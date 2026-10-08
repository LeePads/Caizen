import { parseLocalDateKey } from "../lifehub/date-utils";
import { normalizeExternalWebUrl } from "../native/open-link";
import type {
  ModuleTaxonomyCategory,
  PersonalVaultItem,
  PersonalVaultType,
} from "../types";

const EPOCH = new Date(0);

export const PERSONAL_VAULT_TYPES: PersonalVaultType[] = [
  "document",
  "career",
  "creative",
  "install",
  "links",
];

const DEFAULT_SUBTYPES: Record<PersonalVaultType, string> = {
  document: "other",
  career: "resume-portfolio",
  creative: "other",
  install: "essential-apps",
  links: "favorites-shortcuts",
};

const LEGACY_TYPE_MAP: Record<
  string,
  { type: PersonalVaultType; subType: string }
> = {
  document: { type: "document", subType: "other" },
  government: { type: "document", subType: "identity-government" },
  resume: { type: "career", subType: "resume-portfolio" },
  career: { type: "career", subType: "resume-portfolio" },
  achievement: { type: "career", subType: "certificates" },
  certificate: { type: "career", subType: "certificates" },
  favorite: { type: "links", subType: "favorites-shortcuts" },
  shortcut: { type: "links", subType: "favorites-shortcuts" },
  software: { type: "install", subType: "essential-apps" },
  media: { type: "creative", subType: "videos" },
  learning: { type: "links", subType: "learning" },
  hobby: { type: "creative", subType: "other" },
  account: { type: "links", subType: "favorites-shortcuts" },
};

const SUBTYPE_MIGRATION: Partial<
  Record<PersonalVaultType, Record<string, string>>
> = {
  document: {
    government: "identity-government",
    id: "identity-government",
    receipt: "receipts-warranties",
    warranty: "receipts-warranties",
    bill: "finance-bills",
    finance: "finance-bills",
  },
  career: {
    resume: "resume-portfolio",
    portfolio: "resume-portfolio",
    coe: "employment",
    certificate: "certificates",
    presentation: "presentations",
  },
  creative: {
    music: "recordings",
    video: "videos",
    practice: "projects-practice",
  },
  install: {
    essential: "essential-apps",
    driver: "drivers",
    "dev-tool": "developer-tools",
    "audio-tool": "creative-tools",
    "gaming-tool": "gaming",
    utility: "utilities-extensions",
    extension: "utilities-extensions",
  },
  links: {
    "favorite-site": "favorites-shortcuts",
    shortcut: "favorites-shortcuts",
    "government-portal": "government",
    onedrive: "cloud-storage",
    "google-drive": "cloud-storage",
    tool: "tools",
    canva: "creative-resources",
    "music-resource": "creative-resources",
  },
};

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;

const cleanString = (value: unknown): string | undefined => {
  if (typeof value !== "string") return undefined;
  const cleaned = value.trim().replace(/\s+/g, " ");
  return cleaned || undefined;
};

const optionalString = (value: unknown) => cleanString(value);

const stringArray = (value: unknown) =>
  Array.isArray(value)
    ? value.map(cleanString).filter((entry): entry is string => Boolean(entry))
    : [];

const booleanValue = (value: unknown, fallback = false) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.trim().toLocaleLowerCase() === "true") return true;
    if (value.trim().toLocaleLowerCase() === "false") return false;
  }
  if (value === 1) return true;
  if (value === 0) return false;
  return fallback;
};

const keyOf = (value: string) => value.toLocaleLowerCase();

const uniqueStrings = (values: string[]) => {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = keyOf(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function stableVaultId(value: UnknownRecord, index: number) {
  const seed = JSON.stringify([
    value.type,
    value.title ?? value.name ?? value.label,
    value.link ?? value.url,
    value.date ?? value.issuedAt ?? value.issued_at,
    value.expiryDate ?? value.expiresAt ?? value.expiry_date,
    index,
  ]);
  return `vault-${stableHash(seed)}`;
}

function normalizeDate(value: unknown, fallback: Date | null = null) {
  if (value === null || value === undefined || value === "") return fallback;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? fallback : new Date(value);
  }
  if (typeof value !== "string" && typeof value !== "number") return fallback;
  const date =
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? parseLocalDateKey(value)
      : new Date(value);
  return !date || Number.isNaN(date.getTime()) ? fallback : date;
}

function normalizeUrl(value: unknown) {
  return typeof value === "string" ? normalizeExternalWebUrl(value) ?? undefined : undefined;
}

export function normalizePersonalVaultItem(
  input: unknown,
  index = 0,
  options: { now?: Date } = {},
): PersonalVaultItem | null {
  const value = asRecord(input);
  if (!value) return null;

  const rawType = cleanString(value.type)?.toLocaleLowerCase() || "document";
  const mapped = LEGACY_TYPE_MAP[rawType];
  const type = mapped?.type ||
    (PERSONAL_VAULT_TYPES.includes(rawType as PersonalVaultType)
      ? (rawType as PersonalVaultType)
      : "document");
  const rawSubtype =
    cleanString(value.subType) ||
    cleanString(value.subcategory) ||
    cleanString(value.category) ||
    mapped?.subType ||
    DEFAULT_SUBTYPES[type];
  const subType = SUBTYPE_MIGRATION[type]?.[rawSubtype.toLocaleLowerCase()] || rawSubtype;
  const title =
    cleanString(value.title) ||
    cleanString(value.name) ||
    cleanString(value.label) ||
    "Untitled reference";
  const referenceHint =
    optionalString(value.referenceHint) || optionalString(value.usernameHint);
  const createdAt =
    normalizeDate(value.createdAt ?? value.created_at, options.now || EPOCH) ||
    new Date(options.now || EPOCH);
  const id =
    cleanString(value.id) ||
    stableVaultId(value, index);
  const installStatus = ["needed", "installed", "optional"].includes(
    String(value.installStatus),
  )
    ? (value.installStatus as PersonalVaultItem["installStatus"])
    : undefined;

  return {
    id,
    type,
    subType,
    title,
    link: normalizeUrl(value.link ?? value.url),
    officialWebsite: normalizeUrl(value.officialWebsite ?? value.website),
    image: normalizeUrl(value.image ?? value.imageUrl ?? value.previewUrl),
    usernameHint: referenceHint,
    referenceHint,
    issuer: optionalString(value.issuer),
    platform: optionalString(value.platform),
    installStatus,
    date: normalizeDate(value.date ?? value.issuedAt ?? value.issued_at),
    expiryDate: normalizeDate(
      value.expiryDate ?? value.expiresAt ?? value.expiry_date,
    ),
    notes: optionalString(value.notes),
    favorite: booleanValue(value.favorite),
    showTitleInPlanning: value.showTitleInPlanning === true,
    createdAt,
  };
}

export function normalizePersonalVaultItems(
  input: unknown,
  now = EPOCH,
): PersonalVaultItem[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();

  return input.flatMap((value, index) => {
    const normalized = normalizePersonalVaultItem(value, index, { now });
    if (!normalized) return [];

    let id = normalized.id;
    let suffix = 1;
    while (seen.has(id)) {
      suffix += 1;
      id = `${normalized.id}~${suffix}`;
    }
    seen.add(id);
    return [{ ...normalized, id }];
  });
}

export function normalizePersonalVaultTaxonomy(
  input: unknown,
): ModuleTaxonomyCategory[] {
  if (!Array.isArray(input)) return [];
  const categories = new Map<string, ModuleTaxonomyCategory>();
  const usedIds = new Set<string>();

  input.forEach((entry, index) => {
    const value = asRecord(entry);
    const name = cleanString(value?.name);
    if (!name) return;
    const key = keyOf(name);
    const existing = categories.get(key);
    const subcategories = uniqueStrings([
      ...(existing?.subcategories || []),
      ...stringArray(value?.subcategories),
    ]);
    const valid = new Set(subcategories.map(keyOf));
    const archivedSubcategories = uniqueStrings([
      ...(existing?.archivedSubcategories || []),
      ...stringArray(value?.archivedSubcategories),
    ]).filter((subcategory) => valid.has(keyOf(subcategory)));
    const customSubcategories = uniqueStrings([
      ...(existing?.customSubcategories || []),
      ...stringArray(value?.customSubcategories),
    ]).filter((subcategory) => valid.has(keyOf(subcategory)));

    let id =
      existing?.id ||
      cleanString(value?.id) ||
      `taxonomy-${stableHash(`${key}:${index}`)}`;
    if (!existing) {
      const baseId = id;
      let suffix = 1;
      while (usedIds.has(id)) {
        suffix += 1;
        id = `${baseId}~${suffix}`;
      }
      usedIds.add(id);
    }

    categories.set(key, {
      id,
      name: existing?.name || name,
      archived: booleanValue(value?.archived, existing?.archived ?? false),
      subcategories,
      archivedSubcategories,
      customSubcategories,
    });
  });

  return Array.from(categories.values());
}

export function personalVaultTaxonomySignature(input: unknown) {
  return JSON.stringify(normalizePersonalVaultTaxonomy(input));
}
