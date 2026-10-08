import type { InventoryItem, ModuleTaxonomyCategory } from '@/lib/types';
import { normalizeModuleTaxonomyCategories } from '@/lib/module-taxonomy-normalization';

export const INVENTORY_STORAGE_LOCATION_MODULE = 'inventory-locations' as const;

function cleanLocation(value: unknown) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

export function normalizeStorageLocation(value: unknown) {
  return cleanLocation(value).toLocaleLowerCase();
}

function locationId(name: string) {
  const slug = cleanLocation(name)
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `storage-location-${slug || 'location'}`;
}

export function createManagedStorageLocation(name: string): ModuleTaxonomyCategory {
  const cleaned = cleanLocation(name);
  return {
    id: locationId(cleaned),
    name: cleaned,
    archived: false,
    subcategories: [],
  };
}

export function cleanStorageLocation(value: unknown) {
  return cleanLocation(value);
}

export function normalizeManagedStorageLocations(value: unknown): ModuleTaxonomyCategory[] {
  return normalizeModuleTaxonomyCategories(value).map(location => ({
    id: location.id,
    name: location.name,
    archived: location.archived === true,
    subcategories: [],
  }));
}

export function composeInventoryStorageLocations(
  managedValue: unknown,
  inventoryItems: InventoryItem[],
) {
  const managed = normalizeManagedStorageLocations(managedValue);
  const seen = new Set(managed.map(location => normalizeStorageLocation(location.name)));
  const observed: ModuleTaxonomyCategory[] = [];

  inventoryItems.forEach(item => {
    const name = cleanLocation(item.storageLocation);
    const key = normalizeStorageLocation(name);
    if (!key || seen.has(key)) return;
    seen.add(key);
    observed.push({
      id: locationId(name),
      name,
      archived: false,
      subcategories: [],
    });
  });

  return [...managed, ...observed];
}

export function storageLocationUsageCount(
  inventoryItems: InventoryItem[],
  location: string,
) {
  const key = normalizeStorageLocation(location);
  if (!key) return 0;
  return inventoryItems.filter(item => normalizeStorageLocation(item.storageLocation) === key).length;
}

export function renameInventoryStorageLocationValues(
  inventoryItems: InventoryItem[],
  from: string,
  to: string,
) {
  const fromKey = normalizeStorageLocation(from);
  const nextName = cleanLocation(to);
  if (!fromKey || !nextName) return inventoryItems;

  return inventoryItems.map(item =>
    normalizeStorageLocation(item.storageLocation) === fromKey
      ? { ...item, storageLocation: nextName }
      : item,
  );
}
