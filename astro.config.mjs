import { defineConfig } from 'astro/config';

const publicSiteUrl = process.env.PUBLIC_SITE_URL || '';
const usesCustomDomain = publicSiteUrl.length > 0 && !publicSiteUrl.includes('github.io');
const repoBase = process.env.ASTRO_BASE_PATH || (usesCustomDomain ? '/' : '/aprice/');

function createDev404Plugin(basePath) {
  const normalizedBase = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;

  function normalizePath(pathname) {
    if (!pathname.startsWith(normalizedBase)) return pathname;
    const appPath = pathname.slice(normalizedBase.length) || '/';
    return appPath.startsWith('/') ? appPath : `/${appPath}`;
  }

  function isKnownRoute(pathname) {
    const appPath = normalizePath(pathname).replace(/\/$/, '') || '/';
    if (appPath === '/' || appPath === '/404') return true;
    if (appPath === '/scan' || appPath === '/login' || appPath === '/me' || appPath === '/admin') return true;
    if (appPath.startsWith('/product/')) return true;
    return false;
  }

  return {
    name: 'aprice-dev-404',
    configureServer(server) {
      server.httpServer?.prependListener('request', (req) => {
        const rawUrl = req.url || '/';
        const url = new URL(rawUrl, 'http://127.0.0.1');
        const pathname = url.pathname;

        if (pathname.startsWith(`${normalizedBase}/404`)) {
          return;
        }

        if (!pathname.startsWith(normalizedBase) || pathname.includes('.')) {
          return;
        }

        if (!isKnownRoute(pathname)) {
          const target = `${normalizedBase}/404/`;
          console.log(`[aprice] rewrite 404: ${pathname} -> ${target}`);
          req.url = `${target}${url.search}`;
        }
      });
    },
  };
}

export default defineConfig({
  site: process.env.PUBLIC_SITE_URL || 'https://example.github.io/aprice',
  base: repoBase,
  trailingSlash: 'always',
  output: 'static',
  vite: {
    resolve: {
      preserveSymlinks: true,
    },
    plugins: [createDev404Plugin(repoBase)],
  },
});