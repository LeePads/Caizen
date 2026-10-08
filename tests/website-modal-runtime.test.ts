import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf8').replace(/\r\n/g, '\n');

describe('website platform and modal regression contracts', () => {
  it('keeps build output and runtime presentation platform-specific', () => {
    const config = read('next.config.mjs');
    const gate = read('components/native/NativeStartupGate.tsx');
    const page = read('app/app/page.tsx');
    const gitignore = read('.gitignore');

    expect(config).toContain("distDir: process.env.CAPACITOR_BUILD === '1' ? 'out' : '.next'");
    expect(gitignore).toContain('out/');
    expect(gate).not.toContain("document.documentElement.setAttribute('data-capacitor', 'true');");
    expect(page).toContain('setAndroidPresentation(isAndroid());');
    expect(page).not.toContain('document.documentElement.dataset.capacitor === \'true\'');
  });

  it('preserves body-level web and Android branches for all affected modal flows', () => {
    const dashboard = read('components/sections/Dashboard.tsx');
    const weight = read('components/modals/WeightModal.tsx');
    const picker = read('components/modals/MealTemplatePickerModal.tsx');
    const template = read('components/modals/MealTemplateModal.tsx');

    expect(dashboard).toContain('createPortal(');
    expect(dashboard).toContain('caizen-form-modal-root fixed inset-0');
    expect(dashboard).not.toContain('caizen-form-modal-root relative fixed');
    expect(dashboard).toContain('caizen-form-modal modal-card-enter relative z-10');
    expect(dashboard).toContain('<CaizenBottomSheet');
    expect(weight).toContain('createPortal(');
    expect(weight).toContain('<CaizenBottomSheet');
    expect(weight).toContain('relative z-10 w-full max-w-xl');
    expect(weight).toContain('items-center justify-center');
    expect(picker).toContain('createPortal(');
    expect(picker).toContain("androidPresentation ? 'items-end' : 'items-center'");
    expect(template).toContain('createPortal(');
    expect(template).toContain('flex items-center justify-center');
    expect(template).toContain('android-meal-template-modal-root');
  });

  it('keeps native modal alignment selectors scoped to the native marker', () => {
    const styles = read('app/globals.css');

    expect(styles).toContain("html[data-capacitor='true'] .caizen-modal-root");
    expect(styles).toContain("html[data-capacitor='true'] .caizen-form-modal-root");
    expect(styles).toContain("html[data-capacitor='true'] .android-weight-modal-root");
    expect(styles).toContain("html[data-capacitor='true'] .android-meal-template-picker-root");
    expect(styles).toContain("html[data-capacitor='true'] .android-meal-template-modal-root");
  });

  it('uses the shared Inventory desktop control hierarchy for web collections', () => {
    const inventory = read('components/sections/InventorySection.tsx');
    const skincare = read('components/sections/SkincareSection.tsx');
    const supplements = read('components/sections/SupplementsSection.tsx');
    const styles = read('app/globals.css');

    for (const source of [skincare, supplements]) {
      expect(source).toContain('section-surface w-full');
      expect(source).toContain('flex flex-col gap-4');
      expect(source).toContain('<SearchField');
      expect(source).toContain('wrapperClassName="w-full lg:max-w-md"');
      expect(source).toContain('lg:flex-row lg:items-center lg:justify-between');
      expect(source).toContain('control-button');
      expect(source).toContain('control-button-primary');
      expect(source).toContain('<ViewModeToggle');
    }

    expect(inventory).toMatch(/<TaxonomySettingsButton\s+module="inventory"/);
    expect(inventory).toContain('className="section-surface p-5"');
    expect(skincare).toContain('ariaLabel="Personal care category filter"');
    expect(skincare).toContain('ariaLabel="Sort personal care products"');
    expect(supplements).toContain('Export Supplements');
    expect(supplements).toContain('filterSupplementsForExport');
    expect(supplements).toContain('label="Type"');
    expect(supplements).toContain('label="Schedule"');
    expect(supplements).toContain('label="Expiry state"');
    expect(supplements).toContain('SUPPLEMENT_EXPIRY_OPTIONS');
    expect(supplements).not.toContain('android-supplements-toolbar section-surface');
    expect(styles).not.toContain("html:not([data-capacitor='true']) .caizen-skincare-controls");
  });
});
