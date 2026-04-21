import assert from 'node:assert/strict';

globalThis.__APriceConfig = {
  baseUrl: '/aprice/',
  supabaseUrl: 'https://example.supabase.co',
  supabaseAnonKey: 'anon-key',
};

const requests = [];


globalThis.fetch = async (input) => {
  const url = String(input);
  requests.push(url);

  if (url.includes('r.jina.ai/http://www.jancode.xyz/4987240210733/')) {
    return new Response(
      [
        'Title: JANコード 4987240210733 | 龍角散ダイレクトスティック ピーチ(16包) 株式会社龍角散 医薬品・コンタクト・介護',
        '',
        '## 龍角散ダイレクトスティック ピーチ(16包)',
        '',
        '### 商品基本情報',
        '',
        '| 商品名 | 龍角散ダイレクトスティック ピーチ(16包) |',
        '| 会社名 | 株式会社龍角散 |',
        '| 商品ジャンル | 医薬品・コンタクト・介護 > 医薬品・医薬部外品 > 医薬品 |',
      ].join('\n'),
      { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
    );
  }

  if (url.includes('/rest/v1/products')) {
    if (url.includes('barcode=eq.4987188161027')) {
      return new Response(
        JSON.stringify([
          {
            id: 'loxonin-s',
            name: 'Loxonin S',
            brand: 'Santen',
            pack: '12 tabs',
            barcode: '4987188161027',
          },
        ]),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify([
        {
          id: 'loxonin-s',
          name: 'Loxonin S',
          brand: 'Santen',
          pack: '12 tabs',
          barcode: '4987188161027',
        },
      ]),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  if (url.includes('/rest/v1/stores')) {
    return new Response(
      JSON.stringify([
        {
          id: 'welcia-shibuya',
          name: 'Welcia Shibuya',
          chain_name: 'Welcia',
          city: 'Tokyo',
          pref: 'Tokyo',
        },
        {
          id: 'welcia-ebisu',
          name: 'Welcia Ebisu',
          chain_name: 'Welcia',
          city: 'Tokyo',
          pref: 'Tokyo',
        },
      ]),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  if (url.includes('/rest/v1/prices')) {
    return new Response(
      JSON.stringify([
        {
          id: 'price-near',
          product_id: 'loxonin-s',
          store_id: 'near-store',
          price_yen: 720,
          stores: { id: 'near-store', name: 'Near Store', lat: 35.649, lng: 139.722 },
        },
        {
          id: 'price-far',
          product_id: 'loxonin-s',
          store_id: 'far-store',
          price_yen: 650,
          stores: { id: 'far-store', name: 'Far Store', lat: 35.8, lng: 139.9 },
        },
        {
          id: 'price-unknown-distance',
          product_id: 'loxonin-s',
          store_id: 'unknown-store',
          price_yen: 600,
          stores: { id: 'unknown-store', name: 'Unknown Distance Store' },
        },
      ]),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }


  return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
};

const browser = await import('../src/lib/browser.js');

const rows = await browser.searchProducts('ロキソ');
assert.equal(rows.length, 1);
assert.match(requests[0], /\/rest\/v1\/products/);
assert.match(requests[0], /name\.ilike/);
assert.equal(browser.resolveBase('product/loxonin-s/'), '/aprice/product/loxonin-s/');

const storesPage = await browser.fetchStoresPage({ term: 'welcia', limit: 1 });
assert.equal(storesPage.rows.length, 1);
assert.equal(storesPage.hasMore, true);
assert.equal(storesPage.nextOffset, 1);
assert.match(requests.at(-1), /\/rest\/v1\/stores/);
assert.match(requests.at(-1), /limit=2/);
assert.match(requests.at(-1), /offset=0/);
assert.match(requests.at(-1), /chain_name\.ilike/);

const draft = browser.parseJancodeProductDraft(
  [
    'Title: JANコード 4987240210733 | 龍角散ダイレクトスティック ピーチ(16包) 株式会社龍角散 医薬品・コンタクト・介護',
    '',
    '## 龍角散ダイレクトスティック ピーチ(16包)',
    '',
    '### 商品基本情報',
    '',
    '| 商品名 | 龍角散ダイレクトスティック ピーチ(16包) |',
    '| 会社名 | 株式会社龍角散 |',
    '| 商品ジャンル | 医薬品・コンタクト・介護 > 医薬品・医薬部外品 > 医薬品 |',
  ].join('\n'),
  '4987240210733',
);
assert.equal(draft?.barcode, '4987240210733');
assert.equal(draft?.name, '龍角散ダイレクトスティック ピーチ(16包)');
assert.equal(draft?.brand, '株式会社龍角散');
assert.equal(draft?.category, '医薬品・コンタクト・介護 > 医薬品・医薬部外品 > 医薬品');

const jancodeDraft = await browser.fetchJancodeProductDraft('4987240210733');
assert.equal(jancodeDraft?.barcode, '4987240210733');
assert.match(jancodeDraft?.name || '', /龍角散ダイレクトスティック ピーチ/);

const requestsBeforeEmptyBarcode = requests.length;
assert.equal(await browser.fetchProductByBarcode('not a barcode'), null);
assert.equal(requests.length, requestsBeforeEmptyBarcode);

const barcodeProduct = await browser.fetchProductByBarcode('JAN 4987-1881-6102-7');
assert.equal(barcodeProduct?.barcode, '4987188161027');
assert.match(requests.at(-1), /barcode=eq\.4987188161027/);

assert.equal(browser.parseJancodeProductDraft('Title: Product without barcode', ''), null);
assert.equal(browser.parseJancodeProductDraft('', '4987240210733'), null);

const cleanedDraft = browser.parseJancodeProductDraft(
  [
    'Title: <b>Fallback &amp; Title</b>',
    '',
    '| 商品名 | [リンク付き商品](https://example.test/item) &amp; Extra |',
    '| 会社名 | <strong>Example &amp; Co</strong> |',
    '| 商品ジャンル | OTC &gt; Pain |',
  ].join('\n'),
  '4987240210733',
);
assert.equal(cleanedDraft?.name, 'リンク付き商品 & Extra');
assert.equal(cleanedDraft?.brand, 'Example & Co');
assert.equal(cleanedDraft?.category, 'OTC > Pain');

const nearbyPrices = await browser.fetchNearbyPrices({ productId: 'loxonin-s', lat: 35.6485, lng: 139.7215, radiusKm: 5 });
assert.equal(nearbyPrices.length, 2);
assert.equal(nearbyPrices[0].id, 'price-near');
assert.equal(nearbyPrices[1].id, 'price-unknown-distance');
assert.equal(nearbyPrices[1].distance_km, null);

assert.equal(browser.productToneClass('mint'), 'tone-mint');
assert.equal(browser.productToneClass('unknown-tone'), 'tone-sunset');
assert.match(browser.formatYen(1234), /1,234/);
assert.equal(browser.formatDistance(null), 'unknown');
assert.equal(browser.formatDistance(1.234), '1.2 km');

const recentStorage = new Map();
globalThis.window = {
  localStorage: {
    getItem(key) {
      return recentStorage.has(key) ? recentStorage.get(key) : null;
    },
    setItem(key, value) {
      recentStorage.set(key, String(value));
    },
  },
};

for (let index = 0; index < 13; index += 1) {
  browser.recordRecentView({
    id: `product-${index}`,
    name: `Product ${index}`,
    brand: 'Brand',
    pack: '1 pack',
    barcode: `49000000000${index}`,
    tone: 'mint',
  });
}
assert.equal(browser.fetchRecentViews().length, 12);
browser.recordRecentView({ id: 'product-5', name: 'Product 5 Updated', brand: 'Brand', pack: '2 pack' });
const recentViews = browser.fetchRecentViews();
assert.equal(recentViews.length, 12);
assert.equal(recentViews[0].id, 'product-5');
assert.equal(recentViews.filter((item) => item.id === 'product-5').length, 1);
browser.clearRecentViews();
assert.deepEqual(browser.fetchRecentViews(), []);

globalThis.window = {
  localStorage: {
    getItem() {
      throw new Error('storage unavailable');
    },
    setItem() {
      throw new Error('storage unavailable');
    },
  },
};
assert.deepEqual(browser.fetchRecentViews(), []);
assert.doesNotThrow(() => browser.recordRecentView({ id: 'safe-product', name: 'Safe Product' }));
assert.doesNotThrow(() => browser.clearRecentViews());



console.log('browser-runtime smoke test passed');


