import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

describe('Audit #10 remediation contracts', () => {
  it('keeps new Journal photo selection on managed media and legacy URLs readable', () => {
    const source = read('components/modals/JournalModal.tsx');
    expect(source).toContain("ownerType: 'journal'");
    expect(source).toContain('MediaAssetImage');
    expect(source).toContain('cleanupDraftMedia');
    expect(source).toContain('legacy/external image URL');
    expect(source).toContain("ownerId: draftEntryId");
  });

  it('keeps Work Hub desktop calendar cells independently operable and announced', () => {
    const source = read('components/work/WorkHubMonthGrid.tsx');
    expect(source).toContain('aria-label={`${date.toLocaleDateString');
    expect(source).toContain('aria-pressed={selected}');
    expect(source).toContain("aria-current={sameDay(date, new Date()) ? 'date' : undefined}");
  });

  it('uses the current native-entry contract in the Phase18 harness', () => {
    const source = read('scripts/android-phase18-visual.mjs');
    expect(source).toContain("from './lib/android-harness.mjs'");
    expect(source.match(/completeNativeEntry\(page\)/g)?.length).toBe(2);
  });
});
