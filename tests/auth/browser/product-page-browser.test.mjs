import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, normalize, resolve } from 'node:path';

import { chromium } from 'playwright';

const distRoot = resolve(process.cwd(), 'dist');
const browserPath = `${process.env.LOCALAPPDATA}\\ms-playwright\\chromium_headless_shell-1217\\chrome-headless-shell-win64\\chrome-headless-shell.exe`;

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
};

function toFilePath(urlPath) {
  const cleanPath = decodeURIComponent(String(urlPath || '/').split('?')[0].split('#')[0]).replace(/^\/+/, '');
  const strippedPath = cleanPath.startsWith('aprice/') ? cleanPath.slice('aprice/'.length) : cleanPath;
  if (strippedPath === 'lib/browser.js') return resolve(distRoot, 'browser.js');
  if (strippedPath === 'lib/browser-auth.js') return resolve(distRoot, 'browser-auth.js');
  if (strippedPath === 'lib/supabase-rest.js') return resolve(distRoot, 'supabase-rest.js');
  const joined = normalize(resolve(distRoot, strippedPath || 'index.html'));
  if (!joined.startsWith(normalize(distRoot))) return null;
  return joined;
}

function responseFor(requestUrl) {
  const url = new URL(requestUrl);
  if (url.pathname.endsWith('/stores')) {
    return [
      {
        id: 'sugi-hiroo',
        name: 'Sugi Pharmacy Hiroo',
        city: 'Tokyo',
        pref: 'Tokyo',
      },
      {
        id: 'welcia-shibuya',
        name: 'Welcia Shibuya',
        city: 'Tokyo',
        pref: 'Tokyo',
      },
    ];
  }

  if (url.pathname.endsWith('/prices')) {
    return [
      {
        id: 'price-1',
        product_id: 'loxonin-s',
        store_id: 'sugi-hiroo',
        price_yen: 698,
        is_member_price: false,
        source: 'manual',
        collected_at: '2026-04-03T08:00:00.000Z',
        stores: {
          id: 'sugi-hiroo',
          name: 'Sugi Pharmacy Hiroo',
          chain_name: 'Sugi',
          address: 'Tokyo, Shibuya',
          city: 'Tokyo',
          pref: 'Tokyo',
          lat: 35.648,
          lng: 139.722,
          hours: '09:00-22:00',
        },
        products: {
          id: 'loxonin-s',
          name: 'Loxonin S',
          barcode: '4987188161027',
          brand: 'Santen',
          pack: '12 tabs',
          tone: 'sunset',
        },
      },
      {
        id: 'price-2',
        product_id: 'loxonin-s',
        store_id: 'welcia-shibuya',
        price_yen: 728,
        is_member_price: true,
        source: 'manual',
        collected_at: '2026-04-04T08:00:00.000Z',
        stores: {
          id: 'welcia-shibuya',
          name: 'Welcia Shibuya',
          chain_name: 'Welcia',
          address: 'Tokyo, Shibuya',
          city: 'Tokyo',
          pref: 'Tokyo',
          lat: 35.661,
          lng: 139.698,
          hours: '10:00-23:00',
        },
        products: {
          id: 'loxonin-s',
          name: 'Loxonin S',
          barcode: '4987188161027',
          brand: 'Santen',
          pack: '12 tabs',
          tone: 'sunset',
        },
      },
    ];
  }

  return [];
}

async function startStaticServer() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      let pathname = url.pathname;
      if (pathname === '/' || pathname === '/aprice/') {
        pathname = '/index.html';
      }
      if (pathname.endsWith('/')) {
        pathname += 'index.html';
      }

      const filePath = toFilePath(pathname);
      if (!filePath) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      let finalPath = filePath;
      try {
        const fileStat = await stat(finalPath);
        if (fileStat.isDirectory()) {
          finalPath = resolve(finalPath, 'index.html');
        }
      } catch {
        if (pathname === '/index.html') {
          throw new Error('dist not built');
        }
        finalPath = resolve(distRoot, 'index.html');
      }

      const body = await readFile(finalPath);
      const type = mimeTypes[extname(finalPath)] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type });
      res.end(body);
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(String(error.message || error));
    }
  });

  await new Promise((resolvePromise) => server.listen(0, '127.0.0.1', resolvePromise));
  const address = server.address();
  assert.ok(address && typeof address === 'object', 'static server did not start');
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function main() {
  const { server, baseUrl } = await startStaticServer();
  let browser;

  try {
    try {
      browser = await chromium.launch({
        headless: true,
        executablePath: browserPath,
      });
    } catch (error) {
      console.log(`product-page browser test skipped: ${error.message}`);
      process.exitCode = 0;
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
          body: JSON.stringify(responseFor(requestUrl)),
        });
      });

      await page.goto(`${baseUrl}/aprice/product/loxonin-s/`, { waitUntil: 'networkidle' });
      await page.locator('#product-page').waitFor({ state: 'attached' });
      await page.locator('.product-title').waitFor({ state: 'attached' });
      const heroTitle = await page.locator('.product-title').textContent();
      const heroSub = await page.locator('.product-sub').textContent();
      const priceListText = await page.locator('#price-list').textContent();
      const nearbyListText = await page.locator('#nearby-store-list').textContent();
      const insightText = await page.locator('#insight-pills').textContent();
      const geoStatus = await page.locator('#geo-status').textContent();
      const storeOptions = await page.locator('#personal-store option').allTextContents();

      assert.match(heroTitle || '', /ロキソニンS|Loxonin S/);
      assert.ok((heroSub || '').length > 0);
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


























