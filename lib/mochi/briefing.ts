// Turns MochiObservation[] into the short briefing shared by the Dashboard
// bubble and the Mochi modal. Analyze broadly, speak narrowly — this owns the "speak
// narrowly" half. Selection is a plain deterministic sort, not a scoring
// model: importance first, then how time-sensitive the kind is, then the
// order analysis produced them in.

import type { MochiObservation, MochiObservationKind } from '@/lib/mochi/types';
import { analyzeAllSections, type MochiAnalysisContext } from '@/lib/mochi/section-analysis';
import { getDiscoverySuggestion, type DiscoveryContext } from '@/lib/discovery/rules';
import {
  dismissDiscoverySuggestion,
  isDiscoverySuggestionDismissed,
} from '@/lib/discovery/dismissal';

/** Reuses the existing discovery dismissal store — it is already
 * profile-scoped, cooldown-based localStorage, and its keys are plain
 * observation ids, so it works for any 'opportunity' observation, not just
 * the original DiscoverySuggestion ones. Only opportunity/discovery-style
 * hints get a cooldown; factual observations (attention/upcoming/progress)
 * are never suppressed just because they were seen before. */
export function dismissMochiObservation(profileId: string, observationId: string): void {
  dismissDiscoverySuggestion(profileId, observationId);
}

const IMPORTANCE_RANK: Record<MochiObservation['importance'], number> = {
  high: 3,
  medium: 2,
  low: 1,
};

// Time-sensitive/actionable kinds sort ahead of purely informational ones;
// 'quiet' always sorts last so it only ever surfaces when nothing else does.
const KIND_RANK: Record<MochiObservationKind, number> = {
  attention: 5,
  upcoming: 4,
  opportunity: 3,
  pattern: 3,
  progress: 2,
  quiet: 0,
};

function priorityRank(observation: MochiObservation): number {
  return IMPORTANCE_RANK[observation.importance] * 10 + KIND_RANK[observation.kind];
}

function discoverySuggestionToObservation(context: DiscoveryContext): MochiObservation | null {
  const suggestion = getDiscoverySuggestion(context);
  if (!suggestion) return null;
  return {
    id: `discovery-${suggestion.id}`,
    section: suggestion.section,
    importance: 'low',
    kind: 'opportunity',
    title: suggestion.title,
    detail: suggestion.description || suggestion.actionLabel,
    target: typeof suggestion.target === 'string'
      ? { section: suggestion.target }
      : suggestion.target,
  };
}

/** All of Mochi's current observations, sorted best-first. Analysis only —
 * callers decide how many to actually show. */
export function getPrioritizedObservations(context: MochiAnalysisContext): MochiObservation[] {
  const discoveryContext: DiscoveryContext = {
    foodEntries: context.foodEntries,
    mealTemplateCount: context.mealTemplateCount,
    wallets: context.wallets,
    activeWishlistCount: context.wishlistItems.filter(item => !item.isBought).length,
    dailyChecklistItemCount: context.dailyChecklistItems.length,
    productivityItemCount: context.productivityItems.length,
    inventoryItems: context.inventoryItems,
  };

  const observations = [
    ...analyzeAllSections(context),
    discoverySuggestionToObservation(discoveryContext),
  ]
    .filter((item): item is MochiObservation => Boolean(item))
    .filter(item => {
      if (item.kind !== 'opportunity' || !context.profileId) return true;
      return !isDiscoverySuggestionDismissed(context.profileId, item.id);
    });

  return observations.slice().sort((a, b) => priorityRank(b) - priorityRank(a));
}

export type MochiBriefingGroup = {
  kind: MochiObservationKind;
  label: string;
  observations: MochiObservation[];
};

const GROUP_LABELS: Record<MochiObservationKind, string> = {
  attention: 'Keep an eye on this',
  upcoming: 'Coming up',
  progress: 'Your progress',
  opportunity: 'Something useful',
  pattern: 'A pattern I noticed',
  quiet: 'Nothing urgent',
};

const BRIEFING_MAX_OBSERVATIONS = 5;

/** A short, grouped "what I noticed today" briefing for the Mochi modal.
 * Bounded to a handful of items total — never a full report. */
export function getMochiBriefing(context: MochiAnalysisContext): MochiBriefingGroup[] {
  const prioritized = getPrioritizedObservations(context);
  const meaningful = prioritized.filter(item => item.kind !== 'quiet');
  const selected = meaningful.slice(0, BRIEFING_MAX_OBSERVATIONS);

  if (selected.length === 0) {
    const quiet = prioritized.find(item => item.kind === 'quiet');
    return [{
      kind: 'quiet',
      label: GROUP_LABELS.quiet,
      observations: quiet
        ? [quiet]
        : [{
          id: 'briefing-all-quiet',
          section: 'dashboard',
          importance: 'low',
          kind: 'quiet',
          title: 'Nothing stands out right now',
          detail: "I'll let you know when something does.",
        }],
    }];
  }

  // Keep the highest-ranked observation first on screen. Grouping the whole
  // selection by kind could otherwise make a lower-ranked item the lead.
  const [primary, ...supporting] = selected;
  const groups: MochiBriefingGroup[] = [{
    kind: primary.kind,
    label: GROUP_LABELS[primary.kind],
    observations: [primary],
  }];
  for (const observation of supporting) {
    const previous = groups[groups.length - 1];
    if (previous?.kind === observation.kind) previous.observations.push(observation);
    else groups.push({ kind: observation.kind, label: GROUP_LABELS[observation.kind], observations: [observation] });
  }
  return groups;
}
