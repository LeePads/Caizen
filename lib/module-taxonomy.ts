"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ModuleTaxonomyCategory } from "./types";
import { useAppContext } from './context';
import { createTaxonomyId, ensureUniqueTaxonomyIds } from './module-taxonomy-normalization';

export type TaxonomyModule =
  | "inventory"
  | "wishlist"
  | "skincare"
  | "supplements"
  | "work"
  | "personal"
  // Flat Supplement Type list (Vitamin, Mineral, ...). Stored separately
  // from the "supplements" module, which already holds the dosage-unit
  // taxonomy (capsules, tablets, ml) - the two are different concepts and
  // must not share one taxonomy list.
  | "supplement-types";

export type TaxonomyCategory = ModuleTaxonomyCategory;

export type TaxonomyPersistence = {
  /** Profile-backed value. Omit this object to retain the legacy localStorage behavior. */
  value: TaxonomyCategory[];
  onChange: (categories: TaxonomyCategory[]) => void;
  /** Import the previous unscoped localStorage taxonomy once when value is empty. */
  migrateLegacy?: boolean;
  /** Optional module-specific records to merge during that one-time migration. */
  legacyValue?: TaxonomyCategory[];
};

const STORAGE_PREFIX = "caizen-module-taxonomy-v1:";

function clean(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function keyOf(value: string) {
  return clean(value).toLocaleLowerCase();
}

function unique(values: string[]) {
  const seen = new Set<string>();
  return values.map(clean).filter((value) => {
    const key = keyOf(value);
    if (!value || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function normalizeTaxonomy(categories: TaxonomyCategory[]) {
  const byName = new Map<string, TaxonomyCategory>();

  categories.forEach((category) => {
    const name = clean(category?.name || "");
    if (!name) return;

    const key = keyOf(name);
    const existing = byName.get(key);
    const subcategories = unique([
      ...(existing?.subcategories || []),
      ...(category.subcategories || []),
    ]);
    const validKeys = new Set(subcategories.map(keyOf));

    byName.set(key, {
      id: existing?.id || category.id || createTaxonomyId(name),
      name: existing?.name || name,
      // Later, persisted values override configured defaults.
      archived: category.archived ?? existing?.archived ?? false,
      subcategories,
      archivedSubcategories: unique([
        ...(existing?.archivedSubcategories || []),
        ...(category.archivedSubcategories || []),
      ]).filter((value) => validKeys.has(keyOf(value))),
      customSubcategories: unique([
        ...(existing?.customSubcategories || []),
        ...(category.customSubcategories || []),
      ]).filter((value) => validKeys.has(keyOf(value))),
    });
  });

  return ensureUniqueTaxonomyIds(Array.from(byName.values()));
}

function read(module: TaxonomyModule) {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(
      localStorage.getItem(`${STORAGE_PREFIX}${module}`) || "[]",
    );
    return Array.isArray(value) ? normalizeTaxonomy(value) : [];
  } catch {
    return [];
  }
}

function writeLocal(module: TaxonomyModule, categories: TaxonomyCategory[]) {
  const next = normalizeTaxonomy(categories);
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${module}`, JSON.stringify(next));
    window.dispatchEvent(
      new CustomEvent("caizen:taxonomy-change", { detail: { module } }),
    );
  } catch (error) {
    console.error(`Unable to save ${module} taxonomy`, error);
  }
  return next;
}

export function useModuleTaxonomy(
  module: TaxonomyModule,
  defaults: Record<string, string[]> | string[],
  observed: Array<{ category?: string; subcategory?: string }> = [],
  persistence?: TaxonomyPersistence,
) {
  const defaultsSignature = JSON.stringify(defaults);
  const observedSignature = JSON.stringify(
    observed.map((record) => [record.category, record.subcategory]),
  );
  const persistedSignature = JSON.stringify(persistence?.value || []);
  const migratedRef = useRef(false);

  const configuredDefaults = useMemo<TaxonomyCategory[]>(
    () =>
      Array.isArray(defaults)
        ? defaults.map((name) => ({
            id: createTaxonomyId(name),
            name,
            subcategories: [],
          }))
        : Object.entries(defaults).map(([name, subcategories]) => ({
            id: createTaxonomyId(name),
            name,
            subcategories,
          })),
    [defaultsSignature],
  );

  const observedCategories = useMemo<TaxonomyCategory[]>(
    () =>
      observed
        .filter((record) => record.category)
        .map((record) => ({
          id: createTaxonomyId(record.category!),
          name: record.category!,
          subcategories: record.subcategory ? [record.subcategory] : [],
        })),
    [observedSignature],
  );

  // Categories/subcategories are denormalized strings stored directly on
  // domain records, not IDs — there is no foreign key to check for orphans.
  // Deletion safety instead comes from checking `observed`, the live
  // category/subcategory values read off the module's current records, so a
  // still-referenced value is never removed out from under existing data.
  const observedCategoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    observed.forEach((record) => {
      if (!record.category) return;
      const key = keyOf(record.category);
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return counts;
  }, [observedSignature]);

  const observedSubcategoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    observed.forEach((record) => {
      if (!record.category || !record.subcategory) return;
      const key = `${keyOf(record.category)}::${keyOf(record.subcategory)}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return counts;
  }, [observedSignature]);

  const isSystemCategory = useCallback(
    (name: string) =>
      configuredDefaults.some(
        (category) => keyOf(category.name) === keyOf(name),
      ),
    [configuredDefaults],
  );

  const isSystemSubcategory = useCallback(
    (categoryName: string, name: string) =>
      configuredDefaults.some(
        (category) =>
          keyOf(category.name) === keyOf(categoryName) &&
          category.subcategories.some(
            (subcategory) => keyOf(subcategory) === keyOf(name),
          ),
      ),
    [configuredDefaults],
  );

  const categoryUsageCount = useCallback(
    (name: string) => observedCategoryCounts.get(keyOf(name)) || 0,
    [observedCategoryCounts],
  );

  const subcategoryUsageCount = useCallback(
    (categoryName: string, name: string) =>
      observedSubcategoryCounts.get(`${keyOf(categoryName)}::${keyOf(name)}`) || 0,
    [observedSubcategoryCounts],
  );

  const sourceCategories = useMemo(
    () =>
      persistence ? normalizeTaxonomy(persistence.value || []) : read(module),
    [module, persistedSignature, Boolean(persistence)],
  );

  const compose = useCallback(
    (stored: TaxonomyCategory[]) => {
      const storedIds = new Map(stored.map(category => [keyOf(category.name), category.id]));
      const merged = normalizeTaxonomy([
        ...configuredDefaults,
        ...observedCategories,
        ...stored,
      ]);
      return ensureUniqueTaxonomyIds(merged.map(category => ({
        ...category,
        id: storedIds.get(keyOf(category.name)) || category.id,
      })));
    },
    [configuredDefaults, observedCategories],
  );

  const [categories, setCategories] = useState<TaxonomyCategory[]>(() =>
    compose(sourceCategories),
  );
  const categoriesRef = useRef(categories);

  useEffect(() => {
    const next = compose(sourceCategories);
    categoriesRef.current = next;
    setCategories(next);
  }, [compose, sourceCategories]);

  useEffect(() => {
    if (!persistence || !persistence.migrateLegacy || migratedRef.current)
      return;
    migratedRef.current = true;
    if (persistence.value.length > 0) return;

    const legacy = normalizeTaxonomy([
      ...read(module),
      ...(persistence.legacyValue || []),
    ]);
    if (legacy.length > 0) persistence.onChange(compose(legacy));
  }, [compose, module, persistence, persistedSignature]);

  useEffect(() => {
    if (persistence) return;
    const sync = (event?: Event) => {
      const detail = (event as CustomEvent<{ module?: string }> | undefined)
        ?.detail;
      if (detail?.module && detail.module !== module) return;
      setCategories(compose(read(module)));
    };
    window.addEventListener("caizen:taxonomy-change", sync);
    return () => window.removeEventListener("caizen:taxonomy-change", sync);
  }, [compose, module, persistence]);

  const persist = useCallback(
    (next: TaxonomyCategory[]) => {
      const normalized = normalizeTaxonomy(next);
      if (persistence) persistence.onChange(normalized);
      else writeLocal(module, normalized);
      return normalized;
    },
    [module, persistence],
  );

  const update = useCallback(
    (recipe: (current: TaxonomyCategory[]) => TaxonomyCategory[]) => {
      // Persistence updates the profile provider. Keep it outside React's
      // state updater, which React may replay while rendering.
      const next = persist(recipe(categoriesRef.current));
      categoriesRef.current = next;
      setCategories(next);
    },
    [persist],
  );

  const addCategory = useCallback(
    (name: string) =>
      update((current) => [
        ...current,
        {
          id: createTaxonomyId(name),
          name: clean(name),
          subcategories: [],
        },
      ]),
    [update],
  );

  const addSubcategory = useCallback(
    (categoryName: string, name: string) => {
      const nextName = clean(name);
      if (!nextName) return;
      update((current) =>
        current.map((category) =>
          keyOf(category.name) === keyOf(categoryName)
            ? {
                ...category,
                subcategories: unique([...category.subcategories, nextName]),
                customSubcategories: unique([
                  ...(category.customSubcategories || []),
                  nextName,
                ]),
                archivedSubcategories: (
                  category.archivedSubcategories || []
                ).filter((value) => keyOf(value) !== keyOf(nextName)),
              }
            : category,
        ),
      );
    },
    [update],
  );

  const archiveCategory = useCallback(
    (name: string, archived = true) =>
      update((current) =>
        current.map((category) =>
          keyOf(category.name) === keyOf(name)
            ? { ...category, archived }
            : category,
        ),
      ),
    [update],
  );

  const archiveSubcategory = useCallback(
    (categoryName: string, name: string, archived = true) =>
      update((current) =>
        current.map((category) => {
          if (keyOf(category.name) !== keyOf(categoryName)) return category;
          const hidden = category.archivedSubcategories || [];
          return {
            ...category,
            archivedSubcategories: archived
              ? unique([...hidden, name])
              : hidden.filter((value) => keyOf(value) !== keyOf(name)),
          };
        }),
      ),
    [update],
  );

  const renameCategory = useCallback(
    (from: string, to: string) =>
      update((current) =>
        current.map((category) =>
          keyOf(category.name) === keyOf(from)
            ? { ...category, name: clean(to) }
            : category,
        ),
      ),
    [update],
  );

  const renameSubcategory = useCallback(
    (categoryName: string, from: string, to: string) =>
      update((current) =>
        current.map((category) => {
          if (keyOf(category.name) !== keyOf(categoryName)) return category;
          const replace = (values: string[] = []) =>
            unique(
              values.map((value) =>
                keyOf(value) === keyOf(from) ? clean(to) : value,
              ),
            );
          return {
            ...category,
            subcategories: replace(category.subcategories),
            archivedSubcategories: replace(category.archivedSubcategories),
            customSubcategories: replace(category.customSubcategories),
          };
        }),
      ),
    [update],
  );

  // Guarded: won't remove a default/system subcategory (it would just be
  // re-injected by compose() on the next render) or one still referenced by
  // an existing record (that would silently reappear too, since `observed`
  // is folded back in on every compose). Returns whether the delete ran.
  const deleteSubcategory = useCallback(
    (categoryName: string, name: string) => {
      if (
        isSystemSubcategory(categoryName, name) ||
        subcategoryUsageCount(categoryName, name) > 0
      ) {
        return false;
      }
      update((current) =>
        current.map((category) =>
          keyOf(category.name) !== keyOf(categoryName)
            ? category
            : {
                ...category,
                subcategories: category.subcategories.filter(
                  (value) => keyOf(value) !== keyOf(name),
                ),
                archivedSubcategories: (
                  category.archivedSubcategories || []
                ).filter((value) => keyOf(value) !== keyOf(name)),
                customSubcategories: (
                  category.customSubcategories || []
                ).filter((value) => keyOf(value) !== keyOf(name)),
              },
        ),
      );
      return true;
    },
    [isSystemSubcategory, subcategoryUsageCount, update],
  );

  // Same guard as deleteSubcategory, for the same reason: a default or
  // still-referenced category would just reappear via compose() otherwise.
  const deleteCategory = useCallback(
    (name: string) => {
      if (isSystemCategory(name) || categoryUsageCount(name) > 0) {
        return false;
      }
      update((current) =>
        current.filter((category) => keyOf(category.name) !== keyOf(name)),
      );
      return true;
    },
    [isSystemCategory, categoryUsageCount, update],
  );

  const moveCategory = useCallback(
    (name: string, direction: -1 | 1) =>
      update((current) => {
        const next = [...current];
        const index = next.findIndex(
          (category) => keyOf(category.name) === keyOf(name),
        );
        const target = index + direction;
        if (index < 0 || target < 0 || target >= next.length) return current;
        [next[index], next[target]] = [next[target], next[index]];
        return next;
      }),
    [update],
  );

  const moveSubcategory = useCallback(
    (categoryName: string, name: string, direction: -1 | 1) =>
      update((current) =>
        current.map((category) => {
          if (keyOf(category.name) !== keyOf(categoryName)) return category;
          const subcategories = [...category.subcategories];
          const index = subcategories.findIndex(
            (value) => keyOf(value) === keyOf(name),
          );
          const target = index + direction;
          if (index < 0 || target < 0 || target >= subcategories.length) {
            return category;
          }
          [subcategories[index], subcategories[target]] = [
            subcategories[target],
            subcategories[index],
          ];
          return { ...category, subcategories };
        }),
      ),
    [update],
  );

  const getActiveSubcategories = useCallback(
    (categoryName: string) => {
      const category = categories.find(
        (item) => keyOf(item.name) === keyOf(categoryName),
      );
      if (!category) return [];
      const hidden = new Set((category.archivedSubcategories || []).map(keyOf));
      return category.subcategories.filter(
        (value) => !hidden.has(keyOf(value)),
      );
    },
    [categories],
  );

  return {
    categories,
    activeCategories: categories.filter((category) => !category.archived),
    addCategory,
    addSubcategory,
    archiveCategory,
    archiveSubcategory,
    renameCategory,
    renameSubcategory,
    deleteCategory,
    deleteSubcategory,
    moveCategory,
    moveSubcategory,
    getActiveSubcategories,
    isSystemCategory,
    isSystemSubcategory,
    categoryUsageCount,
    subcategoryUsageCount,
  };
}

/** Profile-scoped taxonomy boundary for collection screens and editors. */
export function useProfileModuleTaxonomy(
  module: TaxonomyModule,
  defaults: Record<string, string[]> | string[],
  observed: Array<{ category?: string; subcategory?: string }> = [],
  persistenceOverride?: TaxonomyPersistence,
) {
  const { profiles, currentProfileId, updateProfile } = useAppContext();
  const currentProfile = profiles.find(profile => profile.id === currentProfileId);
  const value = currentProfile?.moduleTaxonomies?.[module] || [];

  const profilePersistence: TaxonomyPersistence = {
    value,
    migrateLegacy: false,
    onChange: categories => {
      if (!currentProfile) return;
      updateProfile(currentProfile.id, {
        moduleTaxonomies: {
          ...(currentProfile.moduleTaxonomies || {}),
          [module]: normalizeTaxonomy(categories),
        },
      });
    },
  };

  return useModuleTaxonomy(module, defaults, observed, persistenceOverride ?? profilePersistence);
}
