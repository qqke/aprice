import assert from 'node:assert/strict';

import { launchChromiumForTest } from './_playwright-launch.mjs';
import { startStaticServer } from './_browser-test-server.mjs';
import { waitForText } from './_browser-test-wait.mjs';

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

      await page.locator('#my-logs').waitFor({ state: 'attached' });
      await page.locator('#recent-views').waitFor({ state: 'attached' });
      await page.locator('#my-favorites').waitFor({ state: 'attached' });
      await page.locator('#log-status').waitFor({ state: 'attached' });
      await waitForText(page, '#my-logs', '请登录');
      await waitForText(page, '#my-favorites', '未登录');

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





