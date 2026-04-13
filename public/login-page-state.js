export const SESSION_HINT_KEY = 'aprice:session-hint';

const LOGIN_MODE_COPY = {
  login: {
    title: '登录账号',
    description: '输入邮箱和密码即可登录，或者切换到注册和找回密码。',
    pill: '登录',
    submit: '登录',
    modeToggle: '切换到注册',
    forgotToggle: '忘记密码',
    hint: '登录后保存价格与收藏。',
    status: '登录后保存价格与收藏。',
  },
  register: {
    title: '注册账号',
    description: '输入邮箱、密码和确认密码，完成注册。',
    pill: '注册',
    submit: '创建账号',
    modeToggle: '切换到登录',
    forgotToggle: '忘记密码',
    hint: '注册后会收到确认邮件。',
    status: '注册后会收到确认邮件。',
  },
  'request-reset': {
    title: '找回密码',
    description: '输入注册邮箱，我们会发送重置密码邮件。',
    pill: '找回',
    submit: '发送重置链接',
    modeToggle: '返回登录',
    forgotToggle: '返回登录',
    hint: '重置邮件会把你带回这个页面的新密码流程。',
    status: '输入邮箱后发送重置链接。',
  },
  'reset-password': {
    title: '重置密码',
    description: '点击邮件里的重置链接后，在这里设置新密码。',
    pill: '重置',
    submit: '更新密码',
    modeToggle: '返回登录',
    forgotToggle: '返回登录',
    hint: '请通过邮件中的重置链接进入，再设置新密码。',
    status: '请设置新的登录密码。',
  },
};

export function readSessionHint(storage = globalThis.localStorage) {
  try {
    return storage?.getItem?.(SESSION_HINT_KEY) || null;
  } catch {
    return null;
  }
}

export function writeSessionHint(value, storage = globalThis.localStorage) {
  try {
    if (value) {
      storage?.setItem?.(SESSION_HINT_KEY, value);
    } else {
      storage?.removeItem?.(SESSION_HINT_KEY);
    }
  } catch {}
}

export function isSignedInSessionHint(storage = globalThis.localStorage) {
  return readSessionHint(storage) === 'signed-in';
}

export function getInitialLoginMode(url) {
  const searchParams = url?.searchParams;
  if (!searchParams) return 'login';
  return searchParams.get('mode') === 'reset' || searchParams.get('type') === 'recovery' ? 'reset-password' : 'login';
}

export function getLoginPanelCopy(mode, { redirectTarget = '' } = {}) {
  const config = LOGIN_MODE_COPY[mode] || LOGIN_MODE_COPY.login;
  return {
    ...config,
    status: redirectTarget && mode === 'login' ? '登录后返回原页面。' : config.status,
  };
}

export function validateLoginInputs({ mode, email, password, confirmPassword }) {
  const trimmedEmail = String(email || '').trim();
  const passwordValue = String(password || '');
  const confirmPasswordValue = String(confirmPassword || '');

  if (mode !== 'reset-password' && !trimmedEmail) {
    return '请输入邮箱地址。';
  }
  if ((mode === 'login' || mode === 'register') && !passwordValue) {
    return '请输入密码。';
  }
  if ((mode === 'register' || mode === 'reset-password') && passwordValue.length < 8) {
    return '密码至少需要 8 位。';
  }
  if ((mode === 'register' || mode === 'reset-password') && passwordValue !== confirmPasswordValue) {
    return '两次输入的密码不一致。';
  }
  return '';
}

export function formatAuthError(error, submitMode) {
  const message = String(error?.message || '');
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('invalid login credentials')) {
    return '邮箱或密码不正确；请完成邮箱确认。';
  }
  if (lowerMessage.includes('email not confirmed')) {
    return '邮箱未确认，请点击邮件里的确认链接。';
  }
  if (lowerMessage.includes('password should be at least')) {
    return '密码长度不够，请至少设置 8 位。';
  }
  if (lowerMessage.includes('already registered') || lowerMessage.includes('user already registered')) {
    return '该邮箱已注册，请直接登录或重置密码。';
  }
  if (lowerMessage.includes('signup is disabled') || lowerMessage.includes('signups not allowed')) {
    return '当前暂不开放注册。';
  }
  if (lowerMessage.includes('email rate limit') || lowerMessage.includes('rate limit exceeded')) {
    return '发送过于频繁，请稍后再试。';
  }
  if (lowerMessage.includes('invalid email')) {
    return '邮箱格式不正确。';
  }
  if (lowerMessage.includes('token has expired') || lowerMessage.includes('invalid token')) {
    return '重置链接已失效，请重新发送。';
  }
  if (submitMode === 'request-reset' && lowerMessage.includes('for security purposes')) {
    return '如果这个邮箱存在，我们会发送重置链接。请检查收件箱和垃圾箱。';
  }
  return message || '未知错误，请稍后再试。';
}

export function getPostLoginTarget(redirectTarget, fallbackTarget) {
  return redirectTarget || fallbackTarget;
}
