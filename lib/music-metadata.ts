import { detectMusicProvider } from './music-links';
import { isNativeApp } from './platform';

const IS_CAPACITOR_BUILD =
  process.env.NEXT_PUBLIC_CAPACITOR_BUILD === '1';
const CONFIGURED_WEB_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL || '').trim();
function resolveWebOrigin(value: string): string | null {
  if (!value) return null;

  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== 'https:' ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password
    ) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

const CAIZEN_WEB_ORIGIN = resolveWebOrigin(CONFIGURED_WEB_ORIGIN);

export type MusicMetadata = {
  provider: 'youtube' | 'spotify';
  title: string;
  artist: string;
  image: string;
  canonicalUrl: string;
  partial: boolean;
  message?: string;
};

export function supportsMusicMetadata(value: string) {
  const provider = detectMusicProvider(value);
  return provider === 'youtube' || provider === 'spotify';
}

export async function fetchMusicMetadata(
  url: string,
  signal?: AbortSignal,
): Promise<MusicMetadata> {
  if (signal?.aborted) {
    throw new Error('Music detail lookup was cancelled.');
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Music details are unavailable while this device is offline. You can still enter them manually.');
  }

  const native = IS_CAPACITOR_BUILD || isNativeApp();
  if (native && !CAIZEN_WEB_ORIGIN) {
    throw new Error(
      'Online music detail lookup is not configured for this Android build. You can still enter details manually.',
    );
  }

  const endpoint = native
    ? `${CAIZEN_WEB_ORIGIN}/api/music/metadata`
    : '/api/music/metadata';
  const controller = new AbortController();
  let timedOut = false;
  const timeout = globalThis.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 10_000);
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener('abort', abortFromCaller, { once: true });

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: controller.signal,
    });
  } catch {
    if (timedOut) {
      throw new Error('Music detail lookup timed out. You can continue with manual details.');
    }
    if (signal?.aborted) throw new Error('Music detail lookup was cancelled.');
    throw new Error('Caizen could not reach the music detail service. Manual entry is still available.');
  } finally {
    globalThis.clearTimeout(timeout);
    signal?.removeEventListener('abort', abortFromCaller);
  }

  const body = (await response.json().catch(() => null)) as
    | (MusicMetadata & { error?: string })
    | null;

  if (!response.ok || !body) {
    throw new Error(body?.error || 'Could not read music details from this link.');
  }

  return body;
}

