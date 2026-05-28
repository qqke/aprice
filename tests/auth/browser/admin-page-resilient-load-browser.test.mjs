import assert from 'node:assert/strict';

import { launchChromiumForTest } from '../../_playwright-launch.mjs';
import { makeAdminPageResponseForRequest } from '../../_browser-test-fixtures.mjs';
import { startStaticServer } from '../../_browser-test-server.mjs';
import { waitForHidden, waitForText } from '../../_browser-test-wait.mjs';

async function main() {
  const { server, baseUrl } = await startStaticServer();
  const browser = await launchChromiumForTest('admin-page-resilient-load');

  try {
    if (!browser) {
      return;
    }

    try {
      const page = await browser.newPage();
      const pageErrors = [];

      page.on('pageerror', (error) => pageErrors.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') {
          const text = message.text();
          if (!text.includes('Failed to load resource')) pageErrors.push(text);
        }
      });

      await page.route('https://esm.sh/@supabase/supabase-js@2.105.4', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'text/javascript; charset=utf-8',
          body: [
            'export function createClient(){',
            '  return {',
            '    auth: {',
            '      async getSession(){',
            '        return {',
            '          data: {',
            '            session: {',
            '              user: { id: "user-admin-1", email: "admin@example.com" },',
            '              access_token: "test-access-token",',
            '            },',
            '          },',
            '          error: null,',
            '        };',
            '      },',
            '      async getUser(){ return { data: { user: { id: "user-admin-1", email: "admin@example.com" } }, error: null }; },',
            '      onAuthStateChange(){ return { data: { subscription: { unsubscribe(){} } } }; },',
            '      async signOut(){ return { error: null }; },',
            '    },',
            '  };',
            '}',
          ].join('\n'),
        });
      });

      await page.route('**/rest/v1/**', async (route) => {
        const requestUrl = route.request().url();
        const url = new URL(requestUrl);

        if (url.pathname.endsWith('/user_price_logs')) {
          await route.fulfill({
            status: 503,
            contentType: 'application/json; charset=utf-8',
            body: JSON.stringify({
              code: 'PGRST205',
              message: 'pending price submissions unavailable',
            }),
          });
          return;
        }

        const responseRows = makeAdminPageResponseForRequest(requestUrl, route.request().method());
        await route.fulfill({
          status: 200,
          contentType: 'application/json; charset=utf-8',
          body: JSON.stringify(responseRows),
        });
      });

      await page.goto(`${baseUrl}/aprice/admin/`, { waitUntil: 'domcontentloaded' });

      await waitForText(page, '#admin-status', '可以开始维护数据');
      await waitForText(page, '#admin-access', '管理员权限已开启');
      await waitForHidden(page, '#admin-auth-gate');

      assert.equal(await page.locator('#admin-status').textContent(), '已登录为 admin@example.com，可以开始维护数据。');
      assert.equal(await page.locator('#admin-auth-gate').isVisible(), false);
      assert.equal(pageErrors.length, 0, `page errors: ${pageErrors.join(' | ')}`);

      console.log('admin-page resilient load test passed');
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
