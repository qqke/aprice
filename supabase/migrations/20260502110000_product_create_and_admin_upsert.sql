create or replace function public.create_product(payload jsonb)
returns public.products
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.products;
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

  if exists (
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
    description
  )
  values (
    target_id,
    target_barcode,
    coalesce(payload->>'name', ''),
    coalesce(payload->>'brand', ''),
    coalesce(payload->>'pack', ''),
    coalesce(payload->>'category', ''),
    coalesce(nullif(payload->>'tone', ''), 'sunset'),
    coalesce(payload->>'description', '')
  )
  returning * into result;

  return result;
end;
$$;

create or replace function public.admin_upsert_product(payload jsonb)
returns public.products
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.products;
  target_id text;
  target_barcode text;
begin
  perform public.require_admin_user();

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
    description
  )
  values (
    target_id,
    target_barcode,
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
