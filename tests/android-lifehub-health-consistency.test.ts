import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8').replace(/\r\n/g, '\n');

describe('Android Life Hub and Health consistency contracts', () => {
  it('keeps Life Hub inbox tabs single-row and routine metrics aligned on Android', () => {
    const section = read('components/sections/LifeHubSection.tsx') + read('components/lifehub/LifeHubActivityWorkspace.tsx');
    const styles = read('app/globals.css');

    expect(section).toContain('role="tablist"');
    expect(section).toContain('lifehub-primary-tab');
    expect(section).toContain('android-routine-metric-grid');
    expect(section).toContain('<LifeHubActivityTimeline');
    expect(styles).toContain('.android-lifehub-inbox-tab');
    expect(styles).toContain('.android-routine-metric-grid .android-routine-metric-cell:nth-child(even)');
    expect(styles).toContain('.android-lifehub-activity-panel');
  });

  it('keeps Health date navigation centered, summary boundaries subtle, and actions compact', () => {
    const navigator = read('components/health/HealthDayNavigator.tsx');
    const section = read('components/sections/HealthSection.tsx');
    const supplements = read('components/sections/SupplementsSection.tsx');
    const styles = read('app/globals.css');

    expect(navigator).toContain('health-day-navigator');
    expect(section).toContain('android-health-today-summary');
    expect(section).toContain('android-food-action-row');
    expect(section).toContain('android-food-entry-actions');
    expect(section).toContain('Edit sleep log');
    expect(section).toContain('android-compact-action-button');
    expect(supplements).toContain('android-supplement-list');
    expect(supplements).toContain('android-supplement-thumb');
    expect(styles).toContain('grid-template-columns: 2.75rem minmax(0, 1fr) 2.75rem');
    expect(styles).toContain('.android-health-today-summary > .android-stat-cell:nth-child(n + 3)');
    expect(styles).toContain('.android-health-today-summary > .android-stat-cell:nth-child(5)');
  });

  it('uses adaptive Health overflow sheets while preserving the desktop menu path', () => {
    const overflow = read('components/health/HealthOverflowMenu.tsx');
    const health = read('components/sections/HealthSection.tsx');
    const supplements = read('components/sections/SupplementsSection.tsx');
    const workouts = read('components/health/WorkoutWorkspace.tsx');
    const lifeHub = read('components/sections/LifeHubSection.tsx');

    expect(overflow).toContain('CaizenBottomSheet');
    expect(overflow).toContain('DropdownMenu');
    expect(overflow).toContain('android-health-action-list');
    expect(health).toContain('<HealthOverflowMenu');
    expect(supplements).toContain('<HealthOverflowMenu');
    expect(workouts).toContain('<HealthOverflowMenu');
    expect(lifeHub).toContain('androidPresentation={androidPresentation}');
    expect(lifeHub).toContain('Delete routine');
    expect(overflow).toContain('dismissOnBackdrop');
  });

  it('uses shared Android backdrop dismissal while preserving Journal behavior', () => {
    const design = read('components/native/android-design.tsx');
    const modalShell = read('components/ui/section-kit.tsx');
    const journal = read('components/sections/JournalSection.tsx');

    expect(design).toContain('dismissOnBackdrop = true');
    expect(design).toContain('AndroidDismissibleBackdrop');
    expect(modalShell).toContain('<AndroidDismissibleBackdrop');
    expect(design).toContain('className="caizen-sheet-backdrop"');
    expect(journal).toContain('dismissOnBackdrop');
    expect(journal).toContain('className="android-journal-detail space-y-4"');
    expect(journal).toContain('playItems(linkedItem.id, [linkedItem])');
    expect(journal).toContain('openExternalLink(link)');
  });

  it('keeps the shared switch track sized and non-shrinking for Android cards', () => {
    const switchComponent = read('components/ui/switch.tsx');
    const nativeControls = read('components/native/android-design.tsx');
    const styles = read('app/globals.css');

    expect(switchComponent).toContain('h-6 min-h-6 w-11 min-w-11 shrink-0');
    expect(nativeControls).toContain('AndroidBooleanControl');
    expect(styles).toContain("html[data-capacitor='true'] [data-slot='switch']");
    expect(styles).toContain('flex: 0 0 auto;');
  });

  it('keeps duplicated Life Hub card actions in the Android action sheet', () => {
    const section = read('components/sections/LifeHubSection.tsx');

    expect(section).toContain("{ label: 'Convert to Task', icon: Target, onSelect: onConvert }");
    expect(section).toContain("{ label: 'Convert to Reminder', icon: Clock3, onSelect: onConvertReminder }");
    expect(section).toContain("{ label: 'Mark reminder done', icon: Check, onSelect: onComplete }");
    expect(section).toContain('!androidPresentation && !archived && !converted');
    expect(section).toContain('{!androidPresentation ? <div className="mt-4 flex flex-wrap gap-2">');
  });

  it('keeps Health entry navigation visible without page scroll restoration', () => {
    const section = read('components/sections/HealthSection.tsx');

    expect(section).toContain('android-health-entry-tabs');
    expect(section).toContain('aria-label="Health views"');
    expect(section).not.toContain('window.scrollTo({ top: 0');
  });
});
