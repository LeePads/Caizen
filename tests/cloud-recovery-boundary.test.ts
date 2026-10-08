import { describe, expect, it, vi } from 'vitest';

const { getSupabaseClient } = vi.hoisted(() => ({
  getSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({ getSupabaseClient }));

import {
  listCaizenMediaAssetMetadata,
  listCaizenProfileBackupMetadata,
} from '@/lib/caizen-cloud-repository';

describe('Cloud recovery metadata query boundary', () => {
  it('does not select structured snapshot data or private media identity', async () => {
    const select = vi.fn().mockReturnThis();
    const eq = vi.fn().mockReturnThis();
    const order = vi.fn().mockReturnThis();
    const range = vi.fn().mockResolvedValue({ data: [], error: null, count: 0 });
    const is = vi.fn().mockReturnThis();
    getSupabaseClient.mockReturnValue({
      auth: {
        getUser: () => Promise.resolve({ data: { user: { id: 'user-1' } }, error: null }),
      },
      from: () => ({ select, eq, order, is, range }),
    });

    await listCaizenProfileBackupMetadata();
    await listCaizenMediaAssetMetadata();

    expect(select).toHaveBeenNthCalledWith(
      1,
      'id, user_id, profile_id, schema_version, created_at, updated_at',
      { count: 'exact' },
    );
    expect(select).toHaveBeenNthCalledWith(
      2,
      'profile_id, size_bytes',
      { count: 'exact' },
    );
    expect(select.mock.calls.flat().join(' ')).not.toContain('data');
    expect(select.mock.calls.flat().join(' ')).not.toContain('storage_path');
    expect(eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(is).toHaveBeenCalledWith('deleted_at', null);
  });
});
