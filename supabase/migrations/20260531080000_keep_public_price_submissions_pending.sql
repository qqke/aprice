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

  return result;
end;
$$;

grant execute on function public.submit_store_price(jsonb) to authenticated;
