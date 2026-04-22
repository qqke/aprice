import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/middleware.ts', import.meta.url), 'utf8');
const patchedSource = source
  .replace("import { defineMiddleware } from 'astro:middleware';", 'function defineMiddleware(handler) { return handler; }')
  .replace(/import\.meta\.env\.BASE_URL/g, "'/aprice/'")
  .replace(/: string/g, '')
  .replace('export const onRequest', 'const onRequest')
  .concat('\nexport { onRequest, normalizePath, isKnownRoute };');

const middleware = await import(`data:text/javascript;base64,${Buffer.from(patchedSource).toString('base64')}`);

assert.equal(middleware.normalizePath('/aprice/'), '/');
assert.equal(middleware.normalizePath('/aprice/login/'), '/login/');
assert.equal(middleware.normalizePath('/outside/'), '/outside/');

for (const pathname of [
  '/aprice/',
  '/aprice/login/',
  '/aprice/scan/',
  '/aprice/me/',
  '/aprice/admin/',
  '/aprice/product/loxonin-s/',
  '/aprice/product-runtime/',
  '/aprice/404/',
]) {
  assert.equal(middleware.isKnownRoute(pathname), true, `${pathname} should be known`);
}

for (const pathname of ['/aprice/unknown/', '/aprice/products', '/random']) {
  assert.equal(middleware.isKnownRoute(pathname), false, `${pathname} should be unknown`);
}

const nextCalls = [];
await middleware.onRequest(
  { url: new URL('https://aprice.example/aprice/product/loxonin-s/') },
  (target) => {
    nextCalls.push(target || '');
    return new Response('ok');
  },
);
assert.equal(nextCalls.at(-1), '');

await middleware.onRequest(
  { url: new URL('https://aprice.example/aprice/not-found/') },
  (target) => {
    nextCalls.push(target || '');
    return new Response('not found');
  },
);
assert.equal(nextCalls.at(-1), '/aprice/404/');

console.log('middleware test passed');
