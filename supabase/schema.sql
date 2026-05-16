create extension if not exists pg_trgm;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  full_name text,
  role text not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists products (
  id text primary key,
  barcode text unique not null,
  name text not null,
  brand text not null default '',
  pack text not null default '',
  category text not null default '',
  tone text not null default 'sunset',
  description text not null default '',
  image_url text not null default '' check (image_url = '' or image_url ~* '^https?://'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists product_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  barcode text not null,
  name text not null,
  brand text not null default '',
  pack text not null default '',
  category text not null default '',
  tone text not null default 'sunset',
  description text not null default '',
  image_url text not null default '' check (image_url = '' or image_url ~* '^https?://'),
  review_status text not null default 'pending' check (review_status in ('pending', 'approved', 'rejected')),
  review_note text not null default '',
  promoted_product_id text references products(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists stores (
  id text primary key,
  name text not null,
  chain_name text not null default '',
  address text not null,
  city text not null default '',
  pref text not null default '',
  lat double precision not null,
  lng double precision not null,
  hours text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists prices (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references products(id) on delete cascade,
  store_id text not null references stores(id) on delete cascade,
  price_yen integer not null check (price_yen > 0),
  is_member_price boolean not null default false,
  source text not null default 'manual',
  note text not null default '',
  collected_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists user_price_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id text not null references products(id) on delete cascade,
  store_id text references stores(id) on delete set null,
  price_yen integer not null check (price_yen > 0),
  purchased_at date,
  note text not null default '',
  share_to_public boolean not null default false,
  review_status text not null default 'private' check (review_status in ('private', 'pending', 'approved', 'rejected')),
  evidence_url text not null default '',
  confidence_score numeric not null default 0,
  review_note text not null default '',
  reviewed_at timestamptz,
  promoted_price_id uuid references prices(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in ('product', 'store')),
  entity_id text not null,
  created_at timestamptz not null default now(),
  unique (user_id, entity_type, entity_id)
);

create table if not exists telemetry_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  event_name text not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists products_name_trgm_idx on products using gin (name gin_trgm_ops);
create index if not exists products_brand_trgm_idx on products using gin (brand gin_trgm_ops);
create index if not exists products_barcode_idx on products (barcode);
create index if not exists product_submissions_review_idx on product_submissions (review_status, created_at desc);
create index if not exists product_submissions_user_idx on product_submissions (user_id, created_at desc);
create index if not exists stores_city_idx on stores (city);
create index if not exists prices_product_store_idx on prices (product_id, store_id);
create index if not exists prices_product_collected_idx on prices (product_id, collected_at desc);
create index if not exists prices_collected_idx on prices (collected_at desc);
create index if not exists user_price_logs_user_idx on user_price_logs (user_id, created_at desc);
create index if not exists user_price_logs_review_idx on user_price_logs (review_status, share_to_public, created_at desc);
create index if not exists favorites_user_idx on favorites (user_id, created_at desc);
create index if not exists telemetry_events_name_time_idx on telemetry_events (event_name, occurred_at desc);
create index if not exists telemetry_events_user_time_idx on telemetry_events (user_id, occurred_at desc);

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists products_updated_at on products;
create trigger products_updated_at
before update on products
for each row execute function set_updated_at();

drop trigger if exists stores_updated_at on stores;
create trigger stores_updated_at
before update on stores
for each row execute function set_updated_at();

drop trigger if exists product_submissions_updated_at on product_submissions;
create trigger product_submissions_updated_at
before update on product_submissions
for each row execute function set_updated_at();

drop trigger if exists prices_updated_at on prices;
create trigger prices_updated_at
before update on prices
for each row execute function set_updated_at();

drop trigger if exists user_price_logs_updated_at on user_price_logs;
create trigger user_price_logs_updated_at
before update on user_price_logs
for each row execute function set_updated_at();

drop trigger if exists profiles_updated_at on profiles;
create trigger profiles_updated_at
before update on profiles
for each row execute function set_updated_at();

alter table profiles enable row level security;
alter table products enable row level security;
alter table product_submissions enable row level security;
alter table stores enable row level security;
alter table prices enable row level security;
alter table user_price_logs enable row level security;
alter table favorites enable row level security;
alter table telemetry_events enable row level security;

create policy "profiles read own" on profiles for select using (auth.uid() = id);
create policy "profiles insert own" on profiles for insert with check (auth.uid() = id);
create policy "profiles update own" on profiles for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "products public read" on products for select using (true);
create policy "stores public read" on stores for select using (true);
create policy "prices public read" on prices for select using (true);

create policy "products admin write" on products for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "product submissions owner read" on product_submissions for select using (auth.uid() = user_id);
create policy "product submissions owner insert" on product_submissions for insert with check (auth.uid() = user_id);
create policy "stores admin write" on stores for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "prices admin write" on prices for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

create policy "logs owner read" on user_price_logs for select using (auth.uid() = user_id);
create policy "logs owner insert" on user_price_logs for insert with check (auth.uid() = user_id);
create policy "logs owner update" on user_price_logs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "logs owner delete" on user_price_logs for delete using (auth.uid() = user_id);

create policy "favorites owner read" on favorites for select using (auth.uid() = user_id);
create policy "favorites owner insert" on favorites for insert with check (auth.uid() = user_id);
create policy "favorites owner update" on favorites for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "favorites owner delete" on favorites for delete using (auth.uid() = user_id);

create or replace function is_admin_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1
    from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function require_admin_user()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not is_admin_user() then
    raise exception 'admin privileges required';
  end if;
end;
$$;

create or replace function fetch_product_prices(payload jsonb)
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
language plpgsql
security definer
set search_path = public
as $$
declare
  target_product_id text := coalesce(nullif(payload->>'product_id', ''), '');
begin
  perform public.consume_price_reference(target_product_id);
  return query
  with args as (
    select
      target_product_id,
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
      jsonb_build_object('id', s.id, 'name', s.name, 'chain_name', s.chain_name, 'address', s.address, 'city', s.city, 'pref', s.pref, 'lat', s.lat, 'lng', s.lng, 'hours', s.hours) as stores,
      jsonb_build_object('id', pr.id, 'name', pr.name, 'barcode', pr.barcode, 'brand', pr.brand, 'pack', pr.pack, 'tone', pr.tone) as products,
      case
        when a.lat is null or a.lng is null then null
        else (6371 * acos(cos(radians(a.lat)) * cos(radians(s.lat)) * cos(radians(s.lng) - radians(a.lng)) + sin(radians(a.lat)) * sin(radians(s.lat))))
      end as distance_km
    from public.prices p
    join public.stores s on s.id = p.store_id
    join public.products pr on pr.id = p.product_id
    cross join args a
    where p.product_id = a.target_product_id
      and (a.since_days is null or p.collected_at >= (now() - make_interval(days => greatest(0, a.since_days))))
  )
  select b.id, b.product_id, b.store_id, b.price_yen, b.is_member_price, b.source, b.collected_at, b.note, b.stores, b.products, b.distance_km
  from base_rows b
  cross join args a
  where a.target_product_id <> ''
    and (a.radius_km is null or b.distance_km is null or b.distance_km <= greatest(0, a.radius_km))
  order by case when a.lat is null or a.lng is null then 1 else 0 end, b.distance_km asc nulls last, b.collected_at desc, b.price_yen asc
  limit (select target_limit from args);
end;
$$;

create or replace function fetch_product_prices_page(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  credit jsonb;
  result jsonb;
  target_product_id text := coalesce(nullif(payload->>'product_id', ''), '');
begin
  credit := public.consume_price_reference(target_product_id);
  with args as (
    select
      target_product_id,
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
      jsonb_build_object('id', s.id, 'name', s.name, 'chain_name', s.chain_name, 'address', s.address, 'city', s.city, 'pref', s.pref, 'lat', s.lat, 'lng', s.lng, 'hours', s.hours) as stores,
      jsonb_build_object('id', pr.id, 'name', pr.name, 'barcode', pr.barcode, 'brand', pr.brand, 'pack', pr.pack, 'tone', pr.tone) as products,
      case
        when a.lat is null or a.lng is null then null
        else (6371 * acos(cos(radians(a.lat)) * cos(radians(s.lat)) * cos(radians(s.lng) - radians(a.lng)) + sin(radians(a.lat)) * sin(radians(s.lat))))
      end as distance_km
    from public.prices p
    join public.stores s on s.id = p.store_id
    join public.products pr on pr.id = p.product_id
    cross join args a
    where p.product_id = a.target_product_id
      and (a.since_days is null or p.collected_at >= (now() - make_interval(days => greatest(0, a.since_days))))
      and (a.cursor_collected_at is null or (p.collected_at, p.id) < (a.cursor_collected_at, coalesce(a.cursor_id, '00000000-0000-0000-0000-000000000000'::uuid)))
  ),
  filtered_rows as (
    select *
    from base_rows b
    cross join args a
    where a.radius_km is null or b.distance_km is null or b.distance_km <= greatest(0, a.radius_km)
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
    coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'product_id', v.product_id, 'store_id', v.store_id, 'price_yen', v.price_yen, 'is_member_price', v.is_member_price, 'source', v.source, 'collected_at', v.collected_at, 'note', v.note, 'stores', v.stores, 'products', v.products, 'distance_km', v.distance_km) order by v.collected_at desc, v.id desc) from visible_rows v), '[]'::jsonb),
    'next_cursor',
    (select case when n.id is null then null else jsonb_build_object('collected_at', n.collected_at, 'id', n.id) end from next_row n),
    'credit',
    credit
  )
  into result;
  return result;
end;
$$;

create table if not exists app_settings (
  setting_key text primary key,
  setting_value jsonb not null,
  description text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null check (amount <> 0),
  reason text not null,
  reference_type text not null default '',
  reference_id uuid,
  note text not null default '',
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists search_usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  search_date date not null default current_date,
  query text not null default '',
  charged_points integer not null default 0 check (charged_points >= 0),
  created_at timestamptz not null default now()
);

create table if not exists price_reference_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reference_date date not null default current_date,
  product_id text not null references products(id) on delete cascade,
  charged_points integer not null default 0 check (charged_points >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, reference_date, product_id)
);

create table if not exists price_tasks (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references products(id) on delete cascade,
  store_id text references stores(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'claimed', 'completed', 'skipped', 'expired')),
  assigned_user_id uuid references auth.users(id) on delete set null,
  claimed_at timestamptz,
  skipped_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz,
  source text not null default 'system',
  priority integer not null default 0,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into app_settings (setting_key, setting_value, description)
values
  ('daily_free_searches', '5'::jsonb, 'Daily free product searches'),
  ('daily_free_price_references', '5'::jsonb, 'Daily free product price references'),
  ('search_cost_after_free', '1'::jsonb, 'Credit cost per search after free quota'),
  ('price_reference_cost', '1'::jsonb, 'Credit cost per product price reference after free quota'),
  ('approved_contribution_reward', '3'::jsonb, 'Credit reward for each contributor after consensus approval'),
  ('consensus_required_users', '3'::jsonb, 'Distinct users required to promote a public price'),
  ('consensus_window_days', '30'::jsonb, 'Days used when counting matching price submissions'),
  ('task_claim_limit_per_day', '3'::jsonb, 'Daily task claim limit per user'),
  ('task_expiry_hours', '24'::jsonb, 'Hours before a claimed task expires'),
  ('stale_price_days', '30'::jsonb, 'Days after which a public price needs refresh'),
  ('low_balance_threshold', '2'::jsonb, 'Credit balance threshold for recharge prompt')
on conflict (setting_key) do nothing;

create index if not exists credit_ledger_user_time_idx on credit_ledger (user_id, created_at desc);
create unique index if not exists credit_ledger_contribution_reward_unique_idx
  on credit_ledger (user_id, reference_id)
  where reason = 'contribution_reward' and reference_id is not null;
create index if not exists search_usage_logs_user_date_idx on search_usage_logs (user_id, search_date, created_at desc);
create index if not exists price_reference_logs_user_date_idx on price_reference_logs (user_id, reference_date, created_at desc);
create index if not exists price_tasks_status_priority_idx on price_tasks (status, priority desc, created_at asc);
create index if not exists price_tasks_assigned_idx on price_tasks (assigned_user_id, status, created_at desc);

drop trigger if exists app_settings_updated_at on app_settings;
create trigger app_settings_updated_at
before update on app_settings
for each row execute function set_updated_at();

drop trigger if exists price_tasks_updated_at on price_tasks;
create trigger price_tasks_updated_at
before update on price_tasks
for each row execute function set_updated_at();

alter table app_settings enable row level security;
alter table credit_ledger enable row level security;
alter table search_usage_logs enable row level security;
alter table price_reference_logs enable row level security;
alter table price_tasks enable row level security;

drop policy if exists "app settings public read" on app_settings;
create policy "app settings public read" on app_settings for select using (true);
drop policy if exists "app settings admin write" on app_settings;
create policy "app settings admin write" on app_settings for all using (is_admin_user()) with check (is_admin_user());
drop policy if exists "credit ledger owner read" on credit_ledger;
create policy "credit ledger owner read" on credit_ledger for select using (auth.uid() = user_id);
drop policy if exists "credit ledger admin read" on credit_ledger;
create policy "credit ledger admin read" on credit_ledger for select using (is_admin_user());
drop policy if exists "search usage owner read" on search_usage_logs;
create policy "search usage owner read" on search_usage_logs for select using (auth.uid() = user_id);
drop policy if exists "search usage admin read" on search_usage_logs;
create policy "search usage admin read" on search_usage_logs for select using (is_admin_user());
drop policy if exists "price reference owner read" on price_reference_logs;
create policy "price reference owner read" on price_reference_logs for select using (auth.uid() = user_id);
drop policy if exists "price reference admin read" on price_reference_logs;
create policy "price reference admin read" on price_reference_logs for select using (is_admin_user());
drop policy if exists "price tasks owner read" on price_tasks;
create policy "price tasks owner read" on price_tasks for select using (status = 'open' or auth.uid() = assigned_user_id);
drop policy if exists "price tasks admin read" on price_tasks;
create policy "price tasks admin read" on price_tasks for select using (is_admin_user());
drop policy if exists "price tasks admin write" on price_tasks;
create policy "price tasks admin write" on price_tasks for all using (is_admin_user()) with check (is_admin_user());

drop policy if exists "prices public read" on prices;
drop policy if exists "prices authenticated read" on prices;
create policy "prices authenticated read" on prices for select using (auth.uid() is not null or is_admin_user());

create or replace function app_setting_int(target_key text, default_value integer)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select case
        when jsonb_typeof(setting_value) = 'number' then (setting_value #>> '{}')::integer
        when jsonb_typeof(setting_value) = 'string' and (setting_value #>> '{}') ~ '^-?[0-9]+$' then (setting_value #>> '{}')::integer
        else null
      end
      from public.app_settings
      where setting_key = target_key
    ),
    default_value
  );
$$;

create or replace function fetch_app_settings()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(setting_key, setting_value order by setting_key), '{}'::jsonb)
  from public.app_settings;
$$;

create or replace function credit_balance(target_user_id uuid default auth.uid())
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(amount), 0)::integer
  from public.credit_ledger
  where user_id = target_user_id;
$$;

create or replace function fetch_credit_summary()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with args as (
    select
      auth.uid() as user_id,
      current_date as today,
      public.app_setting_int('daily_free_searches', 5) as daily_free_searches,
      public.app_setting_int('daily_free_price_references', 5) as daily_free_price_references,
      public.app_setting_int('search_cost_after_free', 1) as search_cost_after_free,
      public.app_setting_int('price_reference_cost', 1) as price_reference_cost,
      public.app_setting_int('approved_contribution_reward', 3) as approved_contribution_reward,
      public.app_setting_int('low_balance_threshold', 2) as low_balance_threshold
  ),
  usage as (
    select
      (select count(*)::integer from public.search_usage_logs s, args a where s.user_id = a.user_id and s.search_date = a.today) as searches_today,
      (select count(*)::integer from public.price_reference_logs r, args a where r.user_id = a.user_id and r.reference_date = a.today) as references_today
  )
  select jsonb_build_object(
    'balance', case when (select user_id from args) is null then 0 else public.credit_balance((select user_id from args)) end,
    'searches_today', (select searches_today from usage),
    'references_today', (select references_today from usage),
    'daily_free_searches', (select daily_free_searches from args),
    'daily_free_price_references', (select daily_free_price_references from args),
    'search_cost_after_free', (select search_cost_after_free from args),
    'price_reference_cost', (select price_reference_cost from args),
    'approved_contribution_reward', (select approved_contribution_reward from args),
    'low_balance_threshold', (select low_balance_threshold from args),
    'settings', public.fetch_app_settings()
  );
$$;

create or replace function consume_credit(target_user_id uuid, amount integer, reason text, reference_type text default '', reference_id uuid default null, note text default '')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  current_balance integer;
begin
  if target_user_id is null then
    raise exception 'login required';
  end if;
  if amount <= 0 then
    return public.credit_balance(target_user_id);
  end if;
  current_balance := public.credit_balance(target_user_id);
  if current_balance < amount then
    raise exception 'insufficient_credits';
  end if;
  insert into public.credit_ledger (user_id, amount, reason, reference_type, reference_id, note, created_by)
  values (target_user_id, -amount, reason, coalesce(reference_type, ''), reference_id, coalesce(note, ''), auth.uid());
  return current_balance - amount;
end;
$$;

create or replace function consume_price_reference(target_product_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user_id uuid := auth.uid();
  free_limit integer := greatest(0, public.app_setting_int('daily_free_price_references', 5));
  cost integer := greatest(0, public.app_setting_int('price_reference_cost', 1));
  used_count integer;
  charged integer := 0;
  remaining integer;
begin
  if target_user_id is null then
    raise exception 'login required';
  end if;
  if coalesce(target_product_id, '') = '' then
    raise exception 'product_id is required';
  end if;
  select charged_points into charged
  from public.price_reference_logs
  where user_id = target_user_id and reference_date = current_date and product_id = target_product_id;
  if found then
    return jsonb_build_object(
      'balance', public.credit_balance(target_user_id),
      'free_remaining', greatest(0, free_limit - (select count(*)::integer from public.price_reference_logs where user_id = target_user_id and reference_date = current_date)),
      'charged_points', 0,
      'already_referenced', true,
      'settings', public.fetch_app_settings()
    );
  end if;
  select count(*)::integer into used_count
  from public.price_reference_logs
  where user_id = target_user_id and reference_date = current_date;
  if used_count >= free_limit then
    charged := cost;
    perform public.consume_credit(target_user_id, charged, 'price_reference', 'product', null, target_product_id);
  else
    charged := 0;
  end if;
  insert into public.price_reference_logs (user_id, reference_date, product_id, charged_points)
  values (target_user_id, current_date, target_product_id, charged);
  remaining := greatest(0, free_limit - used_count - 1);
  return jsonb_build_object(
    'balance', public.credit_balance(target_user_id),
    'free_remaining', remaining,
    'charged_points', charged,
    'already_referenced', false,
    'settings', public.fetch_app_settings()
  );
end;
$$;

create or replace function record_product_search(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user_id uuid := auth.uid();
  free_limit integer := greatest(0, public.app_setting_int('daily_free_searches', 5));
  cost integer := greatest(0, public.app_setting_int('search_cost_after_free', 1));
  used_count integer;
  charged integer := 0;
  search_query text := left(coalesce(payload->>'query', ''), 200);
begin
  perform public.require_authenticated_user();
  select count(*)::integer into used_count from public.search_usage_logs where user_id = target_user_id and search_date = current_date;
  if used_count >= free_limit then
    charged := cost;
    perform public.consume_credit(target_user_id, charged, 'product_search', 'search', null, search_query);
  end if;
  insert into public.search_usage_logs (user_id, search_date, query, charged_points)
  values (target_user_id, current_date, search_query, charged);
  return jsonb_build_object('balance', public.credit_balance(target_user_id), 'free_remaining', greatest(0, free_limit - used_count - 1), 'charged_points', charged, 'settings', public.fetch_app_settings());
end;
$$;

create or replace function try_promote_consensus_price(target_product_id text, target_store_id text, target_price_yen integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  required_users integer := greatest(1, public.app_setting_int('consensus_required_users', 3));
  window_days integer := greatest(1, public.app_setting_int('consensus_window_days', 30));
  reward integer := greatest(0, public.app_setting_int('approved_contribution_reward', 3));
  matching_count integer;
  next_price_id uuid;
  contributor record;
begin
  select count(distinct user_id)::integer into matching_count
  from public.user_price_logs
  where product_id = target_product_id and store_id = target_store_id and price_yen = target_price_yen
    and share_to_public = true and review_status = 'pending'
    and created_at >= now() - make_interval(days => window_days);
  if matching_count < required_users then
    return jsonb_build_object('promoted', false, 'matching_users', matching_count, 'required_users', required_users);
  end if;
  next_price_id := gen_random_uuid();
  insert into public.prices (id, product_id, store_id, price_yen, is_member_price, source, note, collected_at)
  values (next_price_id, target_product_id, target_store_id, target_price_yen, false, 'community_consensus', '', now());
  for contributor in
    select distinct on (user_id) id, user_id
    from public.user_price_logs
    where product_id = target_product_id and store_id = target_store_id and price_yen = target_price_yen
      and share_to_public = true and review_status = 'pending'
      and created_at >= now() - make_interval(days => window_days)
    order by user_id, created_at asc
    limit required_users
  loop
    update public.user_price_logs
    set review_status = 'approved', confidence_score = 100, review_note = 'Auto-approved by community consensus',
        reviewed_at = now(), promoted_price_id = next_price_id, updated_at = now()
    where id = contributor.id;
    if reward > 0 then
      insert into public.credit_ledger (user_id, amount, reason, reference_type, reference_id, note, created_by)
      values (contributor.user_id, reward, 'contribution_reward', 'user_price_logs', contributor.id, 'Community consensus price reward', auth.uid())
      on conflict do nothing;
    end if;
  end loop;
  update public.price_tasks
  set status = 'completed', completed_at = now(), updated_at = now()
  where product_id = target_product_id and (store_id = target_store_id or store_id is null) and status in ('open', 'claimed');
  return jsonb_build_object('promoted', true, 'matching_users', matching_count, 'required_users', required_users, 'price_id', next_price_id);
end;
$$;

create or replace function require_authenticated_user()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'login required';
  end if;
end;
$$;

drop policy if exists "logs admin read" on user_price_logs;
create policy "logs admin read" on user_price_logs for select using (is_admin_user());
drop policy if exists "logs admin update" on user_price_logs;
create policy "logs admin update" on user_price_logs for update using (is_admin_user()) with check (is_admin_user());
drop policy if exists "product submissions admin read" on product_submissions;
create policy "product submissions admin read" on product_submissions for select using (is_admin_user());
drop policy if exists "product submissions admin update" on product_submissions;
create policy "product submissions admin update" on product_submissions for update using (is_admin_user()) with check (is_admin_user());

create or replace function create_product(payload jsonb)
returns products
language plpgsql
security definer
set search_path = public
as $$
declare
  result products;
  target_id text;
  target_barcode text;
begin
  perform public.require_authenticated_user();

  target_barcode := regexp_replace(coalesce(payload->>'barcode', payload->>'id', ''), '\D', '', 'g');
  target_id := coalesce(nullif(payload->>'id', ''), target_barcode);

  if target_barcode !~ '^(\d{8}|\d{12,14})$' then
    raise exception 'jan_code is required';
  end if;

  if coalesce(payload->>'name', '') = '' then
    raise exception 'name is required';
  end if;

  if exists(
    select 1
    from public.products
    where id = target_id or barcode = target_barcode
  ) then
    raise exception 'product already exists';
  end if;

  insert into public.products (
    id,
    barcode,
    name,
    brand,
    pack,
    category,
    tone,
    description,
    image_url
  )
  values (
    target_id,
    target_barcode,
    coalesce(payload->>'name', ''),
    coalesce(payload->>'brand', ''),
    coalesce(payload->>'pack', ''),
    coalesce(payload->>'category', ''),
    coalesce(nullif(payload->>'tone', ''), 'sunset'),
    coalesce(payload->>'description', ''),
    case
      when coalesce(payload->>'image_url', '') ~* '^https?://' then payload->>'image_url'
      else ''
    end
  )
  returning * into result;

  return result;
end;
$$;

create or replace function submit_product_submission(payload jsonb)
returns product_submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  result product_submissions;
  target_barcode text;
begin
  perform require_authenticated_user();

  target_barcode := regexp_replace(coalesce(payload->>'barcode', payload->>'id', ''), '\D', '', 'g');
  if target_barcode !~ '^(\d{8}|\d{12,14})$' then
    raise exception 'jan_code is required';
  end if;

  if coalesce(payload->>'name', '') = '' then
    raise exception 'name is required';
  end if;

  if exists(select 1 from public.products where barcode = target_barcode or id = coalesce(nullif(payload->>'id', ''), target_barcode)) then
    raise exception 'product already exists';
  end if;

  insert into public.product_submissions (
    user_id,
    barcode,
    name,
    brand,
    pack,
    category,
    tone,
    description,
    image_url
  )
  values (
    auth.uid(),
    target_barcode,
    coalesce(payload->>'name', ''),
    coalesce(payload->>'brand', ''),
    coalesce(payload->>'pack', ''),
    coalesce(payload->>'category', ''),
    coalesce(nullif(payload->>'tone', ''), 'sunset'),
    coalesce(payload->>'description', ''),
    case
      when coalesce(payload->>'image_url', '') ~* '^https?://' then payload->>'image_url'
      else ''
    end
  )
  returning * into result;

  return result;
end;
$$;

create or replace function admin_review_product_submission(payload jsonb)
returns product_submissions
language plpgsql
security definer
set search_path = public
as $$
declare
  target_submission product_submissions;
  result product_submissions;
  action text;
  next_product_id text;
begin
  perform public.require_admin_user();

  action := coalesce(payload->>'action', '');
  if action not in ('approve', 'reject') then
    raise exception 'review action must be approve or reject';
  end if;

  select *
  into target_submission
  from public.product_submissions
  where id = nullif(payload->>'id', '')::uuid
  for update;

  if not found then
    raise exception 'product submission not found';
  end if;

  if target_submission.review_status <> 'pending' then
    raise exception 'product submission is not pending';
  end if;

  if action = 'approve' then
    next_product_id := coalesce(nullif(payload->>'product_id', ''), target_submission.barcode);
    insert into public.products (
      id,
      barcode,
      name,
      brand,
      pack,
      category,
      tone,
      description,
      image_url
    )
    values (
      next_product_id,
      target_submission.barcode,
      target_submission.name,
      target_submission.brand,
      target_submission.pack,
      target_submission.category,
      target_submission.tone,
      target_submission.description,
      target_submission.image_url
    )
    on conflict (id) do update
      set barcode = excluded.barcode,
          name = excluded.name,
          brand = excluded.brand,
          pack = excluded.pack,
          category = excluded.category,
          tone = excluded.tone,
          description = excluded.description,
          image_url = excluded.image_url,
          updated_at = now();

    update public.product_submissions
    set review_status = 'approved',
        review_note = coalesce(payload->>'review_note', ''),
        promoted_product_id = next_product_id,
        reviewed_at = now(),
        updated_at = now()
    where id = target_submission.id
    returning * into result;
  else
    update public.product_submissions
    set review_status = 'rejected',
        review_note = coalesce(payload->>'review_note', ''),
        reviewed_at = now(),
        updated_at = now()
    where id = target_submission.id
    returning * into result;
  end if;

  return result;
end;
$$;

create or replace function admin_upsert_product(payload jsonb)
returns products
language plpgsql
security definer
set search_path = public
as $$
declare
  result products;
  target_id text;
  target_barcode text;
begin
  perform require_admin_user();

  target_barcode := regexp_replace(coalesce(payload->>'barcode', payload->>'id', ''), '\D', '', 'g');
  target_id := coalesce(nullif(payload->>'id', ''), target_barcode);

  if target_barcode !~ '^(\d{8}|\d{12,14})$' then
    raise exception 'jan_code is required';
  end if;

  if coalesce(payload->>'name', '') = '' then
    raise exception 'name is required';
  end if;

  insert into public.products (
    id,
    barcode,
    name,
    brand,
    pack,
    category,
    tone,
    description,
    image_url
  )
  values (
    target_id,
    target_barcode,
    coalesce(payload->>'name', ''),
    coalesce(payload->>'brand', ''),
    coalesce(payload->>'pack', ''),
    coalesce(payload->>'category', ''),
    coalesce(nullif(payload->>'tone', ''), 'sunset'),
    coalesce(payload->>'description', ''),
    case
      when coalesce(payload->>'image_url', '') ~* '^https?://' then payload->>'image_url'
      else ''
    end
  )
  on conflict (id) do update
    set barcode = excluded.barcode,
        name = excluded.name,
        brand = excluded.brand,
        pack = excluded.pack,
        category = excluded.category,
        tone = excluded.tone,
        description = excluded.description,
        image_url = excluded.image_url,
        updated_at = now()
  returning * into result;

  return result;
end;
$$;

create or replace function admin_upsert_store(payload jsonb)
returns stores
language plpgsql
security definer
set search_path = public
as $$
declare
  result stores;
begin
  perform require_admin_user();

  insert into public.stores (
    id,
    name,
    chain_name,
    address,
    city,
    pref,
    lat,
    lng,
    hours
  )
  values (
    coalesce(nullif(payload->>'id', ''), nullif(payload->>'name', '')),
    coalesce(payload->>'name', ''),
    coalesce(payload->>'chain_name', ''),
    coalesce(payload->>'address', ''),
    coalesce(payload->>'city', ''),
    coalesce(payload->>'pref', ''),
    coalesce((nullif(payload->>'lat', ''))::double precision, 0),
    coalesce((nullif(payload->>'lng', ''))::double precision, 0),
    coalesce(payload->>'hours', '')
  )
  on conflict (id) do update
    set name = excluded.name,
        chain_name = excluded.chain_name,
        address = excluded.address,
        city = excluded.city,
        pref = excluded.pref,
        lat = excluded.lat,
        lng = excluded.lng,
        hours = excluded.hours,
        updated_at = now()
  returning * into result;

  return result;
end;
$$;

create or replace function admin_upsert_price(payload jsonb)
returns prices
language plpgsql
security definer
set search_path = public
as $$
declare
  result prices;
begin
  perform require_admin_user();

  insert into public.prices (
    id,
    product_id,
    store_id,
    price_yen,
    is_member_price,
    source,
    note,
    collected_at
  )
  values (
    coalesce(nullif(payload->>'id', '')::uuid, gen_random_uuid()),
    coalesce(payload->>'product_id', ''),
    coalesce(payload->>'store_id', ''),
    nullif(payload->>'price_yen', '')::integer,
    coalesce((nullif(payload->>'is_member_price', ''))::boolean, false),
    coalesce(payload->>'source', 'manual'),
    coalesce(payload->>'note', ''),
    coalesce((nullif(payload->>'collected_at', ''))::timestamptz, now())
  )
  on conflict (id) do update
    set product_id = excluded.product_id,
        store_id = excluded.store_id,
        price_yen = excluded.price_yen,
        is_member_price = excluded.is_member_price,
        source = excluded.source,
        note = excluded.note,
        collected_at = excluded.collected_at,
        updated_at = now()
  returning * into result;

  return result;
end;
$$;

create or replace function admin_delete_product(target_id text)
returns products
language plpgsql
security definer
set search_path = public
as $$
declare
  result products;
begin
  perform require_admin_user();

  delete from public.products
  where id = target_id
  returning * into result;

  return result;
end;
$$;

create or replace function admin_delete_store(target_id text)
returns stores
language plpgsql
security definer
set search_path = public
as $$
declare
  result stores;
begin
  perform require_admin_user();

  delete from public.stores
  where id = target_id
  returning * into result;

  return result;
end;
$$;

create or replace function admin_delete_price(target_id uuid)
returns prices
language plpgsql
security definer
set search_path = public
as $$
declare
  result prices;
begin
  perform require_admin_user();

  delete from public.prices
  where id = target_id
  returning * into result;

  return result;
end;
$$;

create or replace function submit_store_price(payload jsonb)
returns user_price_logs
language plpgsql
security definer
set search_path = public
as $$
declare
  result user_price_logs;
  should_share boolean;
begin
  perform require_authenticated_user();

  if coalesce(payload->>'product_id', '') = '' then
    raise exception 'product_id is required';
  end if;

  if coalesce(payload->>'store_id', '') = '' then
    raise exception 'store_id is required';
  end if;

  if nullif(payload->>'price_yen', '') is null then
    raise exception 'price_yen is required';
  end if;

  should_share := coalesce((nullif(payload->>'share_to_public', ''))::boolean, false);

  insert into public.user_price_logs (
    user_id,
    product_id,
    store_id,
    price_yen,
    purchased_at,
    note,
    share_to_public,
    review_status,
    evidence_url
  )
  values (
    auth.uid(),
    coalesce(payload->>'product_id', ''),
    coalesce(payload->>'store_id', ''),
    nullif(payload->>'price_yen', '')::integer,
    coalesce((nullif(payload->>'purchased_at', ''))::date, current_date),
    coalesce(payload->>'note', ''),
    should_share,
    case when should_share then 'pending' else 'private' end,
    coalesce(payload->>'evidence_url', '')
  )
  returning * into result;

  return result;
end;
$$;

create or replace function fetch_product_prices(payload jsonb)
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
language plpgsql
security definer
set search_path = public
as $$
declare
  target_product_id text := coalesce(nullif(payload->>'product_id', ''), '');
begin
  perform public.consume_price_reference(target_product_id);
  return query
  with args as (
    select
      target_product_id,
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
      jsonb_build_object('id', s.id, 'name', s.name, 'chain_name', s.chain_name, 'address', s.address, 'city', s.city, 'pref', s.pref, 'lat', s.lat, 'lng', s.lng, 'hours', s.hours) as stores,
      jsonb_build_object('id', pr.id, 'name', pr.name, 'barcode', pr.barcode, 'brand', pr.brand, 'pack', pr.pack, 'tone', pr.tone) as products,
      case
        when a.lat is null or a.lng is null then null
        else (6371 * acos(cos(radians(a.lat)) * cos(radians(s.lat)) * cos(radians(s.lng) - radians(a.lng)) + sin(radians(a.lat)) * sin(radians(s.lat))))
      end as distance_km
    from public.prices p
    join public.stores s on s.id = p.store_id
    join public.products pr on pr.id = p.product_id
    cross join args a
    where p.product_id = a.target_product_id
      and (a.since_days is null or p.collected_at >= (now() - make_interval(days => greatest(0, a.since_days))))
  )
  select b.id, b.product_id, b.store_id, b.price_yen, b.is_member_price, b.source, b.collected_at, b.note, b.stores, b.products, b.distance_km
  from base_rows b
  cross join args a
  where a.target_product_id <> ''
    and (a.radius_km is null or b.distance_km is null or b.distance_km <= greatest(0, a.radius_km))
  order by case when a.lat is null or a.lng is null then 1 else 0 end, b.distance_km asc nulls last, b.collected_at desc, b.price_yen asc
  limit (select target_limit from args);
end;
$$;

create or replace function fetch_product_prices_page(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  credit jsonb;
  result jsonb;
  target_product_id text := coalesce(nullif(payload->>'product_id', ''), '');
begin
  credit := public.consume_price_reference(target_product_id);
  with args as (
    select
      target_product_id,
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
      jsonb_build_object('id', s.id, 'name', s.name, 'chain_name', s.chain_name, 'address', s.address, 'city', s.city, 'pref', s.pref, 'lat', s.lat, 'lng', s.lng, 'hours', s.hours) as stores,
      jsonb_build_object('id', pr.id, 'name', pr.name, 'barcode', pr.barcode, 'brand', pr.brand, 'pack', pr.pack, 'tone', pr.tone) as products,
      case
        when a.lat is null or a.lng is null then null
        else (6371 * acos(cos(radians(a.lat)) * cos(radians(s.lat)) * cos(radians(s.lng) - radians(a.lng)) + sin(radians(a.lat)) * sin(radians(s.lat))))
      end as distance_km
    from public.prices p
    join public.stores s on s.id = p.store_id
    join public.products pr on pr.id = p.product_id
    cross join args a
    where p.product_id = a.target_product_id
      and (a.since_days is null or p.collected_at >= (now() - make_interval(days => greatest(0, a.since_days))))
      and (a.cursor_collected_at is null or (p.collected_at, p.id) < (a.cursor_collected_at, coalesce(a.cursor_id, '00000000-0000-0000-0000-000000000000'::uuid)))
  ),
  filtered_rows as (
    select *
    from base_rows b
    cross join args a
    where a.radius_km is null or b.distance_km is null or b.distance_km <= greatest(0, a.radius_km)
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
    coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'product_id', v.product_id, 'store_id', v.store_id, 'price_yen', v.price_yen, 'is_member_price', v.is_member_price, 'source', v.source, 'collected_at', v.collected_at, 'note', v.note, 'stores', v.stores, 'products', v.products, 'distance_km', v.distance_km) order by v.collected_at desc, v.id desc) from visible_rows v), '[]'::jsonb),
    'next_cursor',
    (select case when n.id is null then null else jsonb_build_object('collected_at', n.collected_at, 'id', n.id) end from next_row n),
    'credit',
    credit
  )
  into result;
  return result;
end;
$$;

create or replace function admin_review_price_submission(payload jsonb)
returns user_price_logs
language plpgsql
security definer
set search_path = public
as $$
declare
  target_log user_price_logs;
  result user_price_logs;
  action text;
  next_confidence numeric;
  next_price_id uuid;
begin
  perform require_admin_user();

  action := coalesce(payload->>'action', '');
  if action not in ('approve', 'reject') then
    raise exception 'review action must be approve or reject';
  end if;

  select *
  into target_log
  from public.user_price_logs
  where id = nullif(payload->>'id', '')::uuid
  for update;

  if not found then
    raise exception 'price submission not found';
  end if;

  if target_log.review_status <> 'pending' then
    raise exception 'price submission is not pending';
  end if;

  next_confidence := greatest(0, least(100, coalesce((nullif(payload->>'confidence_score', ''))::numeric, target_log.confidence_score, 0)));

  if action = 'approve' then
    next_price_id := gen_random_uuid();

    insert into public.prices (
      id,
      product_id,
      store_id,
      price_yen,
      is_member_price,
      source,
      note,
      collected_at
    )
    values (
      next_price_id,
      target_log.product_id,
      target_log.store_id,
      target_log.price_yen,
      false,
      'community',
      target_log.note,
      coalesce(target_log.purchased_at::timestamptz, target_log.created_at)
    );

    update public.user_price_logs
    set review_status = 'approved',
        confidence_score = next_confidence,
        review_note = coalesce(payload->>'review_note', ''),
        reviewed_at = now(),
        promoted_price_id = next_price_id,
        updated_at = now()
    where id = target_log.id
    returning * into result;
  else
    update public.user_price_logs
    set review_status = 'rejected',
        confidence_score = next_confidence,
        review_note = coalesce(payload->>'review_note', ''),
        reviewed_at = now(),
        updated_at = now()
    where id = target_log.id
    returning * into result;
  end if;

  return result;
end;
$$;

create or replace function submit_telemetry_events(payload jsonb)
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

create or replace function fetch_product_prices(payload jsonb)
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

create or replace function fetch_product_prices_page(payload jsonb)
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

create or replace function admin_fetch_telemetry_summary(payload jsonb default '{}'::jsonb)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with args as (
    select greatest(1, least(90, coalesce((nullif(payload->>'days', ''))::integer, 7))) as days_window
  ),
  scoped as (
    select t.*
    from public.telemetry_events t
    cross join args a
    where t.occurred_at >= now() - make_interval(days => a.days_window)
  ),
  top_events as (
    select event_name, count(*)::integer as total
    from scoped
    group by event_name
    order by total desc, event_name asc
    limit 8
  )
  select jsonb_build_object(
    'days', (select days_window from args),
    'total_events', coalesce((select count(*)::integer from scoped), 0),
    'active_users', coalesce((select count(distinct user_id)::integer from scoped where user_id is not null), 0),
    'top_events', coalesce((select jsonb_agg(jsonb_build_object('event_name', event_name, 'total', total)) from top_events), '[]'::jsonb)
  );
$$;

create or replace function admin_fetch_telemetry_recent(payload jsonb default '{}'::jsonb)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with args as (
    select greatest(1, least(200, coalesce((nullif(payload->>'limit', ''))::integer, 30))) as row_limit
  ),
  rows as (
    select
      t.id,
      t.user_id,
      t.event_name,
      t.payload,
      t.occurred_at,
      p.email
    from public.telemetry_events t
    left join public.profiles p on p.id = t.user_id
    order by t.occurred_at desc, t.id desc
    limit (select row_limit from args)
  )
  select jsonb_build_object(
    'items',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', r.id,
            'user_id', r.user_id,
            'email', coalesce(r.email, ''),
            'event_name', r.event_name,
            'payload', r.payload,
            'occurred_at', r.occurred_at
          )
          order by r.occurred_at desc, r.id desc
        )
        from rows r
      ),
      '[]'::jsonb
    )
  );
$$;

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do update
    set email = excluded.email,
        full_name = excluded.full_name,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function handle_new_user();

create or replace function admin_update_app_setting(payload jsonb)
returns app_settings
language plpgsql
security definer
set search_path = public
as $$
declare
  result app_settings;
  target_key text := coalesce(payload->>'setting_key', payload->>'key', '');
  allowed_keys text[] := array[
    'daily_free_searches',
    'daily_free_price_references',
    'search_cost_after_free',
    'price_reference_cost',
    'approved_contribution_reward',
    'consensus_required_users',
    'consensus_window_days',
    'task_claim_limit_per_day',
    'task_expiry_hours',
    'stale_price_days',
    'low_balance_threshold'
  ];
begin
  perform require_admin_user();
  if not target_key = any(allowed_keys) then
    raise exception 'setting key is not allowed';
  end if;
  insert into public.app_settings (setting_key, setting_value, description, updated_by)
  values (target_key, coalesce(payload->'setting_value', payload->'value', '0'::jsonb), coalesce(payload->>'description', ''), auth.uid())
  on conflict (setting_key) do update
    set setting_value = excluded.setting_value,
        description = coalesce(nullif(excluded.description, ''), public.app_settings.description),
        updated_by = auth.uid(),
        updated_at = now()
  returning * into result;
  insert into public.telemetry_events (user_id, event_name, payload, occurred_at)
  values (auth.uid(), 'app_setting_updated', jsonb_build_object('setting_key', target_key), now());
  return result;
end;
$$;

create or replace function admin_adjust_credits(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user_id uuid := nullif(payload->>'user_id', '')::uuid;
  delta integer := coalesce((nullif(payload->>'amount', ''))::integer, 0);
begin
  perform require_admin_user();
  if target_user_id is null then
    raise exception 'user_id is required';
  end if;
  if delta = 0 then
    raise exception 'amount must not be zero';
  end if;
  insert into public.credit_ledger (user_id, amount, reason, reference_type, note, created_by)
  values (target_user_id, delta, 'admin_adjustment', 'admin', coalesce(payload->>'note', ''), auth.uid());
  return jsonb_build_object('user_id', target_user_id, 'balance', public.credit_balance(target_user_id), 'amount', delta);
end;
$$;

create or replace function claim_random_price_task(payload jsonb default '{}'::jsonb)
returns price_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  result price_tasks;
  claim_limit integer := greatest(0, public.app_setting_int('task_claim_limit_per_day', 3));
  expiry_hours integer := greatest(1, public.app_setting_int('task_expiry_hours', 24));
  claims_today integer;
begin
  perform require_authenticated_user();
  update public.price_tasks set status = 'expired', updated_at = now() where status = 'claimed' and expires_at is not null and expires_at < now();
  select count(*)::integer into claims_today from public.price_tasks where assigned_user_id = auth.uid() and claimed_at::date = current_date;
  if claims_today >= claim_limit then
    raise exception 'daily_task_claim_limit_reached';
  end if;
  select * into result from public.price_tasks where status = 'claimed' and assigned_user_id = auth.uid() and (expires_at is null or expires_at >= now()) order by claimed_at desc limit 1;
  if found then
    return result;
  end if;
  update public.price_tasks
  set status = 'claimed', assigned_user_id = auth.uid(), claimed_at = now(), expires_at = now() + make_interval(hours => expiry_hours), updated_at = now()
  where id = (select id from public.price_tasks where status = 'open' order by priority desc, random() limit 1 for update skip locked)
  returning * into result;
  if not found then
    raise exception 'no_price_tasks_available';
  end if;
  return result;
end;
$$;

create or replace function skip_price_task(payload jsonb)
returns price_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  result price_tasks;
begin
  perform require_authenticated_user();
  update public.price_tasks
  set status = 'skipped', skipped_at = now(), updated_at = now()
  where id = nullif(payload->>'id', '')::uuid and assigned_user_id = auth.uid() and status = 'claimed'
  returning * into result;
  if not found then
    raise exception 'price task not found';
  end if;
  return result;
end;
$$;

create or replace function submit_store_price(payload jsonb)
returns user_price_logs
language plpgsql
security definer
set search_path = public
as $$
declare
  result user_price_logs;
  should_share boolean;
  target_product_id text;
  target_store_id text;
  target_price_yen integer;
begin
  perform require_authenticated_user();
  target_product_id := coalesce(payload->>'product_id', '');
  target_store_id := coalesce(payload->>'store_id', '');
  target_price_yen := nullif(payload->>'price_yen', '')::integer;
  if target_product_id = '' then raise exception 'product_id is required'; end if;
  if target_store_id = '' then raise exception 'store_id is required'; end if;
  if target_price_yen is null then raise exception 'price_yen is required'; end if;
  should_share := coalesce((nullif(payload->>'share_to_public', ''))::boolean, false);
  select * into result
  from public.user_price_logs
  where user_id = auth.uid() and product_id = target_product_id and store_id = target_store_id and price_yen = target_price_yen
    and share_to_public = should_share
    and created_at >= now() - make_interval(days => greatest(1, public.app_setting_int('consensus_window_days', 30)))
  order by created_at desc
  limit 1;
  if found then
    update public.user_price_logs
    set purchased_at = coalesce((nullif(payload->>'purchased_at', ''))::date, purchased_at, current_date),
        note = coalesce(payload->>'note', note, ''),
        evidence_url = coalesce(payload->>'evidence_url', evidence_url, ''),
        updated_at = now()
    where id = result.id
    returning * into result;
  else
    insert into public.user_price_logs (user_id, product_id, store_id, price_yen, purchased_at, note, share_to_public, review_status, evidence_url)
    values (auth.uid(), target_product_id, target_store_id, target_price_yen, coalesce((nullif(payload->>'purchased_at', ''))::date, current_date), coalesce(payload->>'note', ''), should_share, case when should_share then 'pending' else 'private' end, coalesce(payload->>'evidence_url', ''))
    returning * into result;
  end if;
  if should_share and result.review_status = 'pending' then
    perform public.try_promote_consensus_price(target_product_id, target_store_id, target_price_yen);
  end if;
  return result;
end;
$$;

create or replace function fetch_product_prices(payload jsonb)
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
language plpgsql
security definer
set search_path = public
as $$
declare
  target_product_id text := coalesce(nullif(payload->>'product_id', ''), '');
begin
  perform public.consume_price_reference(target_product_id);
  return query
  with args as (
    select
      target_product_id,
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
      jsonb_build_object('id', s.id, 'name', s.name, 'chain_name', s.chain_name, 'address', s.address, 'city', s.city, 'pref', s.pref, 'lat', s.lat, 'lng', s.lng, 'hours', s.hours) as stores,
      jsonb_build_object('id', pr.id, 'name', pr.name, 'barcode', pr.barcode, 'brand', pr.brand, 'pack', pr.pack, 'tone', pr.tone) as products,
      case
        when a.lat is null or a.lng is null then null
        else (6371 * acos(cos(radians(a.lat)) * cos(radians(s.lat)) * cos(radians(s.lng) - radians(a.lng)) + sin(radians(a.lat)) * sin(radians(s.lat))))
      end as distance_km
    from public.prices p
    join public.stores s on s.id = p.store_id
    join public.products pr on pr.id = p.product_id
    cross join args a
    where p.product_id = a.target_product_id
      and (a.since_days is null or p.collected_at >= (now() - make_interval(days => greatest(0, a.since_days))))
  )
  select b.id, b.product_id, b.store_id, b.price_yen, b.is_member_price, b.source, b.collected_at, b.note, b.stores, b.products, b.distance_km
  from base_rows b
  cross join args a
  where a.target_product_id <> ''
    and (a.radius_km is null or b.distance_km is null or b.distance_km <= greatest(0, a.radius_km))
  order by case when a.lat is null or a.lng is null then 1 else 0 end, b.distance_km asc nulls last, b.collected_at desc, b.price_yen asc
  limit (select target_limit from args);
end;
$$;

create or replace function fetch_product_prices_page(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  credit jsonb;
  result jsonb;
  target_product_id text := coalesce(nullif(payload->>'product_id', ''), '');
begin
  credit := public.consume_price_reference(target_product_id);
  with args as (
    select
      target_product_id,
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
      jsonb_build_object('id', s.id, 'name', s.name, 'chain_name', s.chain_name, 'address', s.address, 'city', s.city, 'pref', s.pref, 'lat', s.lat, 'lng', s.lng, 'hours', s.hours) as stores,
      jsonb_build_object('id', pr.id, 'name', pr.name, 'barcode', pr.barcode, 'brand', pr.brand, 'pack', pr.pack, 'tone', pr.tone) as products,
      case
        when a.lat is null or a.lng is null then null
        else (6371 * acos(cos(radians(a.lat)) * cos(radians(s.lat)) * cos(radians(s.lng) - radians(a.lng)) + sin(radians(a.lat)) * sin(radians(s.lat))))
      end as distance_km
    from public.prices p
    join public.stores s on s.id = p.store_id
    join public.products pr on pr.id = p.product_id
    cross join args a
    where p.product_id = a.target_product_id
      and (a.since_days is null or p.collected_at >= (now() - make_interval(days => greatest(0, a.since_days))))
      and (a.cursor_collected_at is null or (p.collected_at, p.id) < (a.cursor_collected_at, coalesce(a.cursor_id, '00000000-0000-0000-0000-000000000000'::uuid)))
  ),
  filtered_rows as (
    select *
    from base_rows b
    cross join args a
    where a.radius_km is null or b.distance_km is null or b.distance_km <= greatest(0, a.radius_km)
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
    coalesce((select jsonb_agg(jsonb_build_object('id', v.id, 'product_id', v.product_id, 'store_id', v.store_id, 'price_yen', v.price_yen, 'is_member_price', v.is_member_price, 'source', v.source, 'collected_at', v.collected_at, 'note', v.note, 'stores', v.stores, 'products', v.products, 'distance_km', v.distance_km) order by v.collected_at desc, v.id desc) from visible_rows v), '[]'::jsonb),
    'next_cursor',
    (select case when n.id is null then null else jsonb_build_object('collected_at', n.collected_at, 'id', n.id) end from next_row n),
    'credit',
    credit
  )
  into result;
  return result;
end;
$$;





