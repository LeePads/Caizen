import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { normalizeModuleTaxonomyCategories, normalizeModuleTaxonomies } from '@/lib/module-taxonomy-normalization';

const read = (path: string) => readFileSync(path, 'utf8');

describe('targeted web and Android UX remediation contracts', () => {
  it('normalizes profile-scoped custom taxonomy deterministically', () => {
    expect(normalizeModuleTaxonomyCategories([
      { id: 'a', name: '  Devices ', subcategories: ['Audio', ' audio ', ''] },
      { id: 'b', name: 'devices', subcategories: ['Cables'] },
    ] as any)).toEqual([{
      id: 'a',
      name: 'Devices',
      archived: false,
      subcategories: ['Audio', 'Cables'],
      archivedSubcategories: [],
      customSubcategories: [],
    }]);
    expect(normalizeModuleTaxonomies({ inventory: [{ name: 'Devices', subcategories: [] }], other: null })).toHaveProperty('inventory');
  });

  it('keeps fixed-option controls semantic while applying shared closed-control treatment', () => {
    const css = read('app/globals.css');
    expect(css).toContain('select.control-input');
    expect(css).toContain('appearance: none');
    expect(read('components/ui/combobox.tsx')).toContain('modal={false}');
    expect(read('components/settings/SettingsHub.tsx')).not.toContain('type="color"');
  });

  it('keeps the currency prefix inline without a separate visual compartment', () => {
    const moneyInput = read('components/ui/money-input.tsx');
    expect(moneyInput).toContain('grid-cols-[auto_minmax(0,1fr)]');
    expect(moneyInput).toContain('pl-2 pr-3');
    expect(moneyInput).not.toContain('border-r');
    expect(moneyInput).not.toContain('min-w-[2.85rem]');
    expect(read('components/modals/WalletModal.tsx')).toContain('<MoneyInput');
  });

  it('keeps form backdrops inert and uses the shared no-scroll overlay focus path', () => {
    expect(read('components/modals/WishlistModal.tsx')).toContain('aria-hidden="true" className="fixed inset-0 bg-black/70 backdrop-blur-sm"');
    expect(read('components/modals/FoodModal.tsx')).toContain('absolute inset-0');
    expect(read('components/modals/ProductivityModal.tsx')).toContain('absolute inset-0');
    expect(read('hooks/use-overlay-lifecycle.ts')).toContain('preventScroll: true');
    expect(read('components/native/android-design.tsx')).toContain('list.scrollTo');
    expect(read('components/native/android-design.tsx')).not.toContain("scrollIntoView({ block: 'center' })");
    for (const file of [
      'components/modals/NotesModal.tsx',
      'components/modals/WeightModal.tsx',
      'components/modals/MealTemplatePickerModal.tsx',
      'components/modals/WalletModal.tsx',
      'components/modals/SupplementModal.tsx',
      'components/modals/PersonalVaultModal.tsx',
    ]) {
      expect(read(file)).not.toMatch(/onMouseDown=\{\s*event =>/);
    }
  });

  it('keeps managed profile avatar references on the existing media boundary', () => {
    expect(read('components/modals/ProfileModal.tsx')).toContain("ownerType: 'profile'");
    expect(read('components/modals/ProfileModal.tsx')).toContain('queueMediaCleanup');
    expect(read('lib/storage/media-references.ts')).toContain("'avatarAssetId'");
    expect(read('components/layout/ProfileSwitcher.tsx')).toContain('MediaAssetImage');
    expect(read('lib/profile/normalize-profile.ts')).toContain('moduleTaxonomies');
  });

  it('registers the approved Calendar, Routines, and Today widgets and keeps the action queue bounded', () => {
    const manifest = read('android/app/src/main/AndroidManifest.xml');
    const updater = read('android/app/src/main/java/app/caizen/life/CaizenWidgetUpdater.java');
    expect(manifest).toContain('.CaizenCalendarWidget');
    expect(manifest).toContain('.CaizenRoutinesWidget');
    expect(manifest).toContain('.CaizenTodayWidget');
    expect(manifest).not.toContain('.CaizenMusicWidget');
    expect(updater).toContain('CaizenRoutinesWidget.class');
    expect(read('android/app/src/main/java/app/caizen/life/WidgetRoutineActionStore.java')).toContain('MAX_ACTIONS = 32');
    expect(read('android/app/src/main/java/app/caizen/life/CaizenRoutinesWidget.java')).toContain('ROUTINE_COMPLETE');
    expect(read('android/app/src/main/res/layout/widget_calendar.xml')).toContain('@drawable/widget_row_background');
    expect(read('android/app/src/main/java/app/caizen/life/CaizenCalendarWidget.java')).toContain('profileId');
    expect(read('components/native/NativeAppShell.tsx')).toContain('completeRoutineOccurrenceForProfile');
    expect(read('components/native/NativeAppShell.tsx')).toContain('caizen:local-save-complete');
  });

  it('keeps streak visibility backward-compatible and calendar-scoped', () => {
    expect(read('lib/health/normalization.ts')).toContain('item.showMilestonesInCalendar !== false');
    expect(read('lib/lifehub/calendar-events.tsx')).toContain('tracker.showMilestonesInCalendar === false');
    expect(read('components/modals/StreakTimelineModal.tsx')).toContain('showMilestonesInCalendar');
  });
});
