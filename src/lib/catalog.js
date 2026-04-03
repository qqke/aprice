export const demoProducts = [
  {
    id: 'loxonin-s',
    barcode: '4987188161027',
    name: 'ロキソニンS',
    brand: '第一三共ヘルスケア',
    pack: '12錠',
    category: '鎮痛薬',
    tone: 'sunset',
    description: '日本の薬店でよく見かける定番OTC。这个 demo 只做价格比较，不提供用药建议。',
  },
  {
    id: 'eve-a',
    barcode: '4987300064010',
    name: 'EVE A錠',
    brand: 'エスエス製薬',
    pack: '24錠',
    category: '鎮痛薬',
    tone: 'mint',
    description: '适合演示条码扫描与多门店比价的常见商品。',
  },
  {
    id: 'rohto-lycee',
    barcode: '4987241123456',
    name: 'ロートリセコンタクト',
    brand: 'ロート製薬',
    pack: '1本',
    category: '眼部护理',
    tone: 'azure',
    description: '用于演示模糊搜索、门店价格和个人记录。',
  },
];

export const demoStores = [
  {
    id: 'shibuya-matsumoto',
    name: 'マツモトキヨシ 渋谷店',
    chain_name: 'マツモトキヨシ',
    address: '東京都渋谷区宇田川町',
    city: '渋谷',
    pref: '東京都',
    lat: 35.6595,
    lng: 139.7005,
    hours: '09:00-23:00',
  },
  {
    id: 'shinjuku-welcia',
    name: 'ウエルシア 新宿三丁目店',
    chain_name: 'ウエルシア',
    address: '東京都新宿区新宿',
    city: '新宿',
    pref: '東京都',
    lat: 35.6899,
    lng: 139.7035,
    hours: '08:00-22:30',
  },
  {
    id: 'ikebukuro-sundrug',
    name: 'サンドラッグ 池袋駅前店',
    chain_name: 'サンドラッグ',
    address: '東京都豊島区西池袋',
    city: '池袋',
    pref: '東京都',
    lat: 35.7296,
    lng: 139.7101,
    hours: '10:00-22:00',
  },
  {
    id: 'ginza-cocokara',
    name: 'ココカラファイン 銀座店',
    chain_name: 'ココカラファイン',
    address: '東京都中央区銀座',
    city: '銀座',
    pref: '東京都',
    lat: 35.6719,
    lng: 139.7648,
    hours: '10:00-21:00',
  },
];

export const demoPrices = [
  {
    id: 'p1',
    product_id: 'loxonin-s',
    store_id: 'shibuya-matsumoto',
    price_yen: 798,
    is_member_price: false,
    source: 'store shelf',
    collected_at: '2026-04-01T09:20:00+09:00',
    note: '朝市价',
  },
  {
    id: 'p2',
    product_id: 'loxonin-s',
    store_id: 'shinjuku-welcia',
    price_yen: 748,
    is_member_price: true,
    source: 'community',
    collected_at: '2026-04-02T11:15:00+09:00',
    note: '会员价',
  },
  {
    id: 'p3',
    product_id: 'loxonin-s',
    store_id: 'ikebukuro-sundrug',
    price_yen: 820,
    is_member_price: false,
    source: 'store shelf',
    collected_at: '2026-04-02T14:10:00+09:00',
    note: '午后采样',
  },
  {
    id: 'p4',
    product_id: 'eve-a',
    store_id: 'shibuya-matsumoto',
    price_yen: 920,
    is_member_price: false,
    source: 'store shelf',
    collected_at: '2026-04-02T08:35:00+09:00',
    note: '店头价',
  },
  {
    id: 'p5',
    product_id: 'eve-a',
    store_id: 'ginza-cocokara',
    price_yen: 888,
    is_member_price: true,
    source: 'community',
    collected_at: '2026-04-02T18:05:00+09:00',
    note: '电子会员卡',
  },
  {
    id: 'p6',
    product_id: 'rohto-lycee',
    store_id: 'shinjuku-welcia',
    price_yen: 1360,
    is_member_price: false,
    source: 'store shelf',
    collected_at: '2026-04-01T16:10:00+09:00',
    note: '近期开价',
  },
  {
    id: 'p7',
    product_id: 'rohto-lycee',
    store_id: 'ginza-cocokara',
    price_yen: 1298,
    is_member_price: false,
    source: 'community',
    collected_at: '2026-04-03T09:40:00+09:00',
    note: '银座采样',
  },
];

export const demoLogs = [
  {
    id: 'log-1',
    user_id: 'demo-user',
    product_id: 'loxonin-s',
    store_id: 'shibuya-matsumoto',
    price_yen: 798,
    purchased_at: '2026-04-01',
    note: '晚饭前顺路买的',
    created_at: '2026-04-01T19:30:00+09:00',
  },
];

export const demoFavorites = [
  {
    id: 'fav-1',
    user_id: 'demo-user',
    entity_type: 'product',
    entity_id: 'loxonin-s',
    created_at: '2026-04-01T20:00:00+09:00',
  },
];

export function findDemoProductById(id) {
  return demoProducts.find((product) => product.id === id) ?? null;
}

export function findDemoProductByBarcode(barcode) {
  const normalized = String(barcode || '').trim().replace(/\D/g, '');
  return demoProducts.find((product) => product.barcode === normalized) ?? null;
}

export function demoPriceRows(productId) {
  const product = findDemoProductById(productId);
  if (!product) return [];

  return demoPrices
    .filter((price) => price.product_id === productId)
    .map((price) => ({
      ...price,
      product,
      store: demoStores.find((store) => store.id === price.store_id) ?? null,
    }))
    .sort((a, b) => a.price_yen - b.price_yen);
}
