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
  const browser = await launchChromiumForTest('product-scan-entry');

  try {
    if (!browser) {
      return;
    }

    try {
      const page = await browser.newPage();
      const pageErrors = [];
      const productSlug = '9999999999999';
      const personalLogs = makePersonalPriceLogs().map((entry) => ({ ...entry, product_id: productSlug }));
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
        const url = new URL(requestUrl);

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

      await page.goto(`${baseUrl}/aprice/product/${productSlug}/?selectNearestStore=1#product-personal-record`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => document.querySelector('#personal-store')?.value === 'sugi-hiroo', null, { timeout: 10000 });

      assert.equal(await page.locator('#personal-selected-store-label').textContent(), 'Sugi Pharmacy Hiroo');
      assert.equal(await page.locator('#personal-store').inputValue(), 'sugi-hiroo');
      assert.equal(await page.locator('#personal-log-form button[type="submit"]').isEnabled(), true);
      assert.match(await page.locator('#personal-store-list .store-picker__item').first().textContent(), /Sugi Pharmacy Hiroo/);
      assert.equal(await page.locator('#personal-price').inputValue(), '688');
      assert.equal(pageErrors.filter((message) => !message.includes('Failed to load resource')).length, 0, `page errors: ${pageErrors.join(' | ')}`);

      console.log('product scan entry browser test passed');
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
