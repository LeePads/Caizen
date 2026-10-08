import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  normalizeAdaptiveSelectionOptions,
  type CaizenSelectionOption,
} from '@/components/native/android-design';
import { getPresentationHistoryClearUpdates } from '@/lib/lifehub/history-presentation';

const source = (relativePath: string) =>
  readFileSync(resolve(__dirname, '..', relativePath), 'utf8');

describe('post-remediation shared Select regressions', () => {
  it('keeps empty native option values selectable without rendering invalid Radix items', () => {
    const options: CaizenSelectionOption[] = [
      { value: '', label: 'Any wallet' },
      { value: 'wallet-1', label: 'Everyday wallet' },
    ];

    const normalized = normalizeAdaptiveSelectionOptions(options);

    expect(normalized.map(option => option.value)).toEqual([
      '__caizen_empty_option_0',
      'wallet-1',
    ]);
    expect(normalized.map(option => option.sourceValue)).toEqual(['', 'wallet-1']);
    expect(normalized.every(option => option.value !== '')).toBe(true);
  });

  it('drops duplicate malformed option values deterministically', () => {
    const normalized = normalizeAdaptiveSelectionOptions([
      { value: 'same', label: 'First' },
      { value: 'same', label: 'Duplicate' },
      { value: '', label: 'Empty' },
      { value: '', label: 'Duplicate empty' },
    ]);

    expect(normalized.map(option => option.label)).toEqual(['First', 'Empty']);
  });

  it('keeps modal Select content above custom Work and Inventory modal shells', () => {
    expect(source('components/ui/select.tsx')).toContain('z-[10600]');
    expect(source('components/sections/WorkHubSection.tsx')).toContain('<WorkSelect');
    expect(source('components/modals/InventoryModal.tsx')).toContain('label="Status"');
    expect(source('components/modals/InventoryModal.tsx')).toContain('label="Acquisition Type"');
  });
});

describe('presentation-only Life Hub history clearing', () => {
  it('returns only hidden-history updates and leaves canonical item fields untouched', () => {
    const updates = getPresentationHistoryClearUpdates([
      { id: 'done-1' },
      { id: 'dropped-1' },
    ]);

    expect(updates).toEqual([
      { id: 'done-1', hiddenFromHistory: true },
      { id: 'dropped-1', hiddenFromHistory: true },
    ]);
    expect(updates[0]).not.toHaveProperty('status');
    expect(updates[0]).not.toHaveProperty('reward');
  });

  it('uses clear-history language while retaining the existing hidden flag', () => {
    const lifeHub = source('components/lifehub/LifeHubActivityWorkspace.tsx');
    expect(lifeHub).toContain('Clear history');
    expect(lifeHub).toContain('updateProfile(currentProfileId');
    expect(lifeHub).toContain('hiddenIds');
    expect(lifeHub).toContain('hiddenFromHistory: true');
    expect(lifeHub).not.toContain('forEach(updateProductivityItem');
    expect(lifeHub).not.toContain('confirmText="Hide history"');
  });
});

describe('Music interaction regressions', () => {
  it('portals the player options surface outside the clipped player stacking context', () => {
    const player = source('components/music/MusicFullPlayer.tsx');
    expect(player).toContain("createPortal((");
    expect(player).toContain('document.body');
    expect(source('styles/music-player.css')).toContain('overflow: hidden');
  });

  it('documents the implemented shortcut set and blocks shortcuts in editing surfaces', () => {
    const player = source('components/music/MusicFullPlayer.tsx');
    const music = source('lib/music-player.tsx');
    const editingTarget = source('lib/dom/is-text-editing-target.ts');
    expect(player).toContain('Keyboard shortcuts');
    expect(player).toContain('Shortcuts are disabled while typing.');
    expect(music).toContain('event.defaultPrevented');
    expect(editingTarget).toContain('[role="textbox"]');
    expect(editingTarget).toContain('[role="combobox"]');
  });
});
