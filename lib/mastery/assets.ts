/**
 * Central registry for the approved category mastery artwork.
 *
 * Two copies of each of the 30 artifacts exist, and only one of them ships to
 * the browser:
 *
 *   source-of-truth  30 original 1254 x 1254 PNGs, ~19.4 MB total.
 *                    Never modified by runtime resolution and never served.
 *   runtime          public/achievements/mastery-runtime/<category>/<category>_<rank>.png
 *                    448 x 448, ~3.3 MB total. What this registry resolves to.
 *
 * The runtime files are generated deterministically by
 * `scripts/build-mastery-runtime-assets.mjs`, which documents why 448px rather
 * than 256px: 448 is 112 * 4, an exact multiple of the largest rendered size, so
 * Chrome resamples it once off a clean mip level instead of compounding two
 * filter passes and softening the pixel-inspired edges. It is also never upscaled
 * at any devicePixelRatio up to 4, which the Capacitor Android build reaches.
 * Regenerate with that script after any change to the source artwork; `--check`
 * verifies the committed files still match.
 *
 * The artwork is pixel-inspired but anti-aliased, so it is downscaled by the
 * browser's default interpolation rather than `image-rendering: pixelated`
 * (nearest-neighbour thins the artwork's 1px inner highlights at 48-128px).
 *
 * `Unstarted` has no artwork of its own by design: it reuses the category's
 * Apprentice artifact under a subdued UI treatment so the silhouette of what can
 * be earned stays legible. See `components/mastery/MasteryArtifact.tsx`.
 *
 * This is the only place asset paths are written down. UI code resolves through
 * `getMasteryAsset`.
 */
import type { AchievementPath } from '@/lib/types';
import {
  MASTERY_CATEGORY_LABEL,
  MASTERY_CATEGORY_ORDER,
} from '@/lib/mastery/category-metadata';

export type MasteryCategory = AchievementPath;

export type MasteryRank =
  | 'unstarted'
  | 'apprentice'
  | 'adept'
  | 'expert'
  | 'master'
  | 'mythic';

/** Earned ranks, in progression order. `unstarted` is the absence of progress. */
export type EarnedMasteryRank = Exclude<MasteryRank, 'unstarted'>;

export const MASTERY_RANK_ORDER: MasteryRank[] = [
  'unstarted',
  'apprentice',
  'adept',
  'expert',
  'master',
  'mythic',
];

const EARNED_RANKS: EarnedMasteryRank[] = [
  'apprentice',
  'adept',
  'expert',
  'master',
  'mythic',
];

/** Serve the optimized derivatives, not the 1254px source artwork. */
const RUNTIME_ROOT = '/achievements/mastery-runtime';

export const MASTERY_RUNTIME_SIZE = 448;

function categoryAssets(
  category: MasteryCategory,
): Record<EarnedMasteryRank, string> {
  return EARNED_RANKS.reduce(
    (acc, rank) => {
      acc[rank] = `${RUNTIME_ROOT}/${category}/${category}_${rank}.png`;
      return acc;
    },
    {} as Record<EarnedMasteryRank, string>,
  );
}

/**
 * category -> rank -> public asset path. Built from the verified on-disk naming
 * convention rather than hand-listed, so a category can never resolve to
 * another category's artwork.
 */
export const MASTERY_ASSETS: Record<
  MasteryCategory,
  Record<EarnedMasteryRank, string>
> = MASTERY_CATEGORY_ORDER.reduce(
  (acc, category) => {
    acc[category] = categoryAssets(category);
    return acc;
  },
  {} as Record<MasteryCategory, Record<EarnedMasteryRank, string>>,
);

/** Display labels for the active progression. Material names are never ranks. */
export const MASTERY_RANK_LABEL: Record<MasteryRank, string> = {
  unstarted: 'Unstarted',
  apprentice: 'Apprentice',
  adept: 'Adept',
  expert: 'Expert',
  master: 'Master',
  mythic: 'Mythic',
};

export { MASTERY_CATEGORY_LABEL, MASTERY_CATEGORY_ORDER };

/** Accepts the display rank names used by the achievement system ("Expert"). */
export function toMasteryRank(rank: string): MasteryRank {
  const normalized = rank.toLowerCase() as MasteryRank;
  return MASTERY_RANK_ORDER.includes(normalized) ? normalized : 'unstarted';
}

export function masteryRankIndex(rank: MasteryRank) {
  return MASTERY_RANK_ORDER.indexOf(rank);
}

export function isUnstartedRank(rank: MasteryRank) {
  return rank === 'unstarted';
}

/**
 * Resolves the artwork for a category at a rank. `unstarted` intentionally
 * returns the Apprentice artifact — callers must pair it with the subdued
 * treatment so it never reads as earned.
 */
export function getMasteryAsset(
  category: MasteryCategory,
  rank: MasteryRank,
): string {
  const assets = MASTERY_ASSETS[category];
  return assets[rank === 'unstarted' ? 'apprentice' : rank];
}

/** Alt text for when the artifact is the only thing conveying the rank. */
export function getMasteryAssetAlt(
  category: MasteryCategory,
  rank: MasteryRank,
) {
  const label = MASTERY_CATEGORY_LABEL[category];
  return rank === 'unstarted'
    ? `${label} mastery — not yet started`
    : `${label} mastery — ${MASTERY_RANK_LABEL[rank]}`;
}
