import assert from 'node:assert/strict';

import { launchChromiumForTest } from '../../_playwright-launch.mjs';
import { makeProductPageResponseForRequest } from '../../_browser-test-fixtures.mjs';
import { startStaticServer } from '../../_browser-test-server.mjs';

async function main() {
  const { server, baseUrl } = await startStaticServer();
  const browser = await launchChromiumForTest('product-page');

  try {
    if (!browser) {
      return;
    }

    try {
      const page = await browser.newPage();
      const requests = [];

      await page.route('https://esm.sh/**', async (route) => {
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
            '    }',
            '  };',
            '}',
          ].join('\n'),
        });
      });
      await page.route('**/rest/v1/**', async (route) => {
        const requestUrl = route.request().url();
        requests.push(requestUrl);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(makeProductPageResponseForRequest(requestUrl)),
        });
      });

      const productUrl = `${baseUrl}/aprice/product/loxonin-s/`;
      await page.goto(productUrl, { waitUntil: 'domcontentloaded' });
      try {
        await page.locator('#product-page').waitFor({ state: 'attached', timeout: 10000 });
      } catch {
        await page.goto(productUrl, { waitUntil: 'domcontentloaded' });
        await page.locator('#product-page').waitFor({ state: 'attached', timeout: 10000 });
      }
      await page.locator('#product-auth-gate').waitFor({ state: 'attached' });
      await page.locator('.product-title').waitFor({ state: 'attached' });
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
      const storeOptions = await page.locator('#personal-store option').allTextContents();

      assert.match(heroTitle || '', /ロキソニンS|Loxonin S/);
      assert.ok((heroSub || '').length > 0);
      assert.equal(authGateHref.pathname, '/aprice/login/');
      assert.equal(authGateHref.searchParams.get('redirect'), '/aprice/product/loxonin-s/');
      assert.match(authGateText || '', /登录后可收藏商品、保存个人价格记录/);
      assert.match(priceListText || '', /Sugi Pharmacy Hiroo/);
      assert.match(nearbyListText || '', /Welcia Shibuya/);
      assert.match(insightText || '', /最低价/);
      assert.match(geoStatus || '', /已加载 2 条价格记录/);
      assert.ok(storeOptions.some((text) => text.includes('Sugi Pharmacy Hiroo')));
      assert.match(requests.join('\n'), /\/rest\/v1\/prices/);
      assert.match(requests.join('\n'), /\/rest\/v1\/stores/);

      await page.locator('#favorite-product-button').click();
      await page.waitForURL('**/aprice/login/**');
      const loginUrl = new URL(page.url());
      assert.equal(loginUrl.searchParams.get('redirect'), '/aprice/product/loxonin-s/');

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













