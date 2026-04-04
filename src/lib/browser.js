import {
  escapeIlike,
  fetchPublicProductByBarcode,
  fetchPublicProductById,
  restDelete,
  restGet,
  restInsert,
  restRpc,
} from './supabase-rest.js';
import { createClient } from '@supabase/supabase-js';

const runtimeConfig = globalThis.__APriceConfig || {};
const SUPABASE_URL = String(import.meta.env?.PUBLIC_SUPABASE_URL || runtimeConfig.supabaseUrl || '').trim();
const SUPABASE_ANON_KEY = String(import.meta.env?.PUBLIC_SUPABASE_ANON_KEY || runtimeConfig.supabaseAnonKey || '').trim();
const BASE_URL = String(import.meta.env?.BASE_URL || runtimeConfig.baseUrl || '/').trim() || '/';

const RECENT_VIEWS_KEY = 'aprice:recent-views';

let supabaseClientPromise = null;

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

function cleanBarcode(value) {
  return String(value || '').replace(/\D/g, '').trim();
}

function distanceKm(lat1, lng1, lat2, lng2) {
  const r = 6371;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

export function resolveBase(pathname = '') {
  const base = BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`;
  const cleanPath = String(pathname || '').replace(/^\//, '');
  if (!cleanPath) return base;
  return `${base.replace(/\/$/, '')}/${cleanPath}`;
}

export async function getSession() {
  const client = await getSupabaseClient();
  const { data } = await client.auth.getSession();
  return data.session ?? null;
}

export async function getCurrentUser() {
  const session = await getSession();
  return session?.user ?? null;
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

export async function signUpWithEmailPassword({ email, password }) {
  const client = await getSupabaseClient();
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: {
      // 注册后回到登录页，兼容 Supabase 邮箱确认链路。
      emailRedirectTo: buildAuthRedirectUrl('login/'),
    },
  });
  if (error) throw error;
  return data;
}

export async function signInWithEmailPassword({ email, password }) {
  const client = await getSupabaseClient();
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data;
}

export async function sendPasswordResetEmail(email) {
  const client = await getSupabaseClient();
  const { error } = await client.auth.resetPasswordForEmail(email, {
    // 找回密码后回到登录页的重置模式，便于直接更新新密码。
    emailRedirectTo: buildAuthRedirectUrl('login/', { mode: 'reset' }),
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

export async function subscribeAuthState(callback) {
  const client = await getSupabaseClient();
  const { data } = client.auth.onAuthStateChange((event, session) => {
    callback?.(event, session);
  });
  return () => data.subscription.unsubscribe();
}
export async function fetchCurrentProfile() {
  const session = await getSession();
  if (!session?.user) return null;
  const rows = await restGet('profiles', {
    query: {
      select: 'id,email,full_name,role,created_at,updated_at',
      id: `eq.${session.user.id}`,
      limit: 1,
    },
    token: session.access_token,
  });
  return rows?.[0] ?? null;
}

export async function adminUpsertProduct(payload) {
  const session = await getSession();
  if (!session?.user) throw new Error('Please sign in first');
  return restRpc('admin_upsert_product', payload, { token: session.access_token });
}

export async function adminUpsertStore(payload) {
  const session = await getSession();
  if (!session?.user) throw new Error('Please sign in first');
  return restRpc('admin_upsert_store', payload, { token: session.access_token });
}

export async function adminUpsertPrice(payload) {
  const session = await getSession();
  if (!session?.user) throw new Error('Please sign in first');
  return restRpc('admin_upsert_price', payload, { token: session.access_token });
}
export async function adminDeleteProduct(targetId) {
  const session = await getSession();
  if (!session?.user) throw new Error('Please sign in first');
  return restRpc('admin_delete_product', { target_id: targetId }, { token: session.access_token });
}

export async function adminDeleteStore(targetId) {
  const session = await getSession();
  if (!session?.user) throw new Error('Please sign in first');
  return restRpc('admin_delete_store', { target_id: targetId }, { token: session.access_token });
}

export async function adminDeletePrice(targetId) {
  const session = await getSession();
  if (!session?.user) throw new Error('Please sign in first');
  return restRpc('admin_delete_price', { target_id: targetId }, { token: session.access_token });
}

export async function signOut() {
  const client = await getSupabaseClient();
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

export async function searchProducts(term = '') {
  const q = term.trim();
  if (!q) return fetchAllProducts();

  const pattern = `%${escapeIlike(q)}%`;
  const barcode = cleanBarcode(q);
  const orParts = [
    `name.ilike.${pattern}`,
    `brand.ilike.${pattern}`,
    `category.ilike.${pattern}`,
  ];
  if (barcode) {
    orParts.push(`barcode.ilike.%${barcode}%`);
  }

  return restGet('products', {
    query: {
      select: '*',
      or: `(${orParts.join(',')})`,
      order: 'updated_at.desc',
      limit: 20,
    },
  });
}

export async function fetchAllProducts() {
  return restGet('products', {
    query: {
      select: '*',
      order: 'updated_at.desc',
      limit: 100,
    },
  });
}

export async function fetchAllStores() {
  return restGet('stores', {
    query: {
      select: '*',
      order: 'updated_at.desc',
      limit: 200,
    },
  });
}

export async function fetchRecentPrices(limit = 10) {
  return restGet('prices', {
    query: {
      select: 'id, product_id, store_id, price_yen, is_member_price, source, note, collected_at, created_at, updated_at, stores:store_id (id, name, city, pref), products:product_id (id, name, barcode, brand)',
      order: 'collected_at.desc',
      limit,
    },
  });
}

export async function fetchProductById(id) {
  if (!id) return null;
  return fetchPublicProductById(id);
}

export async function fetchProductByBarcode(barcode) {
  const cleaned = cleanBarcode(barcode);
  if (!cleaned) return null;
  return fetchPublicProductByBarcode(cleaned);
}

export async function fetchPricesForProduct(productId) {
  if (!productId) return [];
  return restGet('prices', {
    query: {
      select:
        'id, product_id, store_id, price_yen, is_member_price, source, collected_at, note, stores:store_id (id, name, chain_name, address, city, pref, lat, lng, hours), products:product_id (id, name, barcode, brand, pack, tone)',
      product_id: `eq.${productId}`,
      order: 'collected_at.desc',
    },
  });
}

export async function fetchNearbyPrices({ productId, lat, lng, radiusKm = 8 }) {
  const rows = await fetchPricesForProduct(productId);
  return rows
    .map((row) => {
      const store = row.stores || null;
      if (!store || typeof store.lat !== 'number' || typeof store.lng !== 'number') {
        return { ...row, distance_km: null };
      }
      return {
        ...row,
        distance_km: distanceKm(lat, lng, store.lat, store.lng),
      };
    })
    .filter((row) => row.distance_km === null || row.distance_km <= radiusKm)
    .sort((a, b) => {
      if (a.distance_km === null && b.distance_km === null) return a.price_yen - b.price_yen;
      if (a.distance_km === null) return 1;
      if (b.distance_km === null) return -1;
      return a.distance_km - b.distance_km || a.price_yen - b.price_yen;
    });
}

export async function fetchPersonalLogs(userId) {
  if (!userId) return [];
  const session = await getSession();
  return restGet('user_price_logs', {
    query: {
      select: '*, products:product_id (*), stores:store_id (*)',
      user_id: `eq.${userId}`,
      order: 'created_at.desc',
    },
    token: session?.access_token,
  });
}

export async function savePersonalLog(entry) {
  if (!entry?.product_id || !entry?.price_yen) {
    throw new Error('product_id and price_yen are required');
  }
  const session = await getSession();
  if (!session?.user) {
    throw new Error('Please sign in first');
  }
  return restInsert(
    'user_price_logs',
    {
      ...entry,
      user_id: session.user.id,
    },
    { token: session.access_token },
  );
}

export async function fetchFavorites(userId) {
  if (!userId) return [];
  const session = await getSession();
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
  const session = await getSession();
  if (!session?.user) throw new Error('Please sign in first');

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

  return { action: 'added' };
}

export async function geolocate() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation unavailable'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }),
      (error) => reject(error),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  });
}

export function productToneClass(tone = 'sunset') {
  return {
    sunset: 'tone-sunset',
    mint: 'tone-mint',
    azure: 'tone-azure',
  }[tone] || 'tone-sunset';
}

export function productLabel(product) {
  return `${product.name} · ${product.pack}`;
}

export function formatYen(value) {
  return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(value);
}

export function formatDateTime(value) {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function formatDistance(value) {
  if (value === null || value === undefined) return 'unknown';
  return `${value.toFixed(1)} km`;
}
function readRecentViews() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENT_VIEWS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeRecentViews(rows) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(RECENT_VIEWS_KEY, JSON.stringify(rows));
  } catch {
    // Ignore storage quota / privacy mode issues.
  }
}

export function fetchRecentViews() {
  return readRecentViews();
}

export function recordRecentView(product) {
  if (!product?.id) return [];
  const next = {
    id: product.id,
    name: product.name || '',
    brand: product.brand || '',
    pack: product.pack || '',
    barcode: product.barcode || '',
    tone: product.tone || 'sunset',
    viewed_at: new Date().toISOString(),
  };
  const rows = readRecentViews().filter((item) => item.id !== next.id);
  rows.unshift(next);
  writeRecentViews(rows.slice(0, 12));
  return rows;
}

export function clearRecentViews() {
  writeRecentViews([]);
}















