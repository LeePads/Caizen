/**
 * The single renderer for category mastery artwork.
 *
 * Handles asset lookup, sizing, alt text, the Unstarted treatment, and the very
 * subtle neutral backing surface that keeps ivory (Master/Mythic) artwork
 * readable on white cards and dark bronze (Apprentice/Adept) artwork readable on
 * charcoal cards. The artwork itself is never recoloured, cropped, or framed —
 * each PNG already carries its own frame.
 */
import {
  MASTERY_RUNTIME_SIZE,
  getMasteryAsset,
  getMasteryAssetAlt,
  isUnstartedRank,
  type MasteryCategory,
  type MasteryRank,
} from '@/lib/mastery/assets';
import { cn } from '@/lib/utils';

export type MasteryArtifactSize = 'sm' | 'md' | 'lg';

/**
 * Sizes are quoted for the artwork itself; each box is 0.5rem larger to leave
 * room for the padding that insets the art from its backing surface.
 *
 * sm — mastery map / overview rows (56px art)
 * md — category cards (64px art on mobile, 80px from sm up)
 * lg — rank-up presentation (96px art on mobile, 112px from sm up)
 */
const SIZE_CLASSES: Record<MasteryArtifactSize, string> = {
  sm: 'h-[4rem] w-[4rem]',
  md: 'h-[4.5rem] w-[4.5rem] sm:h-[5.5rem] sm:w-[5.5rem]',
  lg: 'h-[6.5rem] w-[6.5rem] sm:h-[7.5rem] sm:w-[7.5rem]',
};

const RADIUS_CLASSES: Record<MasteryArtifactSize, string> = {
  sm: 'rounded-xl',
  md: 'rounded-xl',
  lg: 'rounded-2xl',
};

export function MasteryArtifact({
  category,
  rank,
  size = 'md',
  /**
   * Set when the category and rank are already written next to the artifact, so
   * screen readers do not hear the same thing twice.
   */
  decorative = false,
  className,
}: {
  category: MasteryCategory;
  rank: MasteryRank;
  size?: MasteryArtifactSize;
  decorative?: boolean;
  className?: string;
}) {
  const unstarted = isUnstartedRank(rank);
  const src = getMasteryAsset(category, rank);

  return (
    <span
      className={cn(
        'mastery-artifact-surface grid shrink-0 place-items-center p-1',
        SIZE_CLASSES[size],
        RADIUS_CLASSES[size],
        unstarted && 'mastery-artifact-surface-unstarted',
        className,
      )}
    >
      <img
        src={src}
        alt={decorative ? '' : getMasteryAssetAlt(category, rank)}
        aria-hidden={decorative || undefined}
        width={MASTERY_RUNTIME_SIZE}
        height={MASTERY_RUNTIME_SIZE}
        loading="lazy"
        decoding="async"
        draggable={false}
        className={cn(
          'h-full w-full object-contain',
          // Unstarted: subdued silhouette, no glow. Applied in the UI only.
          unstarted && 'opacity-35 grayscale',
        )}
      />
    </span>
  );
}
