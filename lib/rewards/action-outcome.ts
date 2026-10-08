import type { ActionOutcome } from '../feedback/types';
import type {
  AchievementPath,
  CategoryXpSourceType,
  MasteryBondXpEvent,
  PetReward,
  Profile,
} from '../types';
import {
  getCategoryProgress,
  recordCategoryXpEvent,
  recordMasteryBondEvent,
} from '../mastery/progress';
import { applyPetReward, normalizePet } from '../pets/normalization';

export type PetRewardRequest = Omit<PetReward, 'id' | 'earnedAt'>;

/**
 * Apply a one-time companion reward to the latest profile collection.
 *
 * Keeping this as a pure collection transform is important: callers can use
 * it from a functional React state update without replacing newer profile
 * mutations that were queued in the same event.
 */
export function applyPetRewardToProfiles(
  profiles: Profile[],
  profileId: string,
  reward: PetRewardRequest,
): { profiles: Profile[]; level?: number } {
  let level: number | undefined;
  const nextProfiles = profiles.map(profile => {
    if (profile.id !== profileId) return profile;

    const nextPet = applyPetReward(normalizePet(profile.pet), reward);
    if (!nextPet) return profile;

    level = nextPet.level;
    return { ...profile, pet: nextPet };
  });

  return { profiles: nextProfiles, level };
}

export function categoryXpAwardFor(
  profile: Profile,
  category: AchievementPath,
  sourceId: string,
  sourceType: CategoryXpSourceType,
  requestedXp: number,
) {
  const eventId = `mastery:${category}:${sourceType}:${sourceId}`;
  const next = recordCategoryXpEvent(profile, {
    category,
    sourceId,
    sourceType,
    xp: requestedXp,
    eventId,
  });
  return next.categoryXpEvents?.find(event => event.id === eventId)?.xp || 0;
}

export function bondXpAwardFor(
  profile: Profile,
  sourceId: string,
  sourceType: MasteryBondXpEvent['sourceType'],
  requestedXp: number,
) {
  const next = recordMasteryBondEvent(profile, { sourceId, sourceType, xp: requestedXp });
  const claimId = `${sourceType}:${sourceId}`;
  return next.masteryBondXpEvents?.find(event => event.claimId === claimId)?.xp || 0;
}

export function categoryMilestoneFor(
  profile: Profile,
  category: AchievementPath,
  sourceId: string,
  sourceType: CategoryXpSourceType,
  requestedXp: number,
) {
  const before = getCategoryProgress(profile, category);
  const after = getCategoryProgress(
    recordCategoryXpEvent(profile, {
      category,
      sourceId,
      sourceType,
      xp: requestedXp,
    }),
    category,
  );
  const milestone: NonNullable<ActionOutcome['milestone']> = {};
  if (after.level > before.level) milestone.categoryLevel = after.level;
  if (after.rank !== before.rank) {
    milestone.masteryRank = after.rank;
    if (before.rank === 'Adept' && after.rank === 'Expert') {
      milestone.companionUnlocked = true;
    }
    if (after.rank === 'Master') milestone.skinUnlocked = 'evolved';
    if (after.rank === 'Mythic') milestone.skinUnlocked = 'resonance';
  }
  return Object.keys(milestone).length ? milestone : undefined;
}

export function rewardOutcome(outcome: Omit<ActionOutcome, 'kind'>): ActionOutcome {
  return { ...outcome, kind: 'reward' };
}
