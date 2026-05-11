import assert from 'node:assert/strict';

import { launchChromiumForTest } from './_playwright-launch.mjs';
import { startStaticServer } from './_browser-test-server.mjs';
import { waitForText } from './_browser-test-wait.mjs';

function makeSupabaseShimModuleBody({ signedIn = false, role = 'member' } = {}) {
  const session = signedIn
    ? `{ user: { id: "${role}-1", email: "${role}@example.com" }, access_token: "${role}-access-token" }`
    : 'null';
  const user = signedIn
    ? `{ id: "${role}-1", email: "${role}@example.com" }`
    : 'null';

  return [
    'export function createClient(){',
    '  window.__shellAuthCalls = window.__shellAuthCalls || [];',
    '  window.__shellAuthCalls.push("createClient");',
    '  return {',
    '    auth: {',
    `      async getSession(){ window.__shellAuthCalls.push("getSession"); return { data: { session: ${session} }, error: null }; },`,
    `      async getUser(){ window.__shellAuthCalls.push("getUser"); return { data: { user: ${user} }, error: null }; },`,
    '      onAuthStateChange(callback){ window.__shellAuthCalls.push("onAuthStateChange"); callback?.("SIGNED_IN", null); return { data: { subscription: { unsubscribe(){ window.__shellAuthCalls.push("unsubscribe"); } } } }; },',
    '      async signOut(){ window.__shellAuthCalls.push("signOut"); window.localStorage.setItem("aprice:test-signout", "1"); return { error: null }; },',
    '    },',
    '  };',
    '}',
  ].join('\n');
}

async function routeShellAuth(page, { signedIn = false, role = 'member', failProfile = false } = {}) {
  const restCalls = [];
  let esmCalls = 0;

  await page.route('https://esm.sh/@supabase/supabase-js@2.105.4', async (route) => {
    esmCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: 'text/javascript; charset=utf-8',
      body: makeSupabaseShimModuleBody({ signedIn, role }),
    });
  });

  await page.route('**/rest/v1/**', async (route) => {
    const requestUrl = route.request().url();
    const url = new URL(requestUrl);
    restCalls.push({ method: route.request().method(), url: requestUrl });

    if (failProfile && url.pathname.endsWith('/profiles')) {
      await route.fulfill({
        status: 500,
        contentType: 'text/plain; charset=utf-8',
        body: 'forced profile failure',
      });
      return;
    }

    if (url.pathname.endsWith('/profiles')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json; charset=utf-8',
        body: JSON.stringify([
          {
            id: `${role}-1`,
            email: `${role}@example.com`,
            full_name: `${role} user`,
            role,
            created_at: '2026-04-01T00:00:00.000Z',
            updated_at: '2026-04-01T00:00:00.000Z',
          },
        ]),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json; charset=utf-8',
      body: '[]',
    });
  });

  return {
    restCalls,
    getEsmCalls: () => esmCalls,
  };
}

async function main() {
  const { server, baseUrl } = await startStaticServer();
  const browser = await launchChromiumForTest('shell-auth');

  try {
    if (!browser) return;

    try {
      const guestPage = await browser.newPage();
      const guestErrors = [];
      guestPage.on('pageerror', (error) => guestErrors.push(error.message));
      guestPage.on('console', (message) => {
        if (message.type() === 'error') guestErrors.push(message.text());
      });
      const guestRoutes = await routeShellAuth(guestPage, { signedIn: false });
      await guestPage.goto(`${baseUrl}/aprice/`, { waitUntil: 'domcontentloaded' });

      const guestChipUrl = new URL(await guestPage.locator('#session-chip').getAttribute('href'), baseUrl);
      const guestNavUrl = new URL(await guestPage.locator('[data-auth-nav]').getAttribute('href'), baseUrl);
      const guestMobileUrl = new URL(await guestPage.locator('[data-auth-nav-mobile]').getAttribute('href'), baseUrl);
      assert.equal(guestChipUrl.pathname, '/aprice/login/');
      assert.equal(guestChipUrl.searchParams.get('redirect'), '/aprice/');
      assert.equal(guestNavUrl.pathname, '/aprice/login/');
      assert.equal(guestNavUrl.searchParams.get('redirect'), '/aprice/');
      assert.equal(guestMobileUrl.pathname, '/aprice/login/');
      assert.equal(guestMobileUrl.searchParams.get('redirect'), '/aprice/');
      assert.equal(guestRoutes.getEsmCalls(), 0, 'auth module should not load before hint, timer, or interaction');

      await guestPage.mouse.click(10, 10);
      await waitForText(guestPage, '#session-chip', '未登录');
      assert.equal((await guestPage.locator('[data-auth-nav]').textContent())?.trim(), '登录');
      assert.equal(guestErrors.length, 0, `guest page errors: ${guestErrors.join(' | ')}`);

      const memberContext = await browser.newContext();
      try {
        await memberContext.addInitScript(() => localStorage.setItem('aprice:session-hint', 'signed-in'));
        const memberPage = await memberContext.newPage();
        const memberErrors = [];
        memberPage.on('pageerror', (error) => memberErrors.push(error.message));
        memberPage.on('console', (message) => {
          if (message.type() === 'error') memberErrors.push(message.text());
        });
        const memberRoutes = await routeShellAuth(memberPage, { signedIn: true, role: 'member' });
        await memberPage.goto(`${baseUrl}/aprice/scan/`, { waitUntil: 'domcontentloaded' });
        await waitForText(memberPage, '#session-chip', 'member@example.com');
        const memberChipUrl = new URL(await memberPage.locator('#session-chip').getAttribute('href'), baseUrl);
        assert.equal(memberChipUrl.pathname, '/aprice/me/');
        assert.equal((await memberPage.locator('[data-auth-nav]').textContent())?.trim(), '退出登录');
        assert.equal(await memberPage.locator('[data-auth-nav]').getAttribute('href'), '#');
        assert.ok(memberRoutes.restCalls.some((call) => call.url.includes('/rest/v1/profiles')));

        await memberPage.locator('[data-auth-nav]').click();
        await memberPage.waitForURL('**/aprice/login/**');
        const loginUrl = new URL(memberPage.url());
        assert.equal(loginUrl.searchParams.get('redirect'), '/aprice/scan/');
        assert.equal(await memberPage.evaluate(() => localStorage.getItem('aprice:test-signout')), '1');
        assert.equal(memberErrors.length, 0, `member page errors: ${memberErrors.join(' | ')}`);
      } finally {
        await memberContext.close();
      }

      const adminContext = await browser.newContext();
      try {
        await adminContext.addInitScript(() => localStorage.setItem('aprice:session-hint', 'signed-in'));
        const adminPage = await adminContext.newPage();
        await routeShellAuth(adminPage, { signedIn: true, role: 'admin' });
        await adminPage.goto(`${baseUrl}/aprice/me/`, { waitUntil: 'domcontentloaded' });
        await waitForText(adminPage, '#session-chip', '管理员');
        const adminChipUrl = new URL(await adminPage.locator('#session-chip').getAttribute('href'), baseUrl);
        assert.equal(adminChipUrl.pathname, '/aprice/admin/');
      } finally {
        await adminContext.close();
      }

      const failingContext = await browser.newContext();
      try {
        await failingContext.addInitScript(() => localStorage.setItem('aprice:session-hint', 'signed-in'));
        const failingPage = await failingContext.newPage();
        const failingErrors = [];
        failingPage.on('pageerror', (error) => failingErrors.push(error.message));
        failingPage.on('console', (message) => {
          if (message.type() === 'error') failingErrors.push(message.text());
        });
        await routeShellAuth(failingPage, { signedIn: true, role: 'member', failProfile: true });
        await failingPage.goto(`${baseUrl}/aprice/`, { waitUntil: 'domcontentloaded' });
        await waitForText(failingPage, '#session-chip', '未登录');
        const fallbackChipUrl = new URL(await failingPage.locator('#session-chip').getAttribute('href'), baseUrl);
        assert.equal(fallbackChipUrl.pathname, '/aprice/login/');
        assert.equal((await failingPage.locator('[data-auth-nav]').textContent())?.trim(), '登录');
        assert.equal(failingErrors.length, 0, `failing page errors: ${failingErrors.join(' | ')}`);
      } finally {
        await failingContext.close();
      }

      console.log('shell-auth browser test passed');
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
