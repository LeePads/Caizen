import { Preferences } from '@capacitor/preferences';

export async function getNativePreference(key: string): Promise<string | null> {
  return (await Preferences.get({ key })).value;
}

export async function setNativePreference(key: string, value: string): Promise<void> {
  await Preferences.set({ key, value });
}

export async function removeNativePreference(key: string): Promise<void> {
  await Preferences.remove({ key });
}

const PRIVACY_SCREEN_KEY = 'privacy-screen-enabled';

export async function getPrivacyScreenEnabled(): Promise<boolean> {
  return (await getNativePreference(PRIVACY_SCREEN_KEY)) === 'true';
}

export async function setPrivacyScreenEnabled(enabled: boolean): Promise<void> {
  await setNativePreference(PRIVACY_SCREEN_KEY, String(enabled));
}

