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

create index if not exists products_name_trgm_idx on products using gin (name gin_trgm_ops);
create index if not exists products_brand_trgm_idx on products using gin (brand gin_trgm_ops);
create index if not exists products_barcode_idx on products (barcode);
create index if not exists stores_city_idx on stores (city);
create index if not exists prices_product_store_idx on prices (product_id, store_id);
create index if not exists prices_collected_idx on prices (collected_at desc);
create index if not exists user_price_logs_user_idx on user_price_logs (user_id, created_at desc);
create index if not exists favorites_user_idx on favorites (user_id, created_at desc);

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
alter table stores enable row level security;
alter table prices enable row level security;
alter table user_price_logs enable row level security;
alter table favorites enable row level security;

create policy "profiles read own" on profiles for select using (auth.uid() = id);
create policy "profiles insert own" on profiles for insert with check (auth.uid() = id);
create policy "profiles update own" on profiles for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "products public read" on products for select using (true);
create policy "stores public read" on stores for select using (true);
create policy "prices public read" on prices for select using (true);

create policy "products admin write" on products for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
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

create or replace function admin_upsert_product(payload jsonb)
returns products
language plpgsql
security definer
set search_path = public
as $$
declare
  result products;
begin
  perform require_admin_user();

  insert into public.products (
    id,
    barcode,
    name,
    brand,
    pack,
    category,
    tone,
    description
  )
  values (
    coalesce(nullif(payload->>'id', ''), nullif(payload->>'barcode', '')),
    coalesce(payload->>'barcode', ''),
    coalesce(payload->>'name', ''),
    coalesce(payload->>'brand', ''),
    coalesce(payload->>'pack', ''),
    coalesce(payload->>'category', ''),
    coalesce(nullif(payload->>'tone', ''), 'sunset'),
    coalesce(payload->>'description', '')
  )
  on conflict (id) do update
    set barcode = excluded.barcode,
        name = excluded.name,
        brand = excluded.brand,
        pack = excluded.pack,
        category = excluded.category,
        tone = excluded.tone,
        description = excluded.description,
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
$$;create or replace function handle_new_user()
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





