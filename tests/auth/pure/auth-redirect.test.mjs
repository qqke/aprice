import assert from 'node:assert/strict';

import { buildLoginUrl, normalizeInternalRedirectTarget } from '../../../src/lib/auth-redirect.js';

const origin = 'https://aprice.example';
const basePath = '/aprice/';
const loginPath = '/aprice/login/';

assert.equal(normalizeInternalRedirectTarget('', { origin, basePath, loginPath }), '');
assert.equal(normalizeInternalRedirectTarget(null, { origin, basePath, loginPath }), '');
assert.equal(normalizeInternalRedirectTarget(undefined, { origin, basePath, loginPath }), '');
assert.equal(normalizeInternalRedirectTarget('/aprice/', {}), '');

assert.equal(
  normalizeInternalRedirectTarget('/aprice/product/loxonin-s/?tab=prices#stores', {
    origin,
    basePath,
    loginPath,
  }),
  '/aprice/product/loxonin-s/?tab=prices#stores',
);

assert.equal(
  normalizeInternalRedirectTarget('https://aprice.example/aprice/admin/?filter=recent#top', {
    origin,
    basePath,
    loginPath,
  }),
  '/aprice/admin/?filter=recent#top',
);

assert.equal(
  normalizeInternalRedirectTarget(new URL('/aprice/me/?tab=history#recent', origin).toString(), {
    origin,
    basePath,
    loginPath,
  }),
  '/aprice/me/?tab=history#recent',
);

assert.equal(
  normalizeInternalRedirectTarget('https://evil.example/aprice/product/loxonin-s/', {
    origin,
    basePath,
    loginPath,
  }),
  '',
);

assert.equal(
  normalizeInternalRedirectTarget('/other/path', {
    origin,
    basePath,
    loginPath,
  }),
  '',
);

assert.equal(
  normalizeInternalRedirectTarget('/aprice/login/?redirect=/aprice/', {
    origin,
    basePath,
    loginPath,
  }),
  '',
);

const loginUrl = buildLoginUrl({
  origin,
  loginHref: '/aprice/login/',
  currentUrl: '/aprice/product/loxonin-s/?tab=prices#stores',
  basePath,
  loginPath,
});

const parsedLoginUrl = new URL(loginUrl, origin);
assert.equal(parsedLoginUrl.pathname, '/aprice/login/');
assert.equal(parsedLoginUrl.searchParams.get('redirect'), '/aprice/product/loxonin-s/?tab=prices#stores');

const loginUrlWithAbsoluteCurrent = buildLoginUrl({
  origin,
  loginHref: '/aprice/login/',
  currentUrl: 'https://aprice.example/aprice/admin/?filter=recent#top',
  basePath,
  loginPath,
});

const parsedLoginUrlWithAbsoluteCurrent = new URL(loginUrlWithAbsoluteCurrent, origin);
assert.equal(parsedLoginUrlWithAbsoluteCurrent.searchParams.get('redirect'), '/aprice/admin/?filter=recent#top');

const loginUrlWithoutRedirect = buildLoginUrl({
  origin,
  loginHref: '/aprice/login/',
  currentUrl: '/aprice/login/?redirect=/aprice/admin/',
  basePath,
  loginPath,
});

const parsedLoginUrlWithoutRedirect = new URL(loginUrlWithoutRedirect, origin);
assert.equal(parsedLoginUrlWithoutRedirect.pathname, '/aprice/login/');
assert.equal(parsedLoginUrlWithoutRedirect.searchParams.has('redirect'), false);

console.log('auth-redirect test passed');
