import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

describe('shared Quick Add flow', () => {
  it('keeps Dashboard Quick Add in place and mounts one parent-owned host', () => {
    const page = read('app/app/page.tsx');
    const dashboard = read('components/sections/Dashboard.tsx');
    const dashboardQuickAdd = dashboard.slice(
      dashboard.indexOf('<Popover open={quickAddOpen}'),
      dashboard.indexOf('</Popover>', dashboard.indexOf('<Popover open={quickAddOpen}')),
    );

    expect(dashboard).toContain('onQuickAdd?.(');
    expect(dashboard).toContain('<CaizenBottomSheet');
    expect(dashboard).toContain('android-quick-add-sheet-action');
    for (const label of ['Task', 'Routine', 'Journal entry', 'Important date', 'Food log', 'Work item']) {
      expect(dashboard).toContain(`label: '${label}'`);
    }
    expect(dashboardQuickAdd).not.toContain('life-manager:navigate');
    expect(page).toContain('const [quickAddRequest, setQuickAddRequest]');
    expect(page).toContain('<QuickAddModalHost');
    expect(page).toContain('setQuickAddRequest({ kind });');
  });

  it('covers direct editors and type pickers without changing activeTab', () => {
    const host = read('components/common/QuickAddModalHost.tsx');
    const page = read('app/app/page.tsx');
    const quickAddSource = page.slice(
      page.indexOf('const openQuickAdd'),
      page.indexOf('const openSearchResult'),
    );

    for (const kind of [
      'task', 'routine', 'date', 'food', 'weight', 'journal', 'wallet',
      'expense', 'inventory', 'wishlist', 'supplement', 'game', 'media',
      'music', 'skincare', 'work', 'personal',
    ]) {
      expect(host).toContain(`case '${kind}':`);
    }
    expect(host).toContain('Choose the kind of work');
    expect(host).toContain('Choose how to organize this reference');
    expect(host).toContain('WorkHubQuickAddModal');
    expect(host).toContain('PersonalVaultQuickAddModal');
    expect(quickAddSource).not.toContain('setActiveTab(');
    expect(quickAddSource).not.toContain('life-manager:navigate');
  });

  it('keeps the simplified Life Hub task capture surface while retaining legacy values', () => {
    const taskModal = read('components/modals/LifeHubTaskModal.tsx');

    expect(taskModal).toContain("title={item ? `Update ${currentTypeLabel.toLowerCase()}` : 'Quick capture'}");
    expect(taskModal).toContain('FormField label="Deadline"');
    expect(taskModal).toContain('FormField label="Priority"');
    expect(taskModal).toContain('FormField label="Notes"');
    expect(taskModal).toContain('estimatedMinutes');
    expect(taskModal).not.toContain('Estimated Time');
    expect(taskModal).not.toContain('Planning');
  });
});
