import type { MasteryRankName } from './achievement-system';

/**
 * The only semantic progression model used by mastery-linked companions.
 * Pet XP, gold, active-pet selection, and achievement styling do not affect it.
 */
export type PetMasteryStage =
  | 'locked'
  | 'companion'
  | 'evolved'
  | 'resonance';

const STAGE_BY_RANK: Readonly<Record<MasteryRankName, PetMasteryStage>> = {
  Unstarted: 'locked',
  Apprentice: 'locked',
  Adept: 'locked',
  Expert: 'companion',
  Master: 'evolved',
  Mythic: 'resonance',
};

export const PET_MASTERY_STAGE_ORDER: readonly PetMasteryStage[] = [
  'locked',
  'companion',
  'evolved',
  'resonance',
];

/** Derive a companion stage from the effective category mastery rank. */
export function getPetMasteryStage(rank: MasteryRankName): PetMasteryStage {
  return STAGE_BY_RANK[rank];
}

export const PET_MASTERY_STAGE_LABEL: Readonly<Record<PetMasteryStage, string>> = {
  locked: 'Locked companion',
  companion: 'Base companion',
  evolved: 'Evolved companion',
  resonance: 'Resonance companion',
};

