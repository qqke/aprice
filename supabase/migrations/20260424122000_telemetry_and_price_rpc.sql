create table if not exists public.telemetry_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  event_name text not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists prices_product_collected_idx
  on public.prices (product_id, collected_at desc);

create index if not exists telemetry_events_name_time_idx
  on public.telemetry_events (event_name, occurred_at desc);

create index if not exists telemetry_events_user_time_idx
  on public.telemetry_events (user_id, occurred_at desc);

alter table public.telemetry_events enable row level security;

create or replace function public.submit_telemetry_events(payload jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  accepted_count integer := 0;
  event_name text;
  event_payload jsonb;
  event_time timestamptz;
begin
  if jsonb_typeof(payload) <> 'array' then
    raise exception 'payload must be a json array';
  end if;

  for item in
    select value
    from jsonb_array_elements(payload)
    limit 100
  loop
    event_name := left(coalesce(item->>'name', ''), 64);
    event_payload := coalesce(item->'payload', '{}'::jsonb);
    if jsonb_typeof(event_payload) <> 'object' then
      event_payload := '{}'::jsonb;
    end if;
    event_time := coalesce((nullif(item->>'at', ''))::timestamptz, now());

    if event_name = '' then
      continue;
    end if;
    if event_name !~ '^[a-z0-9_]+$' then
      continue;
    end if;

    insert into public.telemetry_events (
      user_id,
      event_name,
      payload,
      occurred_at
    )
    values (
      auth.uid(),
      event_name,
      event_payload,
      event_time
    );
    accepted_count := accepted_count + 1;
  end loop;

  return accepted_count;
end;
$$;

create or replace function public.fetch_product_prices(payload jsonb)
returns table (
  id uuid,
  product_id text,
  store_id text,
  price_yen integer,
  is_member_price boolean,
  source text,
  collected_at timestamptz,
  note text,
  stores jsonb,
  products jsonb,
  distance_km double precision
)
language sql
security definer
set search_path = public
as $$
  with args as (
    select
      coalesce(nullif(payload->>'product_id', ''), '') as target_product_id,
      greatest(1, least(500, coalesce((nullif(payload->>'limit', ''))::integer, 120))) as target_limit,
      nullif(payload->>'since_days', '')::integer as since_days,
      nullif(payload->>'lat', '')::double precision as lat,
      nullif(payload->>'lng', '')::double precision as lng,
      nullif(payload->>'radius_km', '')::double precision as radius_km
  ),
  base_rows as (
    select
      p.id,
      p.product_id,
      p.store_id,
      p.price_yen,
      p.is_member_price,
      p.source,
      p.collected_at,
      p.note,
      jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'chain_name', s.chain_name,
        'address', s.address,
        'city', s.city,
        'pref', s.pref,
        'lat', s.lat,
        'lng', s.lng,
        'hours', s.hours
      ) as stores,
      jsonb_build_object(
        'id', pr.id,
        'name', pr.name,
        'barcode', pr.barcode,
        'brand', pr.brand,
        'pack', pr.pack,
        'tone', pr.tone
      ) as products,
      case
        when a.lat is null or a.lng is null then null
        when s.lat is null or s.lng is null then null
        else (
          6371 * acos(
            cos(radians(a.lat)) * cos(radians(s.lat)) * cos(radians(s.lng) - radians(a.lng))
            + sin(radians(a.lat)) * sin(radians(s.lat))
          )
        )
      end as distance_km
    from public.prices p
    join public.stores s on s.id = p.store_id
    join public.products pr on pr.id = p.product_id
    cross join args a
    where p.product_id = a.target_product_id
      and (
        a.since_days is null
        or p.collected_at >= (now() - make_interval(days => greatest(0, a.since_days)))
      )
  )
  select
    b.id,
    b.product_id,
    b.store_id,
    b.price_yen,
    b.is_member_price,
    b.source,
    b.collected_at,
    b.note,
    b.stores,
    b.products,
    b.distance_km
  from base_rows b
  cross join args a
  where a.target_product_id <> ''
    and (
      a.radius_km is null
      or b.distance_km is null
      or b.distance_km <= greatest(0, a.radius_km)
    )
  order by
    case when a.lat is null or a.lng is null then 1 else 0 end,
    b.distance_km asc nulls last,
    b.collected_at desc,
    b.price_yen asc
  limit (select target_limit from args);
$$;

create or replace function public.fetch_product_prices_page(payload jsonb)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with args as (
    select
      coalesce(nullif(payload->>'product_id', ''), '') as target_product_id,
      greatest(1, least(200, coalesce((nullif(payload->>'limit', ''))::integer, 60))) as target_limit,
      nullif(payload->>'since_days', '')::integer as since_days,
      nullif(payload->>'radius_km', '')::double precision as radius_km,
      nullif(payload->>'lat', '')::double precision as lat,
      nullif(payload->>'lng', '')::double precision as lng,
      nullif(payload->'cursor'->>'collected_at', '')::timestamptz as cursor_collected_at,
      nullif(payload->'cursor'->>'id', '')::uuid as cursor_id
  ),
  base_rows as (
    select
      p.id,
      p.product_id,
      p.store_id,
      p.price_yen,
      p.is_member_price,
      p.source,
      p.collected_at,
      p.note,
      jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'chain_name', s.chain_name,
        'address', s.address,
        'city', s.city,
        'pref', s.pref,
        'lat', s.lat,
        'lng', s.lng,
        'hours', s.hours
      ) as stores,
      jsonb_build_object(
        'id', pr.id,
        'name', pr.name,
        'barcode', pr.barcode,
        'brand', pr.brand,
        'pack', pr.pack,
        'tone', pr.tone
      ) as products,
      case
        when a.lat is null or a.lng is null then null
        when s.lat is null or s.lng is null then null
        else (
          6371 * acos(
            cos(radians(a.lat)) * cos(radians(s.lat)) * cos(radians(s.lng) - radians(a.lng))
            + sin(radians(a.lat)) * sin(radians(s.lat))
          )
        )
      end as distance_km
    from public.prices p
    join public.stores s on s.id = p.store_id
    join public.products pr on pr.id = p.product_id
    cross join args a
    where p.product_id = a.target_product_id
      and (
        a.since_days is null
        or p.collected_at >= (now() - make_interval(days => greatest(0, a.since_days)))
      )
      and (
        a.cursor_collected_at is null
        or (p.collected_at, p.id) < (a.cursor_collected_at, coalesce(a.cursor_id, '00000000-0000-0000-0000-000000000000'::uuid))
      )
  ),
  filtered_rows as (
    select *
    from base_rows b
    cross join args a
    where (
      a.radius_km is null
      or b.distance_km is null
      or b.distance_km <= greatest(0, a.radius_km)
    )
  ),
  ordered_rows as (
    select *
    from filtered_rows
    order by collected_at desc, id desc
    limit (select target_limit + 1 from args)
  ),
  visible_rows as (
    select *
    from ordered_rows
    limit (select target_limit from args)
  ),
  next_row as (
    select *
    from ordered_rows
    offset (select target_limit from args)
    limit 1
  )
  select jsonb_build_object(
    'items',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', v.id,
            'product_id', v.product_id,
            'store_id', v.store_id,
            'price_yen', v.price_yen,
            'is_member_price', v.is_member_price,
            'source', v.source,
            'collected_at', v.collected_at,
            'note', v.note,
            'stores', v.stores,
            'products', v.products,
            'distance_km', v.distance_km
          )
          order by v.collected_at desc, v.id desc
        )
        from visible_rows v
      ),
      '[]'::jsonb
    ),
    'next_cursor',
    (
      select case
        when n.id is null then null
        else jsonb_build_object(
          'collected_at', n.collected_at,
          'id', n.id
        )
      end
      from next_row n
    )
  );
$$;
