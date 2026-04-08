export function normalizeInternalRedirectTarget(value, { origin, basePath, loginPath } = {}) {
  const raw = String(value || '').trim();
  if (!raw || !origin || !basePath || !loginPath) return '';

  try {
    const parsed = new URL(raw, origin);
    if (parsed.origin !== origin) return '';
    if (!parsed.pathname.startsWith(basePath)) return '';
    if (parsed.pathname === loginPath) return '';
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return '';
  }
}

export function buildLoginUrl({ origin, loginHref, currentUrl, basePath, loginPath }) {
  const loginUrl = new URL(loginHref, origin);
  const redirect = normalizeInternalRedirectTarget(currentUrl, { origin, basePath, loginPath });
  if (redirect) {
    loginUrl.searchParams.set('redirect', redirect);
  }
  return `${loginUrl.pathname}${loginUrl.search}${loginUrl.hash}`;
}
