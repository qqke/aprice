insert into products (id, barcode, name, brand, pack, category, tone, description)
values
  ('loxonin-s', '4987188161027', 'ロキソニンS', '第一三共ヘルスケア', '12錠', '鎮痛薬', 'sunset', '日本の薬店でよく見かける定番OTC。'),
  ('eve-a', '4987300064010', 'EVE A錠', 'エスエス製薬', '24錠', '鎮痛薬', 'mint', '适合演示条码扫描与多门店比价的常见商品。'),
  ('rohto-lycee', '4987241123456', 'ロートリセコンタクト', 'ロート製薬', '1本', '眼部护理', 'azure', '用于演示模糊搜索、门店价格和个人记录。')
on conflict (id) do update
set barcode = excluded.barcode,
    name = excluded.name,
    brand = excluded.brand,
    pack = excluded.pack,
    category = excluded.category,
    tone = excluded.tone,
    description = excluded.description,
    updated_at = now();

insert into stores (id, name, chain_name, address, city, pref, lat, lng, hours)
values
  ('shibuya-matsumoto', 'マツモトキヨシ 渋谷店', 'マツモトキヨシ', '東京都渋谷区宇田川町', '渋谷', '東京都', 35.6595, 139.7005, '09:00-23:00'),
  ('shinjuku-welcia', 'ウエルシア 新宿三丁目店', 'ウエルシア', '東京都新宿区新宿', '新宿', '東京都', 35.6899, 139.7035, '08:00-22:30'),
  ('ikebukuro-sundrug', 'サンドラッグ 池袋駅前店', 'サンドラッグ', '東京都豊島区西池袋', '池袋', '東京都', 35.7296, 139.7101, '10:00-22:00'),
  ('ginza-cocokara', 'ココカラファイン 銀座店', 'ココカラファイン', '東京都中央区銀座', '銀座', '東京都', 35.6719, 139.7648, '10:00-21:00')
on conflict (id) do update
set name = excluded.name,
    chain_name = excluded.chain_name,
    address = excluded.address,
    city = excluded.city,
    pref = excluded.pref,
    lat = excluded.lat,
    lng = excluded.lng,
    hours = excluded.hours,
    updated_at = now();

insert into prices (product_id, store_id, price_yen, is_member_price, source, note, collected_at)
values
  ('loxonin-s', 'shibuya-matsumoto', 798, false, 'store shelf', '朝市价', '2026-04-01T09:20:00+09:00'),
  ('loxonin-s', 'shinjuku-welcia', 748, true, 'community', '会员价', '2026-04-02T11:15:00+09:00'),
  ('loxonin-s', 'ikebukuro-sundrug', 820, false, 'store shelf', '午后采样', '2026-04-02T14:10:00+09:00'),
  ('eve-a', 'shibuya-matsumoto', 920, false, 'store shelf', '店头价', '2026-04-02T08:35:00+09:00'),
  ('eve-a', 'ginza-cocokara', 888, true, 'community', '电子会员卡', '2026-04-02T18:05:00+09:00'),
  ('rohto-lycee', 'shinjuku-welcia', 1360, false, 'store shelf', '近期开价', '2026-04-01T16:10:00+09:00'),
  ('rohto-lycee', 'ginza-cocokara', 1298, false, 'community', '银座采样', '2026-04-03T09:40:00+09:00')
on conflict do nothing;
