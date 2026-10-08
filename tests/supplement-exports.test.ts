import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { buildSupplementCsv, buildSupplementExportDocument, buildSupplementXlsx, filterSupplementsForExport } from '@/lib/collections/supplement-exports';
import type { Supplement } from '@/lib/types';

const supplement = (overrides: Partial<Supplement> = {}): Supplement => ({ id: 'supplement-secret', name: 'Vitamin D', type: 'vitamin', purchasePrice: 200, currentPrice: 240, startDate: new Date('2026-08-01'), expiryDate: new Date('2026-09-01'), dosage: '1000 IU, 1x daily', dosageAmount: 1000, dosageUnit: 'IU', dailyIntake: 1, quantityRemaining: 30, schedule: 'morning', effects: 'Take with food', productLink: 'https://example.test/supplement', createdAt: new Date('2026-08-20'), ...overrides });

describe('Supplement exports', () => {
  it('keeps dosage unit paired but exports Remaining numerically only', () => {
    const report = buildSupplementExportDocument({ items: [supplement()], generatedAt: new Date('2026-08-24') });
    expect(report.items[0]).toMatchObject({ dosageAmount: 1000, dosageUnit: 'IU', remaining: 30, purchasePrice: 200, currentPrice: 240 });
    expect(JSON.stringify(report)).not.toContain('Remaining Unit');
    expect(buildSupplementCsv(report)).toContain('Dosage Amount,Dosage Unit,Daily Intake,Remaining');
    expect(buildSupplementCsv(report)).not.toContain('Remaining Unit');
    expect(buildSupplementCsv(report)).toContain('Purchase Price,Current Price');
  });

  it('preserves incompatible remaining quantities as row-level numeric values', () => {
    const report = buildSupplementExportDocument({ items: [supplement({ dosageUnit: 'mg', quantityRemaining: 1.234 }), supplement({ id: 'capsules', dosageUnit: 'capsules', quantityRemaining: 0 })] });
    expect(report.items.map(item => item.remaining)).toEqual([1.234, 0]);
    expect(report).not.toHaveProperty('quantityTotal');
    expect(report.schedules.reduce((total, row) => total + row.itemRecords, 0)).toBe(2);
  });

  it('filters schedule, unit, reminder, expiry, and price without dosage aggregation', () => {
    const records = [supplement({ id: 'match', schedule: 'morning', dosageUnit: 'mg', purchasePrice: 100, reminderEnabled: true }), supplement({ id: 'wrong', schedule: 'night', dosageUnit: 'capsules', purchasePrice: 900 })];
    expect(filterSupplementsForExport(records, { type: 'all', schedule: 'morning', dosageUnit: 'mg', reminderEnabled: 'yes', expiryState: 'later', minPrice: 50, maxPrice: 150 }, new Date('2026-08-01')).map(record => record.id)).toEqual(['match']);
    expect(() => filterSupplementsForExport(records, { type: 'all', schedule: 'all', dosageUnit: 'all', reminderEnabled: 'all', expiryState: 'all', minPrice: 150, maxPrice: 50 })).toThrow('Minimum price cannot be greater than maximum price.');
  });

  it('creates only Summary, Supplements, and Schedule sheets', async () => {
    const report = buildSupplementExportDocument({ items: [supplement()] });
    const files = unzipSync(new Uint8Array(await buildSupplementXlsx(report).arrayBuffer()));
    const workbook = strFromU8(files['xl/workbook.xml']);
    expect([...workbook.matchAll(/<sheet name="([^"]+)"/g)].map(match => match[1])).toEqual(['Summary', 'Supplements', 'Schedule']);
    expect(JSON.stringify(report)).not.toContain('supplement-secret');
  });

  it('includes current price in the printable report projection', () => {
    const printableReport = readFileSync(
      resolve(__dirname, '..', 'components/health/reports/PrintableSupplementsReport.tsx'),
      'utf8',
    );

    expect(printableReport).toContain('<th>Current Price</th>');
    expect(printableReport).toContain('amount(item.currentPrice, reportDocument.currency)');
  });
});
