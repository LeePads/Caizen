import { afterEach, describe, expect, it } from 'vitest';
import { parseAndPrepareImport } from '@/lib/storage/import-integrity';
import { restoreDataOnlyImport } from '@/lib/storage/backup-repository';
import { loadAppState, saveAppState, type StoredAppState } from '@/lib/storage/app-repository';
import { resetCaizenDatabaseForTests } from '@/lib/storage/database';

/**
 * Regression test for "Import Preview succeeds (correct counts, no blocking
 * errors, Import enabled) but after pressing Import - in any of the three
 * modes, and surviving a full app restart - none of the imported data is
 * visible."
 *
 * Preview succeeding already proves parsing works. This test exercises the
 * remaining pipeline end to end: commit -> IndexedDB transaction -> a FRESH
 * loadAppState() read (simulating a full app restart, not in-memory React
 * state) -> exact collection counts, distinct dates, and active profile ID.
 */

const day = (month: number, dayOfMonth: number) => `2026-${String(month).padStart(2, '0')}-${String(dayOfMonth).padStart(2, '0')}`;

/** Mirrors the shape of a real website export: one profile, many collections. */
const realisticProfile = (id: string, name: string) => ({
  id,
  name,
  createdAt: '2024-01-01T08:00:00+08:00',
  wallets: [{ id: 'w-1', name: 'Cash', createdAt: '2024-01-01T08:00:00+08:00' }],
  transactions: [
    { id: 'tx-1', date: day(1, 5), amount: 100, updatedAt: '2026-01-05T02:00:00.000Z' },
    { id: 'tx-2', date: day(2, 14), amount: 250, updatedAt: '2026-02-14T02:00:00.000Z' },
    { id: 'tx-3', date: day(3, 21), amount: 75, updatedAt: '2026-03-21T02:00:00.000Z' },
  ],
  wishlistItems: [
    { id: 'wl-1', purchaseDate: day(1, 9), createdAt: '2026-01-09T02:00:00.000Z' },
    { id: 'wl-2', purchaseDate: day(4, 2), createdAt: '2026-04-02T02:00:00.000Z' },
  ],
  inventoryItems: [],
  journalEntries: [
    { id: 'j-1', date: day(5, 6), createdAt: '2026-05-06T22:00:00.000Z' },
  ],
  games: [],
  gameGuides: [],
  productivityItems: [],
  mediaItems: [],
  musicItems: [],
  workItems: [
    { id: 'wi-1', date: day(6, 11), dueDate: day(6, 18), createdAt: '2026-06-11T02:00:00.000Z' },
    { id: 'wi-2', date: day(7, 3), dueDate: day(7, 10), createdAt: '2026-07-03T02:00:00.000Z' },
  ],
  personalVaultItems: [],
  trashItems: [],
  skincareProducts: [],
  // "Routine definitions and completion history"
  dailyChecklistItems: [
    {
      id: 'routine-1',
      startDate: day(1, 1),
      createdAt: '2026-01-01T02:00:00.000Z',
      completionHistory: [{ date: day(1, 2) }, { date: day(1, 3) }, { date: day(2, 1) }],
    },
  ],
  // "Calendar records"
  importantDates: [
    { id: 'cal-1', date: day(8, 15), endDate: day(8, 16), createdAt: '2026-08-01T02:00:00.000Z' },
  ],
  supplements: [],
  balanceCheckIns: [],
  health: {
    weightEntries: [
      { id: 'we-1', date: day(1, 11), createdAt: '2026-01-11T02:00:00.000Z' },
      { id: 'we-2', date: day(4, 22), createdAt: '2026-04-22T02:00:00.000Z' },
    ],
    nutritionEntries: [],
    foodEntries: [],
    foodTemplates: [],
    activityEntries: [],
    noXTrackers: [],
  },
});

const totalRecords = (profile: Record<string, any>) => {
  let total = 0;
  for (const value of Object.values(profile)) if (Array.isArray(value)) total += value.length;
  for (const value of Object.values(profile.health ?? {})) if (Array.isArray(value)) total += value.length;
  return total;
};

const websiteExport = (profiles: unknown[], currentProfileId: string) =>
  JSON.stringify({
    format: 'caizen-data',
    version: 3,
    createdAt: '2026-07-31T12:00:00+08:00',
    data: { profiles, currentProfileId },
  });

/** The website's export and the Android app's local profile intentionally have DIFFERENT IDs - the common real-world case. */
const WEBSITE_PROFILE_ID = 'web-profile-abc';
const LOCAL_PROFILE_ID = 'android-local-profile-xyz';

const seedLocalDevice = async () => {
  const localProfile = {
    ...realisticProfile(LOCAL_PROFILE_ID, 'On this device'),
    transactions: [{ id: 'local-tx-1', date: day(1, 1), amount: 5, updatedAt: '2026-01-01T00:00:00.000Z' }],
    wishlistItems: [],
    workItems: [],
    dailyChecklistItems: [],
    importantDates: [],
    health: { ...realisticProfile(LOCAL_PROFILE_ID, '').health, weightEntries: [] },
  };
  await saveAppState({
    profiles: [localProfile as unknown as StoredAppState['profiles'][number]],
    currentProfileId: LOCAL_PROFILE_ID,
  });
};

const prepareWebsiteExport = async () => {
  const existingIds = (await loadAppState())?.profiles.map((p) => p.id) ?? [];
  const json = websiteExport(
    [realisticProfile(WEBSITE_PROFILE_ID, 'Website Export')],
    WEBSITE_PROFILE_ID,
  );
  return parseAndPrepareImport(json, existingIds);
};

afterEach(async () => {
  await resetCaizenDatabaseForTests();
});

describe('import application and post-import rehydration', () => {
  it('preview correctly reports canImport and non-zero record counts (sanity check)', async () => {
    await seedLocalDevice();
    const prepared = await prepareWebsiteExport();
    expect(prepared.report.canImport).toBe(true);
    const total = Object.values(prepared.report.recordCounts).reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(0);
  });

  describe('Import as new profile', () => {
    it('adds a new profile, switches to it, and its records survive a fresh repository read', async () => {
      await seedLocalDevice();
      const prepared = await prepareWebsiteExport();
      await restoreDataOnlyImport(prepared, 'new-profiles');

      // Fresh read from IndexedDB - simulates a full app restart, not
      // trusting whatever is left in React state.
      const reloaded = await loadAppState();
      expect(reloaded).not.toBeNull();
      expect(reloaded!.profiles).toHaveLength(2);

      const imported = reloaded!.profiles.find((p) => p.id !== LOCAL_PROFILE_ID)!;
      expect(imported).toBeDefined();
      // The active profile must be the one the user just imported, not the
      // pre-existing local one - otherwise the import is invisible.
      expect(reloaded!.currentProfileId).toBe(imported.id);

      expect((imported as any).transactions).toHaveLength(3);
      expect((imported as any).wishlistItems).toHaveLength(2);
      expect((imported as any).workItems).toHaveLength(2);
      expect((imported as any).dailyChecklistItems[0].completionHistory).toHaveLength(3);
      expect((imported as any).importantDates).toHaveLength(1);
      expect((imported as any).health.weightEntries).toHaveLength(2);
      expect(totalRecords(imported as any)).toBeGreaterThan(0);

      const txDates = new Set((imported as any).transactions.map((t: any) => t.date));
      expect(txDates.size).toBe(3);

      // The original local profile must be untouched.
      const local = reloaded!.profiles.find((p) => p.id === LOCAL_PROFILE_ID)!;
      expect((local as any).transactions).toHaveLength(1);
    });
  });

  describe('Merge', () => {
    it('inserts records when the website profile ID does not match any local profile', async () => {
      await seedLocalDevice();
      const prepared = await prepareWebsiteExport();
      await restoreDataOnlyImport(prepared, 'merge');

      const reloaded = await loadAppState();
      expect(reloaded).not.toBeNull();
      // No local profile matched the website's profile ID, so it was
      // appended rather than merged in place.
      expect(reloaded!.profiles).toHaveLength(2);
      const imported = reloaded!.profiles.find((p) => p.id === WEBSITE_PROFILE_ID)!;
      expect(imported).toBeDefined();
      expect((imported as any).transactions).toHaveLength(3);
      expect((imported as any).dailyChecklistItems[0].completionHistory).toHaveLength(3);

      // Nothing matched, so the active profile must switch to the newly
      // appended one - otherwise a merge with no matching profile is
      // indistinguishable from "nothing happened".
      expect(reloaded!.currentProfileId).toBe(WEBSITE_PROFILE_ID);
    });

    it('merges in place, by newest updatedAt, when the profile ID DOES match', async () => {
      await seedLocalDevice();
      // Re-export using the SAME id as the local device this time.
      const prepared = parseAndPrepareImport(
        websiteExport([realisticProfile(LOCAL_PROFILE_ID, 'Website Export')], LOCAL_PROFILE_ID),
        [LOCAL_PROFILE_ID],
      );
      await restoreDataOnlyImport(prepared, 'merge');

      const reloaded = await loadAppState();
      expect(reloaded!.profiles).toHaveLength(1);
      const merged = reloaded!.profiles[0] as any;
      // The imported transactions (3) plus the one local-only transaction
      // that the import never mentioned.
      expect(merged.transactions).toHaveLength(4);
      expect(merged.dailyChecklistItems[0].completionHistory).toHaveLength(3);
      // Matched-in-place: the active profile does not need to change.
      expect(reloaded!.currentProfileId).toBe(LOCAL_PROFILE_ID);
    });

    it('does not incorrectly skip every imported record', async () => {
      await seedLocalDevice();
      const prepared = await prepareWebsiteExport();
      await restoreDataOnlyImport(prepared, 'merge');
      const reloaded = await loadAppState();
      const combinedRecordCount = reloaded!.profiles.reduce(
        (sum, profile) => sum + totalRecords(profile as any),
        0,
      );
      expect(combinedRecordCount).toBeGreaterThan(1);
    });
  });

  describe('Replace', () => {
    it('removes existing destination records and commits the imported data', async () => {
      await seedLocalDevice();
      const prepared = await prepareWebsiteExport();
      await restoreDataOnlyImport(prepared, 'replace');

      const reloaded = await loadAppState();
      expect(reloaded).not.toBeNull();
      expect(reloaded!.profiles).toHaveLength(1);
      expect(reloaded!.profiles[0].id).toBe(WEBSITE_PROFILE_ID);
      expect(reloaded!.currentProfileId).toBe(WEBSITE_PROFILE_ID);

      const profile = reloaded!.profiles[0] as any;
      expect(profile.transactions).toHaveLength(3);
      expect(profile.wishlistItems).toHaveLength(2);
      expect(profile.workItems).toHaveLength(2);
      expect(profile.dailyChecklistItems[0].completionHistory).toHaveLength(3);
      expect(profile.importantDates).toHaveLength(1);
      expect(profile.health.weightEntries).toHaveLength(2);

      const allDates = [
        ...profile.transactions.map((t: any) => t.date),
        ...profile.wishlistItems.map((w: any) => w.purchaseDate),
        ...profile.health.weightEntries.map((w: any) => w.date),
      ];
      expect(new Set(allDates).size).toBe(allDates.length);

      // The pre-existing local profile must be gone, not merely hidden.
      expect(reloaded!.profiles.some((p) => p.id === LOCAL_PROFILE_ID)).toBe(false);
    });
  });

  describe('zero-record guard', () => {
    it('refuses to report success when the prepared state ends up with no records anywhere', async () => {
      await saveAppState({
        profiles: [{ ...realisticProfile('only-profile', 'Only'), transactions: [] } as any],
        currentProfileId: 'only-profile',
      });
      // A profile with the SAME id and every collection emptied - a
      // pathological but structurally valid "import" that should never
      // silently report success given the preview promised real records.
      const prepared = parseAndPrepareImport(
        websiteExport(
          [{ ...realisticProfile('only-profile', 'Only'), transactions: [{ id: 't', date: day(1, 1) }] }],
          'only-profile',
        ),
      );
      // Sanity: the preview really did see one record.
      expect(prepared.report.recordCounts.transactions).toBe(1);

      // Simulate a mapping bug producing an empty result: every array-valued
      // collection cleared post-preview, at both the profile root and under
      // `health`, while the preview still reported real records.
      const emptyArrays = (value: Record<string, unknown>) => {
        const cleared: Record<string, unknown> = { ...value };
        for (const key of Object.keys(cleared)) {
          if (Array.isArray(cleared[key])) cleared[key] = [];
        }
        return cleared;
      };
      const emptied = {
        ...prepared,
        state: {
          ...prepared.state,
          profiles: prepared.state.profiles.map((p: any) => ({
            ...emptyArrays(p),
            health: emptyArrays(p.health ?? {}),
          })) as any,
        },
      };
      await expect(restoreDataOnlyImport(emptied, 'replace')).rejects.toThrow(/no records/i);
    });
  });
});
