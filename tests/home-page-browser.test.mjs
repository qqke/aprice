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
  if (url.pathname.endsWith('/products')) {
    const or = url.searchParams.get('or') || '';
    if (or.includes('name.ilike') || or.includes('brand.ilike') || or.includes('category.ilike')) {
      return [
        {
          id: 'loxonin-s',
          name: 'Loxonin S',
          brand: 'Santen',
          pack: '12 tabs',
          barcode: '4987188161027',
        },
      ];
    }

    return [
      {
        id: 'aspirin-81',
        name: 'Aspirin 81',
        brand: 'Bayer',
        pack: '100 tabs',
        barcode: '4987123456789',
      },
    ];
  }

  if (url.pathname.endsWith('/prices')) {
    return [];
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

async function waitForText(page, selector, expectedText) {
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
      console.log(`home-page browser test skipped: ${error.message}`);
      process.exitCode = 0;
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
          body: JSON.stringify(responseFor(requestUrl)),
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

      const ssrContext = await browser.newContext({ javaScriptEnabled: false });
      try {
        const ssrPage = await ssrContext.newPage();
        await ssrPage.goto(`${baseUrl}/aprice/`, { waitUntil: 'domcontentloaded' });
        await ssrPage.locator('#session-chip').waitFor({ state: 'attached' });
        await ssrPage.locator('a[data-auth-nav="true"]').waitFor({ state: 'attached' });

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
