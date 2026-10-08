import type { ModuleTaxonomyCategory } from './types';

function clean(value: unknown) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function keyOf(value: string) {
  return clean(value).toLocaleLowerCase();
}

export function createTaxonomyId(name: string): string {
  const canonical = keyOf(name);
  const slug = canonical.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'category';
  let hash = 2166136261;
  for (let index = 0; index < canonical.length; index += 1) {
    hash = Math.imul(hash ^ canonical.charCodeAt(index), 16777619);
  }
  return `taxonomy-${slug}-${(hash >>> 0).toString(36)}`;
}

export function ensureUniqueTaxonomyIds<T extends { id: string; name: string }>(categories: T[]): T[] {
  const used = new Set<string>();
  return categories.map(category => {
    const preferred = clean(category.id) || createTaxonomyId(category.name);
    let id = preferred;
    if (used.has(id)) {
      const base = createTaxonomyId(category.name);
      id = base;
      let suffix = 2;
      while (used.has(id)) id = `${base}-${suffix++}`;
    }
    used.add(id);
    return id === category.id ? category : { ...category, id };
  });
}

function uniqueStrings(value: unknown) {
  const seen = new Set<string>();
  return (Array.isArray(value) ? value : [])
    .map(clean)
    .filter((item): item is string => {
      const key = keyOf(item);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function normalizeModuleTaxonomyCategories(input: unknown): ModuleTaxonomyCategory[] {
  const byName = new Map<string, ModuleTaxonomyCategory>();
  (Array.isArray(input) ? input : []).forEach((raw: any) => {
    const name = clean(raw?.name);
    if (!name) return;
    const key = keyOf(name);
    const current = byName.get(key);
    const subcategories = uniqueStrings([
      ...(current?.subcategories || []),
      ...(raw?.subcategories || []),
    ]);
    const valid = new Set(subcategories.map(keyOf));
    const archivedSubcategories = uniqueStrings([
      ...(current?.archivedSubcategories || []),
      ...(raw?.archivedSubcategories || []),
    ]).filter(value => valid.has(keyOf(value)));
    const customSubcategories = uniqueStrings([
      ...(current?.customSubcategories || []),
      ...(raw?.customSubcategories || []),
    ]).filter(value => valid.has(keyOf(value)));

    byName.set(key, {
      id: current?.id || clean(raw?.id) || createTaxonomyId(name),
      name: current?.name || name,
      archived: raw?.archived === true || current?.archived === true,
      subcategories,
      archivedSubcategories,
      customSubcategories,
    });
  });
  return ensureUniqueTaxonomyIds(Array.from(byName.values()));
}

export function normalizeModuleTaxonomies(input: unknown): Record<string, ModuleTaxonomyCategory[]> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  return Object.fromEntries(
    Object.entries(input as Record<string, unknown>)
      .map(([module, categories]) => [module, normalizeModuleTaxonomyCategories(categories)] as const)
      .filter(([, categories]) => categories.length > 0),
  );
}
