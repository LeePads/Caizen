import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseAndPrepareImport, prepareImport } from '@/lib/storage/import-integrity';
import { createDataOnlyExport, previewDataOnlyImport, restoreDataOnlyImport } from '@/lib/storage/backup-repository';
import { loadAppState, saveAppState, type StoredAppState } from '@/lib/storage/app-repository';
import { resetCaizenDatabaseForTests } from '@/lib/storage/database';

/**
 * Cross-platform compatibility. Every date-bearing module gets records on
 * DISTINCT dates across several months, so a regression that collapses or
 * shifts dates shows up as a changed distinct-date count rather than as a
 * silently wrong value.
 */

const day = (month: number, dayOfMonth: number) =>
  `2026-${String(month).padStart(2, '0')}-${String(dayOfMonth).padStart(2, '0')}`;

const richProfile = (id = 'p-compat') => ({
  id,
  name: 'Compatibility',
  createdAt: '2024-01-15T08:00:00+08:00',
  wallets: [{ id: 'w-1', name: 'Cash', goalDeadline: day(1, 5), createdAt: '2024-01-15T08:00:00+08:00' }],
  transactions: [
    { id: 'tx-1', date: day(1, 9), amount: 10 },
    { id: 'tx-2', date: day(2, 14), amount: 20 },
    { id: 'tx-3', date: day(3, 21), amount: 30 },
  ],
  inventoryItems: [
    { id: 'inv-1', purchaseDate: day(4, 2), createdAt: '2026-04-02T02:00:00.000Z' },
    { id: 'inv-2', purchaseDate: day(5, 17), createdAt: '2026-05-17T02:00:00.000Z' },
  ],
  wishlistItems: [{ id: 'wl-1', purchaseDate: day(6, 8), createdAt: '2026-06-08T02:00:00.000Z' }],
  journalEntries: [
    { id: 'j-1', date: day(1, 30), createdAt: '2026-01-30T22:00:00.000Z' },
    { id: 'j-2', date: day(7, 4), createdAt: '2026-07-04T22:00:00.000Z' },
  ],
  games: [{ id: 'g-1', playingSince: day(2, 2), createdAt: '2026-02-02T02:00:00.000Z' }],
  gameGuides: [{ id: 'gg-1', createdAt: '2026-02-03T02:00:00.000Z' }],
  productivityItems: [{ id: 'pi-1', deadline: day(8, 19), createdAt: '2026-08-01T02:00:00.000Z' }],
  mediaItems: [{ id: 'mi-1', createdAt: '2026-03-11T02:00:00.000Z' }],
  musicItems: [{ id: 'mu-1', lastPlayedAt: '2026-09-01T02:00:00.000Z', createdAt: '2026-03-12T02:00:00.000Z' }],
  workItems: [{ id: 'wi-1', date: day(9, 23), dueDate: day(10, 1), createdAt: '2026-09-23T02:00:00.000Z' }],
  personalVaultItems: [
    { id: 'pv-1', date: day(10, 15), expiryDate: day(11, 20), createdAt: '2026-10-15T02:00:00.000Z' },
  ],
  trashItems: [{ id: 'tr-1', deletedAt: '2026-11-05T02:00:00.000Z', deleteAfter: '2026-12-05T02:00:00.000Z' }],
  skincareProducts: [{ id: 'sk-1', purchaseDate: day(11, 7), startDate: day(11, 9), createdAt: '2026-11-07T02:00:00.000Z' }],
  dailyChecklistItems: [
    {
      id: 'dc-1',
      startDate: day(1, 2),
      createdAt: '2026-01-02T02:00:00.000Z',
      completionHistory: [{ date: day(1, 3) }, { date: day(1, 4) }, { date: day(2, 5) }],
    },
  ],
  importantDates: [{ id: 'id-1', date: day(12, 24), endDate: day(12, 26), createdAt: '2026-12-01T02:00:00.000Z' }],
  supplements: [{ id: 'su-1', startDate: day(5, 1), expiryDate: day(12, 31), createdAt: '2026-05-01T02:00:00.000Z' }],
  balanceCheckIns: [{ id: 'bc-1', completedAt: '2026-06-30T02:00:00.000Z' }],
  pet: {
    name: 'Mochi',
    createdAt: '2024-01-15T08:00:00+08:00',
    recentRewards: [{ id: 'pr-1', earnedAt: '2026-05-04T02:00:00.000Z' }],
  },
  health: {
    vapeTracker: { quitDate: day(3, 1) },
    weightEntries: [
      { id: 'we-1', date: day(1, 11), createdAt: '2026-01-11T02:00:00.000Z' },
      { id: 'we-2', date: day(4, 22), createdAt: '2026-04-22T02:00:00.000Z' },
    ],
    nutritionEntries: [{ id: 'ne-1', date: day(2, 18), createdAt: '2026-02-18T02:00:00.000Z' }],
    foodEntries: [
      { id: 'fe-1', date: day(3, 3), createdAt: '2026-03-03T02:00:00.000Z' },
      { id: 'fe-2', date: day(6, 13), createdAt: '2026-06-13T02:00:00.000Z' },
    ],
    foodTemplates: [{ id: 'ft-1', createdAt: '2026-03-04T02:00:00.000Z' }],
    mealTemplates: [{ id: 'mt-1', createdAt: '2026-03-05T02:00:00.000Z' }],
    activityEntries: [{ id: 'ae-1', date: day(7, 27), createdAt: '2026-07-27T02:00:00.000Z' }],
    workoutEntries: [{ id: 'wo-1', date: day(8, 6), createdAt: '2026-08-06T02:00:00.000Z' }],
    sleepEntries: [{ id: 'se-1', date: day(9, 16), createdAt: '2026-09-16T02:00:00.000Z' }],
    noXTrackers: [{ id: 'nx-1', startDate: day(10, 28), createdAt: '2026-10-28T02:00:00.000Z' }],
  },
});

/** Every date-only value present anywhere in a prepared profile. */
const collectDateOnlyValues = (value: unknown, found: string[] = []): string[] => {
  if (Array.isArray(value)) {
    value.forEach((child) => collectDateOnlyValues(child, found));
    return found;
  }
  if (value && typeof value === 'object') {
    Object.values(value).forEach((child) => collectDateOnlyValues(child, found));
    return found;
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) found.push(value);
  return found;
};

const webExport = (profiles: unknown[]) =>
  JSON.stringify({
    format: 'caizen-data',
    version: 3,
    createdAt: '2026-07-30T12:00:00+08:00',
    data: { profiles, currentProfileId: 'p-compat' },
  });

/** The double-encoded envelope the legacy website emitted. */
const legacyWebExport = (profiles: unknown[]) =>
  JSON.stringify({ version: '1.0', exportDate: '2026-07-30T04:00:00.000Z', profiles: JSON.stringify(profiles) });

/** A bare state object with no envelope, as found in the shipped demo file. */
const bareStateExport = (profiles: unknown[]) =>
  JSON.stringify({ profiles, currentProfileId: 'p-compat' });

afterEach(async () => {
  await resetCaizenDatabaseForTests();
});

describe('envelope formats', () => {
  it('accepts the current caizen-data envelope', () => {
    const prepared = parseAndPrepareImport(webExport([richProfile()]));
    expect(prepared.report.format).toBe('caizen-data');
    expect(prepared.report.schemaVersion).toBe(3);
    expect(prepared.report.canImport).toBe(true);
  });

  it('accepts the legacy double-encoded website envelope', () => {
    const prepared = parseAndPrepareImport(legacyWebExport([richProfile()]));
    expect(prepared.report.format).toBe('caizen-legacy-web');
    expect(prepared.report.canImport).toBe(true);
    expect(prepared.report.profileCount).toBe(1);
  });

  it('accepts a bare state object', () => {
    const prepared = parseAndPrepareImport(bareStateExport([richProfile()]));
    expect(prepared.report.format).toBe('caizen-state');
    expect(prepared.report.canImport).toBe(true);
  });

  it('preserves identical dates across all three envelope formats', () => {
    const fromEnvelopes = [webExport, legacyWebExport, bareStateExport].map((build) =>
      collectDateOnlyValues(parseAndPrepareImport(build([richProfile()])).state.profiles).sort(),
    );
    expect(fromEnvelopes[1]).toEqual(fromEnvelopes[0]);
    expect(fromEnvelopes[2]).toEqual(fromEnvelopes[0]);
  });
});

describe('web <-> Android round trips', () => {
  it('web export -> Android import keeps every distinct date distinct', () => {
    const prepared = parseAndPrepareImport(webExport([richProfile()]));
    const dates = collectDateOnlyValues(prepared.state.profiles);

    // The expectation is derived from the fixture rather than hand-counted, so
    // it stays honest if the fixture grows.
    const expected = collectDateOnlyValues(richProfile());

    expect(prepared.report.invalidDateCount).toBe(0);
    expect(prepared.report.missingDateCount).toBe(0);
    expect(new Set(dates).size).toBe(new Set(expected).size);
    expect(dates.sort()).toEqual(expected.sort());
    // Spread across all twelve months of 2026.
    expect(new Set(dates.map((value) => value.slice(0, 7))).size).toBe(12);
  });

  it('Android export -> web import survives a full storage round trip', async () => {
    const seeded = parseAndPrepareImport(webExport([richProfile()]));
    const before = collectDateOnlyValues(seeded.state.profiles).sort();

    await saveAppState(seeded.state);
    const exported = await (await createDataOnlyExport()).text();
    const reimported = await previewDataOnlyImport(exported);

    expect(reimported.report.invalidDateCount).toBe(0);
    expect(reimported.report.missingDateCount).toBe(0);
    expect(collectDateOnlyValues(reimported.state.profiles).sort()).toEqual(before);
  });

  it('is stable across three consecutive export/import cycles', async () => {
    let state: StoredAppState = parseAndPrepareImport(webExport([richProfile()])).state;
    const original = collectDateOnlyValues(state.profiles).sort();

    for (let cycle = 0; cycle < 3; cycle += 1) {
      await saveAppState(state);
      const exported = await (await createDataOnlyExport()).text();
      const prepared = await previewDataOnlyImport(exported);
      expect(prepared.report.canImport).toBe(true);
      state = prepared.state;
      await resetCaizenDatabaseForTests();
    }

    expect(collectDateOnlyValues(state.profiles).sort()).toEqual(original);
  });
});

describe('the shipped demo export', () => {
  const demoPath = join(process.cwd(), 'public', 'caizen-demo.json');

  it('imports without a single unreadable date', () => {
    const prepared = parseAndPrepareImport(readFileSync(demoPath, 'utf8'));
    expect(prepared.report.dateIssues.filter((issue) => issue.kind === 'invalid')).toEqual([]);
    expect(
      prepared.report.warnings.filter((warning) => warning.includes('[object Object]')),
    ).toEqual([]);
  });

  it('keeps food entries spread across many days rather than collapsed onto one', () => {
    const prepared = parseAndPrepareImport(readFileSync(demoPath, 'utf8'));
     
    const entries = (prepared.state.profiles[0] as any).health.foodEntries as Array<{ date: string }>;
  expect(entries.length).toBeGreaterThan(0);

const distinctDates = new Set(entries.map((entry) => entry.date));
expect(distinctDates.size).toBeGreaterThan(1);
  });
});

describe('multiple profiles and scale', () => {
  it('imports several profiles and keeps their records separate', async () => {
    const prepared = parseAndPrepareImport(
      webExport([richProfile('p-a'), richProfile('p-b'), richProfile('p-c')]),
    );
    expect(prepared.report.profileCount).toBe(3);
    expect(prepared.report.canImport).toBe(true);

    await restoreDataOnlyImport(prepared, 'replace');
    const stored = await loadAppState();
    expect(stored?.profiles.map((profile) => profile.id)).toEqual(['p-a', 'p-b', 'p-c']);
     
    expect((stored?.profiles[1] as any).transactions).toHaveLength(3);
  });

  it('handles 5,000+ records with distinct dates preserved', async () => {
    // Walk consecutive days so every one of the 336 slots is genuinely
    // distinct; `index % 12` and `index % 28` share a factor and would only
    // produce 84 combinations.
    const transactions = Array.from({ length: 5_400 }, (_, index) => ({
      id: `tx-${index}`,
      date: day(Math.floor((index % 336) / 28) + 1, ((index % 336) % 28) + 1),
      amount: index,
    }));
    const prepared = parseAndPrepareImport(webExport([{ ...richProfile(), transactions }]));

    expect(prepared.report.canImport).toBe(true);
    expect(prepared.report.recordCounts.transactions).toBe(5_400);

    await restoreDataOnlyImport(prepared, 'replace');
    const stored = await loadAppState();
     
    const rows = (stored?.profiles[0] as any).transactions as Array<{ date: string }>;
    expect(rows).toHaveLength(5_400);
    expect(new Set(rows.map((row) => row.date)).size).toBe(336);
  });
});

describe('mixed-quality files', () => {
  it('reports problems per module without discarding the healthy modules', () => {
    const prepared = prepareImport({
      format: 'caizen-data',
      version: 3,
      data: {
        currentProfileId: 'p-mixed',
        profiles: [
          {
            ...richProfile('p-mixed'),
            transactions: [
              { id: 'ok', date: day(1, 9) },
              { id: 'bad', date: { corrupt: true } },
            ],
          },
        ],
      },
    });

    expect(prepared.report.canImport).toBe(false);
    expect(prepared.report.invalidDateCount).toBe(1);
    // Healthy modules are still parsed and counted. Health collections are
    // keyed by their bare name in recordCounts.
    expect(prepared.report.recordCounts.foodEntries).toBe(2);
     
    expect((prepared.state.profiles[0] as any).journalEntries[1].date).toBe(day(7, 4));
  });
});

