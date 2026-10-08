import { useEffect, useRef, useState } from 'react';
import { getNativePreference, setNativePreference } from './native-preferences';

export type NotificationCategory =
  | 'tasks'
  | 'routines'
  | 'calendar'
  | 'deadlines'
  | 'health'
  | 'summary';

export interface NotificationSettings {
  masterEnabled: boolean;
  categories: Record<NotificationCategory, boolean>;
  dailySummaryTime: string; // HH:mm, local
  defaultLeadMinutes: number;
  quietHoursEnabled: boolean;
  quietHoursStart: string; // HH:mm, local
  quietHoursEnd: string; // HH:mm, local
  vibrationEnabled: boolean;
  privacySafePreviews: boolean;
}

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  masterEnabled: false,
  categories: {
    tasks: true,
    routines: true,
    calendar: true,
    deadlines: true,
    health: true,
    summary: false,
  },
  dailySummaryTime: '08:00',
  defaultLeadMinutes: 30,
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '07:00',
  vibrationEnabled: true,
  privacySafePreviews: true,
};

const STORAGE_KEY = 'caizen-notification-settings';

export function normalizeNotificationSettings(raw: unknown): NotificationSettings {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Partial<NotificationSettings>;
  return {
    ...DEFAULT_NOTIFICATION_SETTINGS,
    ...value,
    categories: {
      ...DEFAULT_NOTIFICATION_SETTINGS.categories,
      ...(value.categories || {}),
    },
  };
}

export async function loadNotificationSettings(): Promise<NotificationSettings> {
  try {
    const raw = await getNativePreference(STORAGE_KEY);
    if (!raw) return DEFAULT_NOTIFICATION_SETTINGS;
    return normalizeNotificationSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_NOTIFICATION_SETTINGS;
  }
}

export async function saveNotificationSettings(settings: NotificationSettings): Promise<void> {
  await setNativePreference(STORAGE_KEY, JSON.stringify(settings));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('caizen:notification-settings-changed', { detail: settings }),
    );
  }
}

/** Shifts a local time forward to clear quiet hours, if it falls inside the window. */
export function applyQuietHours(at: Date, settings: NotificationSettings): Date {
  if (!settings.quietHoursEnabled) return at;
  const [startH, startM] = settings.quietHoursStart.split(':').map(Number);
  const [endH, endM] = settings.quietHoursEnd.split(':').map(Number);
  if (Number.isNaN(startH) || Number.isNaN(endH)) return at;

  const minutesOfDay = at.getHours() * 60 + at.getMinutes();
  const start = startH * 60 + startM;
  const end = endH * 60 + endM;
  const inQuietHours = start <= end
    ? minutesOfDay >= start && minutesOfDay < end
    : minutesOfDay >= start || minutesOfDay < end;
  if (!inQuietHours) return at;

  const adjusted = new Date(at);
  adjusted.setHours(endH, endM, 0, 0);
  if (adjusted.getTime() <= at.getTime()) adjusted.setDate(adjusted.getDate() + 1);
  return adjusted;
}

export function useNotificationSettings() {
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const settingsRef = useRef(DEFAULT_NOTIFICATION_SETTINGS);
  const updateSequence = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void loadNotificationSettings().then((loadedSettings) => {
      if (!cancelled) {
        settingsRef.current = loadedSettings;
        setSettings(loadedSettings);
        setLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const update = async (updates: Partial<NotificationSettings>) => {
    const previous = settingsRef.current;
    const next = normalizeNotificationSettings({ ...previous, ...updates });
    const sequence = updateSequence.current + 1;
    updateSequence.current = sequence;
    settingsRef.current = next;
    setSettings(next);

    try {
      await saveNotificationSettings(next);
    } catch (error) {
      if (updateSequence.current === sequence) {
        settingsRef.current = previous;
        setSettings(previous);
      }
      throw error;
    }
  };

  return { settings, update, loaded };
}
