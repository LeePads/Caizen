import {
  normalizePersonalVaultTaxonomy,
  personalVaultTaxonomySignature,
} from "./normalization";
import type { ModuleTaxonomyCategory } from "../types";

export const LEGACY_VAULT_TAXONOMY_OWNER_KEY =
  "caizen-vault-taxonomy-legacy-owner-v1";

type MigrationMarker = {
  profileId: string;
  status: "pending" | "consumed";
  signature: string;
};

export type LegacyVaultTaxonomyMigration =
  | {
      kind: "apply";
      profileId: string;
      categories: ModuleTaxonomyCategory[];
      signature: string;
      currentSignature: string;
    }
  | {
      kind: "complete";
      profileId: string;
      signature: string;
    }
  | null;

const legacyKey = (type: string) => `vault-tabs-${type}`;

const sectionTypes = ["document", "career", "creative", "install", "links"];

function readMarker(): MigrationMarker | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const parsed = JSON.parse(
      localStorage.getItem(LEGACY_VAULT_TAXONOMY_OWNER_KEY) || "null",
    ) as Partial<MigrationMarker> | null;
    if (
      !parsed ||
      typeof parsed.profileId !== "string" ||
      !parsed.profileId ||
      !["pending", "consumed"].includes(String(parsed.status)) ||
      typeof parsed.signature !== "string"
    ) {
      return null;
    }
    return parsed as MigrationMarker;
  } catch {
    return null;
  }
}

export function readLegacyVaultTaxonomy(): ModuleTaxonomyCategory[] {
  if (typeof localStorage === "undefined") return [];

  const entries = sectionTypes.flatMap((type) => {
    try {
      const parsed = JSON.parse(
        localStorage.getItem(legacyKey(type)) ||
          '{"added":[],"hidden":[]}',
      ) as { added?: unknown; hidden?: unknown };
      const added = Array.isArray(parsed?.added)
        ? parsed.added
            .map((entry) => {
              if (entry && typeof entry === "object" && "id" in entry) {
                const id = (entry as { id?: unknown }).id;
                return typeof id === "string" ? id.trim() : "";
              }
              return "";
            })
            .filter(Boolean)
        : [];
      const hidden = Array.isArray(parsed?.hidden)
        ? parsed.hidden.filter(
            (entry): entry is string =>
              typeof entry === "string" && Boolean(entry.trim()),
          )
        : [];
      if (added.length === 0 && hidden.length === 0) return [];
      return [
        {
          id: `taxonomy-${type}`,
          name: type,
          subcategories: added,
          customSubcategories: added,
          archivedSubcategories: hidden,
        },
      ];
    } catch {
      return [];
    }
  });

  return normalizePersonalVaultTaxonomy(entries);
}

export function prepareLegacyVaultTaxonomyMigration(
  profileId: string | undefined,
  current: unknown,
  legacy: unknown,
): LegacyVaultTaxonomyMigration {
  if (!profileId) return null;

  const marker = readMarker();
  if (marker?.profileId && marker.profileId !== profileId) return null;

  const legacyCategories = normalizePersonalVaultTaxonomy(legacy);
  if (marker?.status === "consumed") {
    return legacyCategories.length > 0
      ? { kind: "complete", profileId, signature: marker.signature }
      : null;
  }
  if (legacyCategories.length === 0) return null;

  const currentCategories = normalizePersonalVaultTaxonomy(current);
  const categories = normalizePersonalVaultTaxonomy([
    ...currentCategories,
    ...legacyCategories,
  ]);
  const currentSignature = personalVaultTaxonomySignature(currentCategories);
  const signature = personalVaultTaxonomySignature(categories);

  if (
    marker?.status === "pending" &&
    marker.signature === signature &&
    currentSignature === signature
  ) {
    return { kind: "complete", profileId, signature };
  }

  return {
    kind: "apply",
    profileId,
    categories,
    signature,
    currentSignature,
  };
}

export function markLegacyVaultTaxonomyPending(
  profileId: string,
  signature: string,
) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      LEGACY_VAULT_TAXONOMY_OWNER_KEY,
      JSON.stringify({ profileId, status: "pending", signature }),
    );
  } catch {
    // The profile update remains the source of truth; a later startup retries.
  }
}

export function completeLegacyVaultTaxonomyMigration(
  profileId: string,
  signature: string,
) {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(
      LEGACY_VAULT_TAXONOMY_OWNER_KEY,
      JSON.stringify({ profileId, status: "consumed", signature }),
    );
    sectionTypes.forEach((type) => localStorage.removeItem(legacyKey(type)));
  } catch {
    // Keep the consumed owner marker; a subsequent startup can retry cleanup.
  }
}
