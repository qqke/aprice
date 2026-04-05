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

function makeAdminProfile() {
  return {
    id: 'user-admin-1',
    email: 'admin@example.com',
    full_name: 'Admin User',
    role: 'admin',
    created_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-04T00:00:00.000Z',
  };
}

function makeProducts() {
  return [
    {
      id: 'loxonin-s',
      barcode: '4987188161027',
      name: 'Loxonin S',
      brand: 'Santen',
      pack: '12 tabs',
      category: 'pain-relief',
      tone: 'sunset',
      description: 'Synthetic admin fixture product',
      updated_at: '2026-04-04T01:00:00.000Z',
    },
    {
      id: 'eve-a',
      barcode: '4987300051234',
      name: 'EVE A',
      brand: 'SS Pharmaceuticals',
      pack: '20 tabs',
      category: 'pain-relief',
      tone: 'mint',
      description: 'Secondary fixture product',
      updated_at: '2026-04-03T01:00:00.000Z',
    },
  ];
}

function makeStores() {
  return [
    {
      id: 'sugi-hiroo',
      name: 'Sugi Pharmacy Hiroo',
      chain_name: 'Sugi',
      address: 'Tokyo, Shibuya-ku Hiroo 1-1-1',
      city: 'Tokyo',
      pref: 'Tokyo',
      lat: 35.648,
      lng: 139.722,
      hours: '09:00-22:00',
      updated_at: '2026-04-04T01:00:00.000Z',
    },
    {
      id: 'welcia-shibuya',
      name: 'Welcia Shibuya',
      chain_name: 'Welcia',
      address: 'Tokyo, Shibuya-ku 2-2-2',
      city: 'Tokyo',
      pref: 'Tokyo',
      lat: 35.661,
      lng: 139.698,
      hours: '10:00-23:00',
      updated_at: '2026-04-03T01:00:00.000Z',
    },
  ];
}

function makePrices() {
  const products = makeProducts();
  const stores = makeStores();
  return [
    {
      id: 'price-admin-1',
      product_id: 'loxonin-s',
      store_id: 'sugi-hiroo',
      price_yen: 698,
      is_member_price: false,
      source: 'manual',
      note: 'front shelf',
      collected_at: '2026-04-04T08:00:00.000Z',
      stores: stores[0],
      products: products[0],
    },
    {
      id: 'price-admin-2',
      product_id: 'loxonin-s',
      store_id: 'welcia-shibuya',
      price_yen: 728,
      is_member_price: true,
      source: 'manual',
      note: 'member shelf',
      collected_at: '2026-04-03T08:00:00.000Z',
      stores: stores[1],
      products: products[0],
    },
  ];
}

function responseFor(requestUrl, method) {
  const url = new URL(requestUrl);
  if (url.pathname.endsWith('/profiles')) return [makeAdminProfile()];
  if (url.pathname.endsWith('/products')) return makeProducts();
  if (url.pathname.endsWith('/stores')) return makeStores();
  if (url.pathname.endsWith('/prices')) return makePrices();
  if (url.pathname.includes('/rpc/')) return [{ ok: true, method }];
  return [];
}

async function startStaticServer() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      let pathname = url.pathname;
      if (pathname === '/' || pathname === '/aprice/') pathname = '/index.html';
      if (pathname.endsWith('/')) pathname += 'index.html';

      const filePath = toFilePath(pathname);
      if (!filePath) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }

      let finalPath = filePath;
      try {
        const fileStat = await stat(finalPath);
        if (fileStat.isDirectory()) finalPath = resolve(finalPath, 'index.html');
      } catch {
        if (pathname === '/index.html') throw new Error('dist not built');
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

async function waitForText(page, selector, expectedText) {
  // 统一等待指定节点出现目标文案，减少重复的 waitForFunction 写法。
  await page.waitForFunction(
    ([targetSelector, text]) => String(document.querySelector(targetSelector)?.textContent || '').includes(text),
    [selector, expectedText],
  );
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
      console.log(`admin-page browser test skipped: ${error.message}`);
      process.exitCode = 0;
      return;
    }

    try {
      const page = await browser.newPage();
      const pageErrors = [];
      const rpcCalls = [];

      async function waitForRpc(pathPart, timeoutMs = 5000) {
        const startedAt = Date.now();
        while (Date.now() - startedAt < timeoutMs) {
          if (rpcCalls.some((call) => call.url.includes(pathPart))) {
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        throw new Error('Timed out waiting for ' + pathPart);
      }

      async function clickConfirmAndWait(selector, pathPart) {
        page.once('dialog', (dialog) => dialog.accept());
        await page.locator(selector).click();
        await waitForRpc(pathPart);
      }

      page.on('pageerror', (error) => pageErrors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') pageErrors.push(message.text());
      });

      await page.route('https://esm.sh/@supabase/supabase-js@2.49.1', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'text/javascript; charset=utf-8',
          body: [
            'export function createClient(){',
            '  return {',
            '    auth: {',
            '      async getSession(){',
            '        return {',
            '          data: {',
            '            session: {',
            '              user: { id: "user-admin-1", email: "admin@example.com" },',
            '              access_token: "test-access-token",',
            '            },',
            '          },',
            '          error: null,',
            '        };',
            '      },',
            '      async getUser(){ return { data: { user: { id: "user-admin-1", email: "admin@example.com" } }, error: null }; },',
            '      onAuthStateChange(){ return { data: { subscription: { unsubscribe(){} } } }; },',
            '      async signOut(){ return { error: null }; },',
            '    },',
            '  };',
            '}',
          ].join('\n'),
        });
      });

      await page.route('**/rest/v1/**', async (route) => {
        const requestUrl = route.request().url();
        const method = route.request().method();
        if (method === 'POST') {
          const bodyText = route.request().postData() || '';
          let bodyJson = null;
          try {
            bodyJson = bodyText ? JSON.parse(bodyText) : null;
          } catch {
            bodyJson = null;
          }
          rpcCalls.push({
            url: requestUrl,
            method,
            bodyText,
            bodyJson,
          });
        }

        await route.fulfill({
          status: 200,
          contentType: 'application/json; charset=utf-8',
          body: JSON.stringify(responseFor(requestUrl, method)),
        });
      });

      await page.goto(`${baseUrl}/aprice/admin/`, { waitUntil: 'domcontentloaded' });

      await page.locator('#admin-status').waitFor({ state: 'attached' });
      await page.locator('#admin-access').waitFor({ state: 'attached' });
      await page.locator('#admin-products').waitFor({ state: 'attached' });
      await page.locator('#admin-stores').waitFor({ state: 'attached' });
      await page.locator('#admin-prices').waitFor({ state: 'attached' });

      await waitForText(page, '#admin-status', '可以开始维护数据');
      await waitForText(page, '#admin-access', '管理员权限已开启');

      const statusText = await page.locator('#admin-status').textContent();
      const accessText = await page.locator('#admin-access').textContent();
      const productListText = await page.locator('#admin-products').textContent();
      const storeListText = await page.locator('#admin-stores').textContent();
      const priceListText = await page.locator('#admin-prices').textContent();
      const productOptions = await page.locator('#price-product option').allTextContents();
      const storeOptions = await page.locator('#price-store option').allTextContents();

      assert.match(statusText || '', /可以开始维护数据/);
      assert.match(accessText || '', /管理员权限已开启/);
      assert.match(productListText || '', /Loxonin S/);
      assert.match(storeListText || '', /Sugi Pharmacy Hiroo/);
      assert.match(priceListText || '', /¥698/);
      assert.ok(productOptions.some((text) => text.includes('Loxonin S')));
      assert.ok(storeOptions.some((text) => text.includes('Sugi Pharmacy Hiroo')));

      await page.locator('[data-edit-product="eve-a"]').click();
      assert.equal(await page.locator('#product-id').inputValue(), 'eve-a');
      assert.equal(await page.locator('#product-name').inputValue(), 'EVE A');
      assert.equal(await page.locator('#product-brand').inputValue(), 'SS Pharmaceuticals');

      await page.locator('[data-edit-store="welcia-shibuya"]').click();
      assert.equal(await page.locator('#store-id').inputValue(), 'welcia-shibuya');
      assert.equal(await page.locator('#store-name').inputValue(), 'Welcia Shibuya');
      assert.equal(await page.locator('#store-chain').inputValue(), 'Welcia');

      await page.locator('[data-edit-price="price-admin-1"]').click();
      assert.equal(await page.locator('#price-product').inputValue(), 'loxonin-s');
      assert.equal(await page.locator('#price-store').inputValue(), 'sugi-hiroo');
      assert.equal(await page.locator('#price-yen').inputValue(), '698');
      assert.equal(await page.locator('#price-member').isChecked(), false);

      await page.locator('#product-id').fill('admin-fixture-product');
      await page.locator('#product-barcode').fill('4990000000001');
      await page.locator('#product-name').fill('Admin Fixture Product');
      await page.locator('#product-brand').fill('Aprice');
      await page.locator('#product-pack').fill('8 tabs');
      await page.locator('#product-category').fill('test-fixture');
      await page.locator('#product-description').fill('Browser regression fixture');
      await page.locator('#product-tone').selectOption('mint');
      await page.locator('#product-form button[type="submit"]').click();

      await page.waitForFunction(() => {
        const text = document.querySelector('#admin-status')?.textContent || '';
        return text.includes('可以开始维护数据');
      });

      assert.ok(
        rpcCalls.some((call) => call.url.includes('/rpc/admin_upsert_product')),
        `expected admin_upsert_product RPC, got ${rpcCalls.map((call) => `${call.method} ${call.url}`).join(' | ')}`,
      );
      assert.ok(
        rpcCalls.some((call) => call.url.includes('/rpc/admin_upsert_product') && call.bodyJson?.id === 'admin-fixture-product' && call.bodyJson?.name === 'Admin Fixture Product'),
        `expected admin_upsert_product payload, got ${rpcCalls.map((call) => JSON.stringify(call.bodyJson)).join(' | ')}`,
      );

      assert.ok(await page.locator('[data-edit-product="eve-a"]').count());

      await clickConfirmAndWait('#product-delete', '/rpc/admin_delete_product');
      assert.ok(rpcCalls.some((call) => call.url.includes('/rpc/admin_delete_product')),
        `expected admin_delete_product RPC, got ${rpcCalls.map((call) => `${call.method} ${call.url}`).join(' | ')}`);

      await page.locator('#store-id').fill('admin-fixture-store');
      await page.locator('#store-name').fill('Admin Fixture Store');
      await page.locator('#store-chain').fill('Aprice');
      await page.locator('#store-hours').fill('08:00-23:00');
      await page.locator('#store-address').fill('Tokyo, Chiyoda 1-1-1');
      await page.locator('#store-city').fill('Tokyo');
      await page.locator('#store-pref').fill('Tokyo');
      await page.locator('#store-lat').fill('35.6895');
      await page.locator('#store-lng').fill('139.6917');
      await page.locator('#store-form button[type="submit"]').click();
      await waitForText(page, '#admin-status', '可以开始维护数据');
      assert.ok(rpcCalls.some((call) => call.url.includes('/rpc/admin_upsert_store')),
        `expected admin_upsert_store RPC, got ${rpcCalls.map((call) => `${call.method} ${call.url}`).join(' | ')}`);
      assert.ok(
        rpcCalls.some((call) => call.url.includes('/rpc/admin_upsert_store') && call.bodyJson?.id === 'admin-fixture-store' && call.bodyJson?.name === 'Admin Fixture Store' && call.bodyJson?.chain_name === 'Aprice'),
        `expected admin_upsert_store payload, got ${rpcCalls.map((call) => JSON.stringify(call.bodyJson)).join(' | ')}`,
      );

      await page.locator('#price-product').selectOption('loxonin-s');
      await page.locator('#price-store').selectOption('sugi-hiroo');
      await page.locator('#price-yen').fill('688');
      await page.locator('#price-source').fill('admin test');
      await page.locator('#price-note').fill('browser regression');
      await page.locator('#price-collected').fill('2026-04-04T10:00');
      await page.locator('#price-member').setChecked(true);
      await page.locator('#price-form button[type="submit"]').click();
      await waitForText(page, '#admin-status', '可以开始维护数据');
      assert.ok(rpcCalls.some((call) => call.url.includes('/rpc/admin_upsert_price')),
        `expected admin_upsert_price RPC, got ${rpcCalls.map((call) => `${call.method} ${call.url}`).join(' | ')}`);
      assert.ok(
        rpcCalls.some((call) =>
          call.url.includes('/rpc/admin_upsert_price') &&
          call.bodyJson?.product_id === 'loxonin-s' &&
          call.bodyJson?.store_id === 'sugi-hiroo' &&
          String(call.bodyJson?.price_yen) === '688' &&
          String(call.bodyJson?.is_member_price) === 'true'
        ),
        `expected admin_upsert_price payload, got ${rpcCalls.map((call) => JSON.stringify(call.bodyJson)).join(' | ')}`,
      );

      await clickConfirmAndWait('[data-delete-store="welcia-shibuya"]', '/rpc/admin_delete_store');
      assert.ok(rpcCalls.some((call) => call.url.includes('/rpc/admin_delete_store')),
        `expected admin_delete_store RPC, got ${rpcCalls.map((call) => `${call.method} ${call.url}`).join(' | ')}`);

      await clickConfirmAndWait('[data-delete-price="price-admin-1"]', '/rpc/admin_delete_price');
      assert.ok(rpcCalls.some((call) => call.url.includes('/rpc/admin_delete_price')),
        `expected admin_delete_price RPC, got ${rpcCalls.map((call) => `${call.method} ${call.url}`).join(' | ')}`);

      assert.equal(pageErrors.length, 0, `page errors: ${pageErrors.join(' | ')}`);

      console.log('admin-page browser test passed');
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
























