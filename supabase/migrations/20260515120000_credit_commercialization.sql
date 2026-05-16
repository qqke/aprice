create table if not exists public.app_settings (
  setting_key text primary key,
  setting_value jsonb not null,
  description text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_ledger (
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

create table if not exists public.search_usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  search_date date not null default current_date,
  query text not null default '',
  charged_points integer not null default 0 check (charged_points >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.price_reference_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reference_date date not null default current_date,
  product_id text not null references public.products(id) on delete cascade,
  charged_points integer not null default 0 check (charged_points >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, reference_date, product_id)
);

create table if not exists public.price_tasks (
  id uuid primary key default gen_random_uuid(),
  product_id text not null references public.products(id) on delete cascade,
  store_id text references public.stores(id) on delete set null,
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

insert into public.app_settings (setting_key, setting_value, description)
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

create index if not exists credit_ledger_user_time_idx on public.credit_ledger (user_id, created_at desc);
create unique index if not exists credit_ledger_contribution_reward_unique_idx
  on public.credit_ledger (user_id, reference_id)
  where reason = 'contribution_reward' and reference_id is not null;
create index if not exists search_usage_logs_user_date_idx on public.search_usage_logs (user_id, search_date, created_at desc);
create index if not exists price_reference_logs_user_date_idx on public.price_reference_logs (user_id, reference_date, created_at desc);
create index if not exists price_tasks_status_priority_idx on public.price_tasks (status, priority desc, created_at asc);
create index if not exists price_tasks_assigned_idx on public.price_tasks (assigned_user_id, status, created_at desc);

drop trigger if exists app_settings_updated_at on public.app_settings;
create trigger app_settings_updated_at
before update on public.app_settings
for each row execute function public.set_updated_at();

drop trigger if exists price_tasks_updated_at on public.price_tasks;
create trigger price_tasks_updated_at
before update on public.price_tasks
for each row execute function public.set_updated_at();

alter table public.app_settings enable row level security;
alter table public.credit_ledger enable row level security;
alter table public.search_usage_logs enable row level security;
alter table public.price_reference_logs enable row level security;
alter table public.price_tasks enable row level security;

drop policy if exists "prices public read" on public.prices;
drop policy if exists "prices authenticated read" on public.prices;
create policy "prices authenticated read" on public.prices
  for select using (auth.uid() is not null or public.is_admin_user());

drop policy if exists "app settings public read" on public.app_settings;
create policy "app settings public read" on public.app_settings for select using (true);
drop policy if exists "app settings admin write" on public.app_settings;
create policy "app settings admin write" on public.app_settings for all using (public.is_admin_user()) with check (public.is_admin_user());

drop policy if exists "credit ledger owner read" on public.credit_ledger;
create policy "credit ledger owner read" on public.credit_ledger for select using (auth.uid() = user_id);
drop policy if exists "credit ledger admin read" on public.credit_ledger;
create policy "credit ledger admin read" on public.credit_ledger for select using (public.is_admin_user());

drop policy if exists "search usage owner read" on public.search_usage_logs;
create policy "search usage owner read" on public.search_usage_logs for select using (auth.uid() = user_id);
drop policy if exists "search usage admin read" on public.search_usage_logs;
create policy "search usage admin read" on public.search_usage_logs for select using (public.is_admin_user());

drop policy if exists "price reference owner read" on public.price_reference_logs;
create policy "price reference owner read" on public.price_reference_logs for select using (auth.uid() = user_id);
drop policy if exists "price reference admin read" on public.price_reference_logs;
create policy "price reference admin read" on public.price_reference_logs for select using (public.is_admin_user());

drop policy if exists "price tasks owner read" on public.price_tasks;
create policy "price tasks owner read" on public.price_tasks for select using (status = 'open' or auth.uid() = assigned_user_id);
drop policy if exists "price tasks admin read" on public.price_tasks;
create policy "price tasks admin read" on public.price_tasks for select using (public.is_admin_user());
drop policy if exists "price tasks admin write" on public.price_tasks;
create policy "price tasks admin write" on public.price_tasks for all using (public.is_admin_user()) with check (public.is_admin_user());

create or replace function public.app_setting_int(target_key text, default_value integer)
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

create or replace function public.fetch_app_settings()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(setting_key, setting_value order by setting_key), '{}'::jsonb)
  from public.app_settings;
$$;

create or replace function public.credit_balance(target_user_id uuid default auth.uid())
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

create or replace function public.fetch_credit_summary()
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

create or replace function public.consume_credit(target_user_id uuid, amount integer, reason text, reference_type text default '', reference_id uuid default null, note text default '')
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

create or replace function public.consume_price_reference(target_product_id text)
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

  select charged_points
  into charged
  from public.price_reference_logs
  where user_id = target_user_id
    and reference_date = current_date
    and product_id = target_product_id;

  if found then
    return jsonb_build_object(
      'balance', public.credit_balance(target_user_id),
      'free_remaining', greatest(0, free_limit - (select count(*)::integer from public.price_reference_logs where user_id = target_user_id and reference_date = current_date)),
      'charged_points', 0,
      'already_referenced', true,
      'settings', public.fetch_app_settings()
    );
  end if;

  select count(*)::integer
  into used_count
  from public.price_reference_logs
  where user_id = target_user_id
    and reference_date = current_date;

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

create or replace function public.record_product_search(payload jsonb)
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

  select count(*)::integer
  into used_count
  from public.search_usage_logs
  where user_id = target_user_id
    and search_date = current_date;

  if used_count >= free_limit then
    charged := cost;
    perform public.consume_credit(target_user_id, charged, 'product_search', 'search', null, search_query);
  end if;

  insert into public.search_usage_logs (user_id, search_date, query, charged_points)
  values (target_user_id, current_date, search_query, charged);

  return jsonb_build_object(
    'balance', public.credit_balance(target_user_id),
    'free_remaining', greatest(0, free_limit - used_count - 1),
    'charged_points', charged,
    'settings', public.fetch_app_settings()
  );
end;
$$;

create or replace function public.try_promote_consensus_price(target_product_id text, target_store_id text, target_price_yen integer)
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
  select count(distinct user_id)::integer
  into matching_count
  from public.user_price_logs
  where product_id = target_product_id
    and store_id = target_store_id
    and price_yen = target_price_yen
    and share_to_public = true
    and review_status = 'pending'
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
    where product_id = target_product_id
      and store_id = target_store_id
      and price_yen = target_price_yen
      and share_to_public = true
      and review_status = 'pending'
      and created_at >= now() - make_interval(days => window_days)
    order by user_id, created_at asc
    limit required_users
  loop
    update public.user_price_logs
    set review_status = 'approved',
        confidence_score = 100,
        review_note = 'Auto-approved by community consensus',
        reviewed_at = now(),
        promoted_price_id = next_price_id,
        updated_at = now()
    where id = contributor.id;

    if reward > 0 then
      insert into public.credit_ledger (user_id, amount, reason, reference_type, reference_id, note, created_by)
      values (contributor.user_id, reward, 'contribution_reward', 'user_price_logs', contributor.id, 'Community consensus price reward', auth.uid())
      on conflict do nothing;
    end if;
  end loop;

  update public.price_tasks
  set status = 'completed',
      completed_at = now(),
      updated_at = now()
  where product_id = target_product_id
    and (store_id = target_store_id or store_id is null)
    and status in ('open', 'claimed');

  return jsonb_build_object('promoted', true, 'matching_users', matching_count, 'required_users', required_users, 'price_id', next_price_id);
end;
$$;

create or replace function public.admin_update_app_setting(payload jsonb)
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
  perform public.require_admin_user();

  if not target_key = any(allowed_keys) then
    raise exception 'setting key is not allowed';
  end if;

  insert into public.app_settings (setting_key, setting_value, description, updated_by)
  values (
    target_key,
    coalesce(payload->'setting_value', payload->'value', '0'::jsonb),
    coalesce(payload->>'description', ''),
    auth.uid()
  )
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

create or replace function public.admin_adjust_credits(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user_id uuid := nullif(payload->>'user_id', '')::uuid;
  delta integer := coalesce((nullif(payload->>'amount', ''))::integer, 0);
begin
  perform public.require_admin_user();

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

create or replace function public.claim_random_price_task(payload jsonb default '{}'::jsonb)
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
  perform public.require_authenticated_user();

  update public.price_tasks
  set status = 'expired',
      updated_at = now()
  where status = 'claimed'
    and expires_at is not null
    and expires_at < now();

  select count(*)::integer
  into claims_today
  from public.price_tasks
  where assigned_user_id = auth.uid()
    and claimed_at::date = current_date;

  if claims_today >= claim_limit then
    raise exception 'daily_task_claim_limit_reached';
  end if;

  select *
  into result
  from public.price_tasks
  where status = 'claimed'
    and assigned_user_id = auth.uid()
    and (expires_at is null or expires_at >= now())
  order by claimed_at desc
  limit 1;

  if found then
    return result;
  end if;

  update public.price_tasks
  set status = 'claimed',
      assigned_user_id = auth.uid(),
      claimed_at = now(),
      expires_at = now() + make_interval(hours => expiry_hours),
      updated_at = now()
  where id = (
    select id
    from public.price_tasks
    where status = 'open'
    order by priority desc, random()
    limit 1
    for update skip locked
  )
  returning * into result;

  if not found then
    raise exception 'no_price_tasks_available';
  end if;

  return result;
end;
$$;

create or replace function public.skip_price_task(payload jsonb)
returns price_tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  result price_tasks;
begin
  perform public.require_authenticated_user();

  update public.price_tasks
  set status = 'skipped',
      skipped_at = now(),
      updated_at = now()
  where id = nullif(payload->>'id', '')::uuid
    and assigned_user_id = auth.uid()
    and status = 'claimed'
  returning * into result;

  if not found then
    raise exception 'price task not found';
  end if;

  return result;
end;
$$;

create or replace function public.submit_store_price(payload jsonb)
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
  perform public.require_authenticated_user();

  target_product_id := coalesce(payload->>'product_id', '');
  target_store_id := coalesce(payload->>'store_id', '');
  target_price_yen := nullif(payload->>'price_yen', '')::integer;

  if target_product_id = '' then
    raise exception 'product_id is required';
  end if;
  if target_store_id = '' then
    raise exception 'store_id is required';
  end if;
  if target_price_yen is null then
    raise exception 'price_yen is required';
  end if;

  should_share := coalesce((nullif(payload->>'share_to_public', ''))::boolean, false);

  select *
  into result
  from public.user_price_logs
  where user_id = auth.uid()
    and product_id = target_product_id
    and store_id = target_store_id
    and price_yen = target_price_yen
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
      target_product_id,
      target_store_id,
      target_price_yen,
      coalesce((nullif(payload->>'purchased_at', ''))::date, current_date),
      coalesce(payload->>'note', ''),
      should_share,
      case when should_share then 'pending' else 'private' end,
      coalesce(payload->>'evidence_url', '')
    )
    returning * into result;
  end if;

  if should_share and result.review_status = 'pending' then
    perform public.try_promote_consensus_price(target_product_id, target_store_id, target_price_yen);
  end if;

  return result;
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

create or replace function public.fetch_product_prices_page(payload jsonb)
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
      and (a.radius_km is null or (
        case
          when a.lat is null or a.lng is null then null
          else (6371 * acos(cos(radians(a.lat)) * cos(radians(s.lat)) * cos(radians(s.lng) - radians(a.lng)) + sin(radians(a.lat)) * sin(radians(s.lat))))
        end
      ) is null or (
        case
          when a.lat is null or a.lng is null then null
          else (6371 * acos(cos(radians(a.lat)) * cos(radians(s.lat)) * cos(radians(s.lng) - radians(a.lng)) + sin(radians(a.lat)) * sin(radians(s.lat))))
        end
      ) <= greatest(0, a.radius_km))
  ),
  ordered_rows as (
    select *
    from base_rows
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
          jsonb_build_object('id', v.id, 'product_id', v.product_id, 'store_id', v.store_id, 'price_yen', v.price_yen, 'is_member_price', v.is_member_price, 'source', v.source, 'collected_at', v.collected_at, 'note', v.note, 'stores', v.stores, 'products', v.products, 'distance_km', v.distance_km)
          order by v.collected_at desc, v.id desc
        )
        from visible_rows v
      ),
      '[]'::jsonb
    ),
    'next_cursor',
    (
      select case when n.id is null then null else jsonb_build_object('collected_at', n.collected_at, 'id', n.id) end
      from next_row n
    ),
    'credit',
    credit
  )
  into result;

  return result;
end;
$$;
