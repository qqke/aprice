import { buildLoginUrl } from './auth-redirect.js';

const GATE_COPY = {
  me: {
    guest: {
      title: '登录后可查看个人价格记录与收藏。',
      description: '会跳回当前页面，继续看你的历史数据。',
      primaryButtonLabel: '去登录',
    },
  },
  admin: {
    guest: {
      title: '管理员页面需要先登录。',
      description: '登录后会返回当前管理页；如果账号不是管理员，也会提示切换账号。',
      primaryButtonLabel: '去登录',
      secondaryButtonLabel: '切换账号',
    },
    forbidden: {
      title: '当前账号不是管理员。',
      description: '请使用管理员账号继续访问管理页。',
      primaryButtonLabel: '切换账号',
      secondaryButtonLabel: '返回登录页',
    },
  },
  product: {
    guest: {
      title: '登录后可收藏商品、保存个人价格记录。',
      description: '登录会自动返回当前商品页，继续刚才的操作。',
      primaryButtonLabel: '去登录',
    },
  },
};

const STATUS_COPY = {
  shell: {
    guestChip: '未登录',
    guestNav: '登录',
    guestFooter: '登录',
    guestTitle: '未登录',
    signedInChip: ({ isAdmin = false, isMobile = false, email = '' } = {}) =>
      isAdmin ? '管理员' : (isMobile ? '我的' : (email || '已登录')),
    signedInNav: '退出登录',
    signedInFooter: '退出登录',
    fallbackChip: '会话',
    adminChipTitle: '管理员',
    signedInTitle: '已登录',
  },
  me: {
    pageSub: '登录后可记录购买价与收藏。',
    loggedOutTitle: '请登录',
    loggedOutDescription: '请完成邮箱密码登录。',
    loggedOutFavoritesTitle: '未登录',
    loggedOutFavoritesDescription: '登录后可看收藏。',
    loggedOutStatus: '登录后保存记录与收藏。',
    loading: '同步价格记录和收藏...',
    syncSummary: ({ logsCount = 0, favoritesCount = 0 } = {}) =>
      logsCount || favoritesCount
        ? `已同步 ${logsCount} 条价格记录和 ${favoritesCount} 条收藏。`
        : '还没有个人价格记录，保存第一笔。',
    saveRequired: '请登录后再保存。',
    saveSelectionRequired: '选中商品后再保存。',
    favoriteProductRequired: '选中商品后再添加收藏。',
    favoriteStoreRequired: '选中门店后再添加收藏。',
    removeFavoriteRequired: '请登录后再操作收藏。',
    favoriteSaved: '已更新收藏。',
    recentViewsCleared: '已清空最近浏览。',
    saveSuccess: '已保存个人价格记录。',
    favoriteProductSuccess: '已更新商品收藏。',
    favoriteStoreSuccess: '已更新门店收藏。',
    favoriteFailure: ({ message } = {}) => `收藏失败：${message}`,
    saveFailure: ({ message } = {}) => `记录失败：${message}`,
  },
  admin: {
    pageSub: '仅管理员账号可用。通过后端调用新增基础数据和价格采样。',
    actionLabel: '切换账号',
    notLoggedIn: '请登录后再进入管理页。',
    notAdmin: '当前账号不是管理员，请使用管理员账号进入管理页。',
    loaded: ({ email } = {}) => `已登录为 ${email || '已登录用户'}，可以开始维护数据。`,
    accessLoggedOutTitle: '未登录',
    accessLoggedOutDescription: '需要登录才能继续。',
    accessNotAdminDescription: '当前角色不足以访问管理功能。',
    accessAdminDescription: '管理员权限已开启。',
    saveProductSuccess: '商品已添加。',
    saveStoreSuccess: '门店已保存。',
    savePriceSuccess: '价格已保存。',
    deleteProductSuccess: '商品已删除。',
    deleteStoreSuccess: '门店已删除。',
    deletePriceSuccess: '价格已删除。',
    saveProductFailure: ({ message } = {}) => `添加商品失败：${message}`,
    saveStoreFailure: ({ message } = {}) => `保存门店失败：${message}`,
    savePriceFailure: ({ message } = {}) => `保存价格失败：${message}`,
    deleteProductFailure: ({ message } = {}) => `删除商品失败：${message}`,
    deleteStoreFailure: ({ message } = {}) => `删除门店失败：${message}`,
    deletePriceFailure: ({ message } = {}) => `删除价格失败：${message}`,
  },
  product: {
    favoriteStatus: '登录后可添加收藏。',
    geoStatus: '同步价格数据。',
    favoriteProductRequired: '请登录后再添加商品收藏。',
    favoriteStoreRequired: '请登录后再添加门店收藏。',
    logRequired: '请登录后再记录。',
    logSelectionRequired: '选中商品后再保存。',
    logPrompt: '登录后可查看并回填你的店铺最新价。',
    favoriteStoreUnavailable: '当前没有可添加收藏的门店。',
    loading: '同步价格数据。',
    favoriteProductSuccess: ({ action } = {}) => (action === 'added' ? '已添加商品收藏。' : '已取消商品收藏。'),
    favoriteStoreSuccess: ({ action } = {}) => (action === 'added' ? '已添加门店收藏。' : '已取消门店收藏。'),
    logSuccess: ({ price } = {}) => `已保存 ${price}。`,
    favoriteFailure: ({ message } = {}) => `收藏失败：${message}`,
    logFailure: ({ message } = {}) => `记录失败：${message}`,
  },
};

function normalizeBasePath(baseUrl, origin) {
  return new URL(String(baseUrl || '/'), origin).pathname;
}

export function buildPrivatePageLoginUrl({ origin, baseUrl, currentUrl }) {
  const base = String(baseUrl || '/');
  const loginHref = base.endsWith('/') ? `${base}login/` : `${base}/login/`;
  return buildLoginUrl({
    origin,
    loginHref,
    currentUrl,
    basePath: normalizeBasePath(base, origin),
    loginPath: new URL(loginHref, origin).pathname,
  });
}

export function getPrivatePageGateCopy(page, variant = 'guest') {
  return GATE_COPY[page]?.[variant] || GATE_COPY[page]?.guest || GATE_COPY.me.guest;
}

export function applyPrivatePageGateCopy({ titleEl, descriptionEl, primaryButtonEl, secondaryButtonEl }, copy) {
  if (titleEl) titleEl.textContent = copy.title;
  if (descriptionEl) descriptionEl.textContent = copy.description;
  if (primaryButtonEl) primaryButtonEl.textContent = copy.primaryButtonLabel;
  if (secondaryButtonEl) {
    if (copy.secondaryButtonLabel) {
      secondaryButtonEl.hidden = false;
      secondaryButtonEl.textContent = copy.secondaryButtonLabel;
    } else {
      secondaryButtonEl.hidden = true;
    }
  }
}

export function syncPrivatePageGate({ gateEl, loginLinkEl, loginUrl, visible }) {
  if (gateEl) gateEl.hidden = !visible;
  if (loginLinkEl && loginUrl) loginLinkEl.setAttribute('href', loginUrl);
}

export function redirectToLogin(loginUrl, gateEl) {
  if (gateEl) gateEl.hidden = false;
  window.location.assign(loginUrl);
}

export function getPrivatePageStatusCopy(page, key, params = {}) {
  const copy = STATUS_COPY[page]?.[key];
  if (typeof copy === 'function') {
    return copy(params);
  }
  return copy || '';
}
