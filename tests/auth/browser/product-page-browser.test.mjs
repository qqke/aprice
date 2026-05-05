import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

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
      const restCalls = [];
      const favoriteRows = [];
      let failNextSubmitStorePrice = false;
      const productRuntimeBody = await readFile(new URL('../../../src/lib/product-page-runtime.js', import.meta.url), 'utf8');

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
      await page.route('**/product-page-runtime.js', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'text/javascript; charset=utf-8',
          body: productRuntimeBody,
        });
      });
      await page.route('**/rest/v1/**', async (route) => {
        const requestUrl = route.request().url();
        const request = route.request();
        const url = new URL(requestUrl);
        requests.push(requestUrl);
        restCalls.push({ method: request.method(), url: requestUrl, body: request.postData() || '' });

        if (url.pathname.endsWith('/rpc/submit_store_price')) {
          if (request.method() === 'POST') {
            if (failNextSubmitStorePrice) {
              failNextSubmitStorePrice = false;
              await route.fulfill({
                status: 500,
                contentType: 'text/plain; charset=utf-8',
                body: 'forced submit failure',
              });
              return;
            }
            const bodyJson = request.postDataJSON?.() || JSON.parse(request.postData() || '{}');
            const body = bodyJson.payload || bodyJson;
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

        if (url.pathname.endsWith('/favorites')) {
          if (request.method() === 'GET') {
            const entityType = url.searchParams.get('entity_type')?.replace(/^eq\./, '') || '';
            const entityId = url.searchParams.get('entity_id')?.replace(/^eq\./, '') || '';
            const filteredRows = favoriteRows.filter((row) => {
              if (entityType && row.entity_type !== entityType) return false;
              if (entityId && row.entity_id !== entityId) return false;
              return true;
            });
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify(filteredRows),
            });
            return;
          }

          if (request.method() === 'POST') {
            const body = request.postDataJSON?.() || JSON.parse(request.postData() || '{}');
            const nextFavorite = {
              id: `favorite-${favoriteRows.length + 1}`,
              user_id: body.user_id,
              entity_type: body.entity_type,
              entity_id: body.entity_id,
              created_at: '2026-04-05T09:00:00.000Z',
            };
            favoriteRows.unshift(nextFavorite);
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify([nextFavorite]),
            });
            return;
          }

          if (request.method() === 'DELETE') {
            const favoriteId = url.searchParams.get('id')?.replace(/^eq\./, '') || '';
            const index = favoriteRows.findIndex((row) => row.id === favoriteId);
            const deletedRows = index >= 0 ? favoriteRows.splice(index, 1) : [];
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify(deletedRows),
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
      try {
        await page.locator('#personal-store-list .store-picker__item').first().waitFor({ state: 'attached', timeout: 10000 });
      } catch (error) {
        const debugState = await page.evaluate(() => ({
          productText: document.querySelector('#product-page')?.textContent || '',
          storeText: document.querySelector('#personal-store-list')?.textContent || '',
          storeStatusText: document.querySelector('#personal-store-status')?.textContent || '',
          personalStatusText: document.querySelector('#personal-status')?.textContent || '',
        }));
        throw new Error(
          `${error.message}\ndebug: ${JSON.stringify(debugState)}\nrequests: ${requests.join('\n')}\npageErrors: ${pageErrors.join(' | ') || 'none'}`,
        );
      }
      try {
        await page.waitForFunction(() => String(document.querySelector('#personal-store-list')?.textContent || '').includes('我的价 ¥688'), null, { timeout: 10000 });
      } catch (error) {
        throw new Error(`${error.message}\npageErrors: ${pageErrors.join(' | ') || 'none'}`);
      }
      await page.waitForFunction(() => String(document.querySelector('#price-list')?.textContent || '').includes('Sugi Pharmacy Hiroo'), null, { timeout: 10000 });
      await page.waitForFunction(() => String(document.querySelector('#nearby-store-list')?.textContent || '').includes('Welcia Shibuya'), null, { timeout: 10000 });
      await page.waitForFunction(() => document.querySelectorAll('#nearby-store-map .store-map__marker').length >= 2, null, { timeout: 10000 });
      await page.waitForFunction(() => document.querySelectorAll('#personal-store-map .store-map__marker').length >= 2, null, { timeout: 10000 });
      assert.match(await page.locator('#nearby-store-map iframe').getAttribute('src'), /maps\.google\.com\/maps/);
      assert.match(await page.locator('#personal-store-map iframe').getAttribute('src'), /maps\.google\.com\/maps/);
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
      const nearbyMapStatusText = await page.locator('#nearby-map-status').textContent();
      const pickerMapStatusText = await page.locator('#store-picker-map-status').textContent();

      assert.match(heroTitle || '', /\S/);
      assert.notEqual(heroSub, null);
      assert.equal(authGateHref.pathname, '/aprice/login/');
      assert.equal(authGateHref.searchParams.get('redirect'), productPath);
      assert.match(authGateText || '', /登录后可收藏商品、保存个人价格记录/);
      assert.match(priceListText || '', /Sugi Pharmacy Hiroo/);
      assert.match(nearbyListText || '', /Welcia Shibuya/);
      assert.match(insightText || '', /最低价/);
      assert.match(geoStatus || '', /已加载 2 条价格记录/);
      assert.match(nearbyMapStatusText || '', /已显示在地图上|缺少坐标/);
      assert.match(pickerMapStatusText || '', /已显示在地图上|当前只有一个可定位门店/);
      await page.locator('#geo-sort').click();
      await page.waitForFunction(() => String(document.querySelector('#geo-status')?.textContent || '').includes('已按当前位置排序'), null, { timeout: 10000 });
      assert.match(await page.locator('#geo-status').textContent(), /已按当前位置排序/);
      assert.match(firstStoreText || '', /Sugi Pharmacy Hiroo/);
      assert.match(storePickerText || '', /Sugi Pharmacy Hiroo/);
      assert.match(storePickerText || '', /我的价 ¥688/);
      assert.match(storePickerText || '', /Welcia Shibuya/);
      assert.match(storeStatusText || '', /当前位置优先排序|点击门店即可回填你的最新价/);
      assert.match(personalStatusText || '', /已同步 3 条个人价格记录/);
      assert.equal(await page.locator('#personal-selected-store-label').textContent(), '未选择门店');
      assert.equal(await page.locator('#personal-store').inputValue(), '');
      assert.equal(await page.locator('#personal-log-form button[type="submit"]').isDisabled(), true);
      assert.equal(await page.locator('#favorite-store-button').isDisabled(), true);
      assert.match(requests.join('\n'), /\/rest\/v1\/prices/);
      assert.match(requests.join('\n'), /\/rest\/v1\/stores/);
      assert.match(requests.join('\n'), /limit=11/);
      assert.match(requests.join('\n'), /\/rest\/v1\/user_price_logs/);

      const submitRpcCountBeforeSelection = restCalls.filter((call) => call.url.includes('/rest/v1/rpc/submit_store_price')).length;
      await page.locator('#personal-price').fill('701');
      await page.locator('#personal-log-form').evaluate((form) => {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });
      await page.waitForFunction(() => String(document.querySelector('#personal-status')?.textContent || '').includes('请选择门店后记录价格。'), null, { timeout: 10000 });
      assert.equal(
        restCalls.filter((call) => call.url.includes('/rest/v1/rpc/submit_store_price')).length,
        submitRpcCountBeforeSelection,
      );

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
      await page.waitForFunction(() => document.querySelectorAll('#personal-store-map .store-map__marker').length === 10, null, { timeout: 10000 });

      await page.locator('#personal-store-map .store-map__marker[data-map-store-id="welcia-shibuya"]').click();
      await page.waitForFunction(() => String(document.querySelector('#personal-price')?.value || '') === '712', null, { timeout: 10000 });
      assert.equal(await page.locator('#personal-price').inputValue(), '712');
      assert.equal(await page.locator('#personal-selected-store-label').textContent(), 'Welcia Shibuya');
      assert.equal(await page.locator('#personal-store').inputValue(), 'welcia-shibuya');
      assert.equal(await page.locator('#personal-log-form button[type="submit"]').isEnabled(), true);
      assert.equal(await page.locator('#favorite-store-button').isEnabled(), true);
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'personal-price');
      assert.match(await page.locator('#personal-status').textContent(), /712/);
      assert.equal(await page.locator('#personal-store-map .store-map__marker[data-map-store-id="welcia-shibuya"]').evaluate((node) => node.classList.contains('is-selected')), true);

      await page.locator('#personal-store-search').fill('sugi');
      await page.waitForFunction(() => String(document.querySelector('#personal-store-list')?.textContent || '').includes('Welcia Shibuya'), null, { timeout: 10000 });
      assert.match(await page.locator('#personal-store-status').textContent(), /当前选择已保留在顶部|没有匹配到搜索词/);
      assert.equal(await page.locator('#personal-selected-store-label').textContent(), 'Welcia Shibuya');
      assert.equal(await page.locator('#personal-store').inputValue(), 'welcia-shibuya');
      assert.equal(await page.locator('#personal-log-form button[type="submit"]').isEnabled(), true);

      await page.locator('#favorite-store-button').click();
      await page.waitForFunction(() => document.querySelector('#favorite-store-button')?.textContent?.includes('取消门店收藏'), null, { timeout: 10000 });
      assert.ok(
        restCalls.some((call) => call.method === 'POST' && call.url.includes('/rest/v1/favorites') && call.body.includes('"entity_type":"store"') && call.body.includes('"entity_id":"welcia-shibuya"')),
        `expected selected store favorite insert, got ${restCalls.map((call) => `${call.method} ${call.url} ${call.body}`).join(' | ')}`,
      );
      assert.equal(
        restCalls.some((call) => call.method === 'POST' && call.url.includes('/rest/v1/favorites') && call.body.includes('"entity_id":"sugi-hiroo"')),
        false,
      );

      await page.locator('#favorite-store-button').click();
      await page.waitForFunction(() => document.querySelector('#favorite-store-button')?.textContent?.includes('添加门店收藏'), null, { timeout: 10000 });
      assert.ok(
        restCalls.some((call) => call.method === 'DELETE' && call.url.includes('/rest/v1/favorites') && call.url.includes('id=eq.favorite-1')),
        `expected selected store favorite delete, got ${restCalls.map((call) => `${call.method} ${call.url}`).join(' | ')}`,
      );

      await page.locator('#personal-store-search-clear').click();
      await page.waitForFunction(() => String(document.querySelector('#personal-store-search')?.value || '') === '', null, { timeout: 10000 });
      await page.locator('#nearby-store-map .store-map__marker[data-map-store-id="welcia-shibuya"]').click();
      await page.waitForFunction(() => document.querySelector('#nearby-store-list [data-store-id="welcia-shibuya"]')?.classList.contains('is-active'), null, { timeout: 10000 });

      failNextSubmitStorePrice = true;
      await page.locator('#personal-price').fill('721');
      await page.locator('#personal-log-form button[type="submit"]').click();
      await page.waitForFunction(() => String(document.querySelector('#personal-status')?.textContent || '').includes('记录失败：forced submit failure'), null, { timeout: 10000 });

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
      assert.ok(
        restCalls.some((call) => call.method === 'POST' && call.url.includes('/rest/v1/rpc/submit_store_price') && call.body.includes('"store_id":"welcia-shibuya"')),
        `expected submit_store_price payload for selected store, got ${restCalls.map((call) => `${call.method} ${call.url} ${call.body}`).join(' | ')}`,
      );
      assert.equal(restCalls.some((call) => call.method === 'POST' && call.url.includes('/rest/v1/user_price_logs')), false);

      const failurePage = await browser.newPage();
      const failureErrors = [];
      failurePage.on('pageerror', (error) => failureErrors.push(error.message));
      failurePage.on('console', (message) => {
        if (message.type() === 'error') failureErrors.push(message.text());
      });
      await failurePage.route('https://esm.sh/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'text/javascript; charset=utf-8',
          body: makeEsmShimModuleBody(),
        });
      });
      await failurePage.route('**/product-page-runtime.js', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'text/javascript; charset=utf-8',
          body: productRuntimeBody,
        });
      });
      await failurePage.route('**/rest/v1/**', async (route) => {
        const requestUrl = route.request().url();
        const url = new URL(requestUrl);
        if (url.pathname.endsWith('/stores')) {
          await route.fulfill({ status: 500, contentType: 'text/plain; charset=utf-8', body: 'forced stores failure' });
          return;
        }
        if (url.pathname.endsWith('/prices')) {
          await route.fulfill({ status: 500, contentType: 'text/plain; charset=utf-8', body: 'forced prices failure' });
          return;
        }
        if (url.pathname.endsWith('/favorites')) {
          await route.fulfill({ status: 500, contentType: 'text/plain; charset=utf-8', body: 'forced favorites failure' });
          return;
        }
        if (url.pathname.endsWith('/user_price_logs')) {
          await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
          return;
        }
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(makeProductPageResponseForRequest(requestUrl)),
        });
      });
      await failurePage.goto(productUrl, { waitUntil: 'domcontentloaded' });
      await failurePage.locator('#product-page').waitFor({ state: 'attached', timeout: 10000 });
      await failurePage.waitForFunction(() => String(document.querySelector('#geo-status')?.textContent || '').includes('价格加载失败：forced prices failure'));
      await failurePage.waitForFunction(() => String(document.querySelector('#personal-store-status')?.textContent || '').includes('门店加载失败：forced stores failure'));
      assert.equal(failureErrors.filter((message) => !message.includes('Failed to load resource')).length, 0, `failure page errors: ${failureErrors.join(' | ')}`);
      await failurePage.close();

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






