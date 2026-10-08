import { parseLocalDateValue } from '../date-utils';
import type { PetCompanionData, PetCostume, PetPersonality, PetReward } from '../types';
import {
  getPetShopItem,
  getPetShopItemForCostume,
  isPetCostume,
  PET_SHOP_CATALOG,
} from './catalog';

export const PET_XP_PER_LEVEL = 100;

const PET_REWARD_SOURCE_TYPES: readonly PetReward['sourceType'][] = [
  'task',
  'routine',
  'work-task',
  'achievement',
  'finance',
  'check-in',
  'journal',
  'wellness',
  'food',
];

const PET_DEFAULT_CREATED_AT = new Date(0);

export const DEFAULT_PET_PERSONALITY: PetPersonality = 'calm';

const PET_PERSONALITIES: readonly PetPersonality[] = ['cutesy', 'funny', 'serious', 'grumpy', 'calm'];

const isPetPersonality = (value: unknown): value is PetPersonality =>
  typeof value === 'string' && (PET_PERSONALITIES as readonly string[]).includes(value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const uniqueStrings = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value.filter((entry): entry is string => typeof entry === 'string')
        .map(entry => entry.trim())
        .filter(Boolean),
    ),
  );
};

const finiteNumber = (value: unknown, fallback: number): number => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value !== 'string' || !value.trim()) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const nonNegativeFinite = (value: unknown, fallback: number): number =>
  Math.max(0, finiteNumber(value, fallback));

const normalizeDate = (value: unknown, fallback: Date): Date => {
  const parsed = parseLocalDateValue(
    value instanceof Date || typeof value === 'string' || typeof value === 'number'
      ? value
      : null,
  );
  return parsed ? new Date(parsed) : new Date(fallback);
};

const isRewardSourceType = (
  value: unknown,
): value is PetReward['sourceType'] =>
  typeof value === 'string' &&
  PET_REWARD_SOURCE_TYPES.includes(value as PetReward['sourceType']);

export const normalizePetReward = (
  value: unknown,
  index: number,
): PetReward | null => {
  if (!isRecord(value)) return null;
  const sourceId = typeof value.sourceId === 'string' ? value.sourceId.trim() : '';
  if (!sourceId || !isRewardSourceType(value.sourceType)) return null;

  const id = typeof value.id === 'string' && value.id.trim()
    ? value.id.trim()
    : `pet-reward-history-${index}-${sourceId}`;
  const label = typeof value.label === 'string' && value.label.trim()
    ? value.label.trim()
    : 'Reward';

  return {
    ...value,
    id,
    sourceId,
    sourceType: value.sourceType,
    label,
    xp: nonNegativeFinite(value.xp, 0),
    gold: nonNegativeFinite(value.gold, 0),
    earnedAt: normalizeDate(value.earnedAt, PET_DEFAULT_CREATED_AT),
  } as PetReward;
};

const normalizeCostumesAndPurchases = (pet: Record<string, unknown>) => {
  const rawOwnedCostumes = uniqueStrings(pet.ownedCostumes).filter(isPetCostume);
  const purchaseIds = uniqueStrings(pet.purchasedShopItemIds);
  const purchasedCostumes = purchaseIds
    .map(itemId => getPetShopItem(itemId)?.id)
    .filter((costume): costume is PetCostume => Boolean(costume));

  const hasOwnershipMetadata =
    Array.isArray(pet.ownedCostumes) || Array.isArray(pet.purchasedShopItemIds);
  const legacyCostume = isPetCostume(pet.costume) ? pet.costume : 'default';
  const legacyCostumeOnly =
    !hasOwnershipMetadata && legacyCostume !== 'default';

  // Ownership and purchase history are the canonical current-state evidence.
  // A costume-only record is accepted only for the older shape that had no
  // ownership metadata at all; a contradictory current record does not gain
  // ownership merely because its equipped field is malformed/stale.
  const ownedCostumes = Array.from(
    new Set<PetCostume>([
      'default',
      ...rawOwnedCostumes,
      ...purchasedCostumes,
      ...(legacyCostumeOnly ? [legacyCostume] : []),
    ]),
  );

  const normalizedPurchaseIds = Array.from(
    new Set([
      ...purchaseIds,
      ...ownedCostumes
        .filter(costume => costume !== 'default')
        .map(costume => getPetShopItemForCostume(costume)?.itemId)
        .filter((itemId): itemId is string => Boolean(itemId)),
    ]),
  );
  const equippedCostume =
    isPetCostume(pet.costume) && ownedCostumes.includes(pet.costume)
      ? pet.costume
      : 'default';

  return {
    ownedCostumes,
    purchasedShopItemIds: normalizedPurchaseIds,
    costume: equippedCostume,
  };
};

export const createDefaultPet = (createdAt = new Date()): PetCompanionData => ({
  name: 'Mochi',
  activePetId: 'mochi',
  ownedPetIds: ['mochi'],
  costume: 'default',
  ownedCostumes: ['default'],
  purchasedShopItemIds: [],
  level: 1,
  xp: 0,
  gold: 0,
  createdAt: new Date(createdAt),
  showFloatingPet: true,
  rewardedItemIds: [],
  recentRewards: [],
  personality: DEFAULT_PET_PERSONALITY,
});

/**
 * Canonical boundary for all persisted legacy Pet state. It deliberately
 * keeps unknown fields for forward compatibility while replacing every known
 * field with a deterministic, safe representation.
 */
export const normalizePet = (value: unknown): PetCompanionData => {
  const pet = isRecord(value) ? value : {};
  const defaults = createDefaultPet(PET_DEFAULT_CREATED_AT);
  const normalizedRewards = (Array.isArray(pet.recentRewards) ? pet.recentRewards : [])
    .map((reward, index) => normalizePetReward(reward, index))
    .filter((reward): reward is PetReward => Boolean(reward));
  const rewardSourceIds = normalizedRewards.map(reward => reward.sourceId);
  const ownership = normalizeCostumesAndPurchases(pet);
  const rawName = typeof pet.name === 'string' ? pet.name.trim() : '';
  const name = rawName === 'Pixel' || rawName === 'Ember'
    ? 'Mochi'
    : rawName || 'Mochi';

  return {
    ...defaults,
    ...pet,
    name,
    activePetId: 'mochi',
    ownedPetIds: ['mochi'],
    ...ownership,
    level: Math.max(1, Math.floor(nonNegativeFinite(pet.level, 1))),
    xp: nonNegativeFinite(pet.xp, 0),
    gold: nonNegativeFinite(pet.gold, 0),
    createdAt: normalizeDate(pet.createdAt, PET_DEFAULT_CREATED_AT),
    showFloatingPet: typeof pet.showFloatingPet === 'boolean'
      ? pet.showFloatingPet
      : true,
    personality: isPetPersonality(pet.personality) ? pet.personality : DEFAULT_PET_PERSONALITY,
    rewardedItemIds: Array.from(new Set([
      ...uniqueStrings(pet.rewardedItemIds),
      ...rewardSourceIds,
    ])),
    recentRewards: normalizedRewards,
  } as PetCompanionData;
};

export type PetPurchaseResult =
  | { status: 'invalid'; pet: PetCompanionData }
  | { status: 'already-owned'; pet: PetCompanionData }
  | { status: 'insufficient-funds'; pet: PetCompanionData; shortfall: number }
  | { status: 'purchased'; pet: PetCompanionData; price: number };

/**
 * Applies one existing-catalog purchase to a normalized Pet in one coherent
 * object. The caller persists this returned Pet with the rest of the profile.
 */
export const purchasePetShopState = (
  value: unknown,
  itemId: unknown,
  unlock: { petId?: 'mochi'; costume?: PetCostume },
): PetPurchaseResult => {
  const pet = normalizePet(value);
  const item = getPetShopItem(itemId);
  if (
    !item ||
    (unlock.petId !== undefined && unlock.petId !== item.petId) ||
    (unlock.costume !== undefined && unlock.costume !== item.id)
  ) {
    return { status: 'invalid', pet };
  }

  if (pet.ownedCostumes.includes(item.id)) {
    return { status: 'already-owned', pet };
  }

  const shortfall = Math.max(0, item.price - pet.gold);
  if (shortfall > 0) {
    return { status: 'insufficient-funds', pet, shortfall };
  }

  const nextOwnedCostumes = Array.from(new Set([...pet.ownedCostumes, item.id]));
  const nextPurchaseIds = Array.from(new Set([
    ...pet.purchasedShopItemIds,
    item.itemId,
  ]));

  return {
    status: 'purchased',
    price: item.price,
    pet: {
      ...pet,
      gold: pet.gold - item.price,
      activePetId: item.petId,
      costume: item.id,
      ownedCostumes: nextOwnedCostumes,
      ownedPetIds: ['mochi'],
      purchasedShopItemIds: nextPurchaseIds,
    },
  };
};

export const applyPetReward = (
  value: unknown,
  reward: Omit<PetReward, 'id' | 'earnedAt'>,
): PetCompanionData | null => {
  const current = normalizePet(value);
  const sourceId = typeof reward.sourceId === 'string' ? reward.sourceId.trim() : '';
  if (!sourceId || current.rewardedItemIds?.includes(sourceId)) return null;
  if (!isRewardSourceType(reward.sourceType)) return null;

  const rewardXp = nonNegativeFinite(reward.xp, 0);
  const rewardGold = nonNegativeFinite(reward.gold, 0);
  let nextLevel = current.level;
  let nextXp = current.xp + rewardXp;

  while (nextXp >= PET_XP_PER_LEVEL) {
    nextXp -= PET_XP_PER_LEVEL;
    nextLevel += 1;
  }

  const fullReward: PetReward = {
    ...reward,
    sourceId,
    xp: rewardXp,
    gold: rewardGold,
    id: `pet-reward-${sourceId}`,
    earnedAt: new Date(),
  };

  return {
    ...current,
    level: nextLevel,
    xp: nextXp,
    gold: current.gold + rewardGold,
    rewardedItemIds: Array.from(new Set([
      ...(current.rewardedItemIds || []),
      sourceId,
    ])),
    recentRewards: [fullReward, ...current.recentRewards].slice(0, 20),
  };
};

export { PET_REWARD_SOURCE_TYPES };

// Keep this reference local to the module so catalog changes cannot silently
// make an equipped/purchased known item unrecognized during normalization.
export const PET_SHOP_COSTUME_IDS = PET_SHOP_CATALOG.map(item => item.id);
