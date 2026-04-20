create policy "products authenticated insert" on public.products for insert with check (auth.uid() is not null);

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

create or replace function public.create_product(payload jsonb)
returns public.products
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.products;
begin
  perform public.require_authenticated_user();

  if coalesce(payload->>'barcode', '') = '' then
    raise exception 'barcode is required';
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
    coalesce(nullif(payload->>'id', ''), nullif(payload->>'barcode', '')),
    coalesce(payload->>'barcode', ''),
    coalesce(payload->>'name', ''),
    coalesce(payload->>'brand', ''),
    coalesce(payload->>'pack', ''),
    coalesce(payload->>'category', ''),
    coalesce(nullif(payload->>'tone', ''), 'sunset'),
    coalesce(payload->>'description', '')
  )
  returning * into result;

  return result;
exception
  when unique_violation then
    raise exception 'product already exists';
end;
$$;

create or replace function public.admin_upsert_product(payload jsonb)
returns public.products
language sql
security definer
set search_path = public
as $$
  select * from public.create_product(payload);
$$;
