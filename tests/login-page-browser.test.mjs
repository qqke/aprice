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
    const storageKey = '__aprice_test_session__';
    globalThis.__authCalls = globalThis.__authCalls || [];

    function readSession() {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) return JSON.parse(raw);
      } catch {}

      try {
        const marker = storageKey + '=';
        const rawName = window.name || '';
        if (rawName.startsWith(marker)) {
          return JSON.parse(rawName.slice(marker.length));
        }
      } catch {}

      return session;
    }

    function writeSession(nextSession) {
      session = nextSession;
      try {
        if (nextSession) {
          const serialized = JSON.stringify(nextSession);
          localStorage.setItem(storageKey, serialized);
          window.name = storageKey + '=' + serialized;
        } else {
          localStorage.removeItem(storageKey);
          window.name = '';
        }
      } catch {}
    }

    session = readSession();

    function notify(event) {
      for (const listener of listeners) {
        listener(event, session);
      }
    }

    export function createClient() {
      return {
        auth: {
          async getSession() {
            session = readSession();
            return { data: { session }, error: null };
          },
          async getUser() {
            session = readSession();
            return { data: { user: session?.user || null }, error: null };
          },
          async signUp({ email, options }) {
            globalThis.__authCalls.push({ type: 'signUp', email, options });
            return { data: { user: { id: 'new-user', email }, session: null }, error: null };
          },
          async signInWithPassword({ email }) {
            writeSession({ user: { id: 'signed-in-user', email }, access_token: 'test-access-token' });
            notify('SIGNED_IN');
            return { data: { session }, error: null };
          },
          async resetPasswordForEmail(email, options) {
            globalThis.__authCalls.push({ type: 'resetPasswordForEmail', email, options });
            return { data: {}, error: null };
          },
          async updateUser() {
            return { data: { user: session?.user || null }, error: null };
          },
          async signOut() {
            writeSession(null);
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
  `;
}

async function waitForText(page, selector, expectedText) {
  // 统一等待指定节点出现目标文案，避免到处重复写 waitForFunction。
  await page.waitForFunction(
    ([targetSelector, text]) => {
      return String(document.querySelector(targetSelector)?.textContent || '').includes(text);
    },
    [selector, expectedText],
  );
}

async function waitForHidden(page, selector) {
  // 统一等待节点隐藏，登录态切换时只保留这一种判断方式。
  await page.waitForFunction(
    ([targetSelector]) => document.querySelector(targetSelector)?.hidden === true,
    [selector],
  );
}

async function waitForVisible(page, selector) {
  // 统一等待节点显示，避免同类逻辑散落在测试里。
  await page.waitForFunction(
    ([targetSelector]) => document.querySelector(targetSelector)?.hidden === false,
    [selector],
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
      console.log(`login-page browser test skipped: ${error.message}`);
      process.exitCode = 0;
      return;
    }

    const page = await browser.newPage();
    const pageErrors = [];
    const authCalls = [];
    const redirectTarget = '/aprice/product/loxonin-s/';

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

    await page.goto(`${baseUrl}/aprice/login/?redirect=${encodeURIComponent(redirectTarget)}`, { waitUntil: 'domcontentloaded' });

    await page.locator('#auth-form').waitFor({ state: 'attached' });
    await page.locator('#session-state').waitFor({ state: 'attached' });
    await page.locator('#auth-status').waitFor({ state: 'attached' });

    await waitForText(page, '#session-state', '未登录');

    await page.locator('#email').fill('name@example.com');
    await page.locator('#password').fill('password123');
    await page.locator('#auth-submit').click();

    await page.waitForURL(`**${redirectTarget}`);
    await page.goto(`${baseUrl}/aprice/login/?redirect=${encodeURIComponent(redirectTarget)}`, { waitUntil: 'domcontentloaded' });

    await page.locator('#auth-form').waitFor({ state: 'attached' });
    await page.locator('#session-state').waitFor({ state: 'attached' });
    await page.locator('#auth-status').waitFor({ state: 'attached' });
    await waitForText(page, '#session-state', 'name@example.com');
    await waitForHidden(page, '#auth-form-shell');
    await waitForVisible(page, '#signed-in-state');
    await waitForText(page, '#signed-in-action', '继续访问');
    await page.locator('#signed-in-action').waitFor({ state: 'attached' });
    assert.equal(await page.locator('#signed-in-action').getAttribute('href'), redirectTarget);

    await page.locator('#switch-account-button').click();
    await waitForVisible(page, '#auth-form-shell');
    await waitForHidden(page, '#signed-in-state');
    await waitForText(page, '[data-auth-nav]', '登录');

    await page.locator('#logout-button').click();
    await page.waitForURL('**/aprice/');

    await page.goto(`${baseUrl}/aprice/login/?redirect=${encodeURIComponent('https://evil.example/phish')}`, { waitUntil: 'domcontentloaded' });
    await page.locator('#auth-form').waitFor({ state: 'attached' });
    await page.locator('#session-state').waitFor({ state: 'attached' });
    await page.locator('#email').fill('name@example.com');
    await page.locator('#password').fill('password123');
    await page.locator('#auth-submit').click();
    await page.waitForURL('**/aprice/');

    await page.goto(`${baseUrl}/aprice/login/?redirect=${encodeURIComponent(redirectTarget)}`, { waitUntil: 'domcontentloaded' });
    await waitForVisible(page, '#signed-in-state');
    await page.locator('#switch-account-button').click();
    await waitForVisible(page, '#auth-form-shell');
    await page.goto(`${baseUrl}/aprice/login/?redirect=${encodeURIComponent(redirectTarget)}`, { waitUntil: 'domcontentloaded' });
    await page.locator('#mode-toggle').click();
    await waitForText(page, '#auth-panel-title', '注册账号');
    await page.locator('#email').fill('register@example.com');
    await page.locator('#password').fill('register123');
    await page.locator('#confirm-password').fill('register123');
    await page.locator('#auth-submit').click();
    await waitForText(page, '#auth-status', '注册成功');
    {
      const calls = await page.evaluate(() => globalThis.__authCalls || []);
      const signUpCall = calls.find((call) => call.type === 'signUp');
      assert.ok(signUpCall, 'expected signUp call to be recorded');
      const signUpRedirect = new URL(signUpCall.options.emailRedirectTo);
      assert.equal(signUpRedirect.searchParams.get('redirect'), redirectTarget);
    }

    await page.locator('#forgot-toggle').click();
    await waitForText(page, '#auth-panel-title', '找回密码');
    await page.locator('#email').fill('name@example.com');
    await page.locator('#auth-submit').click();
    await waitForText(page, '#auth-status', '重置链接已发送');
    {
      const calls = await page.evaluate(() => globalThis.__authCalls || []);
      const resetCall = calls.find((call) => call.type === 'resetPasswordForEmail');
      assert.ok(resetCall, 'expected resetPasswordForEmail call to be recorded');
      const resetRedirect = new URL(resetCall.options.emailRedirectTo);
      assert.equal(resetRedirect.searchParams.get('mode'), 'reset');
      assert.equal(resetRedirect.searchParams.get('redirect'), redirectTarget);
    }

    await page.goto(`${baseUrl}/aprice/login/?mode=reset&type=recovery&redirect=${encodeURIComponent(redirectTarget)}`, { waitUntil: 'domcontentloaded' });
    await page.locator('#auth-form').waitFor({ state: 'attached' });
    await waitForText(page, '#auth-panel-title', '重置密码');
    await page.locator('#password').fill('newpassword123');
    await page.locator('#confirm-password').fill('newpassword123');
    await page.locator('#auth-submit').click();
    await page.waitForURL(`**${redirectTarget}`);

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
