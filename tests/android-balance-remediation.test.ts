import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8').replace(/\r\n/g, '\n');

describe('Android Balance remediation contracts', () => {
  it('keeps desktop menus while routing Balance actions to Android sheets', () => {
    const balance = read('components/sections/BalanceSection.tsx');
    const upcoming = read('components/balance/UpcomingMoneyPanel.tsx');
    const recurring = read('components/balance/RecurringTransactionsPanel.tsx');

    expect(balance).toContain('function AndroidBalanceActionSheet');
    expect(balance).toContain('<AndroidBalanceActionSheet');
    expect(balance).toContain('androidPresentation ? (');
    expect(balance).toContain('<DropdownMenu');
    expect(balance).toContain("\"Restore to this month's forecast\"");
    expect(balance).toContain("\"Remove from this month's forecast\"");
    expect(upcoming).toContain('androidPresentation?: boolean;');
    expect(upcoming).toContain('<CaizenBottomSheet');
    expect(upcoming).toContain("<DropdownMenu");
    expect(recurring).toContain('androidPresentation?: boolean;');
    expect(recurring).toContain('<CaizenBottomSheet');
    expect(recurring).toContain('Edit recurring transaction');
  });

  it('uses concise adjustment wording without changing the native behavior', () => {
    const modal = read('components/balance/TransactionModal.tsx');

    expect(modal).toContain("{ value: 'increase' as const, label: 'Increase balance' }");
    expect(modal).toContain("{ value: 'decrease' as const, label: 'Decrease balance' }");
    expect(modal).toContain("balance-form @container/balance-form");
  });

  it('uses a stacked Android donut breakdown without changing report calculations or web markup', () => {
    const chart = read('components/balance/ReportBreakdownChart.tsx');
    const reports = read('components/balance/ReportsPanel.tsx');

    expect(chart).toContain('androidPresentation?: boolean;');
    expect(chart).toContain('className="android-report-breakdown"');
    expect(chart).toContain('android-report-breakdown-list');
    expect(chart).toContain('row.percentage.toFixed(0)');
    expect(chart).toContain('@min-[34rem]/report:');
    expect(reports).toContain('androidPresentation?: boolean;');
    expect(reports).toContain('androidPresentation={androidPresentation}');
  });

  it('scopes native modal, picker, and compact budget navigation hardening to Capacitor', () => {
    const balance = read('components/sections/BalanceSection.tsx');
    const picker = read('components/ui/date-picker.tsx');
    const styles = read('app/globals.css');

    expect(balance).toContain('android-balance-modal-panel');
    expect(balance).toContain('android-balance-month-navigation');
    const androidBudgetNavigation = balance.slice(
      balance.indexOf('className="android-balance-month-navigation'),
      balance.indexOf('<div className="mt-4 grid gap-3 sm:grid-cols-3">'),
    );
    expect(androidBudgetNavigation).not.toContain('> Previous');
    expect(androidBudgetNavigation).not.toContain('> Next');
    expect(picker).toContain('android-balance-date-picker-sheet');
    expect(picker).toContain('data-action-count={nativeApp ? (clearable && !ariaIsRequired ? \'4\' : \'3\') : undefined}');
    expect(styles).toContain("html[data-capacitor='true'] .android-balance-modal-panel {");
    expect(styles).toContain('background-image: none !important;');
    expect(styles).toContain("html[data-capacitor='true'] .android-balance-action {");
    expect(styles).toContain("html[data-capacitor='true'] .android-report-breakdown {");
    expect(styles).toContain("html[data-capacitor='true'] .android-balance-date-picker-sheet {");
  });
});
