import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { materializeDemoWorkspace } from '@/lib/demo/demo-workspace';
import { parseAndPrepareImport } from '@/lib/storage/import-integrity';
import { DEMO_JOURNEY, DEMO_LESSONS } from '@/lib/discovery/demo-journey';
import { SECTION_DISCOVERY_META } from '@/lib/discovery/section-meta';
const template = readFileSync('public/caizen-demo.json', 'utf8');
describe('educational sample', () => {
  it.each(['2026-10-03', '2028-02-29', '2027-01-31', '2026-12-01'])('remains importable and schedules routines on actual due days: %s', target => {
    const json = materializeDemoWorkspace(template, target);
    const prepared = parseAndPrepareImport(json);
    expect(prepared.report.canImport, prepared.report.warnings.join('\n')).toBe(true);
    const profile = JSON.parse(json).data.profiles[0];
    expect(profile.balanceProjectionRows).toHaveLength(JSON.parse(template).data.profiles[0].balanceProjectionRows.length);
    expect(profile.dailyChecklistItems.length).toBeGreaterThan(0);
    for (const routine of profile.dailyChecklistItems) for (const entry of routine.completionHistory) {
      const weekday = new Date(entry.date + 'T12:00:00Z').getUTCDay();
      if (routine.frequency === 'weekdays') expect([1, 2, 3, 4, 5]).toContain(weekday);
      if (routine.frequency === 'weekly' || routine.frequency === 'specific_weekday') expect(routine.weekdays?.length ? routine.weekdays : [0]).toContain(weekday);
      if (routine.frequency === 'monthly') expect(Number(entry.date.slice(8))).toBe(routine.dayOfMonth);
    }
  });
  it('preserves recorded wallet balances and linked sample records', () => {
    const profile = parseAndPrepareImport(template).state.profiles[0];
    const walletIds = new Set(profile.wallets.map(wallet => wallet.id));
    for (const transaction of profile.transactions) {
      expect(walletIds.has(transaction.walletId)).toBe(true);
      if (transaction.destinationWalletId) expect(walletIds.has(transaction.destinationWalletId)).toBe(true);
      const linkedRecord = transaction.linkedRecord;
      if (linkedRecord) {
        const collection = linkedRecord.module === 'inventory' ? profile.inventoryItems : profile.skincareProducts;
        expect(collection.some((item: { id: string }) => item.id === linkedRecord.recordId)).toBe(true);
      }
    }
    for (const wallet of profile.wallets) {
      expect(Number.isFinite(wallet.balance)).toBe(true);
      expect(wallet.balance).toBe(JSON.parse(template).data.profiles[0].wallets.find((item: { id: string }) => item.id === wallet.id).balance);
    }
    for (const event of profile.skincareUsageEvents ?? []) expect(profile.skincareProducts.some((product: { id: string }) => product.id === event.productId)).toBe(true);
  });
  it('covers every section with semantic, actionable guidance', () => {
    expect(new Set(DEMO_JOURNEY)).toEqual(new Set(Object.keys(SECTION_DISCOVERY_META)));
    for (const section of DEMO_JOURNEY) {
      expect(DEMO_LESSONS[section].notice).toBeTruthy();
      expect(SECTION_DISCOVERY_META[section].suggestedFirstAction).toBeTruthy();
      for (const related of SECTION_DISCOVERY_META[section].relatedSections ?? []) expect(SECTION_DISCOVERY_META).toHaveProperty(related);
    }
  });
});
