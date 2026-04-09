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
  if (strippedPath === 'lib/supabase-rest.js') return resolve(distRoot, 'supabase-rest.js');
  const joined = normalize(resolve(distRoot, strippedPath || 'index.html'));
  if (!joined.startsWith(normalize(distRoot))) return null;
  return joined;
}

function productResponse() {
  return {
    id: 'loxonin-s',
    name: 'Loxonin S',
    brand: 'Santen',
    pack: '12 tabs',
    barcode: '4987188161027',
    category: '鎮痛薬',
    tone: 'sunset',
    description: '日本の薬店でよく見かける定番OTC。',
  };
}

function responseFor(requestUrl) {
  const url = new URL(requestUrl);
  if (url.pathname.endsWith('/products')) {
    if (url.searchParams.get('barcode')?.includes('4987188161027')) {
      return [productResponse()];
    }
    const or = url.searchParams.get('or') || '';
    if (or.includes('name.ilike') || or.includes('brand.ilike') || or.includes('category.ilike')) {
      return [productResponse()];
    }
    return [productResponse()];
  }

  if (url.pathname.endsWith('/stores')) {
    return [
      { id: 'sugi-hiroo', name: 'Sugi Pharmacy Hiroo', city: 'Tokyo', pref: 'Tokyo' },
      { id: 'welcia-shibuya', name: 'Welcia Shibuya', city: 'Tokyo', pref: 'Tokyo' },
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
      console.log(`scan-page browser test skipped: ${error.message}`);
      process.exitCode = 0;
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
          body: JSON.stringify(responseFor(requestUrl)),
        });
      });

      await page.goto(`${baseUrl}/aprice/scan/`, { waitUntil: 'domcontentloaded' });
      await page.locator('#barcode-input').fill('4987188161027');
      await Promise.all([
        page.waitForURL(/\/aprice\/product\/loxonin-s\/$/),
        page.locator('#barcode-search').click(),
      ]);

      await page.locator('#product-page').waitFor({ state: 'attached' });
      await page.locator('.product-title').waitFor({ state: 'attached' });
      await page.waitForFunction(() => document.querySelector('#price-list')?.textContent?.includes('Sugi Pharmacy Hiroo'));
      const heroTitle = await page.locator('.product-title').textContent();
      const priceListText = await page.locator('#price-list').textContent();
      const geoStatus = await page.locator('#geo-status').textContent();

      assert.match(heroTitle || '', /Loxonin S|ロキソニンS/);
      assert.match(priceListText || '', /Sugi Pharmacy Hiroo/);
      assert.match(geoStatus || '', /已加载 1 条价格记录|已加载 2 条价格记录/);
      assert.match(requests.join('\n'), /barcode=eq\.4987188161027/);
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
