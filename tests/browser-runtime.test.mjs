import assert from 'node:assert/strict';

globalThis.__APriceConfig = {
  baseUrl: '/aprice/',
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'anon-key',
};

const requests = [];

globalThis.fetch = async (input) => {
  requests.push(String(input));
  return new Response(
    JSON.stringify([
      {
        id: 'loxonin-s',
        name: 'Loxonin S',
        brand: 'Santen',
        pack: '12 tabs',
        barcode: '4987188161027',
      },
    ]),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};

const browser = await import('../public/browser.js');

const rows = await browser.searchProducts('ロキソ');
assert.equal(rows.length, 1);
assert.match(requests[0], /\/rest\/v1\/products/);
assert.match(requests[0], /name\.ilike/);
assert.equal(browser.resolveBase('product/loxonin-s/'), '/aprice/product/loxonin-s/');

console.log('browser-runtime smoke test passed');



