import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = (name: string) => readFileSync(
  resolve(process.cwd(), 'supabase', 'migrations', name),
  'utf8',
).toLowerCase();

describe('Supabase Cloud privacy contract', () => {
  it('keeps backup rows and media metadata owner-only', () => {
    const sql = migration('202608050001_caizen_profile_backup_foundation.sql');

    expect(sql).toContain('alter table public.caizen_profile_backups force row level security');
    expect(sql).toContain('alter table public.caizen_media_assets force row level security');
    expect(sql.match(/auth\.uid\(\) = user_id/g)).toHaveLength(10);
    expect(sql).toContain('revoke all on public.caizen_profile_backups from anon');
    expect(sql).toContain('revoke all on public.caizen_media_assets from anon');
  });

  it('keeps private objects account-scoped and the bucket non-public', () => {
    const foundation = migration('202608050001_caizen_profile_backup_foundation.sql');
    const bucket = migration('202608090001_ensure_caizen_private_bucket.sql');

    expect(foundation.match(/\(storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/g))
      .toHaveLength(5);
    expect(bucket).toMatch(/'caizen-private',\s*'caizen-private',\s*false/);
  });

  it('binds media metadata paths to their user, profile, and asset', () => {
    const sql = migration('202608090003_harden_caizen_cloud_boundaries.sql');

    expect(sql).toContain("split_part(storage_path, '/', 1) = user_id::text");
    expect(sql).toContain("split_part(storage_path, '/', 2) = profile_id");
    expect(sql).toContain("split_part(storage_path, '/', 3) = id::text");
    expect(sql).toContain('check (size_bytes <= 26214400)');
  });

  it('scopes media identity to the authenticated account without changing asset IDs', () => {
    const sql = migration('202608310001_scope_caizen_media_asset_identity.sql');

    expect(sql).toContain('group by user_id, id');
    expect(sql).toContain("having count(*) > 1");
    expect(sql).toContain("confrelid = 'public.caizen_media_assets'::regclass");
    expect(sql).toContain('drop constraint caizen_media_assets_pkey');
    expect(sql).toContain('primary key (user_id, id)');
    expect(sql).not.toContain('primary key (id)');
  });
});
