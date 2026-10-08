import {
  createClient,
  type RealtimeChannel,
  type SupabaseClient,
} from '@supabase/supabase-js';
import { isNativeApp } from './platform';

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let supabaseClient: SupabaseClient | null = null;

export const SUPABASE_ANDROID_REDIRECT_URL =
  'caizen://auth/callback';
export const SUPABASE_WEB_CALLBACK_PATH =
  '/auth/callback';

export const isCloudSyncConfigured =
  Boolean(supabaseUrl && supabaseAnonKey);

export const getCloudAuthRedirectUrl = (googleAttemptId?: string) => {
  if (typeof window === 'undefined') return undefined;

  const destination = isNativeApp()
    ? SUPABASE_ANDROID_REDIRECT_URL
    : `${window.location.origin}${SUPABASE_WEB_CALLBACK_PATH}`;
  const url = new URL(destination);
  if (googleAttemptId) {
    url.searchParams.set('intent', 'google');
    url.searchParams.set('attempt', googleAttemptId);
  }
  return url.href;
};

export const getSupabaseClient = () => {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Cloud is not available in this build.'
    );
  }

  supabaseClient ??= createClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      auth: {
        autoRefreshToken: true,
        // Web and native callbacks explicitly exchange PKCE codes. Automatic
        // detection would consume the same single-use code before that handler.
        detectSessionInUrl: false,
        flowType: 'pkce',
        persistSession: true,
      },
    },
  );

  return supabaseClient;
};

/**
 * Subscribe to changes for one profile's structured Cloud snapshot. RLS still
 * owns authorization; the user ID check prevents an incorrectly configured
 * Realtime filter from dispatching another user's payload to the coordinator.
 */
export const subscribeToCloudProfileBackup = (
  userId: string,
  profileId: string,
  onChange: (payload: { eventType: string; record: Record<string, unknown> | null }) => void,
  onStatus?: (status: string) => void,
): (() => void) => {
  const channel: RealtimeChannel = getSupabaseClient()
    .channel(`caizen-cloud-profile:${userId}:${profileId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'caizen_profile_backups',
        filter: `profile_id=eq.${profileId}`,
      },
      payload => {
        const record = (payload.new && Object.keys(payload.new).length
          ? payload.new
          : payload.old) as Record<string, unknown> | null;
        // DELETE payloads may contain only the table primary key unless the
        // project enables FULL replica identity. In that case the profile
        // filter/channel is the available scope, so do not discard the event
        // merely because user_id is absent.
        if (
          record &&
          typeof record.user_id === 'string' &&
          record.user_id !== userId
        ) return;
        if (
          record &&
          typeof record.profile_id === 'string' &&
          record.profile_id !== profileId
        ) return;
        onChange({ eventType: payload.eventType, record });
      },
    )
    .subscribe(status => onStatus?.(status));

  return () => {
    void getSupabaseClient().removeChannel(channel);
  };
};
