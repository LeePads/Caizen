import type { PetMasteryStage } from './pet-stage';
import type { AchievementPath } from '../types';

export type PetMasteryAsset = {
  src: string;
  name: string;
  /** Optional CSS frame information for animated sprite sheets added later. */
  frame?: {
    width: number;
    height: number;
    backgroundSize: string;
    backgroundPosition?: string;
  };
};

export type PetMasteryAssetRegistry = Record<
  AchievementPath,
  Record<PetMasteryStage, PetMasteryAsset | undefined>
>;

export type ResolvedPetMasteryAsset = {
  requestedStage: PetMasteryStage;
  resolvedStage?: PetMasteryStage;
  asset?: PetMasteryAsset;
  isFallback: boolean;
};

/**
 * Category-stage slots are intentionally explicit even while category pet art
 * is pending approval. The general Pet Shop sprites are animated, unassigned
 * companions, so using them here would make one category appear to own another
 * category's pet. Add approved category artwork to these slots as it arrives.
 */
export const PET_MASTERY_ASSETS: PetMasteryAssetRegistry = {
  productivity: { locked: undefined, companion: undefined, evolved: undefined, resonance: undefined },
  wellness: { locked: undefined, companion: undefined, evolved: undefined, resonance: undefined },
  finance: { locked: undefined, companion: undefined, evolved: undefined, resonance: undefined },
  collection: { locked: undefined, companion: undefined, evolved: undefined, resonance: undefined },
  reflection: { locked: undefined, companion: undefined, evolved: undefined, resonance: undefined },
  discipline: { locked: undefined, companion: undefined, evolved: undefined, resonance: undefined },
};

const FALLBACK_ORDER: Readonly<Record<PetMasteryStage, readonly PetMasteryStage[]>> = {
  locked: ['locked', 'companion', 'evolved', 'resonance'],
  companion: ['companion', 'evolved', 'locked', 'resonance'],
  evolved: ['evolved', 'companion', 'resonance', 'locked'],
  resonance: ['resonance', 'evolved', 'companion', 'locked'],
};

/**
 * Resolve artwork only within the same category. A missing future evolution
 * therefore falls back to that category's nearest valid form, never a
 * different category or a general Pet Shop asset.
 */
export function resolvePetMasteryAsset(
  category: AchievementPath,
  requestedStage: PetMasteryStage,
  registry: PetMasteryAssetRegistry = PET_MASTERY_ASSETS,
): ResolvedPetMasteryAsset {
  const resolvedStage = FALLBACK_ORDER[requestedStage].find(stage => Boolean(registry[category][stage]));
  return {
    requestedStage,
    resolvedStage,
    asset: resolvedStage ? registry[category][resolvedStage] : undefined,
    isFallback: Boolean(resolvedStage && resolvedStage !== requestedStage),
  };
}

export function missingPetMasteryArtwork(
  registry: PetMasteryAssetRegistry = PET_MASTERY_ASSETS,
) {
  return (Object.keys(registry) as AchievementPath[]).flatMap(category =>
    (Object.keys(registry[category]) as PetMasteryStage[])
      .filter(stage => !registry[category][stage])
      .map(stage => ({ category, stage })),
  );
}

