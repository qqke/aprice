import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.105.4';

import { restDelete, restGet, restInsert, restRpc } from './supabase-rest.js';
import { normalizeInternalRedirectTarget } from './auth-redirect.js';
import { resolveBase } from './browser.js';
import { friendlyDataError, validateJanCode, validateOptionalHttpUrl, validatePositiveYen } from './form-validation.js';

const runtimeConfig = globalThis.__APriceConfig || {};
const SUPABASE_URL = String(runtimeConfig.supabaseUrl || '').trim();
const SUPABASE_ANON_KEY = String(runtimeConfig.supabaseAnonKey || '').trim();

let supabaseClientPromise = null;

function trackEvent(name, payload = {}) {
  const event = {
    name: String(name || 'unknown'),
    payload: payload && typeof payload === 'object' ? payload : { value: payload },
    at: new Date().toISOString(),
  };
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof window.CustomEvent === 'function') {
      window.dispatchEvent(new CustomEvent('aprice:track', { detail: event }));
    }
  } catch {
    // Ignore telemetry failures for auth flows.
  }
  return event;
}

function ensureConfigured() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Missing Supabase environment variables');
  }
}

async function getSupabaseClient() {
  ensureConfigured();
  if (!supabaseClientPromise) {
    supabaseClientPromise = Promise.resolve(
      createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      }),
    );
  }
  return supabaseClientPromise;
}

// 统一拼出站内 auth 回跳地址，避免不同页面各自手写 redirect URL。
function buildAuthRedirectUrl(pathname = 'login/', params = {}) {
  const url = new URL(resolveBase(pathname), window.location.origin);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

const authRedirectConfig = {
  origin: window.location.origin,
  basePath: new URL(resolveBase(''), window.location.origin).pathname,
  loginPath: new URL(resolveBase('login/'), window.location.origin).pathname,
};
export async function getSession() {
  const client = await getSupabaseClient();
  const { data } = await client.auth.getSession();
  return data.session ?? null;
}

export async function getCurrentUser() {
  const session = await getSession();
  return session?.user ?? null;
}

async function requireSession() {
  const session = await getSession();
  if (!session?.user) throw new Error('Please sign in first');
  return session;
}

export async function signUpWithEmailPassword({ email, password, redirect = '', captchaToken = '' }) {
  const client = await getSupabaseClient();
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      // 注册后回到登录页，兼容 Supabase 邮箱确认链路。
      emailRedirectTo: buildAuthRedirectUrl('login/', { redirect: normalizeInternalRedirectTarget(redirect, authRedirectConfig) }),
      captchaToken: String(captchaToken || '').trim() || undefined,
    },
  });
  if (error) throw error;
  if (Array.isArray(data?.user?.identities) && data.user.identities.length === 0) {
    throw new Error('User already registered');
  }
  return data;
}

export async function signInWithEmailPassword({ email, password, captchaToken = '' }) {
  const client = await getSupabaseClient();
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
    options: {
      captchaToken: String(captchaToken || '').trim() || undefined,
    },
  });
  if (error) throw error;
  return data;
}

export async function sendPasswordResetEmail({ email, redirect = '', captchaToken = '' }) {
  const client = await getSupabaseClient();
  const { error } = await client.auth.resetPasswordForEmail(email, {
    // 找回密码后回到登录页的重置模式，便于直接更新新密码。
    redirectTo: buildAuthRedirectUrl('login/', {
      mode: 'reset',
      redirect: normalizeInternalRedirectTarget(redirect, authRedirectConfig),
    }),
    captchaToken: String(captchaToken || '').trim() || undefined,
  });
  if (error) throw error;
  return { ok: true };
}

export async function updatePassword(password) {
  const client = await getSupabaseClient();
  const { data, error } = await client.auth.updateUser({
    password,
  });
  if (error) throw error;
  return data;
}

export async function changePassword({ currentPassword, password }) {
  const client = await getSupabaseClient();
  const { data, error } = await client.auth.updateUser({
    current_password: currentPassword,
    password,
  });
  if (error) throw error;
  return data;
}

export async function subscribeAuthState(callback) {
  const client = await getSupabaseClient();
  const { data } = client.auth.onAuthStateChange((event, session) => {
    callback?.(event, session);
  });
  return () => data.subscription.unsubscribe();
}

async function fetchProfileRow(session, includeRole = true) {
  const select = includeRole ? 'id,email,full_name,role,created_at,updated_at' : 'id,email,full_name,created_at,updated_at';
  const rows = await restGet('profiles', {
    query: {
      select,
      id: `eq.${session.user.id}`,
      limit: 1,
    },
    token: session.access_token,
  });
  return rows?.[0] ?? null;
}

export async function fetchCurrentProfile() {
  const session = await getSession();
  if (!session?.user) return null;

  try {
    return await fetchProfileRow(session, true);
  } catch (error) {
    const message = String(error?.message || '');
    const code = String(error?.code || '');
    // 旧库里如果还没有 profiles.role，就回退到不含 role 的安全查询，避免整页会话读取失败。
    if (code === '42703' || message.includes('profiles.role does not exist')) {
      const profile = await fetchProfileRow(session, false);
      if (profile && !('role' in profile)) {
        profile.role = 'user';
      }
      return profile;
    }
    throw error;
  }
}

export async function signOut() {
  const client = await getSupabaseClient();
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

export async function fetchPersonalLogs(userId) {
  if (!userId) return [];
  const session = await requireSession();
  return restGet('user_price_logs', {
    query: {
      select: '*, products:product_id (*), stores:store_id (*)',
      user_id: `eq.${userId}`,
      order: 'created_at.desc',
    },
    token: session?.access_token,
  });
}

export async function fetchCreditSummary() {
  const session = await requireSession();
  const result = await restRpc('fetch_credit_summary', {}, { token: session.access_token });
  const summary = Array.isArray(result) ? result[0] : result;
  return summary && typeof summary === 'object' ? summary : {};
}

export async function fetchCreditLedger(limit = 30) {
  const session = await requireSession();
  return restGet('credit_ledger', {
    query: {
      select: '*',
      user_id: `eq.${session.user.id}`,
      order: 'created_at.desc',
      limit: Math.max(1, Math.min(Number(limit) || 30, 100)),
    },
    token: session.access_token,
  });
}

export async function fetchAppSettings() {
  const result = await restRpc('fetch_app_settings', {});
  const settings = Array.isArray(result) ? result[0] : result;
  return settings && typeof settings === 'object' ? settings : {};
}

export async function recordProductSearch(query) {
  const session = await requireSession();
  const result = await restRpc('record_product_search', { payload: { query: String(query || '') } }, { token: session.access_token });
  const summary = Array.isArray(result) ? result[0] : result;
  return summary && typeof summary === 'object' ? summary : {};
}

export async function claimRandomPriceTask() {
  const session = await requireSession();
  const result = await restRpc('claim_random_price_task', {}, { token: session.access_token });
  return Array.isArray(result) ? result[0] : result;
}

export async function skipPriceTask(id) {
  const session = await requireSession();
  const result = await restRpc('skip_price_task', { payload: { id } }, { token: session.access_token });
  return Array.isArray(result) ? result[0] : result;
}

export async function adminAdjustCredits(payload) {
  const session = await requireSession();
  const result = await restRpc('admin_adjust_credits', { payload }, { token: session.access_token });
  const summary = Array.isArray(result) ? result[0] : result;
  return summary && typeof summary === 'object' ? summary : {};
}

export async function adminUpdateAppSetting(payload) {
  const session = await requireSession();
  const result = await restRpc('admin_update_app_setting', { payload }, { token: session.access_token });
  return Array.isArray(result) ? result[0] : result;
}

function personalLogSortTime(entry) {
  const time = new Date(entry?.created_at || entry?.purchased_at || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

export function indexLatestPersonalPricesByStore(logs = [], productId = '') {
  const selectedProductId = String(productId || '');
  const latestByStore = new Map();

  for (const entry of logs || []) {
    if (!entry || (selectedProductId && String(entry.product_id || '') !== selectedProductId)) continue;
    if (!entry.store_id || !entry.price_yen) continue;

    const storeId = String(entry.store_id);
    const existing = latestByStore.get(storeId);
    if (!existing || personalLogSortTime(entry) >= personalLogSortTime(existing)) {
      latestByStore.set(storeId, entry);
    }
  }

  return latestByStore;
}

export async function savePersonalLog(entry) {
  const price = validatePositiveYen(entry?.price_yen);
  if (!entry?.product_id || !price.ok) {
    throw new Error(!entry?.product_id ? 'product_id and price_yen are required' : price.message);
  }
  const session = await requireSession();
  const result = await restInsert(
    'user_price_logs',
    {
      ...entry,
      price_yen: price.value,
      user_id: session.user.id,
    },
    { token: session.access_token },
  );
  trackEvent('submit_price', {
    product_id: entry?.product_id || '',
    store_id: entry?.store_id || '',
    source: 'personal_log',
  });
  return result;
}

export async function submitStorePrice(entry) {
  const price = validatePositiveYen(entry?.price_yen);
  const evidence = validateOptionalHttpUrl(entry?.evidence_url || '');
  if (!entry?.product_id || !entry?.store_id || !price.ok) {
    throw new Error(!entry?.product_id || !entry?.store_id ? 'product_id, store_id and price_yen are required' : price.message);
  }
  if (!evidence.ok) {
    throw new Error(evidence.message);
  }
  const session = await requireSession();
  const result = await restRpc('submit_store_price', {
    payload: {
      ...entry,
      price_yen: price.value,
      evidence_url: evidence.value,
    },
  }, { token: session.access_token });
  trackEvent('submit_price', {
    product_id: entry?.product_id || '',
    store_id: entry?.store_id || '',
    source: 'store_price',
  });
  if (entry?.share_to_public) {
    trackEvent('share_public', {
      product_id: entry?.product_id || '',
      store_id: entry?.store_id || '',
    });
  }
  return result;
}

export async function fetchPendingPriceSubmissions(limit = 20) {
  const session = await requireSession();
  return restGet('user_price_logs', {
    query: {
      select: '*, products:product_id (*), stores:store_id (*)',
      share_to_public: 'eq.true',
      review_status: 'eq.pending',
      order: 'created_at.desc',
      limit,
    },
    token: session.access_token,
  });
}

export async function fetchProductSubmissions(limit = 20) {
  const session = await requireSession();
  return restGet('product_submissions', {
    query: {
      select: '*',
      review_status: 'eq.pending',
      order: 'created_at.desc',
      limit,
    },
    token: session.access_token,
  });
}

export async function fetchMyProductSubmissions(userId, limit = 20) {
  if (!userId) return [];
  const session = await requireSession();
  return restGet('product_submissions', {
    query: {
      select: '*',
      user_id: `eq.${userId}`,
      order: 'created_at.desc',
      limit,
    },
    token: session.access_token,
  });
}

export async function adminReviewPriceSubmission(payload) {
  const session = await requireSession();
  const result = await restRpc('admin_review_price_submission', { payload }, { token: session.access_token });
  if (payload?.action === 'approve') {
    trackEvent('review_approved', { id: payload?.id || '' });
  }
  return result;
}

export async function adminReviewProductSubmission(payload) {
  const session = await requireSession();
  const result = await restRpc('admin_review_product_submission', { payload }, { token: session.access_token });
  if (payload?.action === 'approve') {
    trackEvent('product_review_approved', { id: payload?.id || '' });
  }
  return result;
}

export async function adminFetchTelemetrySummary(payload = {}) {
  const session = await requireSession();
  const result = await restRpc('admin_fetch_telemetry_summary', { payload }, { token: session.access_token });
  const summary = Array.isArray(result) ? result[0] : result;
  return summary && typeof summary === 'object' ? summary : { days: 7, total_events: 0, active_users: 0, top_events: [] };
}

export async function adminFetchTelemetryRecent(payload = {}) {
  const session = await requireSession();
  const result = await restRpc('admin_fetch_telemetry_recent', { payload }, { token: session.access_token });
  const rows = Array.isArray(result) ? result[0] : result;
  const items = Array.isArray(rows?.items) ? rows.items : [];
  return { items };
}

export async function fetchFavorites(userId) {
  if (!userId) return [];
  const session = await requireSession();
  return restGet('favorites', {
    query: {
      select: '*',
      user_id: `eq.${userId}`,
      order: 'created_at.desc',
    },
    token: session?.access_token,
  });
}

export async function toggleFavorite(entityType, entityId) {
  const session = await requireSession();

  const existing = await restGet('favorites', {
    query: {
      select: 'id',
      user_id: `eq.${session.user.id}`,
      entity_type: `eq.${entityType}`,
      entity_id: `eq.${entityId}`,
      limit: 1,
    },
    token: session.access_token,
  });

  if (existing?.[0]?.id) {
    await restDelete('favorites', {
      query: { id: `eq.${existing[0].id}` },
      token: session.access_token,
    });
    trackEvent('favorite', { action: 'removed', entity_type: entityType, entity_id: entityId });
    return { action: 'removed' };
  }

  await restInsert(
    'favorites',
    {
      user_id: session.user.id,
      entity_type: entityType,
      entity_id: entityId,
    },
    { token: session.access_token },
  );
  trackEvent('favorite', { action: 'added', entity_type: entityType, entity_id: entityId });

  return { action: 'added' };
}

export async function createProduct(payload) {
  const session = await requireSession();
  const barcode = validateJanCode(payload?.barcode || payload?.id || '');
  const imageUrl = validateOptionalHttpUrl(payload?.image_url || '');
  if (!barcode.ok) throw new Error(barcode.message);
  if (!imageUrl.ok) throw new Error(imageUrl.message);
  const normalizedPayload = {
    ...payload,
    id: payload?.id || barcode.value,
    barcode: barcode.value,
    image_url: imageUrl.value,
  };
  try {
    return await restRpc('admin_upsert_product', normalizedPayload, { token: session.access_token });
  } catch (error) {
    throw new Error(friendlyDataError(error));
  }
}

export async function submitProductSubmission(payload) {
  const session = await requireSession();
  const barcode = validateJanCode(payload?.barcode || payload?.id || '');
  const imageUrl = validateOptionalHttpUrl(payload?.image_url || '');
  if (!barcode.ok) throw new Error(barcode.message);
  if (!imageUrl.ok) throw new Error(imageUrl.message);
  if (!String(payload?.name || '').trim()) throw new Error('请填写商品名称。');
  const result = await restRpc('create_product', {
    ...payload,
    id: payload?.id || barcode.value,
    barcode: barcode.value,
    image_url: imageUrl.value,
  }, { token: session.access_token });
  trackEvent('submit_product', { barcode: barcode.ok ? barcode.value : '', source: 'create_product' });
  return result;
}

export async function adminUpsertStore(payload) {
  const session = await requireSession();
  return restRpc('admin_upsert_store', payload, { token: session.access_token });
}

export function formatDataError(error) {
  return friendlyDataError(error);
}

export async function adminUpsertPrice(payload) {
  const session = await requireSession();
  return restRpc('admin_upsert_price', payload, { token: session.access_token });
}

export async function adminDeleteProduct(targetId) {
  const session = await requireSession();
  return restRpc('admin_delete_product', { target_id: targetId }, { token: session.access_token });
}

export async function adminDeleteStore(targetId) {
  const session = await requireSession();
  return restRpc('admin_delete_store', { target_id: targetId }, { token: session.access_token });
}

export async function adminDeletePrice(targetId) {
  const session = await requireSession();
  return restRpc('admin_delete_price', { target_id: targetId }, { token: session.access_token });
}

