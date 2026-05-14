import assert from 'node:assert/strict';

import { launchChromiumForTest } from '../../_playwright-launch.mjs';
import { startStaticServer } from '../../_browser-test-server.mjs';
import { waitForHidden, waitForText, waitForVisible } from '../../_browser-test-wait.mjs';

function makeEsmShimModuleBody() {
  return [
    'export function createClient(){',
    '  const calls = globalThis.__authCalls || (globalThis.__authCalls = []);',
    '  const storageKey = "__authShimSession";',
    '  function readSession(){',
    '    try {',
    '      const raw = globalThis.localStorage?.getItem(storageKey);',
    '      return raw ? JSON.parse(raw) : null;',
    '    } catch {',
    '      return null;',
    '    }',
    '  }',
    '  function writeSession(session){',
    '    try {',
    '      if (session) {',
    '        globalThis.localStorage?.setItem(storageKey, JSON.stringify(session));',
    '      } else {',
    '        globalThis.localStorage?.removeItem(storageKey);',
    '      }',
    '    } catch {}',
    '  }',
    '  function record(type, options){',
    '    calls.push({ type, options });',
    '    try {',
    '      const stored = JSON.parse(globalThis.localStorage?.getItem("__authCallsLog") || "[]");',
    '      stored.push({ type, options });',
    '      globalThis.localStorage?.setItem("__authCallsLog", JSON.stringify(stored));',
    '    } catch {}',
    '  }',
    '  return {',
    '    auth: {',
    '      async getSession(){ return { data: { session: readSession() }, error: null }; },',
    '      async getUser(){',
    '        const session = readSession();',
    '        return { data: { user: session?.user || null }, error: null };',
    '      },',
    '      onAuthStateChange(){ return { data: { subscription: { unsubscribe(){} } } }; },',
    '      async signOut(){',
    '        record("signOut");',
    '        writeSession(null);',
    '        return { error: null };',
    '      },',
    '      async signInWithPassword(options){',
    '        record("signIn", options);',
    '        const session = {',
    '          user: { id: "member-1", email: options.email },',
    '          access_token: "test-access-token",',
    '        };',
    '        writeSession(session);',
    '        return { data: { session, user: session.user }, error: null };',
    '      },',
    '      async signUp(options){',
    '        record("signUp", {',
    '          email: options.email,',
    '          password: options.password,',
    '          emailRedirectTo: options.options?.emailRedirectTo,',
    '          captchaToken: options.options?.captchaToken,',
    '        });',
    '        if (options.email === "taken@example.com") {',
    '          return { data: { session: null, user: { email: options.email, identities: [] } }, error: null };',
    '        }',
    '        return { data: { session: null, user: { email: options.email, identities: [{ provider: "email" }] } }, error: null };',
    '      },',
    '      async resetPasswordForEmail(email, options){',
    '        record("resetPasswordForEmail", { email, ...options });',
    '        return { data: {}, error: null };',
    '      },',
    '      async updateUser(options){',
    '        record("updateUser", options);',
    '        const session = {',
    '          user: { id: "member-1", email: "name@example.com" },',
    '          access_token: "test-access-token",',
    '        };',
    '        writeSession(session);',
    '        return { data: { user: session.user }, error: null };',
    '      },',
    '    }',
    '  };',
    '}',
  ].join('\n');
}

async function main() {
  const { server, baseUrl } = await startStaticServer();
  const browser = await launchChromiumForTest('login-page');

  try {
    if (!browser) {
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
    await page.addInitScript(() => {
      Object.defineProperty(window, '__APriceConfig', {
        configurable: true,
        get() {
          return window['__apriceConfigValue'];
        },
        set(value) {
          window['__apriceConfigValue'] = { ...(value || {}), turnstileSiteKey: 'test-turnstile-site-key' };
        },
      });
      window.turnstile = {
        render(_element, options) {
          window.__turnstileOptions = options;
          return 'test-widget';
        },
        reset() {
          window.__turnstileResets = (window.__turnstileResets || 0) + 1;
        },
      };
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
    assert.match(
      await page.getByRole('link', { name: '返回首页继续搜索' }).getAttribute('href'),
      /^(?:\/aprice\/|\/)$/,
      'login page home link should stay inside the app base path',
    );
    await waitForHidden(page, '#logout-button');

    const desktopMenuDisplay = await page.evaluate(() => {
      const element = document.querySelector('#nav-toggle');
      return element ? getComputedStyle(element).display : null;
    });
    assert.equal(desktopMenuDisplay, 'none', 'desktop subpages should hide the menu toggle');

    await page.setViewportSize({ width: 390, height: 844 });
    const mobileMenuDisplay = await page.evaluate(() => {
      const element = document.querySelector('#nav-toggle');
      return element ? getComputedStyle(element).display : null;
    });
    assert.notEqual(mobileMenuDisplay, 'none', 'mobile subpages should show the menu toggle');
    assert.equal(await page.locator('#mobile-nav').isHidden(), true, 'mobile subpage nav should start collapsed');
    await page.locator('#nav-toggle').click();
    assert.equal(await page.locator('#nav-toggle').getAttribute('aria-expanded'), 'true');
    assert.equal(await page.locator('#mobile-nav').isVisible(), true, 'mobile subpage nav should open from the menu toggle');
    await page.setViewportSize({ width: 1280, height: 900 });

    await waitForText(page, '#session-state', '未登录');
    await waitForText(page, '[data-auth-nav]', '登录');

    await page.locator('#email').fill('name@example.com');
    await page.locator('#password').fill('password123');
    await page.evaluate(() => window.__turnstileOptions?.callback?.('login-turnstile-token'));
    await waitForText(page, '#turnstile-status', '人机验证已完成');
    await page.locator('#auth-submit').click();

    await page.waitForURL(`**${redirectTarget}`);
    {
      const calls = await page.evaluate(() => JSON.parse(globalThis.localStorage?.getItem('__authCallsLog') || '[]'));
      const signInCall = calls.find((call) => call.type === 'signIn');
      assert.ok(signInCall, 'expected signIn call to be recorded');
      assert.equal(signInCall.options.options.captchaToken, 'login-turnstile-token');
    }
    await page.goto(`${baseUrl}/aprice/login/?redirect=${encodeURIComponent(redirectTarget)}`, { waitUntil: 'domcontentloaded' });

    await page.locator('#auth-form').waitFor({ state: 'attached' });
    await page.locator('#session-state').waitFor({ state: 'attached' });
    await page.locator('#auth-status').waitFor({ state: 'attached' });
    await waitForText(page, '#session-state', 'name@example.com');
    await waitForHidden(page, '#auth-form-shell');
    await waitForVisible(page, '#signed-in-state');
    await waitForVisible(page, '#logout-button');
    await waitForText(page, '#signed-in-action', '继续访问');
    await page.locator('#signed-in-action').waitFor({ state: 'attached' });
    assert.equal(await page.locator('#signed-in-action').getAttribute('href'), redirectTarget);
    await waitForText(page, '[data-auth-nav]', '退出');

    await page.locator('#switch-account-button').click();
    await waitForVisible(page, '#auth-form-shell');
    await waitForHidden(page, '#signed-in-state');
    await waitForText(page, '[data-auth-nav]', '登录');
    await waitForHidden(page, '#logout-button');

    await page.goto(`${baseUrl}/aprice/login/?redirect=${encodeURIComponent('https://evil.example/phish')}`, { waitUntil: 'domcontentloaded' });
    await page.locator('#auth-form').waitFor({ state: 'attached' });
    await page.locator('#session-state').waitFor({ state: 'attached' });
    await page.locator('#email').fill('name@example.com');
    await page.locator('#password').fill('password123');
    await page.evaluate(() => window.__turnstileOptions?.callback?.('safe-redirect-turnstile-token'));
    await page.locator('#auth-submit').click();
    await page.waitForURL('**/aprice/');

    await page.goto(`${baseUrl}/aprice/login/?redirect=${encodeURIComponent(redirectTarget)}`, { waitUntil: 'domcontentloaded' });
    await waitForVisible(page, '#signed-in-state');
    await page.locator('#switch-account-button').click();
    await waitForVisible(page, '#auth-form-shell');
    await page.goto(`${baseUrl}/aprice/login/?redirect=${encodeURIComponent(redirectTarget)}`, { waitUntil: 'domcontentloaded' });
    await waitForVisible(page, '#auth-form-shell');
    await page.locator('#mode-toggle').click();
    await waitForText(page, '#auth-panel-title', '注册账号');
    await page.locator('#email').fill('register@example.com');
    await page.locator('#password').fill('register123');
    await page.locator('#confirm-password').fill('register123');
    {
      const signUpCountBeforeCaptcha = await page.evaluate(() => (globalThis.__authCalls || []).filter((call) => call.type === 'signUp').length);
      await page.locator('#auth-submit').click();
      await waitForText(page, '#auth-status', '请先完成人机验证');
      const signUpCountAfterCaptchaBlock = await page.evaluate(() => (globalThis.__authCalls || []).filter((call) => call.type === 'signUp').length);
      assert.equal(signUpCountAfterCaptchaBlock, signUpCountBeforeCaptcha);
      await page.evaluate(() => window.__turnstileOptions?.callback?.('turnstile-token'));
      await waitForText(page, '#turnstile-status', '人机验证已完成');
    }
    await page.locator('#auth-submit').click();
    await waitForText(page, '#auth-status', '注册成功');
    {
      const calls = await page.evaluate(() => globalThis.__authCalls || []);
      const signUpCall = calls.find((call) => call.type === 'signUp');
      assert.ok(signUpCall, 'expected signUp call to be recorded');
      const signUpRedirect = new URL(signUpCall.options.emailRedirectTo);
      assert.equal(signUpRedirect.searchParams.get('redirect'), redirectTarget);
      assert.equal(signUpCall.options.captchaToken, 'turnstile-token');
      assert.ok(await page.evaluate(() => window.__turnstileResets >= 1), 'expected Turnstile to reset after register submit');
    }

    await page.locator('#mode-toggle').click();
    await waitForText(page, '#auth-panel-title', '注册账号');
    await page.locator('#email').fill('taken@example.com');
    await page.locator('#password').fill('register123');
    await page.locator('#confirm-password').fill('register123');
    await page.evaluate(() => window.__turnstileOptions?.callback?.('turnstile-token-2'));
    await page.locator('#auth-submit').click();
    await waitForText(page, '#auth-status', '该邮箱已注册');
    assert.ok(await page.evaluate(() => window.__turnstileResets >= 2), 'expected Turnstile to reset after register failure');

    await page.locator('#forgot-toggle').click();
    await waitForText(page, '#auth-panel-title', '找回密码');
    await page.locator('#email').fill('name@example.com');
    await page.evaluate(() => window.__turnstileOptions?.callback?.('reset-turnstile-token'));
    await waitForText(page, '#turnstile-status', '人机验证已完成');
    await page.locator('#auth-submit').click();
    await waitForText(page, '#auth-status', '重置链接已发送');
    {
      const calls = await page.evaluate(() => globalThis.__authCalls || []);
      const resetCall = calls.find((call) => call.type === 'resetPasswordForEmail');
      assert.ok(resetCall, 'expected resetPasswordForEmail call to be recorded');
      const resetRedirect = new URL(resetCall.options.redirectTo);
      assert.equal(resetRedirect.searchParams.get('mode'), 'reset');
      assert.equal(resetRedirect.searchParams.get('redirect'), redirectTarget);
      assert.equal(resetCall.options.captchaToken, 'reset-turnstile-token');
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
