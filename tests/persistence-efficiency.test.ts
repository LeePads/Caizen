import { afterEach, describe, expect, it } from 'vitest';
import { loadAppState, saveAppState, type StoredAppState } from '@/lib/storage/app-repository';
import { getAllStoreValues, resetCaizenDatabaseForTests } from '@/lib/storage/database';
import { STORES } from '@/lib/storage/schema';

/**
 * `splitProfile` used to stamp a fresh `updatedAt` on EVERY record on EVERY
 * save, so every row was byte-different every time even when nothing in it had
 * changed. That made `updatedAt` meaningless and defeated downstream diffing.
 */

const profile = (transactions: unknown[]) =>
  ({
    id: 'p-perf',
    name: 'Perf',
    createdAt: '2024-01-01T08:00:00+08:00',
    wallets: [],
    transactions,
    health: {},
     
  }) as any;

const state = (transactions: unknown[]): StoredAppState => ({
  profiles: [profile(transactions)],
  currentProfileId: 'p-perf',
});

type Row = { key: string; updatedAt: string; data: unknown };

const rows = async () =>
  (await getAllStoreValues<Row>(STORES.records)).sort((a, b) => a.key.localeCompare(b.key));

afterEach(async () => {
  await resetCaizenDatabaseForTests();
});

describe('record timestamps', () => {
  it('leaves an unchanged record’s updatedAt alone across saves', async () => {
    const unchanged = { id: 'tx-1', date: '2026-03-05', amount: 100 };
    const other = { id: 'tx-2', date: '2026-03-06', amount: 200 };

    await saveAppState(state([unchanged, other]));
    const first = await rows();
    expect(first).toHaveLength(2);

    await new Promise((resolve) => setTimeout(resolve, 5));

    // Same references for tx-1, a brand new object for tx-2.
    await saveAppState(state([unchanged, { id: 'tx-2', date: '2026-03-06', amount: 999 }]));
    const second = await rows();

    const before = Object.fromEntries(first.map((row) => [row.key, row.updatedAt]));
    const after = Object.fromEntries(second.map((row) => [row.key, row.updatedAt]));

    const unchangedKey = first.find((row) => row.key.endsWith('tx-1'))!.key;
    const changedKey = first.find((row) => row.key.endsWith('tx-2'))!.key;

    expect(after[unchangedKey]).toBe(before[unchangedKey]);
    expect(after[changedKey]).not.toBe(before[changedKey]);
  });

  it('still writes the record data correctly after repeated saves', async () => {
    const rowsIn = [{ id: 'tx-1', date: '2026-03-05', amount: 100 }];
    await saveAppState(state(rowsIn));
    await saveAppState(state(rowsIn));
    await saveAppState(state(rowsIn));

    const stored = await loadAppState();
     
    expect((stored?.profiles[0] as any).transactions).toEqual(rowsIn);
  });

  it('does not carry timestamps across a database reset', async () => {
    const shared = { id: 'tx-1', date: '2026-03-05', amount: 100 };
    await saveAppState(state([shared]));
    const before = (await rows())[0].updatedAt;

    await resetCaizenDatabaseForTests();
    await new Promise((resolve) => setTimeout(resolve, 5));

    // Same object reference, but a brand new database: the row is new.
    await saveAppState(state([shared]));
    const after = (await rows())[0].updatedAt;
    expect(after).not.toBe(before);
  });
});
