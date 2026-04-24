const {
  PUBLIC_SUPABASE_URL = '',
  PUBLIC_SUPABASE_ANON_KEY = '',
  BENCH_PRODUCT_ID = '',
  BENCH_LAT = '',
  BENCH_LNG = '',
  BENCH_LIMIT = '120',
  BENCH_SINCE_DAYS = '45',
  BENCH_RADIUS_KM = '20',
} = process.env;

function requiredEnv(name, value) {
  if (!String(value || '').trim()) {
    throw new Error(`Missing required env: ${name}`);
  }
  return String(value).trim();
}

function buildRestUrl(baseUrl, productId, limit, sinceDays) {
  const url = new URL(`${baseUrl.replace(/\/$/, '')}/rest/v1/prices`);
  const sinceIso = new Date(Date.now() - Number(sinceDays) * 24 * 60 * 60 * 1000).toISOString();
  url.searchParams.set(
    'select',
    'id,product_id,store_id,price_yen,is_member_price,source,collected_at,note,stores:store_id(id,name,city,pref,lat,lng,hours),products:product_id(id,name,barcode,brand,pack,tone)',
  );
  url.searchParams.set('product_id', `eq.${productId}`);
  url.searchParams.set('order', 'collected_at.desc');
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('collected_at', `gte.${sinceIso}`);
  return url;
}

function buildRpcUrl(baseUrl) {
  return new URL(`${baseUrl.replace(/\/$/, '')}/rest/v1/rpc/fetch_product_prices`);
}

async function timedFetch(url, options) {
  const startedAt = performance.now();
  const response = await fetch(url, options);
  const text = await response.text();
  const elapsedMs = performance.now() - startedAt;
  if (!response.ok) {
    throw new Error(`Request failed ${response.status}: ${text}`);
  }
  let json;
  try {
    json = text ? JSON.parse(text) : [];
  } catch {
    json = [];
  }
  return {
    elapsedMs,
    rows: Array.isArray(json) ? json.length : 0,
    bytes: Buffer.byteLength(text || ''),
  };
}

async function main() {
  const supabaseUrl = requiredEnv('PUBLIC_SUPABASE_URL', PUBLIC_SUPABASE_URL);
  const anonKey = requiredEnv('PUBLIC_SUPABASE_ANON_KEY', PUBLIC_SUPABASE_ANON_KEY);
  const productId = requiredEnv('BENCH_PRODUCT_ID', BENCH_PRODUCT_ID);
  const lat = Number(BENCH_LAT);
  const lng = Number(BENCH_LNG);
  const limit = Math.max(1, Math.min(500, Number(BENCH_LIMIT) || 120));
  const sinceDays = Math.max(1, Number(BENCH_SINCE_DAYS) || 45);
  const radiusKm = Math.max(1, Number(BENCH_RADIUS_KM) || 20);

  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  const rest = await timedFetch(buildRestUrl(supabaseUrl, productId, limit, sinceDays), {
    method: 'GET',
    headers,
  });

  const rpc = await timedFetch(buildRpcUrl(supabaseUrl), {
    method: 'POST',
    headers: {
      ...headers,
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      payload: {
        product_id: productId,
        limit,
        since_days: sinceDays,
        lat: Number.isFinite(lat) ? lat : null,
        lng: Number.isFinite(lng) ? lng : null,
        radius_km: radiusKm,
      },
    }),
  });

  console.log(JSON.stringify({
    config: {
      productId,
      limit,
      sinceDays,
      radiusKm,
      locationProvided: Number.isFinite(lat) && Number.isFinite(lng),
    },
    rest,
    rpc,
    delta: {
      elapsedMs: Number((rpc.elapsedMs - rest.elapsedMs).toFixed(2)),
      bytes: rpc.bytes - rest.bytes,
      rows: rpc.rows - rest.rows,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exitCode = 1;
});
