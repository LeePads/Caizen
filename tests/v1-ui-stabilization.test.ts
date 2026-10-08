import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { formatLocalDate, parseLocalDate } from '@/components/ui/date-picker';
import { normalizeExternalWebUrl } from '@/lib/native/open-link';

const source = (relativePath: string) =>
  readFileSync(resolve(__dirname, '..', relativePath), 'utf8');

describe('date picker local-value reliability', () => {
  it('round-trips local dates without a timezone shift', () => {
    const value = '2028-02-29';
    const parsed = parseLocalDate(value);
    expect(parsed).toBeDefined();
    expect(formatLocalDate(parsed!)).toBe(value);
  });

  it('rejects malformed and impossible dates', () => {
    expect(parseLocalDate('2027-02-29')).toBeUndefined();
    expect(parseLocalDate('2026-13-01')).toBeUndefined();
    expect(parseLocalDate('03/14/2026')).toBeUndefined();
  });

  it('restores supported boundary values exactly', () => {
    expect(formatLocalDate(parseLocalDate('1900-01-01')!)).toBe('1900-01-01');
    expect(formatLocalDate(parseLocalDate('2100-12-31')!)).toBe('2100-12-31');
  });

  it('keeps the shared picker usable inside Caizen modal focus boundaries', () => {
    const picker = source('components/ui/date-picker.tsx');
    expect(picker).toContain('modal={false}');
    expect(picker).toContain('onOpenAutoFocus={event => event.preventDefault()}');
  });
});

describe('first-run onboarding focus and CTA layout', () => {
  it('announces each onboarding step and keeps actions above the mobile safe area', () => {
    const flow = source('components/onboarding/OnboardingFlow.tsx');
    expect(flow).toContain('<Dialog open onOpenChange=');
    expect(flow).toContain('heading.current?.focus()');
    expect(flow).toContain('<DialogContent');
    expect(flow).toContain('h-dvh max-h-dvh');
    expect(flow).toContain('env(safe-area-inset-bottom)');
    expect(flow).toContain('type="radio"');
  });
});

describe('safe external title destinations', () => {
  it('upgrades plain hostnames and preserves HTTPS destinations', () => {
    expect(normalizeExternalWebUrl('example.com/item')).toBe('https://example.com/item');
    expect(normalizeExternalWebUrl('https://example.com/item?q=1')).toBe('https://example.com/item?q=1');
  });

  it('rejects missing, malformed, insecure, and executable links', () => {
    expect(normalizeExternalWebUrl('')).toBeNull();
    expect(normalizeExternalWebUrl('http://example.com')).toBeNull();
    expect(normalizeExternalWebUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeExternalWebUrl('https://')).toBeNull();
  });
});

describe('hierarchical Back and overlay regressions', () => {
  it('keeps Dashboard Setup on the shared overlay stack and exposes step Back', () => {
    const dashboard = source('components/sections/Dashboard.tsx');
    expect(dashboard).toContain('useOverlayLifecycle(editingDashboard, requestDashboardSetupBack');
    expect(dashboard).toContain("setDashboardSetupStep(0)");
    expect(dashboard).toContain('ArrowLeft className');
  });

  it('pops one Settings destination instead of jumping directly home', () => {
    const settings = source('components/native/AndroidSettingsHub.tsx');
    expect(settings).toContain("useState<SettingsPage[]>(['home'])");
    expect(settings).toContain('current.slice(0, -1)');
  });

  it('returns Journal entry overlays to the still-mounted Journal list', () => {
    const journal = source('components/sections/JournalSection.tsx');
    const modal = source('components/modals/JournalModal.tsx');
    expect(journal).toContain('onClose={closeJournalEditor}');
    expect(modal).toContain('useOverlayLifecycle(isOpen, closeWithoutSaving, { containerRef: modalPanelRef });');
  });

  it('uses the portalled popover layer for Dashboard Quick Add', () => {
    const dashboard = source('components/sections/Dashboard.tsx');
    const popover = source('components/ui/popover.tsx');
    expect(dashboard).toContain('<Popover open={quickAddOpen}');
    expect(popover).toContain('PopoverPrimitive.Portal');
    expect(popover).toContain('z-[10500]');
    expect(source('lib/native/back-handler.ts')).toContain('[data-slot="popover-content"][data-state="open"]');
  });
});

describe('bounded Dashboard refinement contracts', () => {
  it('keeps Dashboard hierarchy concise and removes the retired density surface', () => {
    const dashboard = source('components/sections/Dashboard.tsx');

    expect(dashboard).toContain('eyebrow="TODAY"');
    expect(dashboard).toContain('title="What needs your attention"');
    expect(dashboard).toContain('Select a section to see how things are going.');
    expect(dashboard).not.toContain('A short list, not a life report');
    expect(dashboard).not.toContain('dashboard-density-compact');
    expect(dashboard).not.toContain('Controls spacing, not the amount of information.');
    expect(dashboard).toContain('getEffectiveMilestoneAchievements');
    expect(dashboard).not.toContain('showCategoryIcon={false}');
  });

  it('discards Dashboard setup locally and keeps one shared button focus contract', () => {
    const dashboard = source('components/sections/Dashboard.tsx');
    const dialog = source('components/common/ConfirmDialog.tsx');
    const button = source('components/ui/button.tsx');

    expect(dashboard).toContain('const cancelDashboardSettings = () =>');
    expect(dashboard).toContain('setDraftPreferences(localPreferences)');
    expect(dashboard).toContain('onClick={cancelDashboardSettings}');
    expect(dashboard).not.toContain('Your unsaved dashboard changes will be discarded.');
    expect(dialog).toContain("tone?: 'danger' | 'warning' | 'primary';");
    expect(dialog).toContain('motion-modal-backdrop');
    expect(dialog).toContain('motion-pop');
    expect(button).not.toContain('focus-visible:ring-[4px]');
  });
});

describe('adaptive dropdown accessibility', () => {
  it('uses the shared Caizen Select primitive on web and a named Android selection sheet', () => {
    const adaptive = source('components/native/android-design.tsx');
    // Regression guard: AndroidAdaptiveSelect's web path previously rendered
    // a raw native <select>, which shows the browser's own unstyled dropdown
    // (reported as "Vault Type uses native browser select"). It must use the
    // shared Caizen Select/Combobox primitive instead, consistently with
    // every other dropdown in the app.
    expect(adaptive).not.toContain('<select');
    expect(adaptive).toContain("from '@/components/ui/select'");
    expect(adaptive).toContain('<Select');
    expect(adaptive).toContain('value={webValue}');
    expect(adaptive).toContain('onValueChange={nextValue =>');
    expect(adaptive).toContain('role="listbox"');
    expect(adaptive).toContain('role="option"');
    expect(adaptive).toContain('aria-selected={option.value === value}');
    expect(adaptive).toContain('export function CaizenSelectInterceptor()');
    expect(source('components/native/NativeAppShell.tsx')).toContain('<CaizenSelectInterceptor />');
  });

  it('uses adaptive controls in the quick-capture workflow', () => {
    const taskModal = source('components/modals/LifeHubTaskModal.tsx');
    expect(taskModal.match(/<AndroidAdaptiveSelect/g)).toHaveLength(1);
    expect(taskModal).toContain('<AdaptiveDatePicker');
    expect(taskModal).toContain('<Switch');
  });
});
