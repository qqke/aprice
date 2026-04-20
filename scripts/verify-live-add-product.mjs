import { chromium } from 'playwright';

const siteUrl = String(process.env.LIVE_SITE_URL || 'https://outlets.stbf.online').replace(/\/$/, '');
const email = String(process.env.LIVE_EMAIL || '').trim();
const password = String(process.env.LIVE_PASSWORD || '').trim();
const barcode = String(process.env.LIVE_PRODUCT_BARCODE || `9${String(Date.now()).slice(-12)}`);
const productName = String(process.env.LIVE_PRODUCT_NAME || `Playwright Live Product ${barcode}`).trim();
const productBrand = String(process.env.LIVE_PRODUCT_BRAND || 'Aprice').trim();
const productPack = String(process.env.LIVE_PRODUCT_PACK || '1 pc').trim();
const productCategory = String(process.env.LIVE_PRODUCT_CATEGORY || 'test').trim();
const productTone = String(process.env.LIVE_PRODUCT_TONE || 'mint').trim();
const productDescription = String(process.env.LIVE_PRODUCT_DESCRIPTION || 'Created by Playwright on live site').trim();

if (!email || !password) {
  console.error('Missing LIVE_EMAIL or LIVE_PASSWORD.');
  process.exitCode = 1;
  process.exit(1);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } });
const page = await context.newPage();
const requests = [];
const responses = [];

page.on('request', (request) => {
  const url = request.url();
  if (url.includes('/rest/v1/') || url.includes('/rpc/') || url.includes('supabase')) {
    requests.push({
      method: request.method(),
      url,
      postData: request.postData() || '',
    });
  }
});

page.on('response', async (response) => {
  const url = response.url();
  if (url.includes('/rest/v1/') || url.includes('/rpc/') || url.includes('supabase')) {
    let text = '';
    try {
      text = await response.text();
    } catch {
      text = '';
    }
    responses.push({
      status: response.status(),
      method: response.request().method(),
      url,
      text,
    });
  }
});

try {
  await page.goto(`${siteUrl}/login/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const loginResult = await page.evaluate(async ({ email: loginEmail, password: loginPassword }) => {
    const mod = await import('/browser-auth.js');
    return mod.signInWithEmailPassword({ email: loginEmail, password: loginPassword });
  }, { email, password });

  if (!loginResult?.session?.access_token) {
    throw new Error('Login returned no session token.');
  }

  await page.goto(`${siteUrl}/scan/`, { waitUntil: 'domcontentloaded', timeout: 60000 });

  await page.locator('#barcode-input').fill(barcode);
  await page.locator('#barcode-search').click();
  await page.waitForFunction(
    () => document.querySelector('#missing-product-panel')?.hidden === false,
    null,
    { timeout: 30000 },
  );

  await page.locator('#missing-product-name').fill(productName);
  await page.locator('#missing-product-brand').fill(productBrand);
  await page.locator('#missing-product-pack').fill(productPack);
  await page.locator('#missing-product-category').fill(productCategory);
  await page.locator('#missing-product-tone').selectOption(productTone);
  await page.locator('#missing-product-description').fill(productDescription);
  const insertResponsePromise = page.waitForResponse(
    (response) => response.url().includes('/rest/v1/products') && response.request().method() === 'POST',
    { timeout: 30000 },
  );
  await page.locator('#missing-product-save').click();
  const insertResponse = await insertResponsePromise;

  await page.waitForFunction(
    () => document.querySelector('#missing-product-panel')?.hidden === true,
    null,
    { timeout: 30000 },
  );

  if (insertResponse.status() !== 201) {
    throw new Error(`Expected 201 from products insert, got ${insertResponse.status()}: ${await insertResponse.text()}`);
  }

  const statusText = await page.locator('#scan-status').textContent().catch(() => '');
  const resultText = await page.locator('#scan-result-list').textContent().catch(() => '');
  const resultHref = await page.locator('#scan-result-list a').getAttribute('href').catch(() => '');
  const resultPath = resultHref ? new URL(resultHref, siteUrl).pathname : '';

  if (!String(statusText || '').includes('商品已添加')) {
    throw new Error(`Unexpected status text: ${statusText}`);
  }
  if (!String(resultText || '').includes(productName)) {
    throw new Error(`Updated result list does not mention the new product: ${resultText}`);
  }
  if (!resultPath.endsWith(`/product/${barcode}/`)) {
    throw new Error(`Unexpected product link: ${resultHref}`);
  }

  console.log('Live add-product verification passed');
  console.log(`Site: ${siteUrl}`);
  console.log(`Barcode: ${barcode}`);
  console.log(`Product: ${productName}`);
  console.log(`Insert response: ${insertResponse.status()}`);
} catch (error) {
  console.error('Live add-product verification failed');
  console.error(error?.stack || error?.message || String(error));
  console.error(`Site: ${siteUrl}`);
  console.error(`Barcode: ${barcode}`);
  console.error(`Requests: ${JSON.stringify(requests, null, 2)}`);
  console.error(`Responses: ${JSON.stringify(responses, null, 2)}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
