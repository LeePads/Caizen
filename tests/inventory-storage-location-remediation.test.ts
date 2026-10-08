import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  composeInventoryStorageLocations,
  normalizeStorageLocation,
  renameInventoryStorageLocationValues,
  storageLocationUsageCount,
} from '@/lib/inventory-storage-locations';
import { normalizeInventoryRecord } from '@/lib/collections/normalization';
import { normalizeModuleTaxonomies } from '@/lib/module-taxonomy-normalization';
import type { InventoryItem } from '@/lib/types';

const source = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

const item = (overrides: Partial<InventoryItem> = {}): InventoryItem => ({
  id: `inventory-${Math.random()}`,
  profileId: 'profile-storage-location',
  name: 'Storage test item',
  quantity: 1,
  unit: 'piece',
  category: 'utilities',
  purchaseDate: new Date('2026-08-20T00:00:00Z'),
  createdAt: new Date('2026-08-20T00:00:00Z'),
  ...overrides,
});

describe('Inventory storage location management', () => {
  it('keeps the profile taxonomy key flat and appends observed legacy values after managed order', () => {
    const locations = composeInventoryStorageLocations([
      { id: 'office', name: 'Office', archived: true, subcategories: [] },
      { id: 'desk', name: 'Desk', subcategories: [] },
    ], [
      item({ storageLocation: 'Desk' }),
      item({ storageLocation: 'Bedroom Cabinet' }),
      item({ storageLocation: ' office ' }),
    ]);

    expect(locations.map(location => location.name)).toEqual(['Office', 'Desk', 'Bedroom Cabinet']);
    expect(locations[0]).toMatchObject({ id: 'office', archived: true, subcategories: [] });
    expect(normalizeModuleTaxonomies({
      'inventory-locations': [{ id: 'desk', name: 'Desk', subcategories: [] }],
    })).toHaveProperty('inventory-locations');
  });

  it('normalizes usage matching and renames every matching record without touching unrelated fields', () => {
    const records = [
      item({ id: 'match-a', storageLocation: ' Bedroom  Cabinet ' }),
      item({ id: 'match-b', storageLocation: 'bedroom cabinet', notes: 'Keep dry' }),
      item({ id: 'other', storageLocation: 'Hall Cabinet', status: 'stored' }),
    ];

    expect(normalizeStorageLocation(' Bedroom  Cabinet ')).toBe('bedroom cabinet');
    expect(storageLocationUsageCount(records, 'BEDROOM CABINET')).toBe(2);

    const renamed = renameInventoryStorageLocationValues(records, 'Bedroom Cabinet', 'Office Cabinet');
    expect(renamed.map(record => record.storageLocation)).toEqual([
      'Office Cabinet',
      'Office Cabinet',
      'Hall Cabinet',
    ]);
    expect(renamed[1]).toMatchObject({ id: 'match-b', notes: 'Keep dry' });
    expect(renamed[2]).toBe(records[2]);
  });

  it('preserves the existing Inventory normalization contract', () => {
    const normalized = normalizeInventoryRecord({
      id: 'inventory-normalized-location',
      name: 'Desk item',
      category: 'utilities',
      storageLocation: '  Bedroom   Cabinet  ',
      purchaseDate: '2026-08-20',
      createdAt: '2026-08-20',
    });

    expect(normalized.storageLocation).toBe('Bedroom Cabinet');
  });

  it('keeps the location UI bounded, accessible, and atomic at the profile boundary', () => {
    const manager = source('components/common/InventoryStorageLocationSettingsButton.tsx');
    const locationHelper = source('lib/inventory-storage-locations.ts');
    const modal = source('components/modals/InventoryModal.tsx');
    const section = source('components/sections/InventorySection.tsx');
    const exportModal = source('components/modals/InventoryExportModal.tsx');
    const taxonomy = source('lib/module-taxonomy.ts');

    expect(locationHelper).toContain("INVENTORY_STORAGE_LOCATION_MODULE = 'inventory-locations'");
    expect(manager).toContain('updateProfile(profile.id, {');
    expect(manager).toContain('inventoryItems: nextInventoryItems');
    expect(manager).toContain('storageLocationUsageCount');
    expect(manager).toContain('archiveLocation');
    expect(manager).toContain('aria-pressed={view === \'active\'}');
    expect(manager).toContain('aria-pressed={view === \'archived\'}');
    expect(manager).toContain('More actions for ${location.name}');
    expect(manager).toContain('No matching locations.');
    expect(manager).toContain('Clear search');
    expect(manager).toContain('min-h-11 min-w-11');
    const hub = source('components/common/TaxonomyHub.tsx');
    expect(hub).toContain('useOverlayLifecycle');
    expect(hub).toContain('initialFocusSelector:');
    expect(manager).toContain('type="button"');

    expect(modal).toContain('<AndroidAdaptiveCombobox');
    expect(modal).toContain('storageLocationOptions');
    expect(modal).toContain('onChange={setStorageLocation}');
    expect(modal).toContain('No active locations. Add one from Taxonomy.');
    expect(section).toContain('composeInventoryStorageLocations');
    expect(section).toContain('normalizeStorageLocation(item.storageLocation)');
    expect(exportModal).toContain('locationOptions: string[]');
    expect(taxonomy).toContain('const compose = useCallback');
    expect(taxonomy).not.toContain("inventory-locations");
  });
});
