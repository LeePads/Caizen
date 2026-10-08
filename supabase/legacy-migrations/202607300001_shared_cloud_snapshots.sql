-- Shared Caizen snapshot backup schema for the Next.js website and Capacitor Android app.
-- Apply after creating the Supabase project. This migration is repeatable.

create extension if not exists pgcrypto;

create table if not exists public.user_backups (
  backup_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_ids text[] not null default '{}',
  data jsonb not null,
  schema_version integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_backups
  add column if not exists backup_id uuid default gen_random_uuid(),
  add column if not exists profile_ids text[] not null default '{}',
  add column if not exists schema_version integer not null default 1,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.user_backups
set backup_id = gen_random_uuid()
where backup_id is null;

alter table public.user_backups
  alter column backup_id set default gen_random_uuid(),
  alter column backup_id set not null;

create unique index if not exists user_backups_backup_id_idx
  on public.user_backups (backup_id);

create unique index if not exists user_backups_user_id_idx
  on public.user_backups (user_id);

create index if not exists user_backups_updated_at_idx
  on public.user_backups (updated_at desc);

alter table public.user_backups
  drop constraint if exists user_backups_schema_version_check;
alter table public.user_backups
  add constraint user_backups_schema_version_check
  check (schema_version between 1 and 100);

alter table public.user_backups
  drop constraint if exists user_backups_data_size_check;
alter table public.user_backups
  add constraint user_backups_data_size_check
  check (octet_length(data::text) <= 10485760);

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

drop trigger if exists user_backups_set_updated_at on public.user_backups;
create trigger user_backups_set_updated_at
before update on public.user_backups
for each row execute function public.set_caizen_updated_at();

alter table public.user_backups enable row level security;
alter table public.user_backups force row level security;

drop policy if exists "Caizen users read own backup" on public.user_backups;
create policy "Caizen users read own backup"
on public.user_backups
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Caizen users create own backup" on public.user_backups;
create policy "Caizen users create own backup"
on public.user_backups
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Caizen users update own backup" on public.user_backups;
create policy "Caizen users update own backup"
on public.user_backups
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Caizen users delete own backup" on public.user_backups;
create policy "Caizen users delete own backup"
on public.user_backups
for delete
to authenticated
using (auth.uid() = user_id);

revoke all on public.user_backups from anon;
grant select, insert, update, delete on public.user_backups to authenticated;
