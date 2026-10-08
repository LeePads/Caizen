import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8').replace(/\r\n/g, '\n');

describe('final Android runtime fix contracts', () => {
  it('hides Android scrollbar chrome without removing the authored scrollers', () => {
    const styles = read('app/globals.css');

    expect(styles).toContain("html[data-capacitor='true'] .caizen-content {");
    expect(styles).toContain('overflow-y: auto;');
    expect(styles).toContain('scrollbar-width: none;');
    expect(styles).toContain('.caizen-sheet-body');
    expect(styles).toContain('.caizen-form-modal-body');
  });

  it('contains Today actions and rows inside Android Life Hub cards', () => {
    const section = read('components/sections/LifeHubSection.tsx');
    const styles = read('app/globals.css');

    expect(section).toContain('lifehub-section-title-action');
    expect(section).toContain('flex min-w-0 w-full items-center');
    expect(styles).toContain("[data-caizen-feature='today'] > .grid > section");
    expect(styles).toContain('flex-basis: 100%;');
  });

  it('keeps Dashboard Customize on the existing setup flow with Android discard safety', () => {
    const dashboard = read('components/sections/Dashboard.tsx');

    expect(dashboard).toContain('data-dashboard-customize-trigger="true"');
    expect(dashboard).toContain('onClick={openDashboardSettings}');
    expect(dashboard).toContain('setEditingDashboard(true);');
    expect(dashboard).toContain('requestDashboardSetupClose');
    expect(dashboard).toContain('Keep editing');
  });

  it('prevents the Android touch-target rule from stretching shared switches and checkboxes', () => {
    const styles = read('app/globals.css');

    expect(styles).toContain("button:not([data-slot='checkbox']):not([data-slot='switch'])");
    expect(styles).toContain("[role='button']:not([data-slot='checkbox']):not([data-slot='switch'])");
    expect(styles).toContain("html[data-capacitor='true'] [data-slot='checkbox']");
    expect(styles).toContain("html[data-capacitor='true'] [data-slot='switch']");
    expect(styles).toContain('width: 1.5rem;');
    expect(styles).toContain('width: 2.75rem;');
  });

  it('uses the compact Android weight presentation while preserving the modal behavior', () => {
    const modal = read('components/modals/WeightModal.tsx');
    const health = read('components/sections/HealthSection.tsx');
    const styles = read('app/globals.css');

    expect(modal).toContain('androidPresentation?: boolean;');
    expect(modal).toContain('android-weight-modal-body');
    expect(health).toContain('androidPresentation={androidPresentation}');
    expect(styles).toContain('.android-weight-modal-panel');
    expect(styles).toContain('overflow-y: auto;');
  });

  it('resolves Android workout photos canonically while preserving the web path', () => {
    const media = read('components/health/WorkoutReferenceMedia.tsx');

    expect(media).toContain("import { resolveMedia } from '@/lib/storage/media-resolver';");
    expect(media).toContain('const useNativeMediaResolver = isNativeApp();');
    expect(media).toContain('resolveMedia(referencePhotoAssetId');
    expect(media).toContain('mediaStorage.getDisplayUrl');
  });
});
