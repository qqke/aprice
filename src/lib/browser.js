import {
  escapeIlike,
  fetchPublicProductByBarcode,
  restGet,
  restRpc,
} from './supabase-rest.js';

const runtimeConfig = globalThis.__APriceConfig || {};
const BASE_URL = String(runtimeConfig.baseUrl || '/').trim() || '/';
const RECENT_VIEWS_KEY = 'aprice:recent-views';
const TELEMETRY_QUEUE_KEY = 'aprice:telemetry-events';
const USE_SERVER_PRICE_RPC = Boolean(runtimeConfig.useServerPriceRpc);

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

export function trackEvent(name, payload = {}) {
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
    // Ignore event dispatch errors in constrained environments.
  }

  try {
    if (typeof window === 'undefined') return event;
    const raw = window.localStorage.getItem(TELEMETRY_QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const queue = Array.isArray(parsed) ? parsed : [];
    queue.push(event);
    window.localStorage.setItem(TELEMETRY_QUEUE_KEY, JSON.stringify(queue.slice(-200)));
  } catch {
    // Ignore storage failures.
  }

  return event;
}

export async function flushTrackedEvents({ force = false } = {}) {
  if (!force && !runtimeConfig.enableTelemetryRpc) return { sent: 0, skipped: true };
  if (typeof window === 'undefined') return { sent: 0, skipped: true };

  let queue = [];
  try {
    const raw = window.localStorage.getItem(TELEMETRY_QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    queue = Array.isArray(parsed) ? parsed : [];
  } catch {
    queue = [];
  }

  if (!queue.length) return { sent: 0, skipped: true };

  const batch = queue.slice(-100);
  try {
    await restRpc('submit_telemetry_events', batch);
    try {
      window.localStorage.setItem(TELEMETRY_QUEUE_KEY, JSON.stringify(queue.slice(0, Math.max(0, queue.length - batch.length))));
    } catch {
      // Ignore storage failures after successful submit.
    }
    return { sent: batch.length, skipped: false };
  } catch {
    return { sent: 0, skipped: false };
  }
}

export function escapeHtml(value = '') {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function escapeAttribute(value = '') {
  return escapeHtml(value).replace(/`/g, '&#96;');
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

  trackEvent('search', {
    query: q.slice(0, 120),
    barcode_like: Boolean(barcode),
  });

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

export async function fetchStoresPage({ term = '', limit = 10, offset = 0 } = {}) {
  const pageSize = Math.max(1, Number(limit) || 10);
  const pageOffset = Math.max(0, Number(offset) || 0);
  const q = String(term || '').trim();
  const query = {
    select: '*',
    order: 'name.asc',
    limit: pageSize + 1,
    offset: pageOffset,
  };

  if (q) {
    const pattern = `%${escapeIlike(q)}%`;
    query.or = `(${[
      `name.ilike.${pattern}`,
      `chain_name.ilike.${pattern}`,
      `pref.ilike.${pattern}`,
      `city.ilike.${pattern}`,
      `address.ilike.${pattern}`,
    ].join(',')})`;
  }

  const rows = await restGet('stores', { query });
  const visibleRows = rows?.slice(0, pageSize) || [];
  return {
    rows: visibleRows,
    hasMore: Boolean(rows?.length > pageSize),
    nextOffset: pageOffset + visibleRows.length,
  };
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

export async function fetchProductByBarcode(barcode) {
  const cleaned = cleanBarcode(barcode);
  if (!cleaned) return null;
  return fetchPublicProductByBarcode(cleaned);
}

function stripJancodeMarkup(value = '') {
  return String(value || '')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractJancodeTableValue(markdown, label) {
  const pattern = new RegExp(`^\\|\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\|\\s*(.*?)\\s*\\|$`, 'm');
  const match = String(markdown || '').match(pattern);
  return match?.[1] ? stripJancodeMarkup(match[1]) : '';
}

export function parseJancodeProductDraft(markdown, barcode) {
  const cleanedBarcode = cleanBarcode(barcode);
  const h2Match = String(markdown || '').match(/^##\s*(.+)$/m);
  const titleMatch = String(markdown || '').match(/^Title:\s*(.+)$/m);
  const name = stripJancodeMarkup(h2Match?.[1] || extractJancodeTableValue(markdown, '商品名'));
  const brand = stripJancodeMarkup(extractJancodeTableValue(markdown, '会社名'));
  const category = stripJancodeMarkup(extractJancodeTableValue(markdown, '商品ジャンル')).replace(/\s*>\s*/g, ' > ');
  const title = stripJancodeMarkup(titleMatch?.[1] || '');

  if (!cleanedBarcode) return null;
  if (!name && !brand && !category && !title) return null;

  return {
    id: cleanedBarcode,
    barcode: cleanedBarcode,
    name: name || title || cleanedBarcode,
    brand,
    pack: '',
    category,
    tone: 'sunset',
    description: '',
  };
}

export async function fetchJancodeProductDraft(barcode) {
  const cleaned = cleanBarcode(barcode);
  if (!cleaned) return null;

  const response = await fetch(`https://r.jina.ai/http://www.jancode.xyz/${cleaned}/`, {
    headers: {
      Accept: 'text/plain',
    },
  });

  if (!response.ok) return null;

  const markdown = await response.text();
  return parseJancodeProductDraft(markdown, cleaned);
}

async function fetchPricesForProductRpc(productId, options = {}) {
  const rows = await restRpc('fetch_product_prices', {
    payload: {
      product_id: productId,
      limit: options.limit,
      since_days: options.sinceDays,
      lat: options.lat,
      lng: options.lng,
      radius_km: options.radiusKm,
    },
  });
  return Array.isArray(rows) ? rows : [];
}

async function fetchPricesPageRpc(productId, options = {}) {
  const payload = {
    product_id: productId,
    limit: options.limit,
    since_days: options.sinceDays,
    lat: options.lat,
    lng: options.lng,
    radius_km: options.radiusKm,
    cursor: options.cursor || null,
  };
  const result = await restRpc('fetch_product_prices_page', { payload });
  const page = Array.isArray(result) ? result[0] : result;
  const items = Array.isArray(page?.items) ? page.items : [];
  const nextCursor = page?.next_cursor && typeof page.next_cursor === 'object' ? page.next_cursor : null;
  return { items, nextCursor };
}

export async function fetchPricesForProduct(productId, options = {}) {
  if (!productId) return [];
  const limit = Math.max(1, Math.min(Number(options.limit) || 120, 500));
  const sinceDays = Number(options.sinceDays);
  const collectedSince =
    Number.isFinite(sinceDays) && sinceDays > 0
      ? new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString()
      : '';

  if (USE_SERVER_PRICE_RPC) {
    try {
      return await fetchPricesForProductRpc(productId, {
        limit,
        sinceDays,
        lat: options.lat,
        lng: options.lng,
        radiusKm: options.radiusKm,
      });
    } catch {
      // Fall back to direct table query when RPC is not deployed.
    }
  }

  return restGet('prices', {
    query: {
      select:
        'id, product_id, store_id, price_yen, is_member_price, source, collected_at, note, stores:store_id (id, name, chain_name, address, city, pref, lat, lng, hours), products:product_id (id, name, barcode, brand, pack, tone)',
      product_id: `eq.${productId}`,
      order: 'collected_at.desc',
      limit,
      ...(collectedSince ? { collected_at: `gte.${collectedSince}` } : {}),
    },
  });
}

export async function fetchProductPricesPage(productId, options = {}) {
  if (!productId) return { items: [], nextCursor: null };
  const limit = Math.max(1, Math.min(Number(options.limit) || 60, 200));
  const sinceDays = Number(options.sinceDays);

  if (USE_SERVER_PRICE_RPC) {
    try {
      return await fetchPricesPageRpc(productId, {
        limit,
        sinceDays,
        lat: options.lat,
        lng: options.lng,
        radiusKm: options.radiusKm,
        cursor: options.cursor || null,
      });
    } catch {
      // Fall through to compatibility mode.
    }
  }

  const rows = await fetchPricesForProduct(productId, { limit, sinceDays, lat: options.lat, lng: options.lng, radiusKm: options.radiusKm });
  return { items: rows, nextCursor: null };
}

export async function fetchNearbyPrices({ productId, lat, lng, radiusKm = 8, limit = 160, sinceDays = 30 }) {
  const rows = await fetchPricesForProduct(productId, { limit, sinceDays, lat, lng, radiusKm });
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
      (position) => {
        trackEvent('geolocate_success');
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      (error) => {
        trackEvent('geolocate_failure', { message: String(error?.message || '') });
        reject(error);
      },
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
  trackEvent('open_product', { product_id: String(product.id) });
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
