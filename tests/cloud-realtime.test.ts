import { describe, expect, it, vi } from 'vitest';

const { createClient } = vi.hoisted(() => ({
  createClient: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient,
}));

describe('Cloud Realtime profile subscription', () => {
  it('forwards scoped delete payloads even when replica identity omits user fields', async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-key';

    let onChange: ((payload: any) => void) | undefined;
    const channel = {
      on: vi.fn((_type: string, _filter: unknown, handler: (payload: any) => void) => {
        onChange = handler;
        return channel;
      }),
      subscribe: vi.fn((handler: (status: string) => void) => {
        handler('SUBSCRIBED');
        return channel;
      }),
    };
    const client = {
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(),
    };
    createClient.mockReturnValue(client);

    const { subscribeToCloudProfileBackup } = await import('@/lib/supabase');
    const received = vi.fn();
    const cleanup = subscribeToCloudProfileBackup('user-1', 'profile-1', received);

    onChange?.({ eventType: 'DELETE', new: {}, old: { id: 'backup-1' } });
    onChange?.({
      eventType: 'UPDATE',
      new: { user_id: 'other-user', profile_id: 'profile-1' },
      old: {},
    });

    expect(received).toHaveBeenCalledTimes(1);
    expect(received).toHaveBeenCalledWith({
      eventType: 'DELETE',
      record: { id: 'backup-1' },
    });
    cleanup();
    expect(client.removeChannel).toHaveBeenCalledWith(channel);
  });
});
