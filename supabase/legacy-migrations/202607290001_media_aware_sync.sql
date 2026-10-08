-- Optional foundation for media-aware sync. Existing user_backups snapshot backup remains unchanged.
create table if not exists public.caizen_media (
  user_id uuid not null references auth.users(id) on delete cascade,
  asset_id text not null,
  profile_id text not null,
  owner_type text not null,
  owner_id text not null,
  role text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  checksum text,
  remote_path text not null,
  thumbnail_remote_path text,
  revision bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, asset_id)
);

alter table public.caizen_media enable row level security;
alter table public.caizen_media force row level security;

drop policy if exists "Users manage their Caizen media metadata" on public.caizen_media;
drop policy if exists "Users read their Caizen media metadata" on public.caizen_media;
create policy "Users read their Caizen media metadata"
on public.caizen_media
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users create their Caizen media metadata" on public.caizen_media;
create policy "Users create their Caizen media metadata"
on public.caizen_media
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users update their Caizen media metadata" on public.caizen_media;
create policy "Users update their Caizen media metadata"
on public.caizen_media
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users delete their Caizen media metadata" on public.caizen_media;
create policy "Users delete their Caizen media metadata"
on public.caizen_media
for delete
to authenticated
using (auth.uid() = user_id);

revoke all on public.caizen_media from anon;
grant select, insert, update, delete on public.caizen_media to authenticated;

insert into storage.buckets (id, name, public, file_size_limit)
values ('caizen-media', 'caizen-media', false, 26214400)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;

drop policy if exists "Users read their Caizen media objects" on storage.objects;
create policy "Users read their Caizen media objects"
on storage.objects for select
to authenticated
using (
  bucket_id = 'caizen-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users upload their Caizen media objects" on storage.objects;
create policy "Users upload their Caizen media objects"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'caizen-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users update their Caizen media objects" on storage.objects;
create policy "Users update their Caizen media objects"
on storage.objects for update
to authenticated
using (
  bucket_id = 'caizen-media'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'caizen-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Users delete their Caizen media objects" on storage.objects;
create policy "Users delete their Caizen media objects"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'caizen-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);
