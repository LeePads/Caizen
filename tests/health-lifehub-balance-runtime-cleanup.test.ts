import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

describe('focused Health, Life Hub, and Balance runtime cleanup contracts', () => {
  it('keeps collection controls grouped without stretching the desktop filters', () => {
    const supplements = read('components/sections/SupplementsSection.tsx');
    const plans = read('components/sections/WishlistSection.tsx');
    const tasks = read('components/sections/LifeHubSection.tsx');

    expect(supplements).toContain('caizen-supplements-controls section-surface w-full p-4 sm:p-5');
    expect(supplements).toContain('flex flex-col gap-4');
    expect(supplements).toContain('lg:flex-row lg:items-center lg:justify-between');
    expect(supplements).toContain('Export Supplements');
    expect(supplements).toContain('Add Supplement');

    expect(plans).toContain('label="Plan status"');
    expect(plans).toContain('label="Target date"');
    expect(plans).toContain('aria-label="Search plans"');
    expect(plans).toContain('sm:max-w-36 sm:flex-none');
    expect(plans).toContain('label="Category"');
    expect(plans).toContain('onClick={openAdd}');
    expect(plans).toContain('onClick={() => setShowExportModal(true)}');
    expect(plans).toContain('Add purchase plan');

    expect(tasks).toContain('md:justify-between');
    expect(tasks).toContain('md:max-w-[26.25rem] md:flex-1');
    expect(tasks).toContain('<Select value={taskSort}');
  });

  it('places BMI in Today and keeps Latest Weight in More today only', () => {
    const health = read('components/sections/HealthSection.tsx');
    const summary = health.slice(
      health.indexOf('const todaySummaryItems = ['),
      health.indexOf('const saveHealthPatch =', health.indexOf('const todaySummaryItems = [')),
    );
    const moreToday = health.slice(
      health.indexOf('const overviewCards = ['),
      health.indexOf('const uniqueSavedFoods =', health.indexOf('const overviewCards = [')),
    );

    expect(summary).toContain("label: 'BMI'");
    expect(summary).not.toContain("label: 'Latest weight'");
    expect(moreToday).toContain("label: 'Latest weight'");
    expect(moreToday).not.toContain("label: 'BMI'");
  });

  it('uses the shared activity date control and keeps calories in the main fields', () => {
    const modal = read('components/modals/WorkoutModal.tsx');

    expect(modal).toContain("import { AdaptiveDatePicker } from '@/components/ui/date-picker';");
    expect(modal).toContain('<AdaptiveDatePicker');
    expect(modal).toContain('label="Calories Burned (Optional)"');
    expect(modal).not.toContain('Add a workout photo');
    expect(modal).not.toContain('Upload image');
    expect(modal).not.toContain('Workout photo URL');
  });

  it('guards Balance editor close before CaizenFormDialog enters its exit state', () => {
    const shell = read('components/ui/section-kit.tsx');
    const transaction = read('components/balance/TransactionModal.tsx');
    const budget = read('components/sections/BalanceSection.tsx');
    const recurring = read('components/balance/RecurringTransactionModal.tsx');
    const occurrence = read('components/balance/RecurringOccurrenceModal.tsx');

    expect(shell).toContain('onBeforeClose?: () => boolean;');
    expect(shell).toContain('if (onBeforeClose && !onBeforeClose()) return;');
    for (const source of [transaction, budget, recurring, occurrence]) {
      expect(source).toContain('onBeforeClose={canClose}');
      expect(source).toContain('return false;');
      expect(source).toContain('onCancel={() => setShowDiscard(false)}');
    }
  });
});
