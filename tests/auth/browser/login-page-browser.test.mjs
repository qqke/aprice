import assert from 'node:assert/strict';

import { launchChromiumForTest } from '../../_playwright-launch.mjs';
import { startStaticServer } from '../../_browser-test-server.mjs';
import { waitForHidden, waitForText, waitForVisible } from '../../_browser-test-wait.mjs';

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
