import assert from 'node:assert/strict';

import { launchChromiumForTest } from './_playwright-launch.mjs';
import { makeScanPageResponseForRequest } from './_browser-test-fixtures.mjs';
import { startStaticServer } from './_browser-test-server.mjs';

async function main() {
  const { server, baseUrl } = await startStaticServer();
  const browser = await launchChromiumForTest('scan-page');

  try {
    if (!browser) {
      return;
    }

    try {
      const page = await browser.newPage();
      const requests = [];
      page.on('request', (request) => requests.push(request.url()));

      await page.route('**/rest/v1/**', async (route) => {
        const requestUrl = route.request().url();
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(makeScanPageResponseForRequest(requestUrl)),
        });
      });

      await page.goto(`${baseUrl}/aprice/scan/`, { waitUntil: 'domcontentloaded' });
      await page.locator('#barcode-input').fill('0019014614042');
      await Promise.all([
        page.waitForURL(/\/aprice\/product\/0019014614042\/$/),
        page.locator('#barcode-search').click(),
      ]);

      await page.locator('#product-page').waitFor({ state: 'attached' });
      await page.locator('.product-title').waitFor({ state: 'attached' });
      await page.waitForFunction(() => document.querySelector('#price-list')?.textContent?.includes('Sugi Pharmacy Hiroo'));
      const heroTitle = await page.locator('.product-title').textContent();
      const priceListText = await page.locator('#price-list').textContent();
      const geoStatus = await page.locator('#geo-status').textContent();

      assert.match(heroTitle || '', /\S/);
      assert.match(priceListText || '', /Sugi Pharmacy Hiroo/);
      assert.match(geoStatus || '', /已加载 1 条价格记录|已加载 2 条价格记录/);
      assert.match(requests.join('\n'), /barcode=eq\.0019014614042/);
      assert.match(requests.join('\n'), /\/rest\/v1\/products/);
      assert.match(requests.join('\n'), /\/rest\/v1\/prices/);

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
