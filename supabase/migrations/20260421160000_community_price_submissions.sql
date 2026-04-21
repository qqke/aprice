create or replace function public.is_admin_user()
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

create or replace function public.require_admin_user()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin_user() then
    raise exception 'admin privileges required';
  end if;
end;
$$;

create or replace function public.require_authenticated_user()
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

alter table public.user_price_logs
  add column if not exists share_to_public boolean not null default false,
  add column if not exists review_status text not null default 'private',
  add column if not exists evidence_url text not null default '',
  add column if not exists confidence_score numeric not null default 0,
  add column if not exists review_note text not null default '',
  add column if not exists reviewed_at timestamptz,
  add column if not exists promoted_price_id uuid references public.prices(id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_price_logs_review_status_check'
      and conrelid = 'public.user_price_logs'::regclass
  ) then
    alter table public.user_price_logs
      add constraint user_price_logs_review_status_check
      check (review_status in ('private', 'pending', 'approved', 'rejected'));
  end if;
end;
$$;

create index if not exists user_price_logs_review_idx
  on public.user_price_logs (review_status, share_to_public, created_at desc);

drop policy if exists "logs admin read" on public.user_price_logs;
create policy "logs admin read" on public.user_price_logs
  for select using (public.is_admin_user());

drop policy if exists "logs admin update" on public.user_price_logs;
create policy "logs admin update" on public.user_price_logs
  for update using (public.is_admin_user()) with check (public.is_admin_user());

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
  perform public.require_authenticated_user();

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
  perform public.require_admin_user();

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
