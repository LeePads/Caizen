import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { parseAndPrepareImport } from '@/lib/storage/import-integrity';
import { resetCaizenDatabaseForTests } from '@/lib/storage/database';

/**
 * Timezone integrity + legacy date-shape support.
 *
 * These run under Asia/Manila (UTC+08:00), the reporting user's timezone and
 * the worst case for UTC-based day bucketing: any timestamp before 08:00 UTC
 * falls on the previous day if narrowed with toISOString().
 */
beforeAll(() => {
  expect(new Date(2026, 5, 21).getTimezoneOffset()).toBe(-480);
});

const profile = (overrides: Record<string, unknown> = {}) => ({
  id: 'p-tz',
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
    data: { profiles, currentProfileId: 'p-tz' },
  });

const importedTransactions = (rows: unknown[]) => {
  const prepared = parseAndPrepareImport(envelope([profile({ transactions: rows })]));
   
  return { prepared, rows: (prepared.state.profiles[0] as any).transactions };
};

afterEach(async () => {
  await resetCaizenDatabaseForTests();
});

describe('date-only fields keep the intended local calendar date', () => {
  it('keeps a bare YYYY-MM-DD verbatim', () => {
    const { rows, prepared } = importedTransactions([
      { id: 't1', date: '2026-06-21', createdAt: '2026-06-21T09:00:00+08:00' },
    ]);
    expect(rows[0].date).toBe('2026-06-21');
    expect(prepared.report.invalidDateCount).toBe(0);
  });

  it('narrows a UTC timestamp to the local day, not the UTC day', () => {
    // 17:00Z on 06-20 is 01:00 on 06-21 in Manila. toISOString() would bucket
    // this on 06-20 - the off-by-one that made records look grouped.
    const { rows } = importedTransactions([
      { id: 't1', date: '2026-06-20T17:00:00.000Z', createdAt: '2026-06-21T01:00:00+08:00' },
    ]);
    expect(rows[0].date).toBe('2026-06-21');
  });

  it('keeps records on distinct days distinct across a month boundary', () => {
    const { rows } = importedTransactions([
      { id: 't1', date: '2026-05-31T16:00:00.000Z', createdAt: '2026-06-01T00:00:00+08:00' },
      { id: 't2', date: '2026-06-01T16:00:00.000Z', createdAt: '2026-06-02T00:00:00+08:00' },
      { id: 't3', date: '2026-06-02T16:00:00.000Z', createdAt: '2026-06-03T00:00:00+08:00' },
    ]);
    expect(rows.map((row: { date: string }) => row.date)).toEqual([
      '2026-06-01',
      '2026-06-02',
      '2026-06-03',
    ]);
    expect(new Set(rows.map((row: { date: string }) => row.date)).size).toBe(3);
  });

  it('handles an explicit +08:00 offset', () => {
    const { rows } = importedTransactions([
      { id: 't1', date: '2026-06-21T00:30:00+08:00', createdAt: '2026-06-21T00:30:00+08:00' },
    ]);
    expect(rows[0].date).toBe('2026-06-21');
  });

  it('handles leap day', () => {
    const { rows } = importedTransactions([
      { id: 't1', date: '2024-02-29', createdAt: '2024-02-29T10:00:00+08:00' },
    ]);
    expect(rows[0].date).toBe('2024-02-29');
  });
});

describe('recognised legacy timestamp wrappers', () => {
  it('accepts a Firestore { seconds, nanoseconds } wrapper', () => {
    const seconds = Math.floor(Date.UTC(2026, 2, 5, 4, 0, 0) / 1000);
    const { rows, prepared } = importedTransactions([
      { id: 't1', date: { seconds, nanoseconds: 0 }, createdAt: '2026-03-05T12:00:00+08:00' },
    ]);
    expect(prepared.report.invalidDateCount).toBe(0);
    expect(rows[0].date).toBe('2026-03-05');
  });

  it('accepts the _seconds variant and a MongoDB { $date } wrapper', () => {
    const seconds = Math.floor(Date.UTC(2026, 2, 6, 4, 0, 0) / 1000);
    const { rows, prepared } = importedTransactions([
      { id: 't1', date: { _seconds: seconds, _nanoseconds: 0 }, createdAt: '2026-03-06T12:00:00+08:00' },
      { id: 't2', date: { $date: '2026-03-07T04:00:00.000Z' }, createdAt: '2026-03-07T12:00:00+08:00' },
    ]);
    expect(prepared.report.invalidDateCount).toBe(0);
    expect(rows[0].date).toBe('2026-03-06');
    expect(rows[1].date).toBe('2026-03-07');
  });

  it('accepts a single-key { iso } wrapper', () => {
    const { rows, prepared } = importedTransactions([
      { id: 't1', date: { iso: '2026-03-08T04:00:00.000Z' }, createdAt: '2026-03-08T12:00:00+08:00' },
    ]);
    expect(prepared.report.invalidDateCount).toBe(0);
    expect(rows[0].date).toBe('2026-03-08');
  });
});

describe('unsupported shapes are rejected, never coerced', () => {
  it('rejects an arbitrary object and never prints [object Object]', () => {
    const { prepared } = importedTransactions([
      { id: 't1', date: { hello: 'world', nested: { a: 1 } }, createdAt: '2026-03-05T12:00:00+08:00' },
    ]);
    expect(prepared.report.invalidDateCount).toBe(1);
    expect(prepared.report.canImport).toBe(false);

    const issue = prepared.report.dateIssues[0];
    expect(issue.message).not.toContain('[object Object]');
    expect(issue.message).toContain('hello');
    // The original value is preserved verbatim for the diagnostic report.
    expect(issue.rawValue).toEqual({ hello: 'world', nested: { a: 1 } });
  });

  it('rejects an empty object with a readable description', () => {
    const { prepared } = importedTransactions([
      { id: 't1', date: {}, createdAt: '2026-03-05T12:00:00+08:00' },
    ]);
    expect(prepared.report.dateIssues[0].message).toContain('an empty object');
    expect(prepared.report.dateIssues[0].message).not.toContain('[object Object]');
  });

  it('rejects a bare epoch number on a field that did not opt in', () => {
    const { prepared } = importedTransactions([
      { id: 't1', date: 1772000000000, createdAt: '2026-03-05T12:00:00+08:00' },
    ]);
    expect(prepared.report.invalidDateCount).toBe(1);
  });

  it('rejects a calendar-impossible date', () => {
    const { prepared } = importedTransactions([
      { id: 't1', date: '2026-02-30', createdAt: '2026-03-05T12:00:00+08:00' },
    ]);
    expect(prepared.report.invalidDateCount).toBe(1);
    expect(prepared.report.canImport).toBe(false);
  });

  it('reports a missing required date instead of backfilling today', () => {
    const { prepared } = importedTransactions([
      { id: 't1', createdAt: '2026-03-05T12:00:00+08:00' },
    ]);
    expect(prepared.report.missingDateCount).toBe(1);
    expect(prepared.report.dateIssues[0].message).not.toContain('import date');
    expect(prepared.report.canImport).toBe(false);
  });
});
