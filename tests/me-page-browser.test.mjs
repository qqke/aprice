import assert from 'node:assert/strict';

import { launchChromiumForTest } from './_playwright-launch.mjs';
import { startStaticServer } from './_browser-test-server.mjs';
import { waitForVisible } from './_browser-test-wait.mjs';

async function main() {
  const { server, baseUrl } = await startStaticServer();
  const browser = await launchChromiumForTest('me-page');

  try {
    if (!browser) {
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

      await page.goto(`${baseUrl}/aprice/me/`, { waitUntil: 'domcontentloaded' });

      await page.locator('#me-auth-gate').waitFor({ state: 'attached' });
      await page.locator('#my-logs').waitFor({ state: 'attached' });
      await page.locator('#recent-views').waitFor({ state: 'attached' });
      await page.locator('#my-favorites').waitFor({ state: 'attached' });
      await page.locator('#log-status').waitFor({ state: 'attached' });
      await waitForVisible(page, '#me-auth-gate');

      const gateHref = new URL(await page.locator('#me-login-link').getAttribute('href'), baseUrl);
      const gateText = await page.locator('#me-auth-gate').textContent();
      const recentText = await page.locator('#recent-views').textContent();
      const favsText = await page.locator('#my-favorites').textContent();
      const statusText = await page.locator('#log-status').textContent();

      assert.equal(gateHref.pathname, '/aprice/login/');
      assert.equal(gateHref.searchParams.get('redirect'), '/aprice/me/');
      assert.match(gateText || '', /登录后可查看个人价格记录与收藏/);
      assert.match(favsText || '', /(登录后可查看收藏|未登录)/);
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

