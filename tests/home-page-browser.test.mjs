import assert from 'node:assert/strict';

import { launchChromiumForTest } from './_playwright-launch.mjs';
import { makeHomePageResponseForRequest } from './_browser-test-fixtures.mjs';
import { startStaticServer } from './_browser-test-server.mjs';
import { waitForText } from './_browser-test-wait.mjs';

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
      await waitForText(page, '#search-status', '找到 1 条匹配结果');
      await waitForText(page, '#nearby-status', '暂无价格记录');

      const resultText = await page.locator('#search-results').textContent();
      const nearbyText = await page.locator('#nearby-results').textContent();
      const recentStatusText = await page.locator('#recent-status').textContent();

      assert.match(resultText || '', /Loxonin S/);
      assert.match(nearbyText || '', /当前还没有价格记录/);
      assert.match(recentStatusText || '', /点击按钮后加载最近采样/);
      assert.match(requests.join('\n'), /name\.ilike/);
      assert.match(requests.join('\n'), /\/rest\/v1\/products/);
      assert.match(requests.join('\n'), /\/rest\/v1\/prices/);

      await page.locator('#load-recent-prices').click();
      await waitForText(page, '#recent-status', '暂无最近价格采样');

      const recentText = await page.locator('#recently-viewed').textContent();
      assert.match(recentText || '', /暂无采样/);

      await page.setViewportSize({ width: 390, height: 844 });
      const mobileMenuDisplay = await page.evaluate(() => {
        const element = document.querySelector('#nav-toggle');
        return element ? getComputedStyle(element).display : null;
      });
      assert.notEqual(mobileMenuDisplay, 'none', 'mobile homepage should keep the menu toggle');

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
