import assert from 'node:assert/strict';

import { launchChromiumForTest } from '../../_playwright-launch.mjs';
import { makeAdminPageResponseForRequest } from '../../_browser-test-fixtures.mjs';
import { startStaticServer } from '../../_browser-test-server.mjs';
import { waitForRequestMatch, waitForText } from '../../_browser-test-wait.mjs';

async function main() {
  const { server, baseUrl } = await startStaticServer();
  const browser = await launchChromiumForTest('admin-page');

  try {
    if (!browser) {
      return;
    }

    try {
      const page = await browser.newPage();
      const pageErrors = [];
      const rpcCalls = [];
      const dataCalls = [];
      let failNextRpcPath = '';
      let generatedPriceCount = 0;
      const initialProducts = makeAdminPageResponseForRequest('https://example.test/rest/v1/products', 'GET');
      const initialStores = makeAdminPageResponseForRequest('https://example.test/rest/v1/stores', 'GET');
      let adminProducts = [
        ...initialProducts,
        ...Array.from({ length: 32 }, (_, index) => {
          const number = String(index + 1).padStart(2, '0');
          return {
            id: `catalog-extra-${number}`,
            barcode: `49910000000${number}`,
            name: `Catalog Extra ${number}`,
            brand: 'Aprice',
            pack: `${index + 1} tabs`,
            category: 'extra',
            tone: 'sunset',
            description: `Extra product ${number}`,
            image_url: '',
            updated_at: `2026-04-${String(Math.min(index + 1, 28)).padStart(2, '0')}T01:00:00.000Z`,
          };
        }),
      ];
      let adminStores = [
        ...initialStores,
        ...Array.from({ length: 32 }, (_, index) => {
          const number = String(index + 1).padStart(2, '0');
          return {
            id: `store-extra-${number}`,
            name: `Store Extra ${number}`,
            chain_name: 'Aprice',
            address: `Tokyo, Extra ${number}`,
            city: 'Tokyo',
            pref: 'Tokyo',
            lat: 35.62 + index / 1000,
            lng: 139.7 + index / 1000,
            hours: '09:00-21:00',
            updated_at: `2026-04-${String(Math.min(index + 1, 28)).padStart(2, '0')}T01:00:00.000Z`,
          };
        }),
      ];
      let adminPrices = makeAdminPageResponseForRequest('https://example.test/rest/v1/prices', 'GET');
      let pendingPrices = makeAdminPageResponseForRequest('https://example.test/rest/v1/user_price_logs', 'GET');
      let pendingProducts = makeAdminPageResponseForRequest('https://example.test/rest/v1/product_submissions', 'GET');

      function cloneRows(rows) {
        return JSON.parse(JSON.stringify(rows));
      }

      function searchTermFromUrl(url) {
        const or = String(url.searchParams.get('or') || '').toLowerCase();
        const match = or.match(/ilike\.%([^%,)]+)%/);
        return (match?.[1] || '').replace(/\\/g, '').trim();
      }

      function filterRows(rows, url, keys) {
        const term = searchTermFromUrl(url);
        if (!term) return rows;
        return rows.filter((row) => keys.some((key) => String(row?.[key] || '').toLowerCase().includes(term)));
      }

      function paginateRows(rows, url) {
        const limit = Number(url.searchParams.get('limit') || rows.length);
        const offset = Number(url.searchParams.get('offset') || 0);
        return rows.slice(offset, offset + Math.max(0, limit || rows.length));
      }

      function productForId(id) {
        return adminProducts.find((item) => item.id === id) || { id, name: id, barcode: '', brand: '' };
      }

      function storeForId(id) {
        return adminStores.find((item) => item.id === id) || { id, name: id, city: '', pref: '' };
      }

      async function clickConfirmAndWait(selector, pathPart) {
        page.once('dialog', (dialog) => dialog.accept());
        await page.locator(selector).click();
        await waitForRequestMatch(rpcCalls, (call) => call.url.includes(pathPart));
      }

      async function openPanel(selector) {
        await page.locator(selector).evaluate((el) => {
          if (el instanceof HTMLDetailsElement) el.open = true;
        });
      }

      page.on('pageerror', (error) => pageErrors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') pageErrors.push(message.text());
      });

      await page.route('https://esm.sh/@supabase/supabase-js@2.105.4', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'text/javascript; charset=utf-8',
          body: [
            'export function createClient(){',
            '  return {',
            '    auth: {',
            '      async getSession(){',
            '        return {',
            '          data: {',
            '            session: {',
            '              user: { id: "user-admin-1", email: "admin@example.com" },',
            '              access_token: "test-access-token",',
            '            },',
            '          },',
            '          error: null,',
            '        };',
            '      },',
            '      async getUser(){ return { data: { user: { id: "user-admin-1", email: "admin@example.com" } }, error: null }; },',
            '      onAuthStateChange(){ return { data: { subscription: { unsubscribe(){} } } }; },',
            '      async signOut(){ return { error: null }; },',
            '    },',
            '  };',
            '}',
          ].join('\n'),
        });
      });

      await page.route('**/rest/v1/**', async (route) => {
        const requestUrl = route.request().url();
        const url = new URL(requestUrl);
        const method = route.request().method();
        const bodyText = route.request().postData() || '';
        let bodyJson = null;
        try {
          bodyJson = bodyText ? JSON.parse(bodyText) : null;
        } catch {
          bodyJson = null;
        }
        if (method === 'POST') {
          rpcCalls.push({
            url: requestUrl,
            method,
            bodyText,
            bodyJson,
          });
        }
        dataCalls.push({ url: requestUrl, method, bodyText, bodyJson });

        if (failNextRpcPath && requestUrl.includes(failNextRpcPath)) {
          failNextRpcPath = '';
          await route.fulfill({
            status: 200,
            contentType: 'application/json; charset=utf-8',
            body: 'not-json',
          });
          return;
        }

        const isPayloadRpc =
          requestUrl.includes('/rpc/admin_upsert_product') ||
          requestUrl.includes('/rpc/admin_upsert_store') ||
          requestUrl.includes('/rpc/admin_upsert_price') ||
          requestUrl.includes('/rpc/submit_product_submission') ||
          requestUrl.includes('/rpc/admin_review_price_submission') ||
          requestUrl.includes('/rpc/admin_review_product_submission');

        if (isPayloadRpc && (!bodyJson || typeof bodyJson !== 'object' || !bodyJson.payload)) {
          await route.fulfill({
            status: 404,
            contentType: 'application/json; charset=utf-8',
            body: JSON.stringify({
              code: 'PGRST202',
              message: 'Could not find the function with the supplied arguments',
            }),
          });
          return;
        }

        if (requestUrl.includes('/rpc/admin_upsert_product') && method === 'POST') {
          const payload = bodyJson.payload;
          const nextProduct = {
            id: payload.id,
            barcode: payload.barcode || payload.id,
            name: payload.name || '',
            brand: payload.brand || '',
            pack: payload.pack || '',
            category: payload.category || '',
            tone: payload.tone || 'sunset',
            description: payload.description || '',
            image_url: payload.image_url || '',
            updated_at: '2026-05-28T00:00:00.000Z',
          };
          adminProducts = [nextProduct, ...adminProducts.filter((item) => item.id !== nextProduct.id)];
          await route.fulfill({
            status: 200,
            contentType: 'application/json; charset=utf-8',
            body: JSON.stringify(nextProduct),
          });
          return;
        }

        if (requestUrl.includes('/rpc/admin_upsert_store') && method === 'POST') {
          const payload = bodyJson.payload;
          const nextStore = {
            id: payload.id,
            name: payload.name || '',
            chain_name: payload.chain_name || '',
            address: payload.address || '',
            city: payload.city || '',
            pref: payload.pref || '',
            lat: Number(payload.lat),
            lng: Number(payload.lng),
            hours: payload.hours || '',
            updated_at: '2026-05-28T00:00:00.000Z',
          };
          adminStores = [nextStore, ...adminStores.filter((item) => item.id !== nextStore.id)];
          await route.fulfill({
            status: 200,
            contentType: 'application/json; charset=utf-8',
            body: JSON.stringify(nextStore),
          });
          return;
        }

        if (requestUrl.includes('/rpc/admin_upsert_price') && method === 'POST') {
          const payload = bodyJson.payload;
          const nextPrice = {
            id: payload.id || `price-generated-${++generatedPriceCount}`,
            product_id: payload.product_id,
            store_id: payload.store_id,
            price_yen: Number(payload.price_yen),
            is_member_price: String(payload.is_member_price) === 'true' || payload.is_member_price === true,
            source: payload.source || 'manual',
            note: payload.note || '',
            collected_at: payload.collected_at || '2026-05-28T00:00:00.000Z',
            stores: storeForId(payload.store_id),
            products: productForId(payload.product_id),
          };
          adminPrices = [nextPrice, ...adminPrices.filter((item) => item.id !== nextPrice.id)];
          await route.fulfill({
            status: 200,
            contentType: 'application/json; charset=utf-8',
            body: JSON.stringify(nextPrice),
          });
          return;
        }

        if (requestUrl.includes('/rpc/admin_review_price_submission') && method === 'POST') {
          const payload = bodyJson.payload;
          const target = pendingPrices.find((item) => item.id === payload.id) || null;
          pendingPrices = pendingPrices.filter((item) => item.id !== payload.id);
          await route.fulfill({
            status: 200,
            contentType: 'application/json; charset=utf-8',
            body: JSON.stringify({ ...(target || {}), review_status: payload.action === 'approve' ? 'approved' : 'rejected' }),
          });
          return;
        }

        if (requestUrl.includes('/rpc/admin_review_product_submission') && method === 'POST') {
          const payload = bodyJson.payload;
          const target = pendingProducts.find((item) => item.id === payload.id) || null;
          pendingProducts = pendingProducts.filter((item) => item.id !== payload.id);
          if (target && payload.action === 'approve') {
            adminProducts = [{
              id: target.barcode,
              barcode: target.barcode,
              name: target.name,
              brand: target.brand,
              pack: target.pack,
              category: target.category,
              tone: target.tone,
              description: target.description,
              image_url: target.image_url,
              updated_at: '2026-05-28T00:00:00.000Z',
            }, ...adminProducts];
          }
          await route.fulfill({
            status: 200,
            contentType: 'application/json; charset=utf-8',
            body: JSON.stringify({ ...(target || {}), review_status: payload.action === 'approve' ? 'approved' : 'rejected' }),
          });
          return;
        }

        if (requestUrl.includes('/rpc/admin_delete_product') && method === 'POST') {
          adminProducts = adminProducts.filter((item) => item.id !== bodyJson.target_id);
        }
        if (requestUrl.includes('/rpc/admin_delete_store') && method === 'POST') {
          adminStores = adminStores.filter((item) => item.id !== bodyJson.target_id);
        }
        if (requestUrl.includes('/rpc/admin_delete_price') && method === 'POST') {
          adminPrices = adminPrices.filter((item) => item.id !== bodyJson.target_id);
        }

        let responseRows = makeAdminPageResponseForRequest(requestUrl, method);
        if (url.pathname.endsWith('/products')) responseRows = paginateRows(filterRows(adminProducts, url, ['id', 'barcode', 'name', 'brand', 'category']), url);
        if (url.pathname.endsWith('/stores')) responseRows = paginateRows(filterRows(adminStores, url, ['id', 'name', 'chain_name', 'address', 'city', 'pref']), url);
        if (url.pathname.endsWith('/prices')) responseRows = adminPrices;
        if (url.pathname.endsWith('/user_price_logs')) responseRows = pendingPrices;
        if (url.pathname.endsWith('/product_submissions')) responseRows = pendingProducts;
        responseRows = Array.isArray(responseRows) ? cloneRows(responseRows) : responseRows;
        if (requestUrl.includes('/rest/v1/products') && method === 'GET' && Array.isArray(responseRows) && responseRows[0]) {
          responseRows[0] = {
            ...responseRows[0],
            name: `${responseRows[0].name} <script>window.__adminListXss = true</script>`,
          };
        }
        if (requestUrl.includes('/rest/v1/prices') && method === 'GET' && Array.isArray(responseRows) && responseRows[0]?.stores) {
          responseRows[0] = {
            ...responseRows[0],
            stores: {
              ...responseRows[0].stores,
              name: `${responseRows[0].stores.name} <img src=x onerror=window.__adminListXss=true>`,
            },
          };
        }
        if (requestUrl.includes('/rest/v1/user_price_logs') && method === 'GET' && Array.isArray(responseRows) && responseRows[0]) {
          responseRows[0] = {
            ...responseRows[0],
            note: `${responseRows[0].note} <script>window.__adminListXss = true</script>`,
          };
        }

        await route.fulfill({
          status: 200,
          contentType: 'application/json; charset=utf-8',
          body: JSON.stringify(responseRows),
        });
      });

      await page.goto(`${baseUrl}/aprice/admin/`, { waitUntil: 'domcontentloaded' });

      await page.locator('#admin-auth-gate').waitFor({ state: 'attached' });
      await page.locator('#admin-status').waitFor({ state: 'attached' });
      await page.locator('#admin-access').waitFor({ state: 'attached' });
      await page.locator('#admin-products').waitFor({ state: 'attached' });
      await page.locator('#admin-stores').waitFor({ state: 'attached' });
      await page.locator('#admin-prices').waitFor({ state: 'attached' });
      await page.locator('#admin-panel-telemetry').waitFor({ state: 'attached' });
      await page.locator('#admin-panel-product').waitFor({ state: 'attached' });
      await page.locator('#admin-panel-price-review').waitFor({ state: 'attached' });
      await page.locator('#admin-panel-product-review').waitFor({ state: 'attached' });
      await page.locator('#admin-product-summary-count').waitFor({ state: 'attached' });
      await page.locator('#admin-product-search').waitFor({ state: 'attached' });
      await page.locator('#admin-store-search').waitFor({ state: 'attached' });
      await page.locator('#admin-auth-gate').waitFor({ state: 'hidden' });

      await waitForText(page, '#admin-status', '可以开始维护数据');
      await waitForText(page, '#admin-access', '管理员权限已开启');

      const statusText = await page.locator('#admin-status').textContent();
      const accessText = await page.locator('#admin-access').textContent();
      const productListText = await page.locator('#admin-products').textContent();
      const storeListText = await page.locator('#admin-stores').textContent();
      const priceListText = await page.locator('#admin-prices').textContent();
      const productSummaryText = await page.locator('#admin-panel-product').textContent();
      const storeSummaryText = await page.locator('#admin-panel-store').textContent();
      const priceSummaryText = await page.locator('#admin-panel-price').textContent();
      const priceReviewSummaryText = await page.locator('#admin-panel-price-review').textContent();
      const productReviewSummaryText = await page.locator('#admin-panel-product-review').textContent();
      const telemetrySummaryText = await page.locator('#admin-panel-telemetry').textContent();
      const productOptions = await page.locator('#price-product option').allTextContents();
      const storeOptions = await page.locator('#price-store option').allTextContents();

      assert.match(statusText || '', /可以开始维护数据/);
      assert.match(accessText || '', /管理员权限已开启/);
      assert.equal(await page.locator('#admin-panel-product').evaluate((el) => el.open), false);
      assert.match(telemetrySummaryText || '', /事件看板/);
      assert.match(telemetrySummaryText || '', /事件 0 条/);
      assert.match(telemetrySummaryText || '', /价格 RPC 已启用/);
      assert.match(productSummaryText || '', /商品 30 条/);
      assert.match(storeSummaryText || '', /门店 30 条/);
      assert.match(priceSummaryText || '', /最近价格 2 条/);
      assert.match(priceReviewSummaryText || '', /待审价格 2 条/);
      assert.match(productReviewSummaryText || '', /待审商品 1 条/);
      assert.match(productListText || '', /Loxonin S/);
      assert.match(storeListText || '', /Sugi Pharmacy Hiroo/);
      assert.match(priceListText || '', /¥698/);
      assert.equal(await page.evaluate(() => window.__adminListXss === true), false);
      assert.equal(await page.locator('#admin-products script, #admin-products img[onerror], #admin-prices script, #admin-prices img[onerror]').count(), 0);
      assert.ok(productOptions.some((text) => text.includes('Loxonin S')));
      assert.ok(storeOptions.some((text) => text.includes('Sugi Pharmacy Hiroo')));

      await openPanel('#admin-panel-recent-stores');
      await page.locator('[data-edit-store="welcia-shibuya"]').click();
      assert.equal(await page.locator('#store-id').inputValue(), 'welcia-shibuya');
      assert.equal(await page.locator('#store-name').inputValue(), 'Welcia Shibuya');
      assert.equal(await page.locator('#store-chain').inputValue(), 'Welcia');
      assert.equal(await page.locator('#admin-panel-store').evaluate((el) => el.open), true);
      await page.locator('#store-name').fill('Welcia Shibuya Edited');
      await page.locator('#store-hours').fill('09:30-22:30');
      await page.locator('#store-form button[type="submit"]').click();
      await waitForText(page, '#admin-status', '可以开始维护数据');
      await waitForText(page, '#admin-stores', 'Welcia Shibuya Edited');
      await waitForText(page, '#admin-stores', '09:30-22:30');

      await openPanel('#admin-panel-recent-prices');
      await page.locator('[data-edit-price="price-admin-1"]').click();
      assert.equal(await page.locator('#price-product').inputValue(), 'loxonin-s');
      assert.equal(await page.locator('#price-store').inputValue(), 'sugi-hiroo');
      assert.equal(await page.locator('#price-yen').inputValue(), '698');
      assert.equal(await page.locator('#price-member').isChecked(), false);
      assert.equal(await page.locator('#admin-panel-price').evaluate((el) => el.open), true);
      await page.locator('#price-yen').fill('699');
      await page.locator('#price-source').fill('admin edit');
      await page.locator('#price-form button[type="submit"]').click();
      await waitForText(page, '#admin-status', '可以开始维护数据');
      await waitForText(page, '#admin-prices', '¥699');

      await openPanel('#admin-panel-recent-products');
      await page.locator('[data-edit-product="eve-a"]').click();
      assert.equal(await page.locator('#product-id').inputValue(), 'eve-a');
      await page.locator('#product-name').fill('EVE A Edited');
      await page.locator('#product-form button[type="submit"]').click();
      await waitForText(page, '#admin-status', '可以开始维护数据');
      await waitForText(page, '#admin-products', 'EVE A Edited');

      await openPanel('#admin-panel-product');
      await page.locator('#product-id').fill('admin-fixture-product');
      await page.locator('#product-barcode').fill('4990000000001');
      await page.locator('#product-name').fill('Admin Fixture Product');
      await page.locator('#product-brand').fill('Aprice');
      await page.locator('#product-pack').fill('8 tabs');
      await page.locator('#product-category').fill('test-fixture');
      await page.locator('#product-description').fill('Browser regression fixture');
      await page.locator('#product-image-url').fill('https://cdn.example.com/products/admin-fixture-product.jpg');
      await page.locator('#product-tone').selectOption('mint');
      await page.locator('#product-form button[type="submit"]').click();

      await page.waitForFunction(() => {
        const text = document.querySelector('#admin-status')?.textContent || '';
        return text.includes('可以开始维护数据');
      });

      assert.ok(
        rpcCalls.some((call) => call.url.includes('/rpc/admin_upsert_product') && call.method === 'POST'),
        `expected admin_upsert_product RPC, got ${rpcCalls.map((call) => `${call.method} ${call.url}`).join(' | ')}`,
      );
      assert.ok(
        rpcCalls.some((call) => call.url.includes('/rpc/admin_upsert_product') && call.method === 'POST' && call.bodyJson?.payload?.id === 'admin-fixture-product' && call.bodyJson?.payload?.name === 'Admin Fixture Product' && call.bodyJson?.payload?.image_url === 'https://cdn.example.com/products/admin-fixture-product.jpg'),
        `expected admin_upsert_product payload, got ${rpcCalls.map((call) => JSON.stringify(call.bodyJson)).join(' | ')}`,
      );

      assert.equal(await page.locator('[data-edit-product="eve-a"]').count(), 1);

      await openPanel('#admin-panel-product');
      failNextRpcPath = '/rpc/admin_upsert_product';
      await page.locator('#product-id').fill('admin-failing-product');
      await page.locator('#product-barcode').fill('4990000000002');
      await page.locator('#product-name').fill('Admin Failing Product <script>window.__adminXss = true</script>');
      await page.locator('#product-form button[type="submit"]').click();
      await waitForText(page, '#admin-status', '保存商品失败');
      assert.equal(await page.evaluate(() => window.__adminXss === true), false);

      await openPanel('#admin-panel-product');
      failNextRpcPath = '/rpc/admin_delete_product';
      await clickConfirmAndWait('#product-delete', '/rpc/admin_delete_product');
      await waitForText(page, '#admin-status', '删除商品失败');
      await clickConfirmAndWait('#product-delete', '/rpc/admin_delete_product');
      assert.ok(rpcCalls.some((call) => call.url.includes('/rpc/admin_delete_product')),
        `expected admin_delete_product RPC, got ${rpcCalls.map((call) => `${call.method} ${call.url}`).join(' | ')}`);

      await openPanel('#admin-panel-store');
      await page.locator('#store-id').fill('admin-fixture-store');
      await page.locator('#store-name').fill('Admin Fixture Store');
      await page.locator('#store-chain').fill('Aprice');
      await page.locator('#store-hours').fill('08:00-23:00');
      await page.locator('#store-address').fill('Tokyo, Chiyoda 1-1-1');
      await page.locator('#store-city').fill('Tokyo');
      await page.locator('#store-pref').fill('Tokyo');
      await page.locator('#store-lat').fill('35.6895');
      await page.locator('#store-lng').fill('139.6917');
      await page.locator('#store-form button[type="submit"]').click();
      await waitForText(page, '#admin-status', '可以开始维护数据');
      assert.ok(rpcCalls.some((call) => call.url.includes('/rpc/admin_upsert_store')),
        `expected admin_upsert_store RPC, got ${rpcCalls.map((call) => `${call.method} ${call.url}`).join(' | ')}`);
      assert.ok(
        rpcCalls.some((call) => call.url.includes('/rpc/admin_upsert_store') && call.bodyJson?.payload?.id === 'admin-fixture-store' && call.bodyJson?.payload?.name === 'Admin Fixture Store' && call.bodyJson?.payload?.chain_name === 'Aprice'),
        `expected admin_upsert_store payload, got ${rpcCalls.map((call) => JSON.stringify(call.bodyJson)).join(' | ')}`,
      );

      failNextRpcPath = '/rpc/admin_upsert_store';
      await page.locator('#store-name').fill('Admin Fixture Store Failed');
      await page.locator('#store-form button[type="submit"]').click();
      await waitForText(page, '#admin-status', '保存门店失败');

      await openPanel('#admin-panel-price');
      await page.locator('#price-product').selectOption('loxonin-s');
      await page.locator('#price-store').selectOption('sugi-hiroo');
      await page.locator('#price-yen').fill('688');
      await page.locator('#price-source').fill('admin test');
      await page.locator('#price-note').fill('browser regression');
      await page.locator('#price-collected').fill('2026-04-04T10:00');
      await page.locator('#price-member').setChecked(true);
      await page.locator('#price-form button[type="submit"]').click();
      await waitForText(page, '#admin-status', '可以开始维护数据');
      assert.ok(rpcCalls.some((call) => call.url.includes('/rpc/admin_upsert_price')),
        `expected admin_upsert_price RPC, got ${rpcCalls.map((call) => `${call.method} ${call.url}`).join(' | ')}`);
      assert.ok(
        rpcCalls.some((call) =>
          call.url.includes('/rpc/admin_upsert_price') &&
          call.bodyJson?.payload?.product_id === 'loxonin-s' &&
          call.bodyJson?.payload?.store_id === 'sugi-hiroo' &&
          String(call.bodyJson?.payload?.price_yen) === '688' &&
          String(call.bodyJson?.payload?.is_member_price) === 'true'
        ),
        `expected admin_upsert_price payload, got ${rpcCalls.map((call) => JSON.stringify(call.bodyJson)).join(' | ')}`,
      );

      failNextRpcPath = '/rpc/admin_upsert_price';
      await page.locator('#price-yen').fill('689');
      await page.locator('#price-form button[type="submit"]').click();
      await waitForText(page, '#admin-status', '保存价格失败');

      await openPanel('#admin-panel-price-review');
      await waitForText(page, '#admin-price-review-list', 'front shelf community');
      await page.locator('[data-review-price-approve="11111111-1111-4111-8111-111111111111"]').click();
      await waitForRequestMatch(rpcCalls, (call) => call.url.includes('/rpc/admin_review_price_submission'));
      await waitForText(page, '#admin-status', '价格提交已通过');
      assert.ok(
        rpcCalls.some((call) =>
          call.url.includes('/rpc/admin_review_price_submission') &&
          call.bodyJson?.payload?.id === '11111111-1111-4111-8111-111111111111' &&
          call.bodyJson?.payload?.action === 'approve'
        ),
        `expected admin_review_price_submission payload, got ${rpcCalls.map((call) => JSON.stringify(call.bodyJson)).join(' | ')}`,
      );

      await openPanel('#admin-panel-product-review');
      await waitForText(page, '#admin-product-review-list', 'Submitted Supplement');
      await page.locator('[data-review-product-approve="33333333-3333-4333-8333-333333333333"]').click();
      await waitForRequestMatch(rpcCalls, (call) => call.url.includes('/rpc/admin_review_product_submission'));
      await waitForText(page, '#admin-status', '商品提交已通过');
      assert.ok(
        rpcCalls.some((call) =>
          call.url.includes('/rpc/admin_review_product_submission') &&
          call.bodyJson?.payload?.id === '33333333-3333-4333-8333-333333333333' &&
          call.bodyJson?.payload?.action === 'approve'
        ),
        `expected admin_review_product_submission payload, got ${rpcCalls.map((call) => JSON.stringify(call.bodyJson)).join(' | ')}`,
      );

      await openPanel('#admin-panel-recent-products');
      await page.locator('#admin-product-load-more').click();
      await waitForRequestMatch(dataCalls, (call) => call.method === 'GET' && call.url.includes('/rest/v1/products') && call.url.includes('offset=30'));
      await waitForText(page, '#admin-products', 'Catalog Extra 29');

      await page.locator('#admin-store-load-more').click();
      await waitForRequestMatch(dataCalls, (call) => call.method === 'GET' && call.url.includes('/rest/v1/stores') && call.url.includes('offset=30'));
      await waitForText(page, '#admin-stores', 'Store Extra 29');

      await page.locator('#admin-store-search').fill('Chiyoda');
      await waitForRequestMatch(dataCalls, (call) => call.method === 'GET' && call.url.includes('/rest/v1/stores') && call.url.includes('or='));
      await waitForText(page, '#admin-stores', 'Admin Fixture Store');
      await page.locator('#admin-store-search').fill('');
      await waitForText(page, '#admin-stores', 'Welcia Shibuya Edited');

      await openPanel('#admin-panel-store');
      await page.locator('#store-reset').click();
      await page.locator('#store-form button[type="submit"]').click();
      await waitForText(page, '#admin-status', '请填写门店 ID。');

      await openPanel('#admin-panel-recent-stores');
      failNextRpcPath = '/rpc/admin_delete_store';
      await clickConfirmAndWait('[data-delete-store="welcia-shibuya"]', '/rpc/admin_delete_store');
      await waitForText(page, '#admin-status', '删除门店失败');
      await clickConfirmAndWait('[data-delete-store="welcia-shibuya"]', '/rpc/admin_delete_store');
      assert.ok(rpcCalls.some((call) => call.url.includes('/rpc/admin_delete_store')),
        `expected admin_delete_store RPC, got ${rpcCalls.map((call) => `${call.method} ${call.url}`).join(' | ')}`);

      await openPanel('#admin-panel-recent-prices');
      failNextRpcPath = '/rpc/admin_delete_price';
      await clickConfirmAndWait('[data-delete-price="price-admin-1"]', '/rpc/admin_delete_price');
      await waitForText(page, '#admin-status', '删除价格失败');
      await clickConfirmAndWait('[data-delete-price="price-admin-1"]', '/rpc/admin_delete_price');
      assert.ok(rpcCalls.some((call) => call.url.includes('/rpc/admin_delete_price')),
        `expected admin_delete_price RPC, got ${rpcCalls.map((call) => `${call.method} ${call.url}`).join(' | ')}`);

      assert.equal(pageErrors.length, 0, `page errors: ${pageErrors.join(' | ')}`);

      const ssrContext = await browser.newContext({ javaScriptEnabled: false });
      try {
        const ssrPage = await ssrContext.newPage();
        await ssrPage.goto(`${baseUrl}/aprice/admin/`, { waitUntil: 'domcontentloaded' });
        await ssrPage.locator('#session-chip').waitFor({ state: 'attached' });
        await ssrPage.locator('a[data-auth-nav="true"]').waitFor({ state: 'attached' });
        await ssrPage.locator('#admin-switch-account').waitFor({ state: 'attached' });

        const ssrChipUrl = new URL(await ssrPage.locator('#session-chip').getAttribute('href'), baseUrl);
        const ssrNavUrl = new URL(await ssrPage.locator('a[data-auth-nav="true"]').getAttribute('href'), baseUrl);
        const ssrSwitchUrl = new URL(await ssrPage.locator('#admin-switch-account').getAttribute('href'), baseUrl);

        assert.equal(ssrChipUrl.pathname, '/aprice/login/');
        assert.equal(ssrChipUrl.searchParams.get('redirect'), '/aprice/admin/');
        assert.equal(ssrNavUrl.pathname, '/aprice/login/');
        assert.equal(ssrNavUrl.searchParams.get('redirect'), '/aprice/admin/');
        assert.equal(ssrSwitchUrl.pathname, '/aprice/login/');
        assert.equal(ssrSwitchUrl.searchParams.get('redirect'), '/aprice/admin/');
      } finally {
        await ssrContext.close();
      }

      await page.locator('#admin-logout').click();
      await page.waitForURL('**/aprice/login/**');
      const loginUrl = new URL(page.url());
      assert.equal(loginUrl.searchParams.get('redirect'), '/aprice/admin/');

      const guestContext = await browser.newContext();
      try {
        const guestPage = await guestContext.newPage();
        await guestPage.route('https://esm.sh/@supabase/supabase-js@2.105.4', async (route) => {
          await route.fulfill({
            status: 200,
            contentType: 'text/javascript; charset=utf-8',
            body: [
              'export function createClient(){',
              '  return {',
              '    auth: {',
              '      async getSession(){ return { data: { session: null }, error: null }; },',
              '      async getUser(){ return { data: { user: null }, error: null }; },',
              '      onAuthStateChange(){ return { data: { subscription: { unsubscribe(){} } } }; },',
              '      async signOut(){ return { error: null }; },',
              '    },',
              '  };',
              '}',
            ].join('\n'),
          });
        });

        await guestPage.route('**/rest/v1/**', async (route) => {
          await route.fulfill({
            status: 200,
            contentType: 'application/json; charset=utf-8',
            body: '[]',
          });
        });

        await guestPage.goto(`${baseUrl}/aprice/admin/`, { waitUntil: 'domcontentloaded' });
        await guestPage.locator('#admin-auth-gate').waitFor({ state: 'visible' });
        await guestPage.locator('#admin-logout').waitFor({ state: 'attached' });
        assert.equal(await guestPage.locator('#admin-logout').isVisible(), false);
      } finally {
        await guestContext.close();
      }

      const memberContext = await browser.newContext();
      try {
        const memberPage = await memberContext.newPage();
        const memberCalls = [];
        memberPage.on('pageerror', (error) => pageErrors.push(error.message));
        memberPage.on('console', (message) => {
          if (message.type() === 'error') pageErrors.push(message.text());
        });
        await memberPage.route('https://esm.sh/@supabase/supabase-js@2.105.4', async (route) => {
          await route.fulfill({
            status: 200,
            contentType: 'text/javascript; charset=utf-8',
            body: [
              'export function createClient(){',
              '  return {',
              '    auth: {',
              '      async getSession(){ return { data: { session: { user: { id: "member-1", email: "member@example.com" }, access_token: "member-access-token" } }, error: null }; },',
              '      async getUser(){ return { data: { user: { id: "member-1", email: "member@example.com" } }, error: null }; },',
              '      onAuthStateChange(){ return { data: { subscription: { unsubscribe(){} } } }; },',
              '      async signOut(){ return { error: null }; },',
              '    },',
              '  };',
              '}',
            ].join('\n'),
          });
        });
        await memberPage.route('**/rest/v1/**', async (route) => {
          const request = route.request();
          const requestUrl = request.url();
          memberCalls.push({ method: request.method(), url: requestUrl, body: request.postData() || '' });
          const url = new URL(requestUrl);
          if (url.pathname.endsWith('/profiles')) {
            await route.fulfill({
              status: 200,
              contentType: 'application/json; charset=utf-8',
              body: JSON.stringify([
                {
                  id: 'member-1',
                  email: 'member@example.com',
                  full_name: 'Member User',
                  role: 'member',
                  created_at: '2026-04-01T00:00:00.000Z',
                  updated_at: '2026-04-04T00:00:00.000Z',
                },
              ]),
            });
            return;
          }

          await route.fulfill({
            status: 200,
            contentType: 'application/json; charset=utf-8',
            body: '[]',
          });
        });

        await memberPage.goto(`${baseUrl}/aprice/admin/`, { waitUntil: 'domcontentloaded' });
        await memberPage.locator('#admin-auth-gate').waitFor({ state: 'visible' });
        await waitForText(memberPage, '#admin-status', '当前账号不是管理员');
        await waitForText(memberPage, '#admin-access', '当前角色不足以访问管理功能');

        const memberGateText = await memberPage.locator('#admin-auth-gate').textContent();
        const memberAccessText = await memberPage.locator('#admin-access').textContent();
        assert.match(memberGateText || '', /当前账号不是管理员/);
        assert.match(memberGateText || '', /切换账号/);
        assert.match(memberAccessText || '', /member@example\.com/);
        assert.match(memberAccessText || '', /member/);
        assert.equal(memberCalls.some((call) => call.url.includes('/rpc/')), false);
        assert.equal(memberCalls.some((call) => call.url.includes('/rest/v1/products')), false);
        assert.equal(memberCalls.some((call) => call.url.includes('/rest/v1/stores')), false);
        assert.equal(memberCalls.some((call) => call.url.includes('/rest/v1/prices')), false);
      } finally {
        await memberContext.close();
      }

      console.log('admin-page browser test passed');
    } finally {
      await browser.close();
    }
  } finally {
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
