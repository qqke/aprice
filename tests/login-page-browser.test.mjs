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
  return `
    let session = null;
    const listeners = new Set();

    function notify(event) {
      for (const listener of listeners) {
        listener(event, session);
      }
    }

    export function createClient() {
      return {
        auth: {
          async getSession() {
            return { data: { session }, error: null };
          },
          async getUser() {
            return { data: { user: session?.user || null }, error: null };
          },
          async signUp({ email }) {
            return { data: { user: { id: 'new-user', email }, session: null }, error: null };
          },
          async signInWithPassword({ email }) {
            session = { user: { id: 'signed-in-user', email }, access_token: 'test-access-token' };
            notify('SIGNED_IN');
            return { data: { session }, error: null };
          },
          async resetPasswordForEmail() {
            return { data: {}, error: null };
          },
          async updateUser() {
            return { data: { user: session?.user || null }, error: null };
          },
          async signOut() {
            session = null;
            notify('SIGNED_OUT');
            return { error: null };
          },
          onAuthStateChange(callback) {
            listeners.add(callback);
            queueMicrotask(() => callback('INITIAL_SESSION', session));
            return { data: { subscription: { unsubscribe() { listeners.delete(callback); } } } };
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
    const authCalls = [];

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

    await page.route('**/rest/v1/profiles**', async (route) => {
      const url = route.request().url();
      if (url.includes('role')) {
        await route.fulfill({
          status: 400,
          contentType: 'application/json; charset=utf-8',
          body: JSON.stringify({ code: '42703', message: 'column profiles.role does not exist' }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify([
          {
            id: 'member-1',
            email: 'name@example.com',
            full_name: 'Member User',
            created_at: '2026-04-04T00:00:00.000Z',
            updated_at: '2026-04-04T00:00:00.000Z',
          },
        ]),
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

    await page.locator('#auth-form').waitFor({ state: 'attached' });
    await page.locator('#session-state').waitFor({ state: 'attached' });
    await page.locator('#auth-status').waitFor({ state: 'attached' });

    await page.waitForFunction(() => /未登录/.test(document.querySelector('#session-state')?.textContent || ''));

    await page.locator('#email').fill('name@example.com');
    await page.locator('#password').fill('password123');
    await page.locator('#auth-submit').click();

    await page.waitForFunction(() => /登录成功/.test(document.querySelector('#auth-status')?.textContent || ''));
    await page.waitForFunction(() => /name@example.com/.test(document.querySelector('#session-state')?.textContent || ''));

    await page.locator('#logout-button').click();
    await page.waitForURL('**/aprice/');

    await page.goto(`${baseUrl}/aprice/login/`, { waitUntil: 'domcontentloaded' });
    await page.locator('#mode-toggle').click();
    await page.waitForFunction(() => /注册账号/.test(document.querySelector('#auth-panel-title')?.textContent || ''));
    await page.locator('#email').fill('register@example.com');
    await page.locator('#password').fill('register123');
    await page.locator('#confirm-password').fill('register123');
    await page.locator('#auth-submit').click();
    await page.waitForFunction(() => /注册成功/.test(document.querySelector('#auth-status')?.textContent || ''));

    await page.locator('#forgot-toggle').click();
    await page.waitForFunction(() => /找回密码/.test(document.querySelector('#auth-panel-title')?.textContent || ''));
    await page.locator('#email').fill('name@example.com');
    await page.locator('#auth-submit').click();
    await page.waitForFunction(() => /重置链接已发送/.test(document.querySelector('#auth-status')?.textContent || ''));

    await page.goto(`${baseUrl}/aprice/login/?mode=reset&type=recovery`, { waitUntil: 'domcontentloaded' });
    await page.locator('#auth-form').waitFor({ state: 'attached' });
    await page.waitForFunction(() => /重置密码/.test(document.querySelector('#auth-panel-title')?.textContent || ''));
    await page.locator('#password').fill('newpassword123');
    await page.locator('#confirm-password').fill('newpassword123');
    await page.locator('#auth-submit').click();
    await page.waitForFunction(() => /密码已更新/.test(document.querySelector('#auth-status')?.textContent || ''));

    authCalls.push('login/register/reset flow covered');

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



