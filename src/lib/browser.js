import {
  escapeIlike,
  fetchPublicProductByBarcode,
  fetchPublicProductById,
  restGet,
} from './supabase-rest.js';

const runtimeConfig = globalThis.__APriceConfig || {};
const BASE_URL = String(runtimeConfig.baseUrl || '/').trim() || '/';
const RECENT_VIEWS_KEY = 'aprice:recent-views';

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
