import assert from 'node:assert/strict';

import { launchChromiumForTest } from './_playwright-launch.mjs';
import { startStaticServer } from './_browser-test-server.mjs';
import { waitForHidden, waitForRequestMatch, waitForVisible } from './_browser-test-wait.mjs';

function makeSupabaseShimModuleBody({ signedIn }) {
  return [
    'export function createClient(){',
    '  return {',
    '    auth: {',
    signedIn
      ? '      async getSession(){ return { data: { session: { user: { id: "member-1", email: "member@example.com" }, access_token: "test-access-token" } }, error: null }; },'
      : '      async getSession(){ return { data: { session: null }, error: null }; },',
    signedIn
      ? '      async getUser(){ return { data: { user: { id: "member-1", email: "member@example.com" } }, error: null }; },'
      : '      async getUser(){ return { data: { user: null }, error: null }; },',
    '      onAuthStateChange(){ return { data: { subscription: { unsubscribe(){} } } }; },',
    '      async signOut(){ return { error: null }; },',
    '    }',
    '  };',
    '}',
  ].join('\n');
}

async function main() {
  const { server, baseUrl } = await startStaticServer();
  const browser = await launchChromiumForTest('me-page');

  try {
    if (!browser) {
      return;
    }

    try {
      const page = await browser.newPage();

      await page.route('https://esm.sh/@supabase/supabase-js@2.49.1', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'text/javascript; charset=utf-8',
          body: makeSupabaseShimModuleBody({ signedIn: false }),
        });
      });

      await page.route('**/rest/v1/**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: '[]',
        });
      });

      await page.goto(`${baseUrl}/aprice/me/`, { waitUntil: 'domcontentloaded' });

      await page.locator('#me-auth-gate').waitFor({ state: 'attached' });
      await page.locator('#my-logs').waitFor({ state: 'attached' });
      await page.locator('#recent-views').waitFor({ state: 'attached' });
      await page.locator('#my-favorites').waitFor({ state: 'attached' });
      await page.locator('#log-status').waitFor({ state: 'attached' });
      await waitForVisible(page, '#me-auth-gate');

      const gateHref = new URL(await page.locator('#me-login-link').getAttribute('href'), baseUrl);
      const gateText = await page.locator('#me-auth-gate').textContent();
      const recentText = await page.locator('#recent-views').textContent();
      const favsText = await page.locator('#my-favorites').textContent();
      const statusText = await page.locator('#log-status').textContent();

      assert.equal(gateHref.pathname, '/aprice/login/');
      assert.equal(gateHref.searchParams.get('redirect'), '/aprice/me/');
      assert.match(gateText || '', /登录后可查看个人价格记录与收藏/);
      assert.match(favsText || '', /(登录后可查看收藏|未登录)/);
      assert.match(recentText || '', /暂无浏览记录/);
      assert.match(statusText || '', /登录后/);
      await page.close();

      const signedPage = await browser.newPage();
      const restCalls = [];
      const products = [
        { id: 'loxonin-s', name: 'Loxonin S <script>window.__meXss = true</script>', brand: 'Santen', pack: '12 tabs', barcode: '4987188161027' },
        { id: 'eve-a', name: 'EVE A', brand: 'SS Pharmaceuticals', pack: '20 tabs', barcode: '4987300051234' },
      ];
      const stores = [
        { id: 'sugi-hiroo', name: 'Sugi Pharmacy Hiroo <img src=x onerror=window.__meXss=true>', city: 'Tokyo', pref: 'Tokyo' },
        { id: 'welcia-shibuya', name: 'Welcia Shibuya', city: 'Tokyo', pref: 'Tokyo' },
      ];
      const logs = [
        {
          id: 'log-1',
          user_id: 'member-1',
          product_id: 'loxonin-s',
          store_id: 'sugi-hiroo',
          price_yen: 698,
          note: 'latest store visit <script>window.__meXss = true</script>',
          purchased_at: '2026-04-04',
          created_at: '2026-04-04T09:00:00.000Z',
        },
      ];
      const favorites = [
        { id: 'fav-product-1', user_id: 'member-1', entity_type: 'product', entity_id: 'loxonin-s', created_at: '2026-04-04T09:00:00.000Z' },
        { id: 'fav-store-1', user_id: 'member-1', entity_type: 'store', entity_id: 'welcia-shibuya', created_at: '2026-04-03T09:00:00.000Z' },
      ];
      let failNextLogInsert = false;
      let failNextFavoriteInsert = false;
      let failNextFavoriteDelete = false;

      signedPage.on('pageerror', (error) => {
        throw error;
      });
      await signedPage.addInitScript(() => {
        window.localStorage.setItem('aprice:recent-views', JSON.stringify([
          {
            id: 'loxonin-s',
            name: 'Loxonin S',
            brand: 'Santen',
            pack: '12 tabs',
            barcode: '4987188161027',
            tone: 'sunset',
            viewed_at: '2026-04-04T09:00:00.000Z',
          },
        ]));
      });
      await signedPage.route('https://esm.sh/@supabase/supabase-js@2.49.1', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'text/javascript; charset=utf-8',
          body: makeSupabaseShimModuleBody({ signedIn: true }),
        });
      });
      await signedPage.route('**/rest/v1/**', async (route) => {
        const request = route.request();
        const requestUrl = request.url();
        const url = new URL(requestUrl);
        const method = request.method();
        const bodyText = request.postData() || '';
        const bodyJson = bodyText ? JSON.parse(bodyText) : null;
        restCalls.push({ method, url: requestUrl, bodyText, bodyJson });

        if (url.pathname.endsWith('/products')) {
          if (method === 'GET') {
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(products) });
            return;
          }
        }

        if (url.pathname.endsWith('/stores')) {
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(stores) });
          return;
        }

        if (url.pathname.endsWith('/user_price_logs')) {
          if (method === 'POST') {
            if (failNextLogInsert) {
              failNextLogInsert = false;
              await route.fulfill({
                status: 500,
                contentType: 'text/plain; charset=utf-8',
                body: 'forced log failure',
              });
              return;
            }
            const nextLog = {
              id: `log-${logs.length + 1}`,
              user_id: bodyJson.user_id,
              product_id: bodyJson.product_id,
              store_id: bodyJson.store_id,
              price_yen: bodyJson.price_yen,
              note: bodyJson.note || '',
              purchased_at: bodyJson.purchased_at,
              created_at: `${bodyJson.purchased_at}T09:00:00.000Z`,
            };
            logs.unshift(nextLog);
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([nextLog]) });
            return;
          }
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(logs) });
          return;
        }

        if (url.pathname.endsWith('/favorites')) {
          if (method === 'GET') {
            const entityType = url.searchParams.get('entity_type')?.replace(/^eq\./, '') || '';
            const entityId = url.searchParams.get('entity_id')?.replace(/^eq\./, '') || '';
            const filtered = favorites.filter((favorite) => {
              if (entityType && favorite.entity_type !== entityType) return false;
              if (entityId && favorite.entity_id !== entityId) return false;
              return true;
            });
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(filtered) });
            return;
          }

          if (method === 'POST') {
            if (failNextFavoriteInsert) {
              failNextFavoriteInsert = false;
              await route.fulfill({
                status: 500,
                contentType: 'text/plain; charset=utf-8',
                body: 'forced favorite failure',
              });
              return;
            }
            const nextFavorite = {
              id: `fav-${favorites.length + 1}`,
              user_id: bodyJson.user_id,
              entity_type: bodyJson.entity_type,
              entity_id: bodyJson.entity_id,
              created_at: '2026-04-05T09:00:00.000Z',
            };
            favorites.unshift(nextFavorite);
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([nextFavorite]) });
            return;
          }

          if (method === 'DELETE') {
            if (failNextFavoriteDelete) {
              failNextFavoriteDelete = false;
              await route.fulfill({
                status: 500,
                contentType: 'text/plain; charset=utf-8',
                body: 'forced favorite delete failure',
              });
              return;
            }
            const id = url.searchParams.get('id')?.replace(/^eq\./, '') || '';
            const index = favorites.findIndex((favorite) => favorite.id === id);
            const deleted = index >= 0 ? favorites.splice(index, 1) : [];
            await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(deleted) });
            return;
          }
        }

        await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      });

      await signedPage.goto(`${baseUrl}/aprice/me/`, { waitUntil: 'domcontentloaded' });
      await signedPage.locator('#me-auth-gate').waitFor({ state: 'attached' });
      await waitForHidden(signedPage, '#me-auth-gate');
      await signedPage.waitForFunction(() => String(document.querySelector('#log-status')?.textContent || '').includes('已同步 1 条价格记录和 2 条收藏。'));

      assert.equal(await signedPage.locator('#log-product').isEnabled(), true);
      assert.equal(await signedPage.locator('#log-store').isEnabled(), true);
      assert.match(await signedPage.locator('#my-logs').textContent(), /Loxonin S/);
      assert.match(await signedPage.locator('#my-logs').textContent(), /[¥￥]698/);
      assert.match(await signedPage.locator('#my-favorites').textContent(), /Loxonin S/);
      assert.match(await signedPage.locator('#my-favorites').textContent(), /Welcia Shibuya/);
      assert.match(await signedPage.locator('#favorites-summary').textContent(), /共 2 项收藏，当前显示 2 项/);
      assert.match(await signedPage.locator('#recent-views').textContent(), /Loxonin S/);
      assert.equal(await signedPage.evaluate(() => window.__meXss === true), false);
      assert.equal(await signedPage.locator('#my-logs script, #my-logs img[onerror], #my-favorites script, #my-favorites img[onerror], #recent-views script, #recent-views img[onerror]').count(), 0);

      await signedPage.locator('[data-favorite-filter="product"]').click();
      assert.equal(await signedPage.locator('[data-favorite-filter="product"]').getAttribute('aria-pressed'), 'true');
      assert.match(await signedPage.locator('#my-favorites').textContent(), /Loxonin S/);
      assert.doesNotMatch(await signedPage.locator('#my-favorites').textContent(), /Welcia Shibuya/);

      await signedPage.locator('[data-favorite-filter="store"]').click();
      assert.equal(await signedPage.locator('[data-favorite-filter="store"]').getAttribute('aria-pressed'), 'true');
      assert.match(await signedPage.locator('#my-favorites').textContent(), /Welcia Shibuya/);

      await signedPage.locator('[data-favorite-filter="all"]').click();
      await signedPage.locator('[data-favorite-sort="oldest"]').click();
      assert.equal(await signedPage.locator('[data-favorite-sort="oldest"]').getAttribute('aria-pressed'), 'true');
      const sortedFavoriteText = await signedPage.locator('#my-favorites .me-favorites__item strong').allTextContents();
      assert.equal(sortedFavoriteText[0], 'Welcia Shibuya');

      const logPostCountBeforeInvalid = restCalls.filter((call) => call.method === 'POST' && call.url.includes('/rest/v1/user_price_logs')).length;
      await signedPage.locator('#log-product').selectOption('eve-a');
      await signedPage.locator('#log-store').selectOption('welcia-shibuya');
      await signedPage.locator('#log-price').fill('0');
      await signedPage.locator('#log-form button[type="submit"]').click();
      await signedPage.waitForFunction(() => String(document.querySelector('#log-status')?.textContent || '').includes('请输入有效的日元价格。'));
      assert.equal(restCalls.filter((call) => call.method === 'POST' && call.url.includes('/rest/v1/user_price_logs')).length, logPostCountBeforeInvalid);

      await signedPage.locator('#log-product').selectOption('eve-a');
      await signedPage.locator('#log-store').selectOption('welcia-shibuya');
      await signedPage.locator('#log-price').fill('818');
      await signedPage.locator('#log-note').fill('me browser regression');
      await signedPage.locator('#log-form button[type="submit"]').click();
      await signedPage.waitForFunction(() => String(document.querySelector('#my-logs')?.textContent || '').includes('EVE A'));
      assert.ok(
        restCalls.some((call) =>
          call.method === 'POST' &&
          call.url.includes('/rest/v1/user_price_logs') &&
          call.bodyJson?.product_id === 'eve-a' &&
          call.bodyJson?.store_id === 'welcia-shibuya' &&
          String(call.bodyJson?.price_yen) === '818' &&
          call.bodyJson?.note === 'me browser regression'
        ),
        `expected personal log insert, got ${restCalls.map((call) => JSON.stringify(call.bodyJson)).join(' | ')}`,
      );

      failNextLogInsert = true;
      await signedPage.locator('#log-product').selectOption('eve-a');
      await signedPage.locator('#log-store').selectOption('welcia-shibuya');
      await signedPage.locator('#log-price').fill('819');
      await signedPage.locator('#log-note').fill('me failure regression');
      await signedPage.locator('#log-form button[type="submit"]').click();
      await signedPage.waitForFunction(() => String(document.querySelector('#log-status')?.textContent || '').includes('记录失败：forced log failure'));

      failNextFavoriteInsert = true;
      await signedPage.locator('#log-product').selectOption('eve-a');
      await signedPage.locator('#favorite-product-button').click();
      await signedPage.waitForFunction(() => String(document.querySelector('#log-status')?.textContent || '').includes('收藏失败：forced favorite failure'));

      await signedPage.locator('#log-product').selectOption('eve-a');
      await signedPage.locator('#log-store').selectOption('welcia-shibuya');
      await signedPage.locator('#favorite-product-button').click();
      await signedPage.waitForFunction(() => String(document.querySelector('#favorites-summary')?.textContent || '').includes('共 3 项收藏'));
      await signedPage.locator('#log-store').selectOption('welcia-shibuya');
      failNextFavoriteDelete = true;
      await signedPage.locator('#favorite-store-button').click();
      await signedPage.waitForFunction(() => String(document.querySelector('#log-status')?.textContent || '').includes('收藏失败：forced favorite delete failure'));
      await signedPage.locator('#favorite-store-button').click();
      await waitForRequestMatch(restCalls, (call) => call.method === 'DELETE' && call.url.includes('/rest/v1/favorites'));
      assert.ok(restCalls.some((call) => call.method === 'POST' && call.url.includes('/rest/v1/favorites') && call.bodyJson?.entity_type === 'product' && call.bodyJson?.entity_id === 'eve-a'));
      assert.ok(
        restCalls.some((call) => call.method === 'DELETE' && call.url.includes('/rest/v1/favorites') && call.url.includes('id=eq.fav-store-1')),
        `expected existing store favorite delete, got ${restCalls.map((call) => `${call.method} ${call.url} ${call.bodyText}`).join(' | ')}`,
      );

      await signedPage.locator('#clear-recent-views').click();
      await signedPage.waitForFunction(() => String(document.querySelector('#log-status')?.textContent || '').includes('已清空最近浏览。'));
      assert.match(await signedPage.locator('#recent-views').textContent(), /暂无浏览记录/);
      await signedPage.close();

      const refreshFailurePage = await browser.newPage();
      refreshFailurePage.on('pageerror', (error) => {
        throw error;
      });
      await refreshFailurePage.route('https://esm.sh/@supabase/supabase-js@2.49.1', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'text/javascript; charset=utf-8',
          body: makeSupabaseShimModuleBody({ signedIn: true }),
        });
      });
      await refreshFailurePage.route('**/rest/v1/**', async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname.endsWith('/products')) {
          await route.fulfill({
            status: 500,
            contentType: 'text/plain; charset=utf-8',
            body: 'forced refresh failure',
          });
          return;
        }
        await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      });
      await refreshFailurePage.goto(`${baseUrl}/aprice/me/`, { waitUntil: 'domcontentloaded' });
      await refreshFailurePage.waitForFunction(() => String(document.querySelector('#log-status')?.textContent || '').includes('记录失败：forced refresh failure'));
      assert.equal(await refreshFailurePage.locator('#log-product').isDisabled(), true);
      await refreshFailurePage.close();

      console.log('me-page browser test passed');
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
