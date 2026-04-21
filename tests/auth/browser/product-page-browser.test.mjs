import assert from 'node:assert/strict';

import { launchChromiumForTest } from '../../_playwright-launch.mjs';
import { makePersonalPriceLogs, makeProductPageResponseForRequest } from '../../_browser-test-fixtures.mjs';
import { startBuiltServer } from '../../_browser-test-server.mjs';

function makeEsmShimModuleBody() {
  return [
    'export function createClient(){',
    '  return {',
    '    auth: {',
    '      async getSession(){ return { data: { session: { user: { id: "member-1", email: "name@example.com" }, access_token: "test-access-token" } }, error: null }; },',
    '      async getUser(){ return { data: { user: { id: "member-1", email: "name@example.com" } }, error: null }; },',
    '      onAuthStateChange(){ return { data: { subscription: { unsubscribe(){} } } }; },',
    '      async signOut(){ return { error: null }; },',
    '    }',
    '  };',
    '}',
  ].join('\n');
}

async function main() {
  const { server, baseUrl } = await startBuiltServer();
  const browser = await launchChromiumForTest('product-page');

  try {
    if (!browser) {
      return;
    }

    try {
      const page = await browser.newPage();
      const requests = [];
      const pageErrors = [];
      const productSlug = '9999999999999';
      const productPath = `/aprice/product/${productSlug}/`;
      const personalLogs = makePersonalPriceLogs();

      page.on('pageerror', (error) => pageErrors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') pageErrors.push(message.text());
      });

      await page.addInitScript(() => {
        try {
          Object.defineProperty(navigator, 'geolocation', {
            configurable: true,
            value: {
              getCurrentPosition(success) {
                success({
                  coords: {
                    latitude: 35.6485,
                    longitude: 139.7215,
                  },
                });
              },
            },
          });
        } catch {}
      });

      await page.route('https://esm.sh/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'text/javascript; charset=utf-8',
          body: makeEsmShimModuleBody(),
        });
      });
      await page.route('**/rest/v1/**', async (route) => {
        const requestUrl = route.request().url();
        const request = route.request();
        const url = new URL(requestUrl);
        requests.push(requestUrl);

        if (url.pathname.endsWith('/rpc/submit_store_price')) {
          if (request.method() === 'POST') {
            const body = request.postDataJSON?.() || JSON.parse(request.postData() || '{}');
            const nextEntry = {
              id: `personal-log-${personalLogs.length + 1}`,
              user_id: 'member-1',
              product_id: body.product_id,
              store_id: body.store_id,
              price_yen: body.price_yen,
              purchased_at: body.purchased_at,
              note: body.note || '',
              share_to_public: Boolean(body.share_to_public),
              review_status: body.share_to_public ? 'pending' : 'private',
              evidence_url: body.evidence_url || '',
              confidence_score: 0,
              review_note: '',
              reviewed_at: null,
              promoted_price_id: null,
              created_at: '2026-04-05T09:00:00.000Z',
              updated_at: '2026-04-05T09:00:00.000Z',
            };
            personalLogs.unshift(nextEntry);
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify([nextEntry]),
            });
            return;
          }
        }

        if (url.pathname.endsWith('/user_price_logs')) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(personalLogs),
          });
          return;
        }

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(makeProductPageResponseForRequest(requestUrl)),
        });
      });

      const productUrl = `${baseUrl}${productPath}`;
      for (const entry of personalLogs) {
        entry.product_id = productSlug;
      }
      await page.goto(productUrl, { waitUntil: 'domcontentloaded' });
      try {
        await page.locator('#product-page').waitFor({ state: 'attached', timeout: 10000 });
      } catch {
        await page.goto(productUrl, { waitUntil: 'domcontentloaded' });
        await page.locator('#product-page').waitFor({ state: 'attached', timeout: 10000 });
      }
      await page.locator('#product-auth-gate').waitFor({ state: 'attached' });
      await page.locator('.product-title').waitFor({ state: 'attached' });
      await page.locator('#personal-store-list .store-picker__item').first().waitFor({ state: 'attached', timeout: 10000 });
      try {
        await page.waitForFunction(() => String(document.querySelector('#personal-store-list')?.textContent || '').includes('我的价 ¥688'), null, { timeout: 10000 });
      } catch (error) {
        throw new Error(`${error.message}\npageErrors: ${pageErrors.join(' | ') || 'none'}`);
      }
      await page.waitForFunction(() => String(document.querySelector('#price-list')?.textContent || '').includes('Sugi Pharmacy Hiroo'), null, { timeout: 10000 });
      await page.waitForFunction(() => String(document.querySelector('#nearby-store-list')?.textContent || '').includes('Welcia Shibuya'), null, { timeout: 10000 });
      const heroTitle = await page.locator('.product-title').textContent();
      const heroSub = await page.locator('.product-sub').textContent();
      const authGateHref = new URL(await page.locator('#product-login-link').getAttribute('href'), baseUrl);
      const authGateText = await page.locator('#product-auth-gate').textContent();
      const priceListText = await page.locator('#price-list').textContent();
      const nearbyListText = await page.locator('#nearby-store-list').textContent();
      const insightText = await page.locator('#insight-pills').textContent();
      const geoStatus = await page.locator('#geo-status').textContent();
      const firstStoreText = await page.locator('#personal-store-list .store-picker__item').first().textContent();
      const storePickerText = await page.locator('#personal-store-list').textContent();
      const storeStatusText = await page.locator('#personal-store-status').textContent();
      const personalStatusText = await page.locator('#personal-status').textContent();

      assert.match(heroTitle || '', /\S/);
      assert.notEqual(heroSub, null);
      assert.equal(authGateHref.pathname, '/aprice/login/');
      assert.equal(authGateHref.searchParams.get('redirect'), productPath);
      assert.match(authGateText || '', /登录后可收藏商品、保存个人价格记录/);
      assert.match(priceListText || '', /Sugi Pharmacy Hiroo/);
      assert.match(nearbyListText || '', /Welcia Shibuya/);
      assert.match(insightText || '', /最低价/);
      assert.match(geoStatus || '', /已加载 2 条价格记录/);
      assert.match(firstStoreText || '', /Sugi Pharmacy Hiroo/);
      assert.match(storePickerText || '', /Sugi Pharmacy Hiroo/);
      assert.match(storePickerText || '', /我的价 ¥688/);
      assert.match(storePickerText || '', /Welcia Shibuya/);
      assert.match(storeStatusText || '', /当前位置优先排序|点击门店即可回填你的最新价/);
      assert.match(personalStatusText || '', /已同步 3 条个人价格记录/);
      assert.match(requests.join('\n'), /\/rest\/v1\/prices/);
      assert.match(requests.join('\n'), /\/rest\/v1\/stores/);
      assert.match(requests.join('\n'), /limit=11/);
      assert.match(requests.join('\n'), /\/rest\/v1\/user_price_logs/);
      assert.equal(await page.locator('#personal-store-list .store-picker__item').count(), 10);
      await page.locator('#personal-store-load-more').click();
      await page.waitForFunction(() => document.querySelectorAll('#personal-store-list .store-picker__item').length > 10, null, { timeout: 10000 });
      assert.equal(await page.locator('#personal-store-list .store-picker__item').count(), 20);
      await page.locator('#personal-store-load-more').click();
      await page.waitForFunction(() => document.querySelectorAll('#personal-store-list .store-picker__item').length > 20, null, { timeout: 10000 });
      assert.equal(await page.locator('#personal-store-list .store-picker__item').count(), 22);
      await page.waitForFunction(() => document.querySelector('#personal-store-load-more')?.hidden === true, null, { timeout: 10000 });

      await page.locator('#personal-store-search').fill('welcia');
      await page.waitForFunction(() => !document.querySelector('#personal-store-search-clear')?.hidden, null, { timeout: 10000 });
      await page.waitForFunction(() => document.querySelectorAll('#personal-store-list .store-picker__item').length === 1, null, { timeout: 10000 });
      assert.equal(await page.locator('#personal-store-list .store-picker__item').count(), 1);
      assert.match(await page.locator('#personal-store-list').textContent(), /Welcia Shibuya/);

      await page.locator('#personal-store-search').fill('');
      await page.waitForFunction(() => String(document.querySelector('#personal-store-search-clear')?.hidden || '') === 'true', null, { timeout: 10000 });
      await page.waitForFunction(() => document.querySelectorAll('#personal-store-list .store-picker__item').length === 10, null, { timeout: 10000 });

      await page.locator('#personal-store-list [data-store-id="welcia-shibuya"]').click();
      await page.waitForFunction(() => String(document.querySelector('#personal-price')?.value || '') === '712', null, { timeout: 10000 });
      assert.equal(await page.locator('#personal-price').inputValue(), '712');
      assert.match(await page.locator('#personal-status').textContent(), /712/);

      await page.locator('#personal-store-search').fill('sugi');
      await page.waitForFunction(() => String(document.querySelector('#personal-store-list')?.textContent || '').includes('Welcia Shibuya'), null, { timeout: 10000 });
      assert.match(await page.locator('#personal-store-status').textContent(), /当前选择已保留在顶部|没有匹配到搜索词/);

      await page.locator('#personal-store-search-clear').click();
      await page.waitForFunction(() => String(document.querySelector('#personal-store-search')?.value || '') === '', null, { timeout: 10000 });

      await page.locator('#personal-price').fill('722');
      await page.locator('#personal-note').fill('browser regression');
      await page.locator('#personal-evidence-url').fill('https://example.test/shelf.jpg');
      await page.locator('#personal-log-form button[type="submit"]').click();
      await page.waitForFunction(() => String(document.querySelector('#personal-price')?.value || '') === '722', null, { timeout: 10000 });
      await page.waitForFunction(() => String(document.querySelector('#personal-store-list')?.textContent || '').includes('我的价 ¥722'), null, { timeout: 10000 });
      const updatedStorePickerText = await page.locator('#personal-store-list').textContent();
      assert.match(updatedStorePickerText || '', /我的价 ¥722/);
      assert.match(await page.locator('#personal-status').textContent(), /审核后会进入公共比价/);
      assert.equal(await page.locator('#product-auth-gate').isHidden(), true);
      assert.match(requests.join('\n'), /\/rest\/v1\/rpc\/submit_store_price/);
      assert.doesNotMatch(requests.join('\n'), /POST .*\/rest\/v1\/user_price_logs/);

      console.log('product-page browser test passed');
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











