'use client';

import { useEffect, useState } from 'react';
import {
  ANDROID_APK_ASSET_NAME,
  LATEST_RELEASE_API_URL,
  PUBLIC_GITHUB_URL,
} from '@/lib/public-release';

type AndroidRelease =
  | { status: 'checking' }
  | { status: 'error' }
  | { status: 'unavailable'; reason: 'no-release' | 'no-apk' }
  | { status: 'available'; url: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function useAndroidRelease(): AndroidRelease {
  const [release, setRelease] = useState<AndroidRelease>({ status: 'checking' });

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);

    void (async () => {
      // This unauthenticated endpoint exposes only the public repository's
      // latest stable release. No build-time token or bundled APK is needed.
      const response = await fetch(LATEST_RELEASE_API_URL, {
        headers: { Accept: 'application/vnd.github+json' },
        credentials: 'omit',
        cache: 'no-store',
        signal: controller.signal,
      });
      if (response.status === 404) {
        if (active) setRelease({ status: 'unavailable', reason: 'no-release' });
        return;
      }
      if (!response.ok) throw new Error('Release lookup failed');

      const data: unknown = await response.json();
      if (!isRecord(data) || data.draft !== false || data.prerelease !== false ||
        typeof data.published_at !== 'string' || !data.published_at || !Array.isArray(data.assets)) {
        throw new Error('Release metadata is invalid');
      }
      const asset = data.assets.find((value: unknown) => isRecord(value) &&
        value.name === ANDROID_APK_ASSET_NAME && value.state === 'uploaded' &&
        typeof value.size === 'number' && value.size > 0);
      if (!isRecord(asset)) {
        if (active) setRelease({ status: 'unavailable', reason: 'no-apk' });
        return;
      }
      if (typeof asset.browser_download_url !== 'string') throw new Error('APK URL is missing');
      const url = new URL(asset.browser_download_url);
      if (url.origin !== 'https://github.com' || url.username || url.password ||
        !url.href.startsWith(`${PUBLIC_GITHUB_URL}/releases/download/`) ||
        !url.pathname.endsWith(`/${ANDROID_APK_ASSET_NAME}`) || url.search || url.hash) {
        throw new Error('APK URL is invalid');
      }
      if (active) setRelease({ status: 'available', url: url.href });
    })().catch(() => {
      if (active) setRelease({ status: 'error' });
    }).finally(() => window.clearTimeout(timeout));

    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  return release;
}
