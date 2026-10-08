import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Preferences } from '@capacitor/preferences';
import { isNativeApp } from '../platform';

const HAPTICS_KEY = 'haptics-enabled';

export async function setHapticsEnabled(enabled: boolean) {
  await Preferences.set({ key: HAPTICS_KEY, value: String(enabled) });
}

export async function getHapticsEnabled() {
  const { value } = await Preferences.get({ key: HAPTICS_KEY });
  return value !== 'false';
}

export async function hapticSuccess() {
  if (isNativeApp() && (await getHapticsEnabled())) {
    await Haptics.notification({ type: NotificationType.Success });
  }
}

export async function hapticValidationError() {
  if (isNativeApp() && (await getHapticsEnabled())) {
    await Haptics.notification({ type: NotificationType.Error });
  }
}

export async function hapticSelection() {
  if (isNativeApp() && (await getHapticsEnabled())) {
    await Haptics.impact({ style: ImpactStyle.Light });
  }
}
