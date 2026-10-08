import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { prepareImport } from '@/lib/storage/import-integrity';
import { restoreDataOnlyImport } from '@/lib/storage/backup-repository';
import { loadAppState } from '@/lib/storage/app-repository';
import { resetCaizenDatabaseForTests } from '@/lib/storage/database';

const measurements: Record<string, number> = {};

afterEach(async () => {
  await resetCaizenDatabaseForTests();
});

afterAll(() => {
  if (process.env.CAIZEN_WRITE_BENCHMARK !== '1') return;
  mkdirSync(join(process.cwd(), 'artifacts', 'local'), { recursive: true });
  writeFileSync(
    join(process.cwd(), 'artifacts', 'local', 'phase18-import-performance.json'),
    `${JSON.stringify({
      measuredAt: new Date().toISOString(),
      fixtureRecords: 5_000,
      ...measurements,
    }, null, 2)}\n`,
  );
});

describe('large JSON import performance', () => {
  it('validates in memory before one transactional write', async () => {
    const transactions = Array.from({ length: 5_000 }, (_, index) => ({
      id: `transaction-${index}`,
      date: `${2020 + (index % 7)}-${String((index % 12) + 1).padStart(2, '0')}-${String((index % 27) + 1).padStart(2, '0')}`,
      amount: index + 1,
    }));
    const payload = {
      format: 'caizen-data',
      version: 3,
      data: {
        currentProfileId: 'large-import',
        profiles: [{
          id: 'large-import',
          name: 'Large import',
          transactions,
          health: {},
        }],
      },
    };

    const parseStarted = performance.now();
    const prepared = prepareImport(payload);
    measurements.parseAndValidateMs = Number(
      (performance.now() - parseStarted).toFixed(2),
    );
    expect(prepared.report.canImport).toBe(true);
    expect(prepared.report.recordCounts.transactions).toBe(5_000);

    const writeStarted = performance.now();
    await restoreDataOnlyImport(prepared, 'replace');
    measurements.transactionalWriteMs = Number(
      (performance.now() - writeStarted).toFixed(2),
    );

    const restored = await loadAppState();
    expect(
      (restored?.profiles[0] as unknown as { transactions: unknown[] }).transactions,
    ).toHaveLength(5_000);
    expect(measurements.parseAndValidateMs).toBeLessThan(5_000);
    expect(measurements.transactionalWriteMs).toBeLessThan(10_000);
  });
});
