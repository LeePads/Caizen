import { afterEach, describe, expect, it, vi } from 'vitest';

describe('Supabase public client configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('keeps a missing Cloud configuration controlled and lazy', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    const cloud = await import('@/lib/supabase');

    expect(cloud.isCloudSyncConfigured).toBe(false);
    expect(() => cloud.getSupabaseClient()).toThrow(
      'Cloud is not available in this build.',
    );
  });

  it('initializes a configured public client without a network request', async () => {
    vi.stubEnv(
      'NEXT_PUBLIC_SUPABASE_URL',
      'https://example-project.supabase.co',
    );
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'public-anonymous-test-key');
    const cloud = await import('@/lib/supabase');

    expect(cloud.isCloudSyncConfigured).toBe(true);
    expect(() => cloud.getSupabaseClient()).not.toThrow();
    expect(cloud.SUPABASE_ANDROID_REDIRECT_URL).toBe(
      'caizen://auth/callback',
    );
    expect(cloud.SUPABASE_WEB_CALLBACK_PATH).toBe('/auth/callback');
  });

  it('does not accept alternate or privileged client key names', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example-project.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'not-the-supported-key');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'never-use-this-in-a-client');
    const cloud = await import('@/lib/supabase');
    expect(cloud.isCloudSyncConfigured).toBe(false);
  });
});
