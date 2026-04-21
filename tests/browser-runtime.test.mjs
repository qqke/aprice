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



console.log('browser-runtime smoke test passed');


