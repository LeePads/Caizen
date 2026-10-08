import { loadAppState, saveAppState, type StoredAppState } from './app-repository';
import { getStoreValue, putStoreValue } from './database';
import {
  LEGACY_RECOVERY_KEY,
  LEGACY_STORAGE_KEY,
  MIGRATION_META_KEY,
  STORES,
} from './schema';

type MigrationResult = {
  state: StoredAppState | null;
  migrated: boolean;
};

const parseLegacy = (raw: string): StoredAppState => {
  const parsed = JSON.parse(raw) as Partial<StoredAppState>;
  if (!parsed || !Array.isArray(parsed.profiles)) {
    throw new Error('The legacy Caizen data does not contain a profiles array.');
  }
  const profiles = parsed.profiles.filter(
    (profile): profile is StoredAppState['profiles'][number] =>
      Boolean(profile && typeof profile === 'object' && typeof profile.id === 'string'),
  );
  if (profiles.length !== parsed.profiles.length) {
    console.warn('Caizen skipped one or more invalid legacy profiles during migration.');
  }
  if (profiles.length === 0 && parsed.profiles.length > 0) {
    throw new Error('No valid profiles could be recovered from the legacy data.');
  }
  return {
    profiles,
    currentProfileId:
      typeof parsed.currentProfileId === 'string' ? parsed.currentProfileId : profiles[0]?.id ?? '',
  };
};

export async function initializeAppStorage(): Promise<MigrationResult> {
  const existing = await loadAppState();
  if (existing) return { state: existing, migrated: false };

  const completed = await getStoreValue<{ key: string; completedAt: string }>(
    STORES.meta,
    MIGRATION_META_KEY,
  );
  const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!raw || completed) return { state: null, migrated: false };

  if (!localStorage.getItem(LEGACY_RECOVERY_KEY)) {
    localStorage.setItem(LEGACY_RECOVERY_KEY, raw);
  }

  const legacyState = parseLegacy(raw);
  await saveAppState(legacyState);
  const verified = await loadAppState();
  const expectedIds = new Set(legacyState.profiles.map((profile) => profile.id));
  if (
    !verified ||
    verified.profiles.length !== legacyState.profiles.length ||
    verified.profiles.some((profile) => !expectedIds.has(profile.id))
  ) {
    throw new Error('Legacy migration verification failed. The original data was left untouched.');
  }

  await putStoreValue(STORES.meta, {
    key: MIGRATION_META_KEY,
    completedAt: new Date().toISOString(),
    legacyKey: LEGACY_STORAGE_KEY,
    recoveryKey: LEGACY_RECOVERY_KEY,
  });
  return { state: verified, migrated: true };
}
