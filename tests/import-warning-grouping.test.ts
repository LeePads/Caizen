import { describe, expect, it } from 'vitest';
import { MAX_RETAINED_DATE_ISSUES, prepareImport } from '@/lib/storage/import-integrity';

/**
 * A 5,000-row history with three date rules used to emit 15,000 near-identical
 * warning strings. The preview then sliced to 8 for display while the whole
 * array stayed in memory and went into the downloadable report.
 */

const profileWith = (transactions: unknown[]) => ({
  format: 'caizen-data',
  version: 3,
  data: {
    currentProfileId: 'p-bulk',
    profiles: [
      {
        id: 'p-bulk',
        name: 'Bulk',
        createdAt: '2024-01-01T08:00:00+08:00',
        transactions,
        health: {},
      },
    ],
  },
});

describe('import warning grouping', () => {
  it('collapses thousands of identical issues into one group per field', () => {
    const broken = Array.from({ length: 4_000 }, (_, index) => ({
      id: `tx-${index}`,
      date: { corrupt: true },
    }));
    const prepared = prepareImport(profileWith(broken));

    expect(prepared.report.invalidDateCount).toBe(4_000);
    // One group for transactions.date; warnings is one line per group.
    expect(prepared.report.warningGroups).toHaveLength(1);
    expect(prepared.report.warnings).toHaveLength(1);

    const group = prepared.report.warningGroups[0];
    expect(group.module).toBe('transactions');
    expect(group.field).toBe('date');
    expect(group.kind).toBe('invalid');
    expect(group.count).toBe(4_000);
    expect(group.summary).toContain('4,000');
    expect(group.examples.length).toBeGreaterThan(0);
    expect(group.examples.length).toBeLessThanOrEqual(3);
  });

  it('separates groups by field and kind, ordered by impact', () => {
    const rows = [
      ...Array.from({ length: 10 }, (_, index) => ({ id: `a-${index}`, date: { bad: true } })),
      ...Array.from({ length: 3 }, (_, index) => ({ id: `b-${index}` })), // missing required date
    ];
    const prepared = prepareImport(profileWith(rows));

    const kinds = prepared.report.warningGroups.map((group) => `${group.field}:${group.kind}`);
    expect(kinds).toContain('date:invalid');
    expect(kinds).toContain('date:missing');

    // Most-affected group first.
    const counts = prepared.report.warningGroups.map((group) => group.count);
    expect(counts).toEqual([...counts].sort((left, right) => right - left));
  });

  it('caps retained detail while keeping counts exact', () => {
    const broken = Array.from({ length: 2_000 }, (_, index) => ({
      id: `tx-${index}`,
      date: 'not-a-date',
    }));
    const prepared = prepareImport(profileWith(broken));

    expect(prepared.report.invalidDateCount).toBe(2_000);
    expect(prepared.report.totalDateIssueCount).toBe(2_000);
    expect(prepared.report.dateIssues).toHaveLength(MAX_RETAINED_DATE_ISSUES);
    expect(prepared.report.dateIssuesTruncated).toBe(true);
  });

  it('does not truncate or flag a small report', () => {
    const prepared = prepareImport(
      profileWith([{ id: 'tx-1', date: 'nope' }, { id: 'tx-2', date: '2026-03-05' }]),
    );
    expect(prepared.report.dateIssuesTruncated).toBe(false);
    expect(prepared.report.totalDateIssueCount).toBe(1);
    expect(prepared.report.dateIssues).toHaveLength(1);
  });

  it('reports duplicate IDs and profile conflicts as their own groups', () => {
    const prepared = prepareImport(
      profileWith([
        { id: 'dup', date: '2026-03-05' },
        { id: 'dup', date: '2026-03-06' },
      ]),
      ['p-bulk'],
    );

    const kinds = prepared.report.warningGroups.map((group) => group.kind);
    expect(kinds).toContain('duplicate');
    expect(kinds).toContain('conflict');
    expect(prepared.report.canImport).toBe(false);
  });

  it('keeps a clean import free of warnings', () => {
    const prepared = prepareImport(
      profileWith([
        { id: 'tx-1', date: '2026-03-05' },
        { id: 'tx-2', date: '2026-04-18' },
      ]),
    );
    expect(prepared.report.warnings).toEqual([]);
    expect(prepared.report.warningGroups).toEqual([]);
    expect(prepared.report.canImport).toBe(true);
  });
});
