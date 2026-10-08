-- Per-profile structured backups and private media metadata for Caizen.
-- IndexedDB remains the live source of truth; these tables are backup/restore only.

create table public.caizen_profile_backups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id text not null,
  schema_version integer not null default 1,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint caizen_profile_backups_user_profile_key unique (user_id, profile_id),
  constraint caizen_profile_backups_schema_version_check
    check (schema_version between 1 and 100),
  constraint caizen_profile_backups_data_object_check
    check (jsonb_typeof(data) = 'object')
);

create index caizen_profile_backups_profile_id_idx
  on public.caizen_profile_backups (profile_id);

create index caizen_profile_backups_user_updated_at_idx
  on public.caizen_profile_backups (user_id, updated_at desc);

drop trigger if exists caizen_profile_backups_set_updated_at
  on public.caizen_profile_backups;

create or replace function public.set_caizen_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger caizen_profile_backups_set_updated_at
before update on public.caizen_profile_backups
for each row execute function public.set_caizen_updated_at();

alter table public.caizen_profile_backups enable row level security;
alter table public.caizen_profile_backups force row level security;

create policy "Caizen users read own profile backups"
on public.caizen_profile_backups
for select
to authenticated
using (auth.uid() = user_id);

create policy "Caizen users create own profile backups"
on public.caizen_profile_backups
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Caizen users update own profile backups"
on public.caizen_profile_backups
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Caizen users delete own profile backups"
on public.caizen_profile_backups
for delete
to authenticated
using (auth.uid() = user_id);

revoke all on public.caizen_profile_backups from anon;
grant select, insert, update, delete
  on public.caizen_profile_backups to authenticated;

create table public.caizen_media_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id text not null,
  record_type text not null,
  record_id text not null,
  role text not null,
  storage_path text not null unique,
  original_name text not null,
  mime_type text not null,
  size_bytes bigint not null,
  checksum text,
  width integer,
  height integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint caizen_media_assets_size_bytes_check check (size_bytes >= 0),
  constraint caizen_media_assets_width_check check (width is null or width > 0),
  constraint caizen_media_assets_height_check check (height is null or height > 0)
);

create index caizen_media_assets_user_profile_idx
  on public.caizen_media_assets (user_id, profile_id);

create index caizen_media_assets_record_idx
  on public.caizen_media_assets (user_id, profile_id, record_type, record_id);

create index caizen_media_assets_active_profile_idx
  on public.caizen_media_assets (user_id, profile_id)
  where deleted_at is null;

create index caizen_media_assets_deleted_at_idx
  on public.caizen_media_assets (deleted_at)
  where deleted_at is not null;

drop trigger if exists caizen_media_assets_set_updated_at
  on public.caizen_media_assets;
create trigger caizen_media_assets_set_updated_at
before update on public.caizen_media_assets
for each row execute function public.set_caizen_updated_at();

alter table public.caizen_media_assets enable row level security;
alter table public.caizen_media_assets force row level security;

create policy "Caizen users read own media assets"
on public.caizen_media_assets
for select
to authenticated
using (auth.uid() = user_id);

create policy "Caizen users create own media assets"
on public.caizen_media_assets
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Caizen users update own media assets"
on public.caizen_media_assets
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Caizen users delete own media assets"
on public.caizen_media_assets
for delete
to authenticated
using (auth.uid() = user_id);

revoke all on public.caizen_media_assets from anon;
grant select, insert, update, delete
  on public.caizen_media_assets to authenticated;

create policy "Caizen users read own private objects"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'caizen-private'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Caizen users upload own private objects"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'caizen-private'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Caizen users update own private objects"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'caizen-private'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'caizen-private'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Caizen users delete own private objects"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'caizen-private'
  and (storage.foldername(name))[1] = auth.uid()::text
);
