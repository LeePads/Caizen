import { AppLauncher } from '@capacitor/app-launcher';
import { Browser } from '@capacitor/browser';
import { isNativeApp } from '../platform';

const SAFE_SCHEMES = new Set(['https:', 'http:', 'mailto:', 'tel:']);

// OAuth must stay in a browser tab: its verifier belongs to the WebView.
// Ordinary external links retain their AppLauncher behavior below.
export async function openCloudAuthBrowser(url: string, onReturn: () => void): Promise<() => void> {
  if (new URL(url).protocol !== 'https:') throw new Error('Unsupported auth URL.');
  const listener = await Browser.addListener('browserFinished', onReturn);
  try {
    await Browser.open({ url });
    return () => { void listener.remove(); };
  } catch (error) {
    await listener.remove();
    throw error;
  }
}

export async function closeCloudAuthBrowser(): Promise<void> {
  if (isNativeApp()) await Browser.close().catch(() => undefined);
}

export const isSafeExternalUrl = (value: string) => {
  try {
    return SAFE_SCHEMES.has(new URL(value).protocol);
  } catch {
    return false;
  }
};

/** Normalizes a user-entered website without allowing insecure or WebView-local schemes. */
export const normalizeExternalWebUrl = (value?: string | null): string | null => {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== 'https:' || !parsed.hostname) return null;
    return parsed.href;
  } catch {
    return null;
  }
};

/**
 * Single adapter for every "open this link externally" action in the app.
 *
 * On Android, https/http links go through AppLauncher.openUrl, which issues
 * an ACTION_VIEW intent - the OS resolves it to an installed app (e.g. the
 * OneDrive app for onedrive.live.com links) when one can handle it, exactly
 * like tapping the link outside the app would. This must never fall through
 * to a plain WebView navigation, which would trap the user inside Caizen's
 * webview with no native chrome and no way back to the linked app/site.
 *
 * If no app can handle the link (or the intent fails for any reason), it
 * falls back to the in-app browser tab (Browser.open) rather than failing
 * silently or navigating the WebView itself.
 */
export async function openExternalLink(url: string): Promise<void> {
  if (!isSafeExternalUrl(url)) throw new Error('This link type is not supported.');
  const protocol = new URL(url).protocol;

  if (isNativeApp()) {
    try {
      const result = await AppLauncher.openUrl({ url });
      if (result?.completed) return;
    } catch {
      // HTTP links can still use the in-app browser below.
    }

    if (protocol === 'mailto:' || protocol === 'tel:') {
      throw new Error('No app is available to open this link.');
    }

    try {
      await Browser.open({ url, presentationStyle: 'popover' });
      return;
    } catch {
      throw new Error('Caizen could not open this link.');
    }
  }

  window.open(url, '_blank', 'noopener,noreferrer');
}
