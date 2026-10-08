import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf8').replace(/\r\n/g, '\n');

describe('Android modal flow contracts', () => {
  it('routes Spending Plans to the native Plan categories manager', () => {
    const wishlist = read('components/sections/WishlistSection.tsx');
    const taxonomy = read('components/common/TaxonomySettingsButton.tsx');
    const workspace = read('components/common/TaxonomyWorkspace.tsx');

    expect(wishlist).toContain('module="wishlist" displayName="Plan"');
    expect(wishlist).toContain('androidPresentation={androidPresentation}');
    expect(taxonomy).toContain("if (props.module === 'wishlist') return <TaxonomyWorkspace {...props} />");
    expect(workspace).toContain('data-android-screen={androidPresentation ?');
    expect(workspace).toContain('data-caizen-nested-flow="open"');
  });

  it('keeps Save Meal on an explicit native sheet branch', () => {
    const health = read('components/sections/HealthSection.tsx');
    const food = read('components/modals/FoodModal.tsx');

    expect(health).toContain('androidPresentation={androidPresentation}');
    expect(food).toContain('androidPresentation?: boolean;');
    expect(food).toContain('<CaizenBottomSheet');
    expect(food).toContain('android-food-sheet-content');
    expect(food).toContain('useOverlayLifecycle(isOpen && !androidPresentation');
  });

  it('uses one discriminated Meal Template editor state', () => {
    const health = read('components/sections/HealthSection.tsx');

    expect(health).toContain('type MealTemplateEditor =');
    expect(health).toContain('setMealTemplateEditor({ mode: \'new\' })');
    expect(health).toContain('setMealTemplateEditor({ mode: \'edit\', template })');
    expect(health).not.toContain('showMealTemplateModal');
    expect(health).not.toContain('editingMealTemplate');
  });

  it('makes nested date dismissal explicit without weakening the parent guard', () => {
    const streak = read('components/modals/StreakTimelineModal.tsx');
    const picker = read('components/ui/date-picker.tsx');
    const native = read('components/native/android-design.tsx');

    expect(streak).toContain('datePickerOpenRef');
    expect(streak).toContain('allowOutsideDismiss={isAndroid() && !datePickerOpen}');
    expect(streak).toContain('onOpenChange={setDatePickerOpen}');
    expect(picker).toContain('onOpenChange?: (open: boolean) => void');
    expect(native).toContain('const openPicker = () =>');
    expect(native).toContain('const closePicker = () =>');
    expect(native).toContain('<CaizenBottomSheet open={open} title={label} onClose={closePicker}>');
  });
});
