import assert from 'node:assert/strict';

import { launchChromiumForTest } from './_playwright-launch.mjs';
import { makeProductDetailsResponse } from './_browser-test-fixtures.mjs';
import { startStaticServer } from './_browser-test-server.mjs';
import { waitForHidden, waitForRequestMatch, waitForText, waitForVisible } from './_browser-test-wait.mjs';

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

        if (url.pathname.includes('/rpc/create_product')) {
          const body = request.postDataJSON?.() || JSON.parse(request.postData() || '{}');
          const savedProduct = {
            id: body.id || body.barcode,
            barcode: body.barcode || '',
            name: body.name || '',
            brand: body.brand || '',
            pack: body.pack || '',
            category: body.category || '',
            tone: body.tone || 'sunset',
            description: body.description || '',
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
      await foundPage.route('**/rest/v1/**', async (route) => {
        const request = route.request();
        const requestUrl = request.url();
        const url = new URL(requestUrl);
        foundRequests.push({ method: request.method(), url: requestUrl, body: request.postData() || '' });

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

        if (url.pathname.includes('/rpc/create_product')) {
          const body = request.postDataJSON?.() || JSON.parse(request.postData() || '{}');
          const savedProduct = {
            id: body.id || body.barcode,
            barcode: body.barcode || '',
            name: body.name || '',
            brand: body.brand || '',
            pack: body.pack || '',
            category: body.category || '',
            tone: body.tone || 'sunset',
            description: body.description || '',
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
      await foundPage.locator('#barcode-input').fill('9999999999999');
      await foundPage.locator('#barcode-search').click();
      await waitForRequestMatch(foundRequests, (call) => call.url.includes('/rest/v1/products') && call.url.includes('barcode=eq.9999999999999'));
      await waitForVisible(foundPage, '#missing-product-panel');
      await waitForText(foundPage, '#missing-product-summary', '条码 9999999999999 没有匹配到商品');

      assert.equal(await foundPage.locator('#barcode-input').inputValue(), '9999999999999');
      assert.equal(await foundPage.locator('#missing-product-barcode').inputValue(), '9999999999999');
      assert.match(await foundPage.locator('#scan-result-list').textContent(), /没有找到对应商品/);

      await foundPage.locator('#missing-product-name').fill('Scan Fixture Product');
      await foundPage.locator('#missing-product-brand').fill('Aprice');
      await foundPage.locator('#missing-product-pack').fill('12 tabs');
      await foundPage.locator('#missing-product-category').fill('test-fixture');
      await foundPage.locator('#missing-product-tone').selectOption('mint');
      await foundPage.locator('#missing-product-description').fill('Created from scan page');
      await foundPage.locator('#missing-product-save').click();
      await waitForRequestMatch(foundRequests, (call) => call.url.includes('/rpc/create_product'));
      await waitForHidden(foundPage, '#missing-product-panel');

      assert.ok(
        foundRequests.some((call) => call.url.includes('/rpc/create_product')),
        `expected create_product RPC, got ${foundRequests.map((call) => `${call.method} ${call.url}`).join(' | ')}`,
      );
      assert.ok(
        foundRequests.some((call) => call.url.includes('/rpc/create_product') && call.body.includes('"barcode":"9999999999999"') && call.body.includes('"name":"Scan Fixture Product"')),
        `expected create_product payload, got ${foundRequests.map((call) => call.body).join(' | ')}`,
      );
      assert.match(await foundPage.locator('#scan-result-list').textContent(), /Scan Fixture Product/);
      assert.equal(await foundPage.locator('#scan-result-list a').getAttribute('href'), '/aprice/product/9999999999999/');

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
      await guestPage.locator('#barcode-input').fill('9999999999999');
      await guestPage.locator('#barcode-search').click();
      await waitForVisible(guestPage, '#missing-product-panel');
      await waitForText(guestPage, '#scan-status', '请先登录后再添加商品。');
      await waitForText(guestPage, '#missing-product-summary', '请先登录后再添加商品。');
      assert.equal(await guestPage.locator('#missing-product-save').isDisabled(), true);
      assert.equal(guestRequests.some((call) => call.url.includes('/rpc/create_product')), false);

      assert.equal(pageErrors.length, 0, `page errors: ${pageErrors.join(' | ')}`);

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
