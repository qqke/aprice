import assert from 'node:assert/strict';

import {
  applyPrivatePageGateCopy,
  buildPrivatePageLoginUrl,
  getPrivatePageGateCopy,
  getPrivatePageStatusCopy,
  syncPrivatePageGate,
} from '../../../src/lib/private-page-auth.js';

const origin = 'https://aprice.example';
const loginUrl = buildPrivatePageLoginUrl({
  origin,
  baseUrl: '/aprice/',
  currentUrl: '/aprice/product/loxonin-s/',
});
const parsed = new URL(loginUrl, origin);
assert.equal(parsed.pathname, '/aprice/login/');
assert.equal(parsed.searchParams.get('redirect'), '/aprice/product/loxonin-s/');

const meCopy = getPrivatePageGateCopy('me');
assert.equal(meCopy.primaryButtonLabel, '去登录');

const adminForbiddenCopy = getPrivatePageGateCopy('admin', 'forbidden');
assert.equal(adminForbiddenCopy.primaryButtonLabel, '切换账号');
assert.equal(adminForbiddenCopy.secondaryButtonLabel, '返回登录页');

assert.equal(getPrivatePageStatusCopy('me', 'saveSelectionRequired'), '选中商品后再保存。');
assert.equal(getPrivatePageStatusCopy('me', 'pageSub'), '登录后可记录购买价与收藏。');
assert.equal(getPrivatePageStatusCopy('product', 'favoriteProductSuccess', { action: 'added' }), '已添加商品收藏。');
assert.equal(getPrivatePageStatusCopy('product', 'favoriteStatus'), '登录后可添加收藏。');
assert.equal(getPrivatePageStatusCopy('product', 'geoStatus'), '同步价格数据。');
assert.equal(getPrivatePageStatusCopy('admin', 'loaded', { email: 'admin@example.com' }), '已登录为 admin@example.com，可以开始维护数据。');
assert.equal(getPrivatePageStatusCopy('admin', 'pageSub'), '仅管理员账号可用。通过后端调用写入基础数据和价格采样。');
assert.equal(getPrivatePageStatusCopy('admin', 'actionLabel'), '切换账号');
assert.equal(getPrivatePageStatusCopy('shell', 'guestChip'), '未登录');
assert.equal(getPrivatePageStatusCopy('shell', 'guestNav'), '登录');
assert.equal(getPrivatePageStatusCopy('shell', 'signedInChip', { isAdmin: true }), '管理员');
assert.equal(getPrivatePageStatusCopy('shell', 'signedInChip', { isMobile: true }), '我的');

const elements = {
  titleEl: { textContent: '' },
  descriptionEl: { textContent: '' },
  primaryButtonEl: { textContent: '' },
  secondaryButtonEl: { hidden: true, textContent: '' },
};
applyPrivatePageGateCopy(elements, adminForbiddenCopy);
assert.equal(elements.titleEl.textContent, '当前账号不是管理员。');
assert.equal(elements.primaryButtonEl.textContent, '切换账号');
assert.equal(elements.secondaryButtonEl.hidden, false);
assert.equal(elements.secondaryButtonEl.textContent, '返回登录页');

const gateEl = { hidden: true };
const loginLinkEl = { href: '', setAttribute(name, value) { this[name] = value; } };
syncPrivatePageGate({ gateEl, loginLinkEl, loginUrl, visible: true });
assert.equal(gateEl.hidden, false);
assert.equal(loginLinkEl.href, loginUrl);

console.log('private-page-auth test passed');
