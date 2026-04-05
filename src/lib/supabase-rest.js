const runtimeConfig = globalThis.__APriceConfig || {};
// 这些默认值只覆盖公共 anon 配置，优先级仍然是环境变量 > 运行时注入 > 仓库默认值。
const DEFAULT_SUPABASE_URL = 'https://tplkpguxlvrhxassyjfm.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY = 'sb_publishable_LVrlFNcZCGnBoji9Hw9gcQ_ELbcv1BT';
const SUPABASE_URL = String(import.meta.env?.PUBLIC_SUPABASE_URL || runtimeConfig.supabaseUrl || DEFAULT_SUPABASE_URL).trim();
const SUPABASE_ANON_KEY = String(import.meta.env?.PUBLIC_SUPABASE_ANON_KEY || runtimeConfig.supabaseAnonKey || DEFAULT_SUPABASE_ANON_KEY).trim();

function ensureConfigured() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Missing Supabase environment variables');
  }
}

function buildUrl(path, query = {}) {
  ensureConfigured();
  const url = new URL(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return url;
}

function buildHeaders({ token, prefer } = {}) {
  ensureConfigured();
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(prefer ? { Prefer: prefer } : {}),
  };
}

async function parseResponse(response) {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `Supabase request failed with ${response.status}`);
  }
  if (!text) return null;
  return JSON.parse(text);
}

export async function restGet(path, { query, token } = {}) {
  const response = await fetch(buildUrl(path, query), {
    method: 'GET',
    headers: buildHeaders({ token }),
  });
  return parseResponse(response);
}

export async function restInsert(path, body, { token, returning = true } = {}) {
  const response = await fetch(buildUrl(path), {
    method: 'POST',
    headers: buildHeaders({
      token,
      prefer: returning ? 'return=representation' : 'return=minimal',
    }),
    body: JSON.stringify(body),
  });
  return parseResponse(response);
}

export async function restDelete(path, { query, token } = {}) {
  const response = await fetch(buildUrl(path, query), {
    method: 'DELETE',
    headers: buildHeaders({ token, prefer: 'return=representation' }),
  });
  return parseResponse(response);
}

export async function restRpc(name, body, { token } = {}) {
  const response = await fetch(buildUrl(`rpc/${name}`), {
    method: 'POST',
    headers: buildHeaders({ token, prefer: 'return=representation' }),
    body: JSON.stringify(body),
  });
  return parseResponse(response);
}

export function escapeIlike(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_')
    .replace(/'/g, "''");
}

export async function fetchPublicProducts({ limit = 20, order = 'updated_at.desc' } = {}) {
  return restGet('products', {
    query: {
      select: '*',
      order,
      limit,
    },
  });
}

export async function fetchPublicStores({ limit = 20, order = 'updated_at.desc' } = {}) {
  return restGet('stores', {
    query: {
      select: '*',
      order,
      limit,
    },
  });
}

export async function fetchPublicProductById(id) {
  const rows = await restGet('products', {
    query: {
      select: '*',
      id: `eq.${id}`,
      limit: 1,
    },
  });
  return rows?.[0] ?? null;
}

export async function fetchPublicProductByBarcode(barcode) {
  const rows = await restGet('products', {
    query: {
      select: '*',
      barcode: `eq.${barcode}`,
      limit: 1,
    },
  });
  return rows?.[0] ?? null;
}






