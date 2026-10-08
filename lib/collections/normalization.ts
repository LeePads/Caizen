import { parseLocalDateValue } from '../date-utils';
import type {
  InventoryItem,
  InventoryCategory,
  InventoryStatus,
  PriorityLevel,
  SkincareProduct,
  Supplement,
  SupplementSchedule,
  SupplementType,
  WishlistItem,
} from '../types';

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : null;

const cleanString = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized || undefined;
};

const booleanValue = (value: unknown, fallback = false) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.trim().toLowerCase() === 'true') return true;
    if (value.trim().toLowerCase() === 'false') return false;
  }
  if (value === 1) return true;
  if (value === 0) return false;
  return fallback;
};

export function finiteCollectionNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === '') return fallback;
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function optionalFiniteCollectionNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const number = finiteCollectionNumber(value, Number.NaN);
  return Number.isFinite(number) ? number : undefined;
}

export function normalizeCollectionDate(
  value: unknown,
  fallback: Date | null = null,
): Date | null {
  if (value === null || value === undefined || value === '') return fallback;
  const date = parseLocalDateValue(
    value instanceof Date || typeof value === 'string' || typeof value === 'number'
      ? value
      : null,
  );
  return date || fallback;
}

const stringArray = (value: unknown) =>
  Array.isArray(value)
    ? [...new Set(value
        .map(cleanString)
        .filter((entry): entry is string => Boolean(entry)))]
    : [];

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function stableCollectionId(prefix: string, value: UnknownRecord) {
  let seed = '';
  try {
    seed = JSON.stringify([
      value.name,
      value.title,
      value.category,
      value.type,
      value.dosage,
      value.purchaseDate,
      value.startDate,
      value.createdAt,
      value.productLink,
    ]);
  } catch {
    seed = String(value.name || value.title || prefix);
  }
  return `${prefix}-${stableHash(seed)}`;
}

const recordId = (value: UnknownRecord, prefix: string) =>
  cleanString(value.id) || stableCollectionId(prefix, value);

const normalizeInventoryStatus = (value: unknown): InventoryStatus => {
  switch (value) {
    case 'using':
    case 'stored':
    case 'maintenance':
    case 'replace':
    case 'retired':
    case 'archived':
      return value;
    case 'broken':
      return 'retired';
    default:
      return 'using';
  }
};

/**
 * Keep the Balance → Inventory handoff intentionally narrow. These are the
 * categories already understood by Inventory; anything else uses its neutral
 * utility bucket while the original plan category is retained as subCategory.
 */
export function mapBalanceCategoryToInventoryCategory(value: unknown): InventoryCategory {
  const normalized = cleanString(value)
    ?.toLocaleLowerCase()
    .replace(/[\s_-]+/g, '-') || '';

  if (['personal-tech', 'tech', 'electronics', 'gadgets'].includes(normalized)) {
    return 'personal_tech';
  }
  if (['home', 'furniture', 'appliances', 'kitchen', 'household'].includes(normalized)) {
    return 'home';
  }
  if (['wearables', 'clothing', 'bags', 'shoes', 'fashion'].includes(normalized)) {
    return 'wearables';
  }
  return 'utilities';
}

const normalizePriority = (value: unknown): PriorityLevel =>
  value === 'low' || value === 'high' ? value : 'medium';

const normalizeProductType = (value: unknown): SkincareProduct['productType'] => {
  const allowed = [
    'cleanser', 'moisturizer', 'serum', 'sunscreen', 'toner', 'mask',
    'treatment', 'shampoo', 'conditioner', 'body-wash', 'deodorant',
    'oral-care', 'other',
  ];
  return allowed.includes(String(value))
    ? value as SkincareProduct['productType']
    : 'other';
};

const normalizeFrequency = (value: unknown): SkincareProduct['frequency'] =>
  value === 'Weekly' || value === 'Custom' ? value : 'Daily';

const normalizeSchedule = (value: unknown): SkincareProduct['schedule'] =>
  value === 'morning' || value === 'night' ? value : 'both';

// Type is a free-form value backed by the profile's flat supplement-types
// taxonomy (see lib/module-taxonomy.ts), not a closed enum - a custom or
// otherwise-unlisted type must survive normalization untouched rather than
// being coerced to 'other'. A record with no type stays unset rather than
// being silently assigned one.
const normalizeSupplementType = (value: unknown): string | undefined =>
  cleanString(value);

const normalizeSupplementSchedule = (value: unknown): SupplementSchedule => {
  const allowed: SupplementSchedule[] = ['morning', 'night', 'with-meals', 'custom'];
  return allowed.includes(value as SupplementSchedule)
    ? value as SupplementSchedule
    : 'custom';
};

export function normalizeInventoryRecord(
  input: unknown,
  now = new Date(),
): InventoryItem {
  const value = asRecord(input) || {};
  const quantity = Math.max(1, finiteCollectionNumber(value.quantity, 1));
  return {
    ...value,
    id: recordId(value, 'inv'),
    name: cleanString(value.name) || 'Untitled asset',
    quantity,
    unit: cleanString(value.unit) || 'piece',
    category: cleanString(value.category) || 'utilities',
    purchaseDate: normalizeCollectionDate(value.purchaseDate, new Date(now)) || new Date(now),
    purchasePrice: optionalFiniteCollectionNumber(value.purchasePrice) === undefined
      ? undefined
      : Math.max(0, optionalFiniteCollectionNumber(value.purchasePrice) || 0),
    currentPrice: optionalFiniteCollectionNumber(value.currentPrice) === undefined
      ? undefined
      : Math.max(0, optionalFiniteCollectionNumber(value.currentPrice) || 0),
    replacementCost: optionalFiniteCollectionNumber(value.replacementCost) === undefined
      ? undefined
      : Math.max(0, optionalFiniteCollectionNumber(value.replacementCost) || 0),
    currentValueUpdatedAt: normalizeCollectionDate(value.currentValueUpdatedAt),
    photoAssetIds: stringArray(value.photoAssetIds),
    receiptAssetIds: stringArray(value.receiptAssetIds),
    status: normalizeInventoryStatus(value.status),
    productLink: cleanString(value.productLink) || '',
    subCategory: cleanString(value.subCategory),
    storageLocation: cleanString(value.storageLocation),
    acquisitionType: ['bought', 'included', 'gift', 'free', 'unknown'].includes(String(value.acquisitionType))
      ? value.acquisitionType as InventoryItem['acquisitionType']
      : 'unknown',
    notes: typeof value.notes === 'string' ? value.notes : undefined,
    createdAt: normalizeCollectionDate(value.createdAt, new Date(now)) || new Date(now),
  } as InventoryItem;
}

export function normalizeWishlistRecord(
  input: unknown,
  now = new Date(),
): WishlistItem {
  const value = asRecord(input) || {};
  const estimatedPrice = optionalFiniteCollectionNumber(value.estimatedPrice);
  const actualPrice = optionalFiniteCollectionNumber(value.actualPrice);
  const walletDeductedAmount = optionalFiniteCollectionNumber(value.walletDeductedAmount);
  const isBought = booleanValue(value.isBought, Boolean(value.status === 'bought'));
  const isArchived = booleanValue(value.isArchived, Boolean(value.status === 'archived'));
  const planTypes = ['item', 'subscription', 'health', 'service', 'travel', 'experience', 'other'] as const;
  const type = planTypes.includes(value.type as typeof planTypes[number])
    ? value.type as WishlistItem['type']
    : undefined;
  return {
    ...value,
    id: recordId(value, 'wish'),
    name: cleanString(value.name) || 'Untitled wish',
    type,
    targetDate: normalizeCollectionDate(value.targetDate) || undefined,
    category: cleanString(value.category) || 'Other',
    estimatedPrice: estimatedPrice === undefined ? 0 : Math.max(0, estimatedPrice),
    actualPrice: actualPrice === undefined ? undefined : Math.max(0, actualPrice),
    purchaseDate: normalizeCollectionDate(value.purchaseDate),
    purchaseCompletedAt: normalizeCollectionDate(value.purchaseCompletedAt),
    walletDeductedAmount: walletDeductedAmount === undefined ? undefined : Math.max(0, walletDeductedAmount),
    selected: isBought || isArchived ? false : booleanValue(value.selected),
    isBought,
    isArchived,
    movedToInventory: booleanValue(value.movedToInventory),
    priority: normalizePriority(value.priority),
    image: typeof value.image === 'string' ? value.image : null,
    photoAssetIds: stringArray(value.photoAssetIds),
    notes: typeof value.notes === 'string' ? value.notes : undefined,
    productLink: cleanString(value.productLink),
    createdAt: normalizeCollectionDate(value.createdAt, new Date(now)) || new Date(now),
  } as WishlistItem;
}

export function normalizeSkincareRecord(
  input: unknown,
  now = new Date(),
): SkincareProduct {
  const value = asRecord(input) || {};
  const purchasePrice = typeof value.purchasePrice === 'string' && !value.purchasePrice.trim()
    ? undefined
    : optionalFiniteCollectionNumber(value.purchasePrice);
  const currentPrice = typeof value.currentPrice === 'string' && !value.currentPrice.trim()
    ? undefined
    : optionalFiniteCollectionNumber(value.currentPrice);
  const duration = optionalFiniteCollectionNumber(value.estimatedDuration);
  return {
    ...value,
    id: recordId(value, 'skincare'),
    name: cleanString(value.name) || 'Untitled product',
    category: cleanString(value.category) || 'Other',
    productType: normalizeProductType(value.productType),
    purchasePrice: purchasePrice === undefined ? undefined : Math.max(0, purchasePrice),
    currentPrice: currentPrice === undefined ? undefined : Math.max(0, currentPrice),
    purchaseDate: normalizeCollectionDate(value.purchaseDate),
    startDate: normalizeCollectionDate(value.startDate),
    estimatedDuration: duration === undefined ? undefined : Math.max(1, duration),
    frequency: normalizeFrequency(value.frequency),
    schedule: normalizeSchedule(value.schedule),
    effects: typeof value.effects === 'string' ? value.effects : undefined,
    size: typeof value.size === 'string' ? value.size : '',
    photo: typeof value.photo === 'string' ? value.photo : '',
    image: typeof value.image === 'string' ? value.image : undefined,
    photoAssetIds: stringArray(value.photoAssetIds),
    productLink: cleanString(value.productLink),
    status: value.status === 'emptied' ? 'emptied' : 'active',
    emptiedAt: normalizeCollectionDate(value.emptiedAt),
    emptiedNotes: typeof value.emptiedNotes === 'string' ? value.emptiedNotes : undefined,
    wouldRepurchase: ['yes', 'no', 'maybe'].includes(String(value.wouldRepurchase))
      ? value.wouldRepurchase as SkincareProduct['wouldRepurchase']
      : undefined,
    createdAt: normalizeCollectionDate(value.createdAt, new Date(now)) || new Date(now),
  } as SkincareProduct;
}

function parseDosage(value: unknown) {
  if (typeof value !== 'string') return {};
  const [amountPart, intakePart] = value.split(',').map(part => part.trim());
  const amountMatch = /^(\d+(?:\.\d+)?)\s+(\S+)/.exec(amountPart || '');
  const intakeMatch = /(\d+(?:\.\d+)?)\s*x/i.exec(intakePart || '');
  return {
    amount: amountMatch ? optionalFiniteCollectionNumber(amountMatch[1]) : undefined,
    unit: amountMatch ? cleanString(amountMatch[2]) : undefined,
    dailyIntake: intakeMatch ? optionalFiniteCollectionNumber(intakeMatch[1]) : undefined,
  };
}

const formatDoseNumber = (value: number) => Number.isInteger(value) ? String(value) : String(value);

export function normalizeSupplementRecord(
  input: unknown,
  now = new Date(),
): Supplement {
  const value = asRecord(input) || {};
  const parsed = parseDosage(value.dosage);
  const dosageAmount = optionalFiniteCollectionNumber(value.dosageAmount) ?? parsed.amount ?? optionalFiniteCollectionNumber(value.quantityRemaining) ?? 0;
  const dosageUnit = cleanString(value.dosageUnit) || parsed.unit || 'capsules';
  const dailyIntake = optionalFiniteCollectionNumber(value.dailyIntake) ?? parsed.dailyIntake ?? 1;
  const rawDosage = cleanString(value.dosage);
  const dosage = rawDosage && !parsed.amount && value.dosageAmount === undefined
    ? rawDosage
    : `${formatDoseNumber(Math.max(0, dosageAmount))} ${dosageUnit}, ${formatDoseNumber(Math.max(0, dailyIntake))}x daily`;
  const reminderDays = Array.isArray(value.reminderDays)
    ? [...new Set(value.reminderDays
        .map(day => finiteCollectionNumber(day, Number.NaN))
        .filter(day => Number.isInteger(day) && day >= 0 && day <= 6))]
    : undefined;
  return {
    ...value,
    id: recordId(value, 'supplement'),
    name: cleanString(value.name) || 'Untitled supplement',
    type: normalizeSupplementType(value.type),
    purchasePrice: Math.max(0, finiteCollectionNumber(value.purchasePrice, 0)),
    currentPrice: optionalFiniteCollectionNumber(value.currentPrice) === undefined
      ? undefined
      : Math.max(0, optionalFiniteCollectionNumber(value.currentPrice) || 0),
    startDate: normalizeCollectionDate(value.startDate),
    expiryDate: normalizeCollectionDate(value.expiryDate),
    dosage,
    dosageAmount: Math.max(0, dosageAmount),
    dosageUnit,
    dailyIntake: Math.max(0, dailyIntake),
    quantityRemaining: Math.max(0, finiteCollectionNumber(value.quantityRemaining, 0)),
    estimatedDuration: optionalFiniteCollectionNumber(value.estimatedDuration),
    schedule: normalizeSupplementSchedule(value.schedule),
    effects: typeof value.effects === 'string' ? value.effects : undefined,
    productLink: cleanString(value.productLink),
    image: typeof value.image === 'string' ? value.image : null,
    photoAssetIds: Array.isArray(value.photoAssetIds)
      ? value.photoAssetIds.filter((id: unknown): id is string => typeof id === 'string' && Boolean(id.trim()))
      : undefined,
    reminderEnabled: booleanValue(value.reminderEnabled),
    reminderTime: typeof value.reminderTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value.reminderTime)
      ? value.reminderTime
      : undefined,
    reminderDays,
    createdAt: normalizeCollectionDate(value.createdAt, new Date(now)) || new Date(now),
  } as Supplement;
}

export function normalizeCollectionRecords<T extends { id: string }>(
  input: unknown,
  normalize: (value: unknown, now: Date) => T,
  now = new Date(),
): T[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  return input.flatMap(value => {
    if (!asRecord(value)) return [];
    const normalized = normalize(value, now);
    const baseId = normalized.id;
    let id = baseId;
    let suffix = 1;
    while (seen.has(id)) {
      suffix += 1;
      id = `${baseId}~${suffix}`;
    }
    seen.add(id);
    return [{ ...normalized, id }];
  });
}

export const normalizeInventoryItems = (input: unknown, now = new Date()) =>
  normalizeCollectionRecords(input, normalizeInventoryRecord, now);

export const normalizeWishlistItems = (input: unknown, now = new Date()) =>
  normalizeCollectionRecords(input, normalizeWishlistRecord, now);

export const normalizeSkincareProducts = (input: unknown, now = new Date()) =>
  normalizeCollectionRecords(input, normalizeSkincareRecord, now);

export const normalizeSupplements = (input: unknown, now = new Date()) =>
  normalizeCollectionRecords(input, normalizeSupplementRecord, now);
