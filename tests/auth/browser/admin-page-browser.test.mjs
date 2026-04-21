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

      async function clickConfirmAndWait(selector, pathPart) {
        page.once('dialog', (dialog) => dialog.accept());
        await page.locator(selector).click();
        await waitForRequestMatch(rpcCalls, (call) => call.url.includes(pathPart));
      }

      page.on('pageerror', (error) => pageErrors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') pageErrors.push(message.text());
      });

      await page.route('https://esm.sh/@supabase/supabase-js@2.49.1', async (route) => {
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
        const method = route.request().method();
        if (method === 'POST') {
          const bodyText = route.request().postData() || '';
          let bodyJson = null;
          try {
            bodyJson = bodyText ? JSON.parse(bodyText) : null;
          } catch {
            bodyJson = null;
          }
          rpcCalls.push({
            url: requestUrl,
            method,
            bodyText,
            bodyJson,
          });
        }

        await route.fulfill({
          status: 200,
          contentType: 'application/json; charset=utf-8',
          body: JSON.stringify(makeAdminPageResponseForRequest(requestUrl, method)),
        });
      });

      await page.goto(`${baseUrl}/aprice/admin/`, { waitUntil: 'domcontentloaded' });

      await page.locator('#admin-auth-gate').waitFor({ state: 'attached' });
      await page.locator('#admin-status').waitFor({ state: 'attached' });
      await page.locator('#admin-access').waitFor({ state: 'attached' });
      await page.locator('#admin-products').waitFor({ state: 'attached' });
      await page.locator('#admin-stores').waitFor({ state: 'attached' });
      await page.locator('#admin-prices').waitFor({ state: 'attached' });
      await page.locator('#admin-price-submissions').waitFor({ state: 'attached' });
      await page.locator('#admin-auth-gate').waitFor({ state: 'hidden' });

      await waitForText(page, '#admin-status', '可以开始维护数据');
      await waitForText(page, '#admin-access', '管理员权限已开启');

      const statusText = await page.locator('#admin-status').textContent();
      const accessText = await page.locator('#admin-access').textContent();
      const productListText = await page.locator('#admin-products').textContent();
      const storeListText = await page.locator('#admin-stores').textContent();
      const priceListText = await page.locator('#admin-prices').textContent();
      const pendingPriceText = await page.locator('#admin-price-submissions').textContent();
      const productOptions = await page.locator('#price-product option').allTextContents();
      const storeOptions = await page.locator('#price-store option').allTextContents();

      assert.match(statusText || '', /可以开始维护数据/);
      assert.match(accessText || '', /管理员权限已开启/);
      assert.match(productListText || '', /Loxonin S/);
      assert.match(storeListText || '', /Sugi Pharmacy Hiroo/);
      assert.match(priceListText || '', /¥698/);
      assert.match(pendingPriceText || '', /front shelf community/);
      assert.match(pendingPriceText || '', /¥688/);
      assert.ok(productOptions.some((text) => text.includes('Loxonin S')));
      assert.ok(storeOptions.some((text) => text.includes('Sugi Pharmacy Hiroo')));

      await page.locator('[data-approve-submission="11111111-1111-4111-8111-111111111111"]').click();
      await waitForText(page, '#admin-status', '店头价已通过');
      assert.ok(
        rpcCalls.some((call) =>
          call.url.includes('/rpc/admin_review_price_submission') &&
          call.bodyJson?.id === '11111111-1111-4111-8111-111111111111' &&
          call.bodyJson?.action === 'approve' &&
          String(call.bodyJson?.confidence_score) === '70'
        ),
        `expected approve payload, got ${rpcCalls.map((call) => JSON.stringify(call.bodyJson)).join(' | ')}`,
      );

      await page.locator('[data-reject-submission="22222222-2222-4222-8222-222222222222"]').click();
      await waitForText(page, '#admin-status', '店头价已拒绝');
      assert.ok(
        rpcCalls.some((call) =>
          call.url.includes('/rpc/admin_review_price_submission') &&
          call.bodyJson?.id === '22222222-2222-4222-8222-222222222222' &&
          call.bodyJson?.action === 'reject'
        ),
        `expected reject payload, got ${rpcCalls.map((call) => JSON.stringify(call.bodyJson)).join(' | ')}`,
      );

      await page.locator('[data-edit-store="welcia-shibuya"]').click();
      assert.equal(await page.locator('#store-id').inputValue(), 'welcia-shibuya');
      assert.equal(await page.locator('#store-name').inputValue(), 'Welcia Shibuya');
      assert.equal(await page.locator('#store-chain').inputValue(), 'Welcia');

      await page.locator('[data-edit-price="price-admin-1"]').click();
      assert.equal(await page.locator('#price-product').inputValue(), 'loxonin-s');
      assert.equal(await page.locator('#price-store').inputValue(), 'sugi-hiroo');
      assert.equal(await page.locator('#price-yen').inputValue(), '698');
      assert.equal(await page.locator('#price-member').isChecked(), false);

      await page.locator('#product-id').fill('admin-fixture-product');
      await page.locator('#product-barcode').fill('4990000000001');
      await page.locator('#product-name').fill('Admin Fixture Product');
      await page.locator('#product-brand').fill('Aprice');
      await page.locator('#product-pack').fill('8 tabs');
      await page.locator('#product-category').fill('test-fixture');
      await page.locator('#product-description').fill('Browser regression fixture');
      await page.locator('#product-tone').selectOption('mint');
      await page.locator('#product-form button[type="submit"]').click();

      await page.waitForFunction(() => {
        const text = document.querySelector('#admin-status')?.textContent || '';
        return text.includes('可以开始维护数据');
      });

      assert.ok(
        rpcCalls.some((call) => call.url.includes('/rest/v1/products') && call.method === 'POST'),
        `expected products insert, got ${rpcCalls.map((call) => `${call.method} ${call.url}`).join(' | ')}`,
      );
      assert.ok(
        rpcCalls.some((call) => call.url.includes('/rest/v1/products') && call.method === 'POST' && call.bodyJson?.id === 'admin-fixture-product' && call.bodyJson?.name === 'Admin Fixture Product'),
        `expected products insert payload, got ${rpcCalls.map((call) => JSON.stringify(call.bodyJson)).join(' | ')}`,
      );

      assert.equal(await page.locator('[data-edit-product="eve-a"]').count(), 0);

      await clickConfirmAndWait('#product-delete', '/rpc/admin_delete_product');
      assert.ok(rpcCalls.some((call) => call.url.includes('/rpc/admin_delete_product')),
        `expected admin_delete_product RPC, got ${rpcCalls.map((call) => `${call.method} ${call.url}`).join(' | ')}`);

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
        rpcCalls.some((call) => call.url.includes('/rpc/admin_upsert_store') && call.bodyJson?.id === 'admin-fixture-store' && call.bodyJson?.name === 'Admin Fixture Store' && call.bodyJson?.chain_name === 'Aprice'),
        `expected admin_upsert_store payload, got ${rpcCalls.map((call) => JSON.stringify(call.bodyJson)).join(' | ')}`,
      );

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
          call.bodyJson?.product_id === 'loxonin-s' &&
          call.bodyJson?.store_id === 'sugi-hiroo' &&
          String(call.bodyJson?.price_yen) === '688' &&
          String(call.bodyJson?.is_member_price) === 'true'
        ),
        `expected admin_upsert_price payload, got ${rpcCalls.map((call) => JSON.stringify(call.bodyJson)).join(' | ')}`,
      );

      await clickConfirmAndWait('[data-delete-store="welcia-shibuya"]', '/rpc/admin_delete_store');
      assert.ok(rpcCalls.some((call) => call.url.includes('/rpc/admin_delete_store')),
        `expected admin_delete_store RPC, got ${rpcCalls.map((call) => `${call.method} ${call.url}`).join(' | ')}`);

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
        await guestPage.route('https://esm.sh/@supabase/supabase-js@2.49.1', async (route) => {
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







