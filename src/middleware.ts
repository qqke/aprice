import { defineMiddleware } from 'astro:middleware';

const basePath = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');

function normalizePath(pathname: string) {
  if (!pathname.startsWith(basePath)) return pathname;
  const appPath = pathname.slice(basePath.length) || '/';
  return appPath.startsWith('/') ? appPath : `/${appPath}`;
}

function isKnownRoute(pathname: string) {
  const appPath = normalizePath(pathname).replace(/\/$/, '') || '/';
  if (appPath === '/' || appPath === '/404') return true;
  if (appPath === '/scan' || appPath === '/login' || appPath === '/me' || appPath === '/admin') return true;
  if (appPath.startsWith('/product/')) return true;
  return false;
}

export const onRequest = defineMiddleware((context, next) => {
  const pathname = context.url.pathname;

  // 未知页面直接转到自定义 404，避免 dev server 回落到默认 404。
  if (!isKnownRoute(pathname)) {
    return next(`${basePath}/404/`);
  }

  return next();
});
