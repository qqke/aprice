import assert from 'node:assert/strict';

import { launchChromiumForTest } from './_playwright-launch.mjs';
import { makeHomePageResponseForRequest } from './_browser-test-fixtures.mjs';
import { startStaticServer } from './_browser-test-server.mjs';

async function main() {
  const { server, baseUrl } = await startStaticServer();
  const browser = await launchChromiumForTest('home-page');

  try {
    if (!browser) {
      return;
    }

    try {
      const page = await browser.newPage();
      const requests = [];

      await page.route('**/rest/v1/**', async (route) => {
        const requestUrl = route.request().url();
        requests.push(requestUrl);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(makeHomePageResponseForRequest(requestUrl)),
        });
      });

      const candidatePaths = ['/', '/index.html', '/aprice/', '/aprice/index.html'];
      let loaded = false;
      for (const path of candidatePaths) {
        try {
          await page.goto(`${baseUrl}${path}`, { waitUntil: 'domcontentloaded' });
          loaded = true;
          break;
        } catch {
          // Try the next canonical path.
        }
      }
      assert.ok(loaded, 'homepage did not load from static server');
      await page.locator('#home-search').waitFor({ state: 'attached', timeout: 5000 });

      const desktopMenuDisplay = await page.evaluate(() => {
        const element = document.querySelector('#nav-toggle');
        return element ? getComputedStyle(element).display : null;
      });
      assert.equal(desktopMenuDisplay, 'none', 'desktop homepage should hide the menu toggle');

      assert.equal(requests.length, 0, 'homepage should not fetch REST data before interaction');

      await page.locator('#home-search').fill('ロキソ');
      await page.locator('#home-search-button').click();
      await page.waitForFunction(() => {
        const text = String(document.querySelector('#search-status')?.textContent || '');
        return /找到 1 条匹配结果|已匹配到/.test(text);
      });
      await page.waitForFunction(() => {
        const text = String(document.querySelector('#nearby-status')?.textContent || '');
        return /暂无价格记录|暂无门店价格/.test(text);
      });

      const resultText = await page.locator('#search-results').textContent();
      const nearbyText = await page.locator('#nearby-results').textContent();
      const scanHref = await page.locator('.home-search__scan').getAttribute('href');
      const resultImageSrc = await page.locator('#search-results .product-thumb--home').getAttribute('src');

      assert.match(resultText || '', /Loxonin S/);
      assert.match(nearbyText || '', /(当前还没有价格记录|暂无门店价格|暂无价格记录)/);
      assert.equal(scanHref, '/aprice/scan/');
      assert.equal(resultImageSrc, 'https://cdn.example.com/products/loxonin-s.jpg');
      assert.match(requests.join('\n'), /name\.ilike/);
      assert.match(requests.join('\n'), /\/rest\/v1\/products/);
      assert.match(requests.join('\n'), /\/rest\/v1\/prices/);
      assert.match(await page.evaluate(() => String(document.querySelector('#nearby-map-status')?.textContent || '')), /当前商品还没有可显示的门店价格坐标|选中商品后在这里显示门店分布|当前商品暂无可用坐标|加载中：等待门店数据/);
      assert.equal(await page.locator('#recent-status').count(), 0, 'homepage should remove recent status module');
      assert.equal(await page.locator('#load-recent-prices').count(), 0, 'homepage should remove recent trigger');

      await page.locator('#home-search').fill('EVE');
      await page.locator('#home-search-button').click();
      await page.waitForFunction(() => {
        const text = String(document.querySelector('#nearby-status')?.textContent || '');
        return /EVE A · 2 条价格/.test(text);
      });
      await page.waitForFunction(() => document.querySelectorAll('#nearby-map .home-map__marker').length >= 2, null, { timeout: 10000 });
      const nearbyMapText = await page.locator('#nearby-map').textContent();
      const nearbyMapStatusText = await page.evaluate(() => String(document.querySelector('#nearby-map-status')?.textContent || ''));
      assert.match(nearbyMapText || '', /Sugi Pharmacy Hiroo/);
      assert.match(nearbyMapStatusText || '', /已显示在地图上|可交互：已显示/);
      assert.equal(await page.locator('#nearby-map .home-map__marker').count(), 2);
      assert.match(await page.locator('#nearby-map iframe').getAttribute('src'), /maps\.google\.com\/maps/);

      await page.setViewportSize({ width: 390, height: 844 });
      const mobileMenuDisplay = await page.evaluate(() => {
        const element = document.querySelector('#nav-toggle');
        return element ? getComputedStyle(element).display : null;
      });
      assert.equal(mobileMenuDisplay, 'none', 'mobile homepage should hide the top menu toggle');
      assert.equal(await page.locator('#mobile-nav').isHidden(), true, 'mobile homepage should keep the top nav hidden');

      const mobileMetaDisplay = await page.evaluate(() => {
        const element = document.querySelector('.home-meta');
        return element ? getComputedStyle(element).display : null;
      });
      assert.equal(mobileMetaDisplay, 'none', 'mobile homepage should hide the keyboard shortcut hint');

      await page.locator('#home-search').click();
      const focusedElementId = await page.evaluate(() => document.activeElement?.id || '');
      assert.equal(focusedElementId, 'home-search', 'mobile homepage search input should receive focus on tap');
      await page.waitForTimeout(80);
      const focusedElementAfterDelay = await page.evaluate(() => document.activeElement?.id || '');
      assert.equal(focusedElementAfterDelay, 'home-search', 'mobile homepage search input should keep focus after tap');

      const ssrContext = await browser.newContext({ javaScriptEnabled: false });
      try {
        const ssrPage = await ssrContext.newPage();
        await ssrPage.goto(`${baseUrl}/aprice/`, { waitUntil: 'domcontentloaded' });
        const ssrHtml = await ssrPage.content();
        assert.match(ssrHtml, /id="session-chip"/);
        assert.match(ssrHtml, /data-auth-nav="true"/);

        const ssrChipUrl = new URL(await ssrPage.locator('#session-chip').getAttribute('href'), baseUrl);
        const ssrNavUrl = new URL(await ssrPage.locator('a[data-auth-nav="true"]').getAttribute('href'), baseUrl);

        assert.equal(ssrChipUrl.pathname, '/aprice/login/');
        assert.equal(ssrChipUrl.searchParams.get('redirect'), '/aprice/');
        assert.equal(ssrNavUrl.pathname, '/aprice/login/');
        assert.equal(ssrNavUrl.searchParams.get('redirect'), '/aprice/');
      } finally {
        await ssrContext.close();
      }

      const failingPage = await browser.newPage();
      const failingRequests = [];
      await failingPage.route('**/rest/v1/**', async (route) => {
        failingRequests.push(route.request().url());
        await route.fulfill({
          status: 500,
          contentType: 'text/plain; charset=utf-8',
          body: 'forced search failure',
        });
      });
      await failingPage.goto(`${baseUrl}/aprice/`, { waitUntil: 'domcontentloaded' });
      await failingPage.locator('#home-search').fill('失敗');
      await failingPage.locator('#home-search-button').click();
      await failingPage.waitForFunction(() => String(document.querySelector('#search-status')?.textContent || '').includes('搜索失败：forced search failure'));
      assert.match(await failingPage.locator('#search-results').textContent(), /搜索失败/);
      assert.match(await failingPage.locator('#nearby-status').textContent(), /搜索失败后仍可重新尝试/);
      assert.ok(failingRequests.some((url) => url.includes('/rest/v1/products')));
      await failingPage.close();

      const failureBranchesPage = await browser.newPage();
      await failureBranchesPage.addInitScript(() => {
        Object.defineProperty(navigator, 'geolocation', {
          configurable: true,
          value: {
            getCurrentPosition(_success, failure) {
              failure(new Error('forced location failure'));
            },
          },
        });
      });
      await failureBranchesPage.route('**/rest/v1/**', async (route) => {
        const requestUrl = route.request().url();
        const url = new URL(requestUrl);
        if (url.pathname.endsWith('/products')) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([{ id: 'xss-product', name: 'XSS Product <script>window.__homeXss = true</script>', brand: 'Safe <img src=x onerror=window.__homeXss=true>', pack: '1 pack', barcode: '4900000000001' }]),
          });
          return;
        }
        if (url.pathname.endsWith('/prices') && requestUrl.includes('product_id=eq.xss-product')) {
          await route.fulfill({
            status: 500,
            contentType: 'text/plain; charset=utf-8',
            body: 'forced price failure',
          });
          return;
        }
        if (url.pathname.endsWith('/prices')) {
          await route.fulfill({
            status: 500,
            contentType: 'text/plain; charset=utf-8',
            body: 'forced price failure',
          });
          return;
        }
        await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      });
      await failureBranchesPage.goto(`${baseUrl}/aprice/`, { waitUntil: 'domcontentloaded' });
      await failureBranchesPage.locator('#home-search').fill('xss');
      await failureBranchesPage.locator('#home-search-button').click();
      await failureBranchesPage.waitForFunction(() => String(document.querySelector('#nearby-status')?.textContent || '').includes('价格读取失败'));
      assert.match(await failureBranchesPage.locator('#search-results').textContent(), /XSS Product/);
      assert.match(await failureBranchesPage.evaluate(() => String(document.querySelector('#nearby-map-status')?.textContent || '')), /地图读取失败|门店地图/);
      assert.equal(await failureBranchesPage.evaluate(() => window.__homeXss === true), false);
      assert.equal(await failureBranchesPage.locator('#search-results script, #search-results img[onerror]').count(), 0);
      assert.equal(await failureBranchesPage.locator('#geolocate-home').count(), 0);
      assert.equal(await failureBranchesPage.locator('#load-recent-prices').count(), 0);
      await failureBranchesPage.close();

      console.log('home-page browser test passed');
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
