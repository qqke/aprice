import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, normalize, resolve } from 'node:path';

import { chromium } from 'playwright';

const distRoot = resolve(process.cwd(), 'dist');
const browserPath = `${process.env.LOCALAPPDATA}\\ms-playwright\\chromium-1217\\chrome-win64\\chrome.exe`;

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
      console.log(`me-page browser test skipped: ${error.message}`);
      process.exitCode = 0;
      return;
    }

    try {
      const page = await browser.newPage();

      // The /me page checks auth state via supabase-js. Stub the module so we deterministically stay logged out.
      await page.route('https://esm.sh/@supabase/supabase-js@2.49.1', async (route) => {
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
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: '[]',
        });
      });

      await page.goto(`${baseUrl}/aprice/me/`, { waitUntil: 'networkidle' });

      await page.locator('#my-logs').waitFor({ state: 'attached' });
      await page.locator('#recent-views').waitFor({ state: 'attached' });
      await page.locator('#my-favorites').waitFor({ state: 'attached' });
      await page.locator('#log-status').waitFor({ state: 'attached' });

      const logsText = await page.locator('#my-logs').textContent();
      const recentText = await page.locator('#recent-views').textContent();
      const favsText = await page.locator('#my-favorites').textContent();
      const statusText = await page.locator('#log-status').textContent();

      assert.match(logsText || '', /请登录/);
      assert.match(favsText || '', /未登录/);
      assert.match(recentText || '', /暂无浏览记录/);
      assert.match(statusText || '', /登录后/);

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






