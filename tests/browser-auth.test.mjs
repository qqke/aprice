import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const testState = {
  restCalls: [],
  authCalls: [],
  signedIn: true,
  profileRoleRequestShouldFail: false,
  favoriteRows: [],
  signOutError: null,
  signInError: null,
};

globalThis.__APriceConfig = {
  baseUrl: '/aprice/',
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'anon-key',
};
globalThis.__browserAuthTestState = testState;
globalThis.window = {
  location: { origin: 'https://aprice.example' },
};

const source = await readFile(new URL('../src/lib/browser-auth.js', import.meta.url), 'utf8');
const patchedSource = source
  .replace(
    "import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';",
    `function createClient(){
      const state = globalThis.__browserAuthTestState;
      state.authCalls.push({ type: 'createClient' });
      return {
        auth: {
          async getSession(){
            state.authCalls.push({ type: 'getSession' });
            return state.signedIn
              ? { data: { session: { user: { id: 'member-1', email: 'member@example.com' }, access_token: 'session-token' } }, error: null }
              : { data: { session: null }, error: null };
          },
          async signOut(){ state.authCalls.push({ type: 'signOut' }); return { error: state.signOutError }; },
          onAuthStateChange(callback){
            state.authCalls.push({ type: 'onAuthStateChange' });
            callback?.('SIGNED_IN', { user: { id: 'member-1' } });
            return { data: { subscription: { unsubscribe(){ state.authCalls.push({ type: 'unsubscribe' }); } } } };
          },
          async signUp(options){ state.authCalls.push({ type: 'signUp', options }); return { data: { user: { email: options.email } }, error: null }; },
          async signInWithPassword(options){ state.authCalls.push({ type: 'signInWithPassword', options }); return { data: {}, error: state.signInError }; },
          async resetPasswordForEmail(email, options){ state.authCalls.push({ type: 'resetPasswordForEmail', email, options }); return { error: null }; },
          async updateUser(options){ state.authCalls.push({ type: 'updateUser', options }); return { data: {}, error: null }; },
        },
      };
    }`,
  )
  .replace(
    "import { restDelete, restGet, restInsert, restRpc } from './supabase-rest.js';",
    `async function restGet(path, options = {}) {
      const state = globalThis.__browserAuthTestState;
      state.restCalls.push({ type: 'get', path, options });
      if (path === 'profiles') {
        if (state.profileRoleRequestShouldFail && String(options.query?.select || '').includes('role')) {
          const error = new Error('column profiles.role does not exist');
          error.code = '42703';
          throw error;
        }
        return [{ id: 'member-1', email: 'member@example.com', full_name: 'Member User' }];
      }
      if (path === 'favorites') {
        const entityType = String(options.query?.entity_type || '').replace(/^eq\\./, '');
        const entityId = String(options.query?.entity_id || '').replace(/^eq\\./, '');
        return state.favoriteRows.filter((row) => {
          if (entityType && row.entity_type !== entityType) return false;
          if (entityId && row.entity_id !== entityId) return false;
          return true;
        });
      }
      if (path === 'user_price_logs') return [{ id: 'pending-1' }];
      return [];
    }
    async function restInsert(path, body, options = {}) {
      const state = globalThis.__browserAuthTestState;
      state.restCalls.push({ type: 'insert', path, body, options });
      if (path === 'favorites') state.favoriteRows.unshift({ id: 'favorite-new', ...body });
      return [{ id: body.id || 'inserted', ...body }];
    }
    async function restDelete(path, options = {}) {
      const state = globalThis.__browserAuthTestState;
      state.restCalls.push({ type: 'delete', path, options });
      const id = String(options.query?.id || '').replace(/^eq\\./, '');
      state.favoriteRows = state.favoriteRows.filter((row) => row.id !== id);
      return [{ id }];
    }
    async function restRpc(name, body, options = {}) {
      const state = globalThis.__browserAuthTestState;
      state.restCalls.push({ type: 'rpc', name, body, options });
      return [{ ok: true }];
    }`,
  )
  .replace(
    "import { normalizeInternalRedirectTarget } from './auth-redirect.js';",
    `function normalizeInternalRedirectTarget(value) { return String(value || '').startsWith('/aprice/') ? String(value) : ''; }`,
  )
  .replace(
    "import { resolveBase } from './browser.js';",
    `function resolveBase(pathname = '') { return '/aprice/' + String(pathname || '').replace(/^\\//, ''); }`,
  );

const moduleUrl = `data:text/javascript;base64,${Buffer.from(patchedSource).toString('base64')}`;
const auth = await import(moduleUrl);

const latest = auth.indexLatestPersonalPricesByStore([
  { id: 'old', product_id: 'p1', store_id: 's1', price_yen: 100, created_at: '2026-04-01T00:00:00.000Z' },
  { id: 'new', product_id: 'p1', store_id: 's1', price_yen: 90, created_at: '2026-04-02T00:00:00.000Z' },
  { id: 'other-product', product_id: 'p2', store_id: 's1', price_yen: 80, created_at: '2026-04-03T00:00:00.000Z' },
  { id: 'missing-store', product_id: 'p1', price_yen: 70, created_at: '2026-04-04T00:00:00.000Z' },
  { id: 'missing-price', product_id: 'p1', store_id: 's2', created_at: '2026-04-04T00:00:00.000Z' },
  { id: 'purchase-date', product_id: 'p1', store_id: 's3', price_yen: 110, purchased_at: '2026-04-05' },
], 'p1');
assert.equal(latest.size, 2);
assert.equal(latest.get('s1').id, 'new');
assert.equal(latest.get('s3').id, 'purchase-date');

testState.profileRoleRequestShouldFail = true;
const profile = await auth.fetchCurrentProfile();
assert.equal(profile.role, 'user');
assert.ok(testState.restCalls.some((call) => call.type === 'get' && call.path === 'profiles' && String(call.options.query.select).includes('role')));
assert.ok(testState.restCalls.some((call) => call.type === 'get' && call.path === 'profiles' && !String(call.options.query.select).includes('role')));

testState.favoriteRows = [];
const added = await auth.toggleFavorite('product', 'loxonin-s');
assert.equal(added.action, 'added');
assert.ok(testState.restCalls.some((call) => call.type === 'insert' && call.path === 'favorites' && call.body.entity_id === 'loxonin-s'));

testState.favoriteRows = [{ id: 'favorite-existing', user_id: 'member-1', entity_type: 'store', entity_id: 'welcia-shibuya' }];
const removed = await auth.toggleFavorite('store', 'welcia-shibuya');
assert.equal(removed.action, 'removed');
assert.ok(testState.restCalls.some((call) => call.type === 'delete' && call.path === 'favorites' && call.options.query.id === 'eq.favorite-existing'));

testState.signedIn = false;
await assert.rejects(() => auth.toggleFavorite('product', 'loxonin-s'), /Please sign in first/);
assert.equal((await auth.fetchPersonalLogs('')).length, 0);
assert.equal((await auth.fetchFavorites('')).length, 0);

testState.signedIn = true;
testState.restCalls = [];
await assert.rejects(() => auth.savePersonalLog({ product_id: '', price_yen: 100 }), /product_id and price_yen are required/);
await assert.rejects(() => auth.submitStorePrice({ product_id: 'p1', price_yen: 100 }), /product_id, store_id and price_yen are required/);

await auth.savePersonalLog({ product_id: 'p1', store_id: 's1', price_yen: 701, note: 'personal note' });
assert.ok(testState.restCalls.some((call) =>
  call.type === 'insert' &&
  call.path === 'user_price_logs' &&
  call.body.user_id === 'member-1' &&
  call.body.product_id === 'p1' &&
  call.body.store_id === 's1' &&
  call.body.price_yen === 701 &&
  call.options.token === 'session-token'
));

await auth.submitStorePrice({ product_id: 'p1', store_id: 's2', price_yen: 702, share_to_public: true });
assert.ok(testState.restCalls.some((call) =>
  call.type === 'rpc' &&
  call.name === 'submit_store_price' &&
  call.body.payload.product_id === 'p1' &&
  call.body.payload.store_id === 's2' &&
  call.body.payload.price_yen === 702 &&
  call.body.payload.share_to_public === true &&
  call.options.token === 'session-token'
));

await auth.createProduct({ barcode: '4900000000000', name: 'Created Product' });
assert.ok(testState.restCalls.some((call) =>
  call.type === 'insert' &&
  call.path === 'products' &&
  call.body.id === '4900000000000' &&
  call.body.barcode === '4900000000000' &&
  call.body.name === 'Created Product' &&
  call.options.token === 'session-token'
));

await auth.adminReviewPriceSubmission({ id: 'pending-1', action: 'approve', confidence_score: 80 });
await auth.adminUpsertStore({ id: 'store-1', name: 'Store 1' });
await auth.adminUpsertPrice({ product_id: 'p1', store_id: 's1', price_yen: 698 });
await auth.adminDeleteProduct('p1');
await auth.adminDeleteStore('s1');
await auth.adminDeletePrice('price-1');
assert.ok(testState.restCalls.some((call) => call.type === 'rpc' && call.name === 'admin_review_price_submission' && call.body.payload.id === 'pending-1'));
assert.ok(testState.restCalls.some((call) => call.type === 'rpc' && call.name === 'admin_upsert_store' && call.body.id === 'store-1'));
assert.ok(testState.restCalls.some((call) => call.type === 'rpc' && call.name === 'admin_upsert_price' && call.body.price_yen === 698));
assert.ok(testState.restCalls.some((call) => call.type === 'rpc' && call.name === 'admin_delete_product' && call.body.target_id === 'p1'));
assert.ok(testState.restCalls.some((call) => call.type === 'rpc' && call.name === 'admin_delete_store' && call.body.target_id === 's1'));
assert.ok(testState.restCalls.some((call) => call.type === 'rpc' && call.name === 'admin_delete_price' && call.body.target_id === 'price-1'));

await auth.signUpWithEmailPassword({ email: 'new@example.com', password: 'password123', redirect: '/aprice/me/' });
const signUpCall = testState.authCalls.findLast((call) => call.type === 'signUp');
assert.equal(signUpCall.options.options.emailRedirectTo, 'https://aprice.example/aprice/login/?redirect=%2Faprice%2Fme%2F');

await auth.sendPasswordResetEmail({ email: 'reset@example.com', redirect: 'https://evil.example/aprice/me/' });
const resetCall = testState.authCalls.findLast((call) => call.type === 'resetPasswordForEmail');
assert.equal(resetCall.options.emailRedirectTo, 'https://aprice.example/aprice/login/?mode=reset');

const authEvents = [];
const unsubscribe = await auth.subscribeAuthState((event, session) => authEvents.push({ event, session }));
assert.equal(authEvents[0].event, 'SIGNED_IN');
unsubscribe();
assert.ok(testState.authCalls.some((call) => call.type === 'unsubscribe'));

await auth.signOut();
assert.ok(testState.authCalls.some((call) => call.type === 'signOut'));
testState.signOutError = new Error('sign out failed');
await assert.rejects(() => auth.signOut(), /sign out failed/);
testState.signOutError = null;

testState.signInError = new Error('bad password');
await assert.rejects(() => auth.signInWithEmailPassword({ email: 'member@example.com', password: 'bad' }), /bad password/);
testState.signInError = null;

console.log('browser-auth test passed');
