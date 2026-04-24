import assert from 'node:assert/strict';

import { launchChromiumForTest } from './_playwright-launch.mjs';
import { makeProductDetailsResponse } from './_browser-test-fixtures.mjs';
import { startStaticServer } from './_browser-test-server.mjs';
import { waitForHidden, waitForRequestMatch } from './_browser-test-wait.mjs';

function makeSupabaseShimModuleBody() {
  return [
    'export function createClient(){',
    '  return {',
    '    auth: {',
    '      async getSession(){ return { data: { session: { user: { id: "member-1", email: "member@example.com" }, access_token: "test-access-token" } }, error: null }; },',
    '      async getUser(){ return { data: { user: { id: "member-1", email: "member@example.com" } }, error: null }; },',
    '      onAuthStateChange(){ return { data: { subscription: { unsubscribe(){} } } }; },',
    '      async signOut(){ return { error: null }; },',
    '    },',
    '  };',
    '}',
  ].join('\n');
}

async function main() {
  const { server, baseUrl } = await startStaticServer();
  const browser = await launchChromiumForTest('scan-page');

  try {
    if (!browser) {
      return;
    }

    try {
      const page = await browser.newPage();
      const pageErrors = [];
      const requests = [];

      page.on('pageerror', (error) => pageErrors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') pageErrors.push(message.text());
      });

      await page.route('https://esm.sh/@supabase/supabase-js@2.49.1', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'text/javascript; charset=utf-8',
          body: makeSupabaseShimModuleBody(),
        });
      });

      await page.route('**/rest/v1/**', async (route) => {
        const request = route.request();
        const requestUrl = request.url();
        const url = new URL(requestUrl);
        requests.push({ method: request.method(), url: requestUrl, body: request.postData() || '' });

        if (url.pathname.endsWith('/products')) {
          const barcode = url.searchParams.get('barcode') || '';
          if (barcode === 'eq.0019014614042') {
            await route.fulfill({
              status: 200,
              contentType: 'application/json; charset=utf-8',
              body: JSON.stringify([makeProductDetailsResponse()]),
            });
            return;
          }

          if (barcode === 'eq.9999999999999') {
            await route.fulfill({
              status: 200,
              contentType: 'application/json; charset=utf-8',
              body: '[]',
            });
            return;
          }
        }

        if (url.pathname.includes('/rpc/submit_product_submission') && request.method() === 'POST') {
          const body = request.postDataJSON?.() || JSON.parse(request.postData() || '{}');
          const payload = body.payload || body;
          const savedProduct = {
            id: 'submission-1',
            barcode: payload.barcode || '',
            name: payload.name || '',
            brand: payload.brand || '',
            pack: payload.pack || '',
            category: payload.category || '',
            tone: payload.tone || 'sunset',
            description: payload.description || '',
            review_status: 'pending',
          };
          await route.fulfill({
            status: 200,
            contentType: 'application/json; charset=utf-8',
            body: JSON.stringify([savedProduct]),
          });
          return;
        }

        await route.fulfill({
          status: 200,
          contentType: 'application/json; charset=utf-8',
          body: '[]',
        });
      });

      const scanUrl = `${baseUrl}/aprice/scan/`;

      await page.goto(scanUrl, { waitUntil: 'domcontentloaded' });
      await page.locator('#barcode-search').click();
      await page.waitForFunction(() => String(document.querySelector('#scan-status')?.textContent || '').includes('请输入条码。'));
      await page.locator('#barcode-input').press('Enter');
      await page.waitForFunction(() => String(document.querySelector('#scan-status')?.textContent || '').includes('请输入条码。'));
      assert.equal(requests.some((call) => call.url.includes('/rest/v1/products')), false);

      await page.locator('#barcode-input').fill('0019014614042');
      await page.locator('#barcode-search').click();
      await waitForRequestMatch(requests, (call) => call.url.includes('/rest/v1/products') && call.url.includes('barcode=eq.0019014614042'));
      await page.waitForFunction(() => String(document.querySelector('#scan-result-list')?.textContent || '').includes('アイムス 11歳以上用 毎日の健康ケア チキン 小粒 5kg'));
      await waitForHidden(page, '#missing-product-panel');

      assert.equal(page.url(), scanUrl);
      assert.equal(await page.locator('#barcode-input').inputValue(), '0019014614042');
      assert.match(await page.locator('#scan-result-list').textContent(), /アイムス 11歳以上用 毎日の健康ケア チキン 小粒 5kg/);
      assert.equal(await page.locator('#scan-result-list a').getAttribute('href'), '/aprice/product/0019014614042/');

      const foundPage = await browser.newPage();
      const foundRequests = [];
      foundPage.on('pageerror', (error) => pageErrors.push(error.message));
      foundPage.on('console', (message) => {
        if (message.type() === 'error') pageErrors.push(message.text());
      });
      await foundPage.route('https://esm.sh/@supabase/supabase-js@2.49.1', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'text/javascript; charset=utf-8',
          body: makeSupabaseShimModuleBody(),
        });
      });
      await foundPage.route('https://r.jina.ai/**', async (route) => {
        const body = [
          'Title: JANコード 4987240210733 | 龍角散ダイレクトスティック ピーチ(16包) 株式会社龍角散 医薬品・コンタクト・介護',
          '',
          '## 龍角散ダイレクトスティック ピーチ(16包)',
          '',
          '### 商品基本情報',
          '',
          '| 商品名 | 龍角散ダイレクトスティック ピーチ(16包) |',
          '| 会社名 | 株式会社龍角散 |',
          '| 商品ジャンル | 医薬品・コンタクト・介護 > 医薬品・医薬部外品 > 医薬品 |',
        ].join('\n');
        await route.fulfill({
          status: 200,
          contentType: 'text/plain; charset=utf-8',
          body,
        });
      });
      await foundPage.route('**/rest/v1/**', async (route) => {
        const request = route.request();
        const requestUrl = request.url();
        const url = new URL(requestUrl);
        foundRequests.push({ method: request.method(), url: requestUrl, body: request.postData() || '' });

        if (url.pathname.includes('/rpc/submit_product_submission') && request.method() === 'POST') {
          const body = request.postDataJSON?.() || JSON.parse(request.postData() || '{}');
          const payload = body.payload || body;
          const savedProduct = {
            id: 'submission-1',
            barcode: payload.barcode || '',
            name: payload.name || '',
            brand: payload.brand || '',
            pack: payload.pack || '',
            category: payload.category || '',
            tone: payload.tone || 'sunset',
            description: payload.description || '',
            review_status: 'pending',
          };
          await route.fulfill({
            status: 200,
            contentType: 'application/json; charset=utf-8',
            body: JSON.stringify([savedProduct]),
          });
          return;
        }

        if (url.pathname.endsWith('/products')) {
          if ((url.searchParams.get('barcode') || '') === 'eq.9999999999999') {
            await route.fulfill({
              status: 200,
              contentType: 'application/json; charset=utf-8',
              body: '[]',
            });
            return;
          }
          await route.fulfill({
            status: 200,
            contentType: 'application/json; charset=utf-8',
            body: '[]',
          });
          return;
        }

        if (url.pathname.includes('/rpc/submit_product_submission')) {
          const body = request.postDataJSON?.() || JSON.parse(request.postData() || '{}');
          const payload = body.payload || body;
          const savedProduct = {
            id: 'submission-1',
            barcode: payload.barcode || '',
            name: payload.name || '',
            brand: payload.brand || '',
            pack: payload.pack || '',
            category: payload.category || '',
            tone: payload.tone || 'sunset',
            description: payload.description || '',
            review_status: 'pending',
          };
          await route.fulfill({
            status: 200,
            contentType: 'application/json; charset=utf-8',
            body: JSON.stringify([savedProduct]),
          });
          return;
        }

        await route.fulfill({
          status: 200,
          contentType: 'application/json; charset=utf-8',
          body: '[]',
        });
      });

      await foundPage.goto(scanUrl, { waitUntil: 'domcontentloaded' });
      await foundPage.locator('#barcode-input').fill('4987240210733');
      await foundPage.locator('#barcode-search').click();
      await waitForRequestMatch(foundRequests, (call) => call.url.includes('/rest/v1/products') && call.url.includes('barcode=eq.4987240210733'));
      await foundPage.waitForFunction(() => String(document.querySelector('#scan-status')?.textContent || '').includes('商品补录已提交审核'));

      assert.equal(await foundPage.locator('#barcode-input').inputValue(), '4987240210733');
      assert.match(await foundPage.locator('#missing-product-name').inputValue(), /龍角散ダイレクトスティック ピーチ/);
      await waitForRequestMatch(foundRequests, (call) => call.url.includes('/rpc/submit_product_submission') && call.method === 'POST');
      assert.ok(
        foundRequests.some((call) => call.url.includes('/rpc/submit_product_submission') && call.method === 'POST'),
        `expected product submission RPC, got ${foundRequests.map((call) => `${call.method} ${call.url}`).join(' | ')}`,
      );
      assert.ok(
        foundRequests.some((call) => call.url.includes('/rpc/submit_product_submission') && call.method === 'POST' && call.body.includes('"barcode":"4987240210733"') && call.body.includes('"name":"龍角散ダイレクトスティック ピーチ(16包)"') && call.body.includes('"brand":"株式会社龍角散"')),
        `expected product submission payload, got ${foundRequests.map((call) => call.body).join(' | ')}`,
      );

      const guestPage = await browser.newPage();
      const guestRequests = [];
      guestPage.on('pageerror', (error) => pageErrors.push(error.message));
      guestPage.on('console', (message) => {
        if (message.type() === 'error') pageErrors.push(message.text());
      });
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
      await guestPage.route('https://r.jina.ai/**', async (route) => {
        const body = [
          'Title: JANコード 4987240210733 | 龍角散ダイレクトスティック ピーチ(16包) 株式会社龍角散 医薬品・コンタクト・介護',
          '',
          '## 龍角散ダイレクトスティック ピーチ(16包)',
          '',
          '### 商品基本情報',
          '',
          '| 商品名 | 龍角散ダイレクトスティック ピーチ(16包) |',
          '| 会社名 | 株式会社龍角散 |',
          '| 商品ジャンル | 医薬品・コンタクト・介護 > 医薬品・医薬部外品 > 医薬品 |',
        ].join('\n');
        await route.fulfill({
          status: 200,
          contentType: 'text/plain; charset=utf-8',
          body,
        });
      });
      await guestPage.route('**/rest/v1/**', async (route) => {
        const request = route.request();
        const requestUrl = request.url();
        guestRequests.push({ method: request.method(), url: requestUrl, body: request.postData() || '' });
        await route.fulfill({
          status: 200,
          contentType: 'application/json; charset=utf-8',
          body: '[]',
        });
      });

      await guestPage.goto(scanUrl, { waitUntil: 'domcontentloaded' });
      await guestPage.locator('#barcode-input').fill('4987240210733');
      await guestPage.locator('#barcode-search').click();
      await guestPage.waitForURL('**/aprice/login/**', { timeout: 10000 });
      assert.equal(new URL(guestPage.url()).pathname, '/aprice/login/');
      assert.equal(new URL(guestPage.url()).searchParams.get('redirect'), '/aprice/scan/');
      assert.equal(guestRequests.some((call) => call.url.includes('/rpc/submit_product_submission') && call.method === 'POST'), false);

      const manualPage = await browser.newPage();
      const manualRequests = [];
      manualPage.on('pageerror', (error) => pageErrors.push(error.message));
      manualPage.on('console', (message) => {
        if (message.type() === 'error') pageErrors.push(message.text());
      });
      await manualPage.route('https://esm.sh/@supabase/supabase-js@2.49.1', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'text/javascript; charset=utf-8',
          body: makeSupabaseShimModuleBody(),
        });
      });
      await manualPage.route('https://r.jina.ai/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'text/plain; charset=utf-8',
          body: '',
        });
      });
      await manualPage.route('**/rest/v1/**', async (route) => {
        const request = route.request();
        const requestUrl = request.url();
        const url = new URL(requestUrl);
        manualRequests.push({ method: request.method(), url: requestUrl, body: request.postData() || '' });

        if (url.pathname.includes('/rpc/submit_product_submission') && request.method() === 'POST') {
          const body = request.postDataJSON?.() || JSON.parse(request.postData() || '{}');
          const payload = body.payload || body;
          await route.fulfill({
            status: 200,
            contentType: 'application/json; charset=utf-8',
            body: JSON.stringify([{ ...payload, id: 'submission-1', review_status: 'pending' }]),
          });
          return;
        }

        await route.fulfill({
          status: 200,
          contentType: 'application/json; charset=utf-8',
          body: '[]',
        });
      });

      await manualPage.goto(scanUrl, { waitUntil: 'domcontentloaded' });
      await manualPage.locator('#barcode-input').fill('4900000000000');
      await manualPage.locator('#barcode-search').click();
      await manualPage.locator('#missing-product-panel').waitFor({ state: 'visible', timeout: 10000 });
      await manualPage.waitForFunction(() => String(document.querySelector('#scan-status')?.textContent || '').includes('可以手动填写后提交审核。'));
      assert.equal(await manualPage.locator('#missing-product-save').isEnabled(), true);
      assert.equal(await manualPage.locator('#missing-product-barcode').inputValue(), '4900000000000');

      await manualPage.locator('#missing-product-name').fill('Manual Missing Product');
      await manualPage.locator('#missing-product-brand').fill('Manual Brand');
      await manualPage.locator('#missing-product-pack').fill('24 tabs');
      await manualPage.locator('#missing-product-category').fill('manual-category');
      await manualPage.locator('#missing-product-tone').selectOption('azure');
      await manualPage.locator('#missing-product-description').fill('Added by browser test');
      await manualPage.locator('#missing-product-form button[type="submit"]').click();
      await manualPage.waitForFunction(() => String(document.querySelector('#scan-status')?.textContent || '').includes('商品补录已提交审核：Manual Missing Product'));
      assert.ok(
        manualRequests.some((call) =>
          call.method === 'POST' &&
          call.url.includes('/rpc/submit_product_submission') &&
          call.body.includes('"barcode":"4900000000000"') &&
          call.body.includes('"name":"Manual Missing Product"') &&
          call.body.includes('"brand":"Manual Brand"') &&
          call.body.includes('"pack":"24 tabs"') &&
          call.body.includes('"category":"manual-category"') &&
          call.body.includes('"tone":"azure"') &&
          call.body.includes('"description":"Added by browser test"')
        ),
        `expected manual product submission payload, got ${manualRequests.map((call) => call.body).join(' | ')}`,
      );

      const failureManualPage = await browser.newPage();
      failureManualPage.on('pageerror', (error) => pageErrors.push(error.message));
      failureManualPage.on('console', (message) => {
        if (message.type() === 'error') pageErrors.push(message.text());
      });
      await failureManualPage.route('https://esm.sh/@supabase/supabase-js@2.49.1', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'text/javascript; charset=utf-8',
          body: makeSupabaseShimModuleBody(),
        });
      });
      await failureManualPage.route('https://r.jina.ai/**', async (route) => {
        await route.fulfill({
          status: 500,
          contentType: 'text/plain; charset=utf-8',
          body: 'forced jancode failure',
        });
      });
      await failureManualPage.route('**/rest/v1/**', async (route) => {
        const request = route.request();
        if (request.method() === 'POST') {
          await route.fulfill({
            status: 500,
            contentType: 'text/plain; charset=utf-8',
            body: 'forced manual save failure',
          });
          return;
        }
        await route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: '[]' });
      });
      await failureManualPage.goto(scanUrl, { waitUntil: 'domcontentloaded' });
      await failureManualPage.locator('#barcode-input').fill('4900000000001');
      await failureManualPage.locator('#barcode-search').click();
      await failureManualPage.locator('#missing-product-panel').waitFor({ state: 'visible', timeout: 10000 });
      await failureManualPage.waitForFunction(() => {
        const text = String(document.querySelector('#scan-status')?.textContent || '');
        return text.includes('JANCODE 预填失败') || text.includes('JANCODE 信息');
      });
      await failureManualPage.locator('#missing-product-name').fill('Unsafe <script>window.__scanXss = true</script>');
      await failureManualPage.locator('#missing-product-form button[type="submit"]').click();
      await failureManualPage.waitForFunction(() => String(document.querySelector('#scan-status')?.textContent || '').includes('提交失败：forced manual save failure'));

      const xssPage = await browser.newPage();
      xssPage.on('pageerror', (error) => pageErrors.push(error.message));
      xssPage.on('console', (message) => {
        if (message.type() === 'error') pageErrors.push(message.text());
      });
      await xssPage.route('https://esm.sh/@supabase/supabase-js@2.49.1', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'text/javascript; charset=utf-8',
          body: makeSupabaseShimModuleBody(),
        });
      });
      await xssPage.route('**/rest/v1/**', async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname.endsWith('/products')) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json; charset=utf-8',
            body: JSON.stringify([{ id: '4900000000002', barcode: '4900000000002', name: 'Scan XSS <script>window.__scanXss = true</script>', brand: 'Brand <img src=x onerror=window.__scanXss=true>', pack: '1 pack' }]),
          });
          return;
        }
        await route.fulfill({ status: 200, contentType: 'application/json; charset=utf-8', body: '[]' });
      });
      await xssPage.goto(scanUrl, { waitUntil: 'domcontentloaded' });
      await xssPage.locator('#barcode-input').fill('4900000000002');
      await xssPage.locator('#barcode-search').click();
      await xssPage.waitForFunction(() => String(document.querySelector('#scan-result-list')?.textContent || '').includes('Scan XSS'));
      assert.equal(await xssPage.evaluate(() => window.__scanXss === true), false);
      assert.equal(await xssPage.locator('#scan-result-list script, #scan-result-list img[onerror]').count(), 0);

      assert.equal(pageErrors.filter((message) => !message.includes('Failed to load resource')).length, 0, `page errors: ${pageErrors.join(' | ')}`);

      console.log('scan-page browser test passed');
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
