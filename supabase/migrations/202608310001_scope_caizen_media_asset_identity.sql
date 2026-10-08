-- Scope Cloud media identity to the owning account while preserving each
-- existing Caizen media asset ID, Storage path, and object.

begin;

do $$
begin
  if exists (
    select 1
    from public.caizen_media_assets
    group by user_id, id
    having count(*) > 1
  ) then
    raise exception 'Duplicate (user_id, id) media identities exist';
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where contype = 'f'
      and confrelid = 'public.caizen_media_assets'::regclass
  ) then
    raise exception 'Foreign keys reference public.caizen_media_assets; migrate them before changing its primary key';
  end if;
end
$$;

alter table public.caizen_media_assets
  drop constraint caizen_media_assets_pkey;

alter table public.caizen_media_assets
  add constraint caizen_media_assets_pkey
  primary key (user_id, id);

commit;
