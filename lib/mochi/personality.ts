// Static catalog of selectable companion personalities — presentation
// metadata only (label/description/preview for the selector UI). The
// actual voice differences live in lib/mochi/voice.ts, which reads a
// PetPersonality value at render time; this file never touches analysis
// or observation data.

import type { PetPersonality } from '@/lib/types';

export type PersonalityDefinition = {
  id: PetPersonality;
  label: string;
  description: string;
  /** A short, self-contained line shown in the personality selector so the
   * user can hear the voice before committing to it. */
  preview: string;
};

export const PERSONALITY_DEFINITIONS: Record<PetPersonality, PersonalityDefinition> = {
  calm: {
    id: 'calm',
    label: 'Calm',
    description: 'Gentle, observant, grounded.',
    preview: 'Hmm... a few things caught my eye. Nothing urgent, though.',
  },
  cutesy: {
    id: 'cutesy',
    label: 'Cutesy',
    description: 'Warm, soft, a little playful.',
    preview: 'Hmm... that little task is still waiting for you.',
  },
  funny: {
    id: 'funny',
    label: 'Funny',
    description: 'A little mischief, not too much.',
    preview: 'Well, that\'s certainly a situation.',
  },
  serious: {
    id: 'serious',
    label: 'Serious',
    description: 'Calm, direct, composed.',
    preview: 'A few things need attention. Here\'s what matters.',
  },
  grumpy: {
    id: 'grumpy',
    label: 'Grumpy',
    description: 'Mock-annoyed teasing — never mean.',
    preview: 'Hmph. What\'s this little mess?',
  },
};

export const PERSONALITY_ORDER: PetPersonality[] = ['calm', 'cutesy', 'funny', 'serious', 'grumpy'];

export function getPersonalityDefinition(personality: PetPersonality): PersonalityDefinition {
  return PERSONALITY_DEFINITIONS[personality];
}
