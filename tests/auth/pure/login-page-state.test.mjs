import assert from 'node:assert/strict';

import {
  formatAuthError,
  getInitialLoginMode,
  getLoginPanelCopy,
  getPostLoginTarget,
  isSignedInSessionHint,
  readSessionHint,
  validateLoginInputs,
  validatePasswordChangeInputs,
  writeSessionHint,
} from '../../../src/lib/login-page-state.js';

const origin = 'https://aprice.example';
const loginUrl = new URL('/aprice/login/?mode=reset&type=recovery', origin);
assert.equal(getInitialLoginMode(loginUrl), 'reset-password');
assert.equal(getInitialLoginMode(new URL('/aprice/login/', origin)), 'login');
assert.equal(getInitialLoginMode(null), 'login');

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
assert.equal(validateLoginInputs({ mode: 'register', email: 'name@example.com', password: 'password123', confirmPassword: 'password123', turnstileConfigured: false }), '注册验证尚未配置，请先设置 Turnstile Site Key。');
assert.equal(validateLoginInputs({ mode: 'register', email: 'name@example.com', password: 'password123', confirmPassword: 'password123' }), '请先完成人机验证。');
assert.equal(validateLoginInputs({ mode: 'register', email: 'name@example.com', password: 'password123', confirmPassword: 'password123', captchaToken: 'turnstile-token' }), '');
assert.equal(validateLoginInputs({ mode: 'request-reset', email: 'name@example.com', password: '' }), '');
assert.equal(validateLoginInputs({ mode: 'reset-password', email: '', password: 'short', confirmPassword: 'short' }), '密码至少需要 8 位。');
assert.equal(validateLoginInputs({ mode: 'reset-password', email: '', password: 'newpassword123', confirmPassword: 'otherpassword123' }), '两次输入的密码不一致。');
assert.equal(validateLoginInputs({ mode: 'reset-password', email: '', password: 'newpassword123', confirmPassword: 'newpassword123' }), '');

assert.equal(validatePasswordChangeInputs({ currentPassword: '', password: 'newpassword123', confirmPassword: 'newpassword123' }), '请输入当前密码。');
assert.equal(validatePasswordChangeInputs({ currentPassword: 'oldpassword123', password: 'short', confirmPassword: 'short' }), '新密码至少需要 8 位。');
assert.equal(validatePasswordChangeInputs({ currentPassword: 'oldpassword123', password: 'newpassword123', confirmPassword: 'otherpassword123' }), '两次输入的新密码不一致。');
assert.equal(validatePasswordChangeInputs({ currentPassword: 'samepassword123', password: 'samepassword123', confirmPassword: 'samepassword123' }), '新密码不能和当前密码相同。');
assert.equal(validatePasswordChangeInputs({ currentPassword: 'oldpassword123', password: 'newpassword123', confirmPassword: 'newpassword123' }), '');

assert.equal(formatAuthError({ message: 'Invalid login credentials' }, 'login'), '邮箱或密码不正确；请完成邮箱确认。');
assert.equal(formatAuthError({ message: 'Email not confirmed' }, 'login'), '邮箱未确认，请点击邮件里的确认链接。');
assert.equal(formatAuthError({ message: 'User already registered' }, 'register'), '该邮箱已注册，请直接登录或重置密码。');
assert.equal(formatAuthError({ message: 'Signup is disabled' }, 'register'), '当前暂不开放注册。');
assert.equal(formatAuthError({ message: 'Password should be at least 8 characters' }, 'register'), '密码长度不够，请至少设置 8 位。');
assert.equal(formatAuthError({ message: 'captcha verification failed' }, 'register'), '人机验证失败，请重新完成验证。');
assert.equal(formatAuthError({ message: 'Current password is invalid' }, 'change-password'), '当前密码不正确，请重新输入。');
assert.equal(formatAuthError({ message: 'Weak password' }, 'change-password'), '新密码强度不足，请使用更长且更复杂的密码。');
assert.equal(formatAuthError({ message: 'Email rate limit exceeded' }, 'request-reset'), '发送过于频繁，请稍后再试。');
assert.equal(formatAuthError({ message: 'Invalid email' }, 'register'), '邮箱格式不正确。');
assert.equal(formatAuthError({ message: 'Token has expired or is invalid' }, 'reset-password'), '重置链接已失效，请重新发送。');
assert.equal(formatAuthError({ message: 'For security purposes, you can only request this once every 60 seconds' }, 'request-reset'), '如果这个邮箱存在，我们会发送重置链接。请检查收件箱和垃圾箱。');
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

const throwingStorage = {
  getItem() {
    throw new Error('storage unavailable');
  },
  setItem() {
    throw new Error('storage unavailable');
  },
  removeItem() {
    throw new Error('storage unavailable');
  },
};
assert.equal(readSessionHint(throwingStorage), null);
assert.doesNotThrow(() => writeSessionHint('signed-in', throwingStorage));
assert.doesNotThrow(() => writeSessionHint(null, throwingStorage));
assert.equal(isSignedInSessionHint(throwingStorage), false);

console.log('login-page-state test passed');
