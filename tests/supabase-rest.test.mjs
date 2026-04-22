import assert from 'node:assert/strict';

globalThis.__APriceConfig = {
  supabaseUrl: 'https://example.supabase.co/',
  supabaseAnonKey: 'anon-key',
};

const calls = [];
let nextResponse = new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });

globalThis.fetch = async (input, init = {}) => {
  calls.push({
    url: String(input),
    method: init.method,
    headers: init.headers || {},
    body: init.body || '',
  });
  return nextResponse;
};

const rest = await import('../src/lib/supabase-rest.js');

nextResponse = new Response(JSON.stringify([{ id: 'product-1' }]), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
});
const rows = await rest.restGet('products', {
  query: {
    select: '*',
    id: 'eq.product-1',
    empty: '',
    nil: null,
  },
  token: 'user-token',
});
assert.deepEqual(rows, [{ id: 'product-1' }]);
assert.equal(calls.at(-1).method, 'GET');
assert.equal(calls.at(-1).url, 'https://example.supabase.co/rest/v1/products?select=*&id=eq.product-1');
assert.equal(calls.at(-1).headers.apikey, 'anon-key');
assert.equal(calls.at(-1).headers.Authorization, 'Bearer user-token');
assert.equal(calls.at(-1).headers.Accept, 'application/json');

nextResponse = new Response(JSON.stringify([{ id: 'created-1' }]), {
  status: 201,
  headers: { 'Content-Type': 'application/json' },
});
const inserted = await rest.restInsert('products', { id: 'created-1' }, { token: 'insert-token' });
assert.deepEqual(inserted, [{ id: 'created-1' }]);
assert.equal(calls.at(-1).method, 'POST');
assert.equal(calls.at(-1).headers.Authorization, 'Bearer insert-token');
assert.equal(calls.at(-1).headers.Prefer, 'return=representation');
assert.equal(calls.at(-1).body, JSON.stringify({ id: 'created-1' }));

nextResponse = new Response(null, { status: 204 });
assert.equal(await rest.restInsert('products', { id: 'created-2' }, { returning: false }), null);
assert.equal(calls.at(-1).headers.Authorization, 'Bearer anon-key');
assert.equal(calls.at(-1).headers.Prefer, 'return=minimal');

nextResponse = new Response(JSON.stringify([{ id: 'deleted-1' }]), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
});
const deleted = await rest.restDelete('favorites', { query: { id: 'eq.favorite-1' }, token: 'delete-token' });
assert.deepEqual(deleted, [{ id: 'deleted-1' }]);
assert.equal(calls.at(-1).method, 'DELETE');
assert.equal(calls.at(-1).url, 'https://example.supabase.co/rest/v1/favorites?id=eq.favorite-1');
assert.equal(calls.at(-1).headers.Prefer, 'return=representation');

nextResponse = new Response(JSON.stringify([{ ok: true }]), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
});
const rpcRows = await rest.restRpc('submit_store_price', { payload: { id: 'p1' } }, { token: 'rpc-token' });
assert.deepEqual(rpcRows, [{ ok: true }]);
assert.equal(calls.at(-1).method, 'POST');
assert.equal(calls.at(-1).url, 'https://example.supabase.co/rest/v1/rpc/submit_store_price');
assert.equal(calls.at(-1).body, JSON.stringify({ payload: { id: 'p1' } }));

nextResponse = new Response('policy denied', { status: 403 });
await assert.rejects(
  () => rest.restGet('products'),
  /policy denied/,
);

assert.equal(rest.escapeIlike(String.raw`50%\_ 'sale'`), String.raw`50\%\\\_ ''sale''`);

console.log('supabase-rest test passed');
