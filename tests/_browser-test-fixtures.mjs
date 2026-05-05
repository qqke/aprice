export function makeCatalogProductResponse() {
  return {
    id: 'loxonin-s',
    name: 'Loxonin S',
    brand: 'Santen',
    pack: '12 tabs',
    barcode: '4987188161027',
    category: '鎮痛薬',
    tone: 'sunset',
    description: '日本の薬店でよく見かける定番OTC。',
    image_url: 'https://cdn.example.com/products/loxonin-s.jpg',
  };
}

export function makeAspirinProductResponse() {
  return {
    id: 'aspirin-81',
    name: 'Aspirin 81',
    brand: 'Bayer',
    pack: '100 tabs',
    barcode: '4987123456789',
    image_url: 'https://cdn.example.com/products/aspirin-81.jpg',
  };
}

export function makeProductDetailsResponse(id = '0019014614042') {
  return {
    id,
    name: id === '0019014614042' ? 'アイムス 11歳以上用 毎日の健康ケア チキン 小粒 5kg' : `Playwright Live Product ${id}`,
    brand: 'マースジャパンリミテッド',
    pack: '5kg',
    barcode: id,
    category: '',
    tone: 'sunset',
    description: '',
    image_url: `https://cdn.example.com/products/${id}.jpg`,
  };
}

export function makeStoreFixtures() {
  return [
    {
      id: 'sugi-hiroo',
      name: 'Sugi Pharmacy Hiroo',
      city: 'Tokyo',
      pref: 'Tokyo',
    },
    {
      id: 'welcia-shibuya',
      name: 'Welcia Shibuya',
      city: 'Tokyo',
      pref: 'Tokyo',
    },
  ];
}

export function makePriceFixtures() {
  return [
    {
      id: 'price-1',
      product_id: 'loxonin-s',
      store_id: 'sugi-hiroo',
      price_yen: 698,
      is_member_price: false,
      source: 'manual',
      collected_at: '2026-04-03T08:00:00.000Z',
      stores: {
        id: 'sugi-hiroo',
        name: 'Sugi Pharmacy Hiroo',
        chain_name: 'Sugi',
        address: 'Tokyo, Shibuya',
        city: 'Tokyo',
        pref: 'Tokyo',
        lat: 35.648,
        lng: 139.722,
        hours: '09:00-22:00',
      },
      products: {
        id: 'loxonin-s',
        name: 'Loxonin S',
        barcode: '4987188161027',
        brand: 'Santen',
        pack: '12 tabs',
        tone: 'sunset',
      },
    },
    {
      id: 'price-2',
      product_id: 'loxonin-s',
      store_id: 'welcia-shibuya',
      price_yen: 728,
      is_member_price: true,
      source: 'manual',
      collected_at: '2026-04-04T08:00:00.000Z',
      stores: {
        id: 'welcia-shibuya',
        name: 'Welcia Shibuya',
        chain_name: 'Welcia',
        address: 'Tokyo, Shibuya',
        city: 'Tokyo',
        pref: 'Tokyo',
        lat: 35.661,
        lng: 139.698,
        hours: '10:00-23:00',
      },
      products: {
        id: 'loxonin-s',
        name: 'Loxonin S',
        barcode: '4987188161027',
        brand: 'Santen',
        pack: '12 tabs',
        tone: 'sunset',
      },
    },
  ];
}

export function makeProductPageStoreFixtures() {
  const fillerStores = Array.from({ length: 20 }, (_, index) => {
    const number = String(index + 1).padStart(2, '0');
    return {
      id: `care-${number}`,
      name: `Care Drug ${number}`,
      chain_name: 'Care',
      address: `Tokyo, Test ${number}`,
      city: 'Tokyo',
      pref: 'Tokyo',
      lat: 35.62 + index / 1000,
      lng: 139.7 + index / 1000,
      hours: '09:00-21:00',
    };
  });

  return [
    {
      id: 'sugi-hiroo',
      name: 'Sugi Pharmacy Hiroo',
      chain_name: 'Sugi',
      address: 'Tokyo, Shibuya-ku Hiroo 1-1-1',
      city: 'Tokyo',
      pref: 'Tokyo',
      lat: 35.648,
      lng: 139.722,
      hours: '09:00-22:00',
    },
    {
      id: 'welcia-shibuya',
      name: 'Welcia Shibuya',
      chain_name: 'Welcia',
      address: 'Tokyo, Shibuya-ku 2-2-2',
      city: 'Tokyo',
      pref: 'Tokyo',
      lat: 35.661,
      lng: 139.698,
      hours: '10:00-23:00',
    },
    ...fillerStores,
  ];
}

export function makePersonalPriceLogs() {
  return [
    {
      id: 'personal-log-1',
      user_id: 'member-1',
      product_id: 'sundrug-4902162055576',
      store_id: 'sugi-hiroo',
      price_yen: 698,
      purchased_at: '2026-04-02',
      note: 'older store visit',
      share_to_public: false,
      review_status: 'private',
      evidence_url: '',
      confidence_score: 0,
      review_note: '',
      reviewed_at: null,
      promoted_price_id: null,
      created_at: '2026-04-02T09:00:00.000Z',
      updated_at: '2026-04-02T09:00:00.000Z',
    },
    {
      id: 'personal-log-2',
      user_id: 'member-1',
      product_id: 'sundrug-4902162055576',
      store_id: 'sugi-hiroo',
      price_yen: 688,
      purchased_at: '2026-04-04',
      note: 'latest store visit',
      share_to_public: false,
      review_status: 'private',
      evidence_url: '',
      confidence_score: 0,
      review_note: '',
      reviewed_at: null,
      promoted_price_id: null,
      created_at: '2026-04-04T09:00:00.000Z',
      updated_at: '2026-04-04T09:00:00.000Z',
    },
    {
      id: 'personal-log-3',
      user_id: 'member-1',
      product_id: 'sundrug-4902162055576',
      store_id: 'welcia-shibuya',
      price_yen: 712,
      purchased_at: '2026-04-03',
      note: 'different store',
      share_to_public: false,
      review_status: 'private',
      evidence_url: '',
      confidence_score: 0,
      review_note: '',
      reviewed_at: null,
      promoted_price_id: null,
      created_at: '2026-04-03T09:00:00.000Z',
      updated_at: '2026-04-03T09:00:00.000Z',
    },
  ];
}

export function makeAdminProfile() {
  return {
    id: 'user-admin-1',
    email: 'admin@example.com',
    full_name: 'Admin User',
    role: 'admin',
    created_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-04T00:00:00.000Z',
  };
}

export function makeAdminProducts() {
  return [
    {
      id: 'loxonin-s',
      barcode: '4987188161027',
      name: 'Loxonin S',
      brand: 'Santen',
      pack: '12 tabs',
      category: 'pain-relief',
      tone: 'sunset',
      description: 'Synthetic admin fixture product',
      image_url: 'https://cdn.example.com/products/loxonin-s.jpg',
      updated_at: '2026-04-04T01:00:00.000Z',
    },
    {
      id: 'eve-a',
      barcode: '4987300051234',
      name: 'EVE A',
      brand: 'SS Pharmaceuticals',
      pack: '20 tabs',
      category: 'pain-relief',
      tone: 'mint',
      description: 'Secondary fixture product',
      image_url: 'https://cdn.example.com/products/eve-a.jpg',
      updated_at: '2026-04-03T01:00:00.000Z',
    },
  ];
}

export function makeAdminStores() {
  return [
    {
      id: 'sugi-hiroo',
      name: 'Sugi Pharmacy Hiroo',
      chain_name: 'Sugi',
      address: 'Tokyo, Shibuya-ku Hiroo 1-1-1',
      city: 'Tokyo',
      pref: 'Tokyo',
      lat: 35.648,
      lng: 139.722,
      hours: '09:00-22:00',
      updated_at: '2026-04-04T01:00:00.000Z',
    },
    {
      id: 'welcia-shibuya',
      name: 'Welcia Shibuya',
      chain_name: 'Welcia',
      address: 'Tokyo, Shibuya-ku 2-2-2',
      city: 'Tokyo',
      pref: 'Tokyo',
      lat: 35.661,
      lng: 139.698,
      hours: '10:00-23:00',
      updated_at: '2026-04-03T01:00:00.000Z',
    },
  ];
}

export function makeAdminPrices() {
  const products = makeAdminProducts();
  const stores = makeAdminStores();
  return [
    {
      id: 'price-admin-1',
      product_id: 'loxonin-s',
      store_id: 'sugi-hiroo',
      price_yen: 698,
      is_member_price: false,
      source: 'manual',
      note: 'front shelf',
      collected_at: '2026-04-04T08:00:00.000Z',
      stores: stores[0],
      products: products[0],
    },
    {
      id: 'price-admin-2',
      product_id: 'loxonin-s',
      store_id: 'welcia-shibuya',
      price_yen: 728,
      is_member_price: true,
      source: 'manual',
      note: 'member shelf',
      collected_at: '2026-04-03T08:00:00.000Z',
      stores: stores[1],
      products: products[0],
    },
  ];
}

export function makePendingPriceSubmissions() {
  const products = makeAdminProducts();
  const stores = makeAdminStores();
  return [
    {
      id: '11111111-1111-4111-8111-111111111111',
      user_id: 'member-1',
      product_id: 'loxonin-s',
      store_id: 'sugi-hiroo',
      price_yen: 688,
      purchased_at: '2026-04-05',
      note: 'front shelf community',
      share_to_public: true,
      review_status: 'pending',
      evidence_url: 'https://example.test/evidence.jpg',
      confidence_score: 0,
      review_note: '',
      reviewed_at: null,
      promoted_price_id: null,
      created_at: '2026-04-05T08:00:00.000Z',
      updated_at: '2026-04-05T08:00:00.000Z',
      products: products[0],
      stores: stores[0],
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      user_id: 'member-2',
      product_id: 'eve-a',
      store_id: 'welcia-shibuya',
      price_yen: 818,
      purchased_at: '2026-04-05',
      note: 'looks wrong',
      share_to_public: true,
      review_status: 'pending',
      evidence_url: '',
      confidence_score: 0,
      review_note: '',
      reviewed_at: null,
      promoted_price_id: null,
      created_at: '2026-04-05T07:00:00.000Z',
      updated_at: '2026-04-05T07:00:00.000Z',
      products: products[1],
      stores: stores[1],
    },
  ];
}

export function makePendingProductSubmissions() {
  return [
    {
      id: '33333333-3333-4333-8333-333333333333',
      user_id: 'member-1',
      barcode: '4900000000001',
      name: 'Submitted Supplement',
      brand: 'Aprice',
      pack: '20 tabs',
      category: 'test-fixture',
      tone: 'mint',
      description: 'Submitted from scan',
      image_url: 'https://cdn.example.com/products/submitted-supplement.jpg',
      review_status: 'pending',
      review_note: '',
      promoted_product_id: null,
      reviewed_at: null,
      created_at: '2026-04-05T06:00:00.000Z',
      updated_at: '2026-04-05T06:00:00.000Z',
    },
  ];
}

export function makeHomePageResponseForRequest(requestUrl) {
  const url = new URL(requestUrl);
  if (url.pathname.endsWith('/products')) {
    const or = url.searchParams.get('or') || '';
    if (or.toLowerCase().includes('eve')) {
      return [{
        id: 'eve-a',
        name: 'EVE A',
        brand: 'SS Pharmaceuticals',
        pack: '20 tabs',
        barcode: '4987300051234',
        category: '鎮痛薬',
        tone: 'mint',
        description: 'Secondary fixture product',
        image_url: 'https://cdn.example.com/products/eve-a.jpg',
      }];
    }
    if (or.includes('name.ilike') || or.includes('brand.ilike') || or.includes('category.ilike')) {
      return [makeCatalogProductResponse()];
    }
    return [makeAspirinProductResponse()];
  }

  if (url.pathname.endsWith('/prices')) {
    if (url.searchParams.get('product_id') === 'eq.eve-a') {
      return makePriceFixtures().map((row, index) => ({
        ...row,
        id: `home-price-${index + 1}`,
        product_id: 'eve-a',
        products: {
          id: 'eve-a',
          name: 'EVE A',
          barcode: '4987300051234',
          brand: 'SS Pharmaceuticals',
          pack: '20 tabs',
          tone: 'mint',
        },
      }));
    }
    return [];
  }

  return [];
}

export function makeScanPageResponseForRequest(requestUrl) {
  const url = new URL(requestUrl);
  if (url.pathname.endsWith('/products')) {
    return [makeProductDetailsResponse()];
  }

  if (url.pathname.endsWith('/stores')) {
    return makeStoreFixtures();
  }

  if (url.pathname.endsWith('/prices')) {
    return makePriceFixtures().slice(0, 1);
  }

  return [];
}

export function makeProductPageResponseForRequest(requestUrl) {
  const url = new URL(requestUrl);
  if (url.pathname.endsWith('/products')) {
    const match = url.searchParams.get('id')?.match(/^eq\.(.+)$/) || url.searchParams.get('barcode')?.match(/^eq\.(.+)$/);
    return [makeProductDetailsResponse(match?.[1] || '0019014614042')];
  }

  if (url.pathname.endsWith('/stores')) {
    const limit = Number(url.searchParams.get('limit') || 100);
    const offset = Number(url.searchParams.get('offset') || 0);
    const search = String(url.searchParams.get('or') || '').toLocaleLowerCase('ja-JP');
    const termMatch = search.match(/ilike\.%([^%,)]+)%/);
    const term = termMatch?.[1] ? decodeURIComponent(termMatch[1]).replace(/\\/g, '') : '';
    const rows = makeProductPageStoreFixtures();
    const filteredRows = term
      ? rows.filter((store) => [store.name, store.chain_name, store.pref, store.city, store.address]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('ja-JP')
        .includes(term))
      : rows;
    return filteredRows.slice(offset, offset + limit);
  }

  if (url.pathname.endsWith('/prices')) {
    return makePriceFixtures();
  }

  return [];
}

export function makeAdminPageResponseForRequest(requestUrl, method) {
  const url = new URL(requestUrl);
  if (url.pathname.endsWith('/profiles')) return [makeAdminProfile()];
  if (url.pathname.endsWith('/products')) return makeAdminProducts();
  if (url.pathname.endsWith('/stores')) return makeAdminStores();
  if (url.pathname.endsWith('/prices')) return makeAdminPrices();
  if (url.pathname.endsWith('/user_price_logs')) return makePendingPriceSubmissions();
  if (url.pathname.endsWith('/product_submissions')) return makePendingProductSubmissions();
  if (url.pathname.includes('/rpc/')) return [{ ok: true, method }];
  return [];
}
