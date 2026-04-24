import assert from 'node:assert/strict';

globalThis.__APriceConfig = {
  baseUrl: '/aprice/',
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'anon-key',
  useServerPriceRpc: true,
};

const requests = [];
globalThis.fetch = async (input, init = {}) => {
  const url = String(input);
  requests.push({ url, method: init.method || 'GET', body: init.body || '' });

  if (url.includes('/rest/v1/rpc/fetch_product_prices_page')) {
    return new Response(
      JSON.stringify({
        items: [
          {
            id: '00000000-0000-0000-0000-000000000001',
            product_id: 'loxonin-s',
            store_id: 'sugi-hiroo',
            price_yen: 698,
            is_member_price: false,
            source: 'manual',
            note: '',
            collected_at: '2026-04-24T00:00:00.000Z',
            stores: { id: 'sugi-hiroo', name: 'Sugi Hiroo' },
            products: { id: 'loxonin-s', name: 'Loxonin S' },
            distance_km: 0.5,
          },
        ],
        next_cursor: {
          id: '00000000-0000-0000-0000-000000000002',
          collected_at: '2026-04-23T00:00:00.000Z',
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  if (url.includes('/rest/v1/rpc/fetch_product_prices')) {
    return new Response(
      JSON.stringify([
        {
          id: '00000000-0000-0000-0000-000000000003',
          product_id: 'loxonin-s',
          store_id: 'welcia-shibuya',
          price_yen: 720,
          is_member_price: false,
          source: 'manual',
          note: '',
          collected_at: '2026-04-24T00:00:00.000Z',
          stores: { id: 'welcia-shibuya', name: 'Welcia Shibuya' },
          products: { id: 'loxonin-s', name: 'Loxonin S' },
          distance_km: 0.8,
        },
      ]),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
};

const browser = await import('../src/lib/browser.js');

const page = await browser.fetchProductPricesPage('loxonin-s', {
  limit: 20,
  sinceDays: 30,
  cursor: { id: '00000000-0000-0000-0000-000000000009', collected_at: '2026-04-20T00:00:00.000Z' },
});
assert.equal(page.items.length, 1);
assert.equal(page.items[0].store_id, 'sugi-hiroo');
assert.equal(page.nextCursor?.id, '00000000-0000-0000-0000-000000000002');
assert.ok(requests.some((request) => request.url.includes('/rest/v1/rpc/fetch_product_prices_page')));

const rows = await browser.fetchPricesForProduct('loxonin-s', { limit: 20, sinceDays: 30, lat: 35.67, lng: 139.73, radiusKm: 20 });
assert.equal(rows.length, 1);
assert.equal(rows[0].store_id, 'welcia-shibuya');
assert.ok(requests.some((request) => request.url.includes('/rest/v1/rpc/fetch_product_prices')));

console.log('browser-price-rpc test passed');
