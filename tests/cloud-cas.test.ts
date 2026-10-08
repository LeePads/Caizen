import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getSupabaseClient } = vi.hoisted(() => ({
  getSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  getSupabaseClient,
}));

import {
  CloudBackupBaselineChangedError,
  upsertCaizenProfileBackup,
} from '@/lib/caizen-cloud-repository';

describe('Cloud snapshot compare-and-swap writes', () => {
  beforeEach(() => {
    getSupabaseClient.mockReset();
  });

  it('rejects an insert when another device created the first snapshot first', async () => {
    const insert = vi.fn().mockReturnValue({
      select: () => ({
        single: () => Promise.resolve({
          data: null,
          error: { code: '23505', message: 'duplicate key' },
        }),
      }),
    });
    getSupabaseClient.mockReturnValue({
      auth: {
        getUser: () => Promise.resolve({ data: { user: { id: 'user-1' } }, error: null }),
      },
      from: () => ({ insert }),
    });

    await expect(upsertCaizenProfileBackup({
      profileId: 'profile-1',
      data: { profiles: [] },
      expectedUpdatedAt: null,
    })).rejects.toBeInstanceOf(CloudBackupBaselineChangedError);
  });

  it('uses the observed timestamp for an existing snapshot update', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: 'backup-1',
        user_id: 'user-1',
        profile_id: 'profile-1',
        schema_version: 1,
        data: { profiles: [] },
        created_at: '2026-08-09T00:00:00.000Z',
        updated_at: '2026-08-09T00:01:00.000Z',
      },
      error: null,
    });
    const update = vi.fn().mockReturnThis();
    const eq = vi.fn().mockReturnThis();
    const select = vi.fn().mockReturnValue({ maybeSingle });
    getSupabaseClient.mockReturnValue({
      auth: {
        getUser: () => Promise.resolve({ data: { user: { id: 'user-1' } }, error: null }),
      },
      from: () => ({ update, eq, select }),
    });

    await upsertCaizenProfileBackup({
      profileId: 'profile-1',
      data: { profiles: [] },
      expectedUpdatedAt: '2026-08-09T00:00:00.000Z',
    });

    expect(update).toHaveBeenCalledWith({
      schema_version: 1,
      data: { profiles: [] },
    });
    expect(eq).toHaveBeenNthCalledWith(1, 'user_id', 'user-1');
    expect(eq).toHaveBeenNthCalledWith(2, 'profile_id', 'profile-1');
    expect(eq).toHaveBeenNthCalledWith(3, 'updated_at', '2026-08-09T00:00:00.000Z');
  });
});
