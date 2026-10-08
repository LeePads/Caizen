import { afterEach, describe, expect, it } from 'vitest';
import {
  createProfilesForImport,
  parseAndPrepareImport,
  prepareImport,
} from '@/lib/storage/import-integrity';
import {
  loadAppState,
  saveAppState,
  type StoredAppState,
} from '@/lib/storage/app-repository';
import { restoreDataOnlyImport } from '@/lib/storage/backup-repository';
import { resetCaizenDatabaseForTests } from '@/lib/storage/database';

const profile = (overrides: Record<string, unknown> = {}) => ({
  id: 'profile-manila',
  name: 'Manila',
  createdAt: '2024-01-01T08:00:00+08:00',
  wallets: [],
  transactions: [],
  inventoryItems: [],
  wishlistItems: [],
  journalEntries: [],
  games: [],
  gameGuides: [],
  productivityItems: [],
  mediaItems: [],
  musicItems: [],
  workItems: [],
  personalVaultItems: [],
  trashItems: [],
  skincareProducts: [],
  dailyChecklistItems: [],
  importantDates: [],
  supplements: [],
  balanceCheckIns: [],
  health: {
    weightEntries: [],
    nutritionEntries: [],
    foodEntries: [],
    foodTemplates: [],
    mealTemplates: [],
    activityEntries: [],
    workoutEntries: [],
    sleepEntries: [],
    noXTrackers: [],
  },
  ...overrides,
});

const envelope = (profiles: unknown[]) =>
  JSON.stringify({
    format: 'caizen-data',
    version: 3,
    createdAt: '2026-07-30T12:00:00+08:00',
    data: { profiles, currentProfileId: 'profile-manila' },
  });

afterEach(async () => {
  await resetCaizenDatabaseForTests();
});

describe('JSON import date integrity', () => {
  it('preserves distinct entity dates, aliases, leap day, Z, and Manila offsets', () => {
    const prepared = parseAndPrepareImport(
      envelope([
        profile({
          transactions: [
            { id: 'tx-1', transactionDate: '2024-02-29', createdAt: '2024-02-28T16:00:00Z' },
            { id: 'tx-2', date: '2025-03-17', updatedAt: '2025-03-17T08:30:00+08:00' },
          ],
          journalEntries: [{ id: 'journal-1', entryDate: '2023-12-31' }],
          inventoryItems: [{ id: 'item-1', purchaseDate: '2022-06-04' }],
          productivityItems: [{
            id: 'task-1',
            dueDate: '2026-08-01',
            completedAt: '2026-08-01T21:15:00+08:00',
          }],
          dailyChecklistItems: [{
            id: 'routine-1',
            startDate: '2026-01-10',
            completionHistory: [
              { id: 'done-1', completionDate: '2026-01-11' },
              { id: 'done-2', date: '2026-01-13' },
            ],
          }],
          importantDates: [{
            id: 'event-1',
            start: '2026-09-20',
            end: '2026-09-21',
          }],
          health: {
            weightEntries: [{ id: 'weight-1', recordedAt: '2024-11-03' }],
            foodEntries: [{ id: 'meal-1', loggedAt: '2025-05-06' }],
            activityEntries: [{ id: 'workout-1', startedAt: '2025-07-18T05:30:00+08:00' }],
            workoutEntries: [],
            nutritionEntries: [],
            foodTemplates: [],
            mealTemplates: [],
            sleepEntries: [],
            noXTrackers: [],
          },
        }),
      ]),
    );

    expect(prepared.report.canImport).toBe(true);
    expect(prepared.report.invalidDateCount).toBe(0);
    expect(prepared.report.missingDateCount).toBe(0);
    const imported = prepared.state.profiles[0] as unknown as Record<string, any>;
    expect(imported.transactions.map((item: any) => item.date)).toEqual([
      '2024-02-29',
      '2025-03-17',
    ]);
    expect(imported.journalEntries[0].date).toBe('2023-12-31');
    expect(imported.health.foodEntries[0].date).toBe('2025-05-06');
    expect(imported.health.weightEntries[0].date).toBe('2024-11-03');
    // `activityEntries.date` is a dateOnly rule, so a full timestamp is now
    // narrowed to its LOCAL calendar day. It previously passed through as a raw
    // UTC timestamp, which downstream `toISOString().split('T')[0]` consumers
    // then bucketed a day early in UTC+08:00.
    expect(imported.health.activityEntries[0].date).toBe('2025-07-18');
    expect(imported.productivityItems[0].deadline).toBe('2026-08-01');
    expect(imported.dailyChecklistItems[0].completionHistory.map((item: any) => item.date))
      .toEqual(['2026-01-11', '2026-01-13']);
    expect(imported.importantDates[0]).toMatchObject({
      date: '2026-09-20',
      endDate: '2026-09-21',
    });
    expect(new Set([
      imported.transactions[0].date,
      imported.journalEntries[0].date,
      imported.health.foodEntries[0].date,
      imported.health.weightEntries[0].date,
    ]).size).toBe(4);
  });

  it('does not shift a date-only value through UTC in Asia/Manila', () => {
    const prepared = prepareImport({
      profiles: [profile({
        journalEntries: [{ id: 'journal-date-only', date: '2026-07-30' }],
      })],
      currentProfileId: 'profile-manila',
    });
    const imported = prepared.state.profiles[0] as unknown as Record<string, any>;
    expect(imported.journalEntries[0].date).toBe('2026-07-30');
    expect(new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date('2026-07-30T12:00:00+08:00'))).toBe('2026-07-30');
  });

  it('reports raw invalid and missing dates and blocks the commit', async () => {
    const current = {
      profiles: [profile({ id: 'local', name: 'Local' })],
      currentProfileId: 'local',
    } as unknown as StoredAppState;
    await saveAppState(current);

    const prepared = prepareImport({
      profiles: [profile({
        transactions: [
          { id: 'bad-date', date: '2026-02-30' },
          { id: 'missing-date' },
        ],
      })],
      currentProfileId: 'profile-manila',
    });

    expect(prepared.report.canImport).toBe(false);
    expect(prepared.report.invalidDateCount).toBe(1);
    expect(prepared.report.missingDateCount).toBe(1);
    expect(prepared.report.dateIssues[0].rawValue).toBe('2026-02-30');
    await expect(restoreDataOnlyImport(prepared, 'replace')).rejects.toThrow(/invalid, missing/);
    expect((await loadAppState())?.currentProfileId).toBe('local');
  });

  it('detects duplicate IDs and preserves relationships when importing as a new profile', () => {
    const prepared = prepareImport({
      profiles: [profile({
        inventoryItems: [
          { id: 'same', purchaseDate: '2026-01-01', profileId: 'profile-manila' },
          { id: 'same', purchaseDate: '2026-01-02', profileId: 'profile-manila' },
        ],
      })],
      currentProfileId: 'profile-manila',
    }, ['profile-manila']);
    expect(prepared.report.duplicateIds).toContain('profile-manila:inventoryItems:same');
    expect(prepared.report.profileConflicts).toEqual(['profile-manila']);

    const distinct = prepareImport({
      profiles: [profile({
        inventoryItems: [{ id: 'item', purchaseDate: '2026-01-01', profileId: 'profile-manila' }],
      })],
      currentProfileId: 'profile-manila',
    });
    const merged = createProfilesForImport(
      distinct.state,
      {
        profiles: [profile({ id: 'profile-manila', name: 'Existing' }) as any],
        currentProfileId: 'profile-manila',
      },
      'new-profiles',
    );
    expect(merged.profiles).toHaveLength(2);
    const imported = merged.profiles[1] as unknown as Record<string, any>;
    expect(imported.id).not.toBe('profile-manila');
    expect(imported.inventoryItems[0].profileId).toBe(imported.id);
  });

  it('blocks and excludes negative completed fasting intervals without deduplicating active imports', () => {
    const prepared = prepareImport({
      profiles: [profile({
        health: {
          fastingSessions: [
            {
              id: 'invalid-fast',
              startedAt: '2026-08-28T02:00:00+08:00',
              endedAt: '2026-08-28T01:00:00+08:00',
              createdAt: '2026-08-28T02:00:00+08:00',
            },
            {
              id: 'active-a',
              startedAt: '2026-08-28T00:00:00+08:00',
              endedAt: null,
              createdAt: '2026-08-28T00:00:00+08:00',
            },
            {
              id: 'active-b',
              startedAt: '2026-08-28T00:30:00+08:00',
              endedAt: null,
              createdAt: '2026-08-28T00:30:00+08:00',
            },
          ],
        },
      })],
      currentProfileId: 'profile-manila',
    });

    expect(prepared.report.canImport).toBe(false);
    expect(prepared.report.blockingInvalidCount).toBe(1);
    expect(prepared.report.dateIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        collection: 'health.fastingSessions',
        field: 'endedAt',
        kind: 'invalid',
        required: true,
      }),
    ]));
    expect(prepared.state.profiles[0].health?.fastingSessions?.map(session => session.id)).toEqual(['active-a', 'active-b']);
  });
});
