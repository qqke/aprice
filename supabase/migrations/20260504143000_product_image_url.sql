alter table public.products
  add column if not exists image_url text not null default '';

alter table public.products
  drop constraint if exists products_image_url_check;

alter table public.products
  add constraint products_image_url_check
  check (image_url = '' or image_url ~* '^https?://');

do $$
begin
  if to_regclass('public.product_submissions') is not null then
    execute $sql$
      alter table public.product_submissions
        add column if not exists image_url text not null default ''
    $sql$;

    execute $sql$
      alter table public.product_submissions
        drop constraint if exists product_submissions_image_url_check
    $sql$;

    execute $sql$
      alter table public.product_submissions
        add constraint product_submissions_image_url_check
        check (image_url = '' or image_url ~* '^https?://')
    $sql$;
  end if;
end
$$;

create or replace function public.create_product(payload jsonb)
returns public.products
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

do $$
begin
  if to_regclass('public.product_submissions') is not null then
    execute $sql$
      create or replace function public.submit_product_submission(payload jsonb)
      returns public.product_submissions
      language plpgsql
      security definer
      set search_path = public
      as $fn$
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
      $fn$
    $sql$;

    execute $sql$
      create or replace function public.admin_review_product_submission(payload jsonb)
      returns public.product_submissions
      language plpgsql
      security definer
      set search_path = public
      as $fn$
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
      $fn$
    $sql$;
  end if;
end
$$;

create or replace function public.admin_upsert_product(payload jsonb)
returns public.products
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
