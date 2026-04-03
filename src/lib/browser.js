import {
  demoFavorites,
  demoLogs,
  demoPriceRows,
  demoProducts,
  demoStores,
  findDemoProductByBarcode,
  findDemoProductById,
} from './catalog.js';

const SUPABASE_URL = import.meta.env.PUBLIC_SUPABASE_URL?.trim() || '';
const SUPABASE_ANON_KEY = import.meta.env.PUBLIC_SUPABASE_ANON_KEY?.trim() || '';
const HAS_SUPABASE = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
const BASE_URL = import.meta.env.BASE_URL || '/';

const storageKeys = {
  demoSession: 'aprice:demo-session',
  logs: 'aprice:logs',
  favorites: 'aprice:favorites',
};

let supabaseClientPromise = null;

function normalize(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function cleanBarcode(value) {
  return String(value || '').replace(/\D/g, '').trim();
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

async function getSupabaseClient() {
  if (!HAS_SUPABASE) return null;
  if (!supabaseClientPromise) {
    supabaseClientPromise = import('https://esm.sh/@supabase/supabase-js@2').then(({ createClient }) =>
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

function localProducts() {
  return demoProducts.slice();
}

function localPricesForProduct(productId) {
  return demoPriceRows(productId);
}

export function resolveBase(pathname = '') {
  const base = BASE_URL.endsWith('/') ? BASE_URL : `${BASE_URL}/`;
  const cleanPath = String(pathname || '').replace(/^\//, '');
  if (!cleanPath) {
    return base;
  }
  return `${base.replace(/\/$/, '')}/${cleanPath}`;
}

export async function getSession() {
  if (HAS_SUPABASE) {
    const client = await getSupabaseClient();
    const { data } = await client.auth.getSession();
    return data.session ?? null;
  }
  return readJson(storageKeys.demoSession, null);
}

export async function getCurrentUser() {
  const session = await getSession();
  return session?.user ?? null;
}

export async function sendMagicLink(email) {
  if (!HAS_SUPABASE) {
    const session = {
      user: {
        id: 'demo-user',
        email,
        user_metadata: { full_name: email.split('@')[0] || 'Demo User' },
      },
    };
    writeJson(storageKeys.demoSession, session);
    return { ok: true, mode: 'demo' };
  }

  const client = await getSupabaseClient();
  const redirectTo = `${window.location.origin}${resolveBase('login/')}`;
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  });

  if (error) throw error;
  return { ok: true, mode: 'supabase' };
}

export async function signOut() {
  if (!HAS_SUPABASE) {
    localStorage.removeItem(storageKeys.demoSession);
    return;
  }

  const client = await getSupabaseClient();
  await client.auth.signOut();
}

export async function searchProducts(term = '') {
  const q = term.trim();
  if (!q) {
    return HAS_SUPABASE ? await fetchAllProducts() : localProducts();
  }

  if (!HAS_SUPABASE) {
    const needle = normalize(q);
    return localProducts().filter((product) => {
      return [product.name, product.brand, product.barcode, product.category]
        .map(normalize)
        .some((value) => value.includes(needle));
    });
  }

  const client = await getSupabaseClient();
  const { data, error } = await client
    .from('products')
    .select('*')
    .or(`name.ilike.%${q}%,brand.ilike.%${q}%,barcode.ilike.%${cleanBarcode(q)}%,category.ilike.%${q}%`)
    .order('updated_at', { ascending: false })
    .limit(20);

  if (error) throw error;
  return data ?? [];
}

export async function fetchAllProducts() {
  if (!HAS_SUPABASE) return localProducts();
  const client = await getSupabaseClient();
  const { data, error } = await client.from('products').select('*').order('updated_at', { ascending: false }).limit(100);
  if (error) throw error;
  return data ?? [];
}

export async function fetchProductById(id) {
  if (!id) return null;
  if (!HAS_SUPABASE) return findDemoProductById(id);

  const client = await getSupabaseClient();
  const { data, error } = await client.from('products').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function fetchProductByBarcode(barcode) {
  const cleaned = cleanBarcode(barcode);
  if (!cleaned) return null;
  if (!HAS_SUPABASE) return findDemoProductByBarcode(cleaned);

  const client = await getSupabaseClient();
  const { data, error } = await client.from('products').select('*').eq('barcode', cleaned).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function fetchPricesForProduct(productId) {
  if (!productId) return [];
  if (!HAS_SUPABASE) return localPricesForProduct(productId);

  const client = await getSupabaseClient();
  const { data, error } = await client
    .from('prices')
    .select(
      'id, product_id, store_id, price_yen, is_member_price, source, collected_at, note, stores:store_id (id, name, chain_name, address, city, pref, lat, lng, hours), products:product_id (id, name, barcode, brand, pack, tone)',
    )
    .eq('product_id', productId)
    .order('collected_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function fetchNearbyPrices({ productId, lat, lng, radiusKm = 8 }) {
  const rows = await fetchPricesForProduct(productId);
  return rows
    .map((row) => {
      const store = row.store || row.stores || null;
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
  if (!HAS_SUPABASE) {
    return [...demoLogs.filter((log) => log.user_id === userId), ...readJson(storageKeys.logs, [])]
      .filter((log) => log.user_id === userId)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  }

  const client = await getSupabaseClient();
  const { data, error } = await client
    .from('user_price_logs')
    .select('*, products:product_id (*), stores:store_id (*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function savePersonalLog(entry) {
  if (!entry?.product_id || !entry?.price_yen) {
    throw new Error('product_id and price_yen are required');
  }

  if (!HAS_SUPABASE) {
    const session = readJson(storageKeys.demoSession, null);
    if (!session?.user) {
      throw new Error('Please sign in first');
    }
    const logs = readJson(storageKeys.logs, []);
    const next = {
      id: crypto.randomUUID(),
      user_id: session.user.id,
      created_at: new Date().toISOString(),
      ...entry,
    };
    logs.unshift(next);
    writeJson(storageKeys.logs, logs);
    return next;
  }

  const client = await getSupabaseClient();
  const user = await getCurrentUser();
  const payload = {
    ...entry,
    user_id: user.id,
  };
  const { data, error } = await client.from('user_price_logs').insert(payload).select('*').single();
  if (error) throw error;
  return data;
}

export async function fetchFavorites(userId) {
  if (!userId) return [];
  if (!HAS_SUPABASE) {
    return demoFavorites
      .filter((item) => item.user_id === userId)
      .concat(readJson(storageKeys.favorites, []).filter((item) => item.user_id === userId));
  }

  const client = await getSupabaseClient();
  const { data, error } = await client.from('favorites').select('*').eq('user_id', userId).order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function toggleFavorite(entityType, entityId) {
  const user = await getCurrentUser();
  if (!user) throw new Error('Please sign in first');

  if (!HAS_SUPABASE) {
    const favorites = readJson(storageKeys.favorites, []);
    const index = favorites.findIndex((item) => item.user_id === user.id && item.entity_type === entityType && item.entity_id === entityId);
    if (index >= 0) {
      favorites.splice(index, 1);
    } else {
      favorites.unshift({
        id: crypto.randomUUID(),
        user_id: user.id,
        entity_type: entityType,
        entity_id: entityId,
        created_at: new Date().toISOString(),
      });
    }
    writeJson(storageKeys.favorites, favorites);
    return;
  }

  const client = await getSupabaseClient();
  const { data: existing } = await client
    .from('favorites')
    .select('*')
    .eq('user_id', user.id)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .maybeSingle();

  if (existing?.id) {
    await client.from('favorites').delete().eq('id', existing.id);
    return;
  }

  await client.from('favorites').insert({
    user_id: user.id,
    entity_type: entityType,
    entity_id: entityId,
  });
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

export function getDemoProductById(id) {
  return findDemoProductById(id);
}

export function getDemoPricesForProduct(productId) {
  return demoPriceRows(productId);
}

export function getDemoProducts() {
  return demoProducts.slice();
}

export function getDemoStores() {
  return demoStores.slice();
}
