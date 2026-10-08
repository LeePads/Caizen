-- Keep Cloud metadata inside the same user/profile object boundary enforced
-- by the application and the private Storage bucket policies. NOT VALID keeps
-- deployment safe for legacy rows while enforcing these rules for new writes.

alter table public.caizen_profile_backups
  add constraint caizen_profile_backups_profile_id_path_segment_check
  check (
    profile_id <> ''
    and position('/' in profile_id) = 0
    and strpos(profile_id, chr(92)) = 0
  ) not valid;

alter table public.caizen_profile_backups
  add constraint caizen_profile_backups_data_size_check
  check (octet_length(data::text) <= 10485760) not valid;

alter table public.caizen_media_assets
  add constraint caizen_media_assets_profile_id_path_segment_check
  check (
    profile_id <> ''
    and position('/' in profile_id) = 0
    and strpos(profile_id, chr(92)) = 0
  ) not valid;

alter table public.caizen_media_assets
  add constraint caizen_media_assets_storage_owner_check
  check (
    storage_path ~ '^[^/]+/[^/]+/[^/]+/[^/]+$'
    and split_part(storage_path, '/', 1) = user_id::text
    and split_part(storage_path, '/', 2) = profile_id
    and split_part(storage_path, '/', 3) = id::text
  ) not valid;

alter table public.caizen_media_assets
  add constraint caizen_media_assets_bucket_size_check
  check (size_bytes <= 26214400) not valid;
