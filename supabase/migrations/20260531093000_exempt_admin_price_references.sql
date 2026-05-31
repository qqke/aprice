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

  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text, 0));

  if public.is_admin_user() then
    return jsonb_build_object(
      'balance', public.credit_balance(target_user_id),
      'free_remaining', greatest(0, free_limit - (select count(*)::integer from public.price_reference_logs where user_id = target_user_id and reference_date = current_date)),
      'charged_points', 0,
      'already_referenced', false,
      'admin_exempt', true,
      'settings', public.fetch_app_settings()
    );
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
