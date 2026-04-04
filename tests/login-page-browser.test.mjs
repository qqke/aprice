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
        if (pathname === '/login/index.html' || pathname === '/aprice/login/index.html') {
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

function makeEsmShimModuleBody() {
  // The app's browser runtime lazily imports Supabase from esm.sh.
  // For this regression, we only need `createClient()` with the auth methods used on /login.
  return `
    export function createClient() {
      return {
        auth: {
          async getSession() {
            return { data: { session: null }, error: null };
          },
          async signInWithOtp() {
            return { data: null, error: null };
          },
          async signOut() {
            return { error: null };
          },
        },
      };
    }
  `.trim();
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
      console.log(`login-page browser test skipped: ${error.message}`);
      process.exitCode = 0;
      return;
    }

    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') pageErrors.push(message.text());
    });

    await page.route('https://esm.sh/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/javascript; charset=utf-8',
        body: makeEsmShimModuleBody(),
      });
    });

    await page.route('**/rest/v1/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: '[]',
      });
    });

    await page.goto(`${baseUrl}/aprice/login/`, { waitUntil: 'domcontentloaded' });

    await page.locator('#login-form').waitFor({ state: 'attached' });
    await page.locator('#email').waitFor({ state: 'attached' });
    await page.locator('#login-status').waitFor({ state: 'attached' });
    await page.locator('#session-state').waitFor({ state: 'attached' });

    // On load, refreshSession() should render the guest view (no session).
    await page.waitForFunction(() => {
      const el = document.querySelector('#session-state');
      return el && /未登录/.test(el.textContent || '');
    });

    await page.locator('#email').fill('name@example.com');
    await page.locator('#login-form button[type="submit"]').click();

    // Should update the status label and not crash.
    await page.waitForFunction(() => {
      const el = document.querySelector('#login-status');
      const text = el?.textContent || '';
      return text.includes('正在发送登录链接') || text.includes('登录链接已发送') || text.includes('发送失败');
    });

    assert.equal(pageErrors.length, 0, `page errors: ${pageErrors.join(' | ')}`);

    console.log('login-page browser test passed');
  } finally {
    await browser?.close();
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
