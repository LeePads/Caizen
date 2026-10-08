-- The canonical backup migration creates policies for this bucket, but the
-- bucket itself must also exist in deployed Supabase projects.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'caizen-private',
  'caizen-private',
  false,
  26214400,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'application/pdf'
  ]::text[]
)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
