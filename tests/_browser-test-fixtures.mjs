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
  };
}

export function makeAspirinProductResponse() {
  return {
    id: 'aspirin-81',
    name: 'Aspirin 81',
    brand: 'Bayer',
    pack: '100 tabs',
    barcode: '4987123456789',
  };
}

export function makeProductDetailsResponse() {
  return {
    id: 'loxonin-s',
    name: 'Loxonin S',
    brand: 'Santen',
    pack: '12 tabs',
    barcode: '4987188161027',
    category: '鎮痛薬',
    tone: 'sunset',
    description: '日本の薬店でよく見かける定番OTC。',
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

export function makeHomePageResponseForRequest(requestUrl) {
  const url = new URL(requestUrl);
  if (url.pathname.endsWith('/products')) {
    const or = url.searchParams.get('or') || '';
    if (or.includes('name.ilike') || or.includes('brand.ilike') || or.includes('category.ilike')) {
      return [makeCatalogProductResponse()];
    }
    return [makeAspirinProductResponse()];
  }

  if (url.pathname.endsWith('/prices')) {
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
    return [makeProductDetailsResponse()];
  }

  if (url.pathname.endsWith('/stores')) {
    return makeStoreFixtures();
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
  if (url.pathname.includes('/rpc/')) return [{ ok: true, method }];
  return [];
}
