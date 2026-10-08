-- Notify active Caizen devices when a profile snapshot changes.
-- RLS on caizen_profile_backups remains the authorization boundary.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'caizen_profile_backups'
  ) then
    alter publication supabase_realtime
      add table public.caizen_profile_backups;
  end if;
end
$$;

-- DELETE notifications need the profile/user columns so profile-scoped
-- clients can reconcile a removed snapshot instead of silently missing it.
alter table if exists public.caizen_profile_backups replica identity full;
