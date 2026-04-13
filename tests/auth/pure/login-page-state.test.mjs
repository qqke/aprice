import assert from 'node:assert/strict';

import {
  formatAuthError,
  getInitialLoginMode,
  getLoginPanelCopy,
  getPostLoginTarget,
  isSignedInSessionHint,
  readSessionHint,
  validateLoginInputs,
  writeSessionHint,
} from '../../../src/lib/login-page-state.js';

const origin = 'https://aprice.example';
const loginUrl = new URL('/aprice/login/?mode=reset&type=recovery', origin);
assert.equal(getInitialLoginMode(loginUrl), 'reset-password');
assert.equal(getInitialLoginMode(new URL('/aprice/login/', origin)), 'login');

const loginCopy = getLoginPanelCopy('login', { redirectTarget: '/aprice/product/loxonin-s/' });
assert.equal(loginCopy.status, '登录后返回原页面。');
assert.equal(loginCopy.submit, '登录');

const registerCopy = getLoginPanelCopy('register');
assert.equal(registerCopy.title, '注册账号');
assert.equal(registerCopy.forgotToggle, '忘记密码');

assert.equal(validateLoginInputs({ mode: 'login', email: '', password: 'abc' }), '请输入邮箱地址。');
assert.equal(validateLoginInputs({ mode: 'login', email: 'name@example.com', password: '' }), '请输入密码。');
assert.equal(validateLoginInputs({ mode: 'register', email: 'name@example.com', password: 'short', confirmPassword: 'short' }), '密码至少需要 8 位。');
assert.equal(validateLoginInputs({ mode: 'register', email: 'name@example.com', password: 'password123', confirmPassword: 'password321' }), '两次输入的密码不一致。');
assert.equal(validateLoginInputs({ mode: 'request-reset', email: 'name@example.com', password: '' }), '');

assert.equal(formatAuthError({ message: 'Invalid login credentials' }, 'login'), '邮箱或密码不正确；请完成邮箱确认。');
assert.equal(formatAuthError({ message: 'User already registered' }, 'register'), '该邮箱已注册，请直接登录或重置密码。');
assert.equal(formatAuthError({ message: 'Signup is disabled' }, 'register'), '当前暂不开放注册。');
assert.equal(formatAuthError({ message: 'Password should be at least 8 characters' }, 'register'), '密码长度不够，请至少设置 8 位。');
assert.equal(formatAuthError({ message: 'Token has expired or is invalid' }, 'reset-password'), '重置链接已失效，请重新发送。');
assert.equal(formatAuthError({ message: '' }, 'request-reset'), '未知错误，请稍后再试。');

assert.equal(getPostLoginTarget('/aprice/product/loxonin-s/', '/aprice/'), '/aprice/product/loxonin-s/');
assert.equal(getPostLoginTarget('', '/aprice/'), '/aprice/');

const memoryStorage = new Map();
const storage = {
  getItem(key) {
    return memoryStorage.has(key) ? memoryStorage.get(key) : null;
  },
  setItem(key, value) {
    memoryStorage.set(key, String(value));
  },
  removeItem(key) {
    memoryStorage.delete(key);
  },
};

assert.equal(readSessionHint(storage), null);
writeSessionHint('signed-in', storage);
assert.equal(readSessionHint(storage), 'signed-in');
assert.equal(isSignedInSessionHint(storage), true);
writeSessionHint(null, storage);
assert.equal(isSignedInSessionHint(storage), false);

console.log('login-page-state test passed');
