import { afterEach, describe, expect, it } from 'vitest';
import { loadAppState, saveAppState } from '@/lib/storage/app-repository';
import { openCaizenDatabase, resetCaizenDatabaseForTests, transactionDone } from '@/lib/storage/database';
import { STORES } from '@/lib/storage/schema';
import { parseAndPrepareImport } from '@/lib/storage/import-integrity';

/**
 * `transactions`, `mealTemplates`, `workoutEntries` and `sleepEntries` used to
 * stay inline on the profile core document. Adding them to the split lists
 * would silently drop every existing row unless loadAppState seeds a
 * collection from the inline value that a pre-split core document still owns.
 */

const preSplitCore = {
  id: 'p-legacy',
  name: 'Legacy',
  createdAt: '2024-01-01T08:00:00+08:00',
  // Written by an older build: still inline, no records rows exist for these.
  transactions: [
    { id: 'tx-1', date: '2026-03-05', amount: 100 },
    { id: 'tx-2', date: '2026-04-18', amount: 250 },
  ],
  wallets: [],
  health: {
    mealTemplates: [{ id: 'mt-1', name: 'Breakfast' }],
    workoutEntries: [{ id: 'wo-1', date: '2026-03-05' }],
    sleepEntries: [{ id: 'sl-1', date: '2026-03-05' }],
    weightEntries: [],
    nutritionEntries: [],
    foodEntries: [],
    foodTemplates: [],
    activityEntries: [],
    workoutSessions: [{ id: 'ws-1', startedAt: '2026-03-05T08:00:00.000Z', status: 'completed', exercises: [] }],
    noXTrackers: [],
  },
};

const seedPreSplitProfile = async () => {
  const db = await openCaizenDatabase();
  const transaction = db.transaction([STORES.profiles, STORES.settings], 'readwrite');
  transaction.objectStore(STORES.profiles).put(preSplitCore);
  transaction.objectStore(STORES.settings).put({ key: 'currentProfileId', value: 'p-legacy' });
  await transactionDone(transaction);
};

afterEach(async () => {
  await resetCaizenDatabaseForTests();
});

describe('splitting a collection out of the core document', () => {
  it('keeps inline rows written before the collection was split', async () => {
    await seedPreSplitProfile();
    const state = await loadAppState();

     
    const profile = state?.profiles[0] as any;
    expect(profile.transactions).toHaveLength(2);
    expect(profile.transactions.map((row: { id: string }) => row.id)).toEqual(['tx-1', 'tx-2']);
    expect(profile.health.mealTemplates).toHaveLength(1);
    expect(profile.health.workoutEntries).toHaveLength(1);
    expect(profile.health.workoutSessions).toHaveLength(1);
    expect(profile.health.sleepEntries).toHaveLength(1);
  });

  it('survives a full load -> save -> load cycle without losing rows', async () => {
    await seedPreSplitProfile();
    const first = await loadAppState();
    expect(first).not.toBeNull();

    await saveAppState(first!);
    const second = await loadAppState();

     
    const profile = second?.profiles[0] as any;
    expect(profile.transactions).toHaveLength(2);
    expect(profile.health.mealTemplates).toHaveLength(1);
    expect(profile.health.workoutEntries).toHaveLength(1);
    expect(profile.health.workoutSessions).toHaveLength(1);
    expect(profile.health.sleepEntries).toHaveLength(1);
  });

  it('does not resurrect a row deleted after the collection was split', async () => {
    await seedPreSplitProfile();
    const first = await loadAppState();
    await saveAppState(first!); // migrates the inline rows into the records store

    const trimmed = structuredClone(first!);
     
    (trimmed.profiles[0] as any).transactions = [{ id: 'tx-1', date: '2026-03-05', amount: 100 }];
    await saveAppState(trimmed);

    const after = await loadAppState();
     
    const profile = after?.profiles[0] as any;
    expect(profile.transactions).toHaveLength(1);
    expect(profile.transactions[0].id).toBe('tx-1');
  });
});

describe('previously unvalidated date fields', () => {
  const envelope = (profile: Record<string, unknown>) =>
    JSON.stringify({
      format: 'caizen-data',
      version: 3,
      data: { profiles: [profile], currentProfileId: 'p-nested' },
    });

  const base = {
    id: 'p-nested',
    name: 'Nested',
    createdAt: '2024-01-01T08:00:00+08:00',
    wallets: [],
    health: {
      weightEntries: [],
      nutritionEntries: [],
      foodEntries: [],
      foodTemplates: [],
      activityEntries: [],
      noXTrackers: [],
    },
  };

  it('catches a corrupt profile.createdAt instead of passing it through', () => {
    const prepared = parseAndPrepareImport(envelope({ ...base, createdAt: {} }));
    expect(prepared.report.invalidDateCount).toBe(1);
    expect(prepared.report.dateIssues[0].collection).toBe('profile');
    expect(prepared.report.dateIssues[0].message).not.toContain('[object Object]');
  });

  it('validates pet.createdAt and pet.recentRewards[].earnedAt', () => {
    const prepared = parseAndPrepareImport(
      envelope({
        ...base,
        pet: {
          name: 'Mochi',
          createdAt: '2025-01-01T00:00:00.000Z',
          recentRewards: [{ id: 'r-1', earnedAt: '2026-05-04T02:00:00.000Z' }],
        },
      }),
    );
    expect(prepared.report.invalidDateCount).toBe(0);
    expect(prepared.report.recordCounts['pet.recentRewards']).toBe(1);
    expect(prepared.report.canImport).toBe(true);
  });

  it('validates health.vapeTracker.quitDate as a local calendar date', () => {
    const prepared = parseAndPrepareImport(
      envelope({
        ...base,
        health: { ...base.health, vapeTracker: { quitDate: '2026-06-20T17:00:00.000Z' } },
      }),
    );
    expect(prepared.report.invalidDateCount).toBe(0);
     
    const health = (prepared.state.profiles[0] as any).health;
    expect(health.vapeTracker.quitDate).toBe('2026-06-21');
  });

  it('reports a corrupt pet reward date without blocking on unrelated data', () => {
    const prepared = parseAndPrepareImport(
      envelope({
        ...base,
        pet: { name: 'Mochi', recentRewards: [{ id: 'r-1', earnedAt: { bad: true } }] },
      }),
    );
    expect(prepared.report.invalidDateCount).toBe(1);
    expect(prepared.report.dateIssues[0].collection).toBe('pet.recentRewards');
    expect(prepared.report.dateIssues[0].message).toContain('bad');
  });
});
