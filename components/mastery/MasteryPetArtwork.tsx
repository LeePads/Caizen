import {
  LockKeyhole,
  PawPrint,
  Sparkles,
  Trophy,
  type LucideIcon,
} from 'lucide-react';

import {
  PET_MASTERY_STAGE_LABEL,
  type PetMasteryStage,
} from '@/lib/mastery/pet-stage';
import { resolvePetMasteryAsset } from '@/lib/mastery/pet-assets';
import type { AchievementPath } from '@/lib/types';
import type { MasterySkinId } from '@/lib/types';

const STAGE_ICON: Record<PetMasteryStage, LucideIcon> = {
  locked: LockKeyhole,
  companion: PawPrint,
  evolved: Sparkles,
  resonance: Trophy,
};

const SIZE_CLASS = {
  sm: 'h-16 w-16 rounded-2xl',
  md: 'h-20 w-20 rounded-2xl',
  lg: 'h-24 w-24 rounded-3xl',
} as const;

export function MasteryPetArtwork({
  category,
  stage,
  categoryLabel,
  size = 'md',
  skin,
}: {
  category: AchievementPath;
  stage: PetMasteryStage;
  categoryLabel: string;
  size?: keyof typeof SIZE_CLASS;
  skin?: MasterySkinId;
}) {
  const displayStage: PetMasteryStage = stage === 'locked'
    ? 'locked'
    : skin === 'resonance'
      ? 'resonance'
      : skin === 'evolved'
        ? 'evolved'
        : 'companion';
  const resolution = resolvePetMasteryAsset(category, displayStage);
  const Icon = STAGE_ICON[displayStage];
  const stageLabel = PET_MASTERY_STAGE_LABEL[displayStage];
  const accessibleName = `${categoryLabel} ${stageLabel.toLowerCase()}${
    stage === 'locked' ? '. Reach Expert to unlock.' : ''
  }`;

  return (
    <div
      className={`grid shrink-0 place-items-center border border-border/70 bg-background/50 ${SIZE_CLASS[size]} ${stage === 'locked' ? 'text-muted-foreground' : 'text-primary'}`}
      role="img"
      aria-label={accessibleName}
      data-pet-mastery-stage={stage}
      data-pet-mastery-skin={skin || displayStage}
      data-pet-mastery-artwork={resolution.asset ? 'available' : 'pending'}
    >
      {resolution.asset ? (
        <img
          src={resolution.asset.src}
          alt={accessibleName}
          width={96}
          height={96}
          className="max-h-full max-w-full object-contain"
        />
      ) : (
        <Icon className={size === 'lg' ? 'h-10 w-10' : size === 'md' ? 'h-8 w-8' : 'h-6 w-6'} aria-hidden="true" />
      )}
    </div>
  );
}

