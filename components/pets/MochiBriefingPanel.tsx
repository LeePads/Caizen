'use client';

import type { MochiBriefingGroup } from '@/lib/mochi/briefing';
import type { MochiObservation, MochiObservationKind } from '@/lib/mochi/types';
import { voiceObservation, voicePrimaryLeadIn, voiceSupportingLeadIn } from '@/lib/mochi/voice';
import type { PetPersonality } from '@/lib/types';
import { getSectionDiscoveryMeta } from '@/lib/discovery/section-meta';

/**
 * Mochi's "here's what I noticed today" briefing — presentation only. The
 * first entry is the highest-ranked observation; supporting entries keep the
 * briefing's bounded order without becoming report categories.
 * Which phrasing variant each observation uses is decided by the caller
 * once per modal opening (see PetCompanion.tsx) and passed in via
 * `variantIndices`.
 */
export function MochiBriefingPanel({
  groups,
  variantIndices,
  personality,
  spotlightObservationId,
  onSelect,
}: {
  groups: MochiBriefingGroup[];
  variantIndices: Record<string, number>;
  personality: PetPersonality;
  spotlightObservationId?: string | null;
  onSelect: (observation: MochiObservation) => void;
}) {
  const flat = groups.flatMap(group =>
    group.observations.map(observation => ({ observation, kind: group.kind })),
  );
  if (flat.length === 0) return null;

  const [primaryEntry, ...restEntries] = flat;

  const primaryLine = voiceObservation(primaryEntry.observation, personality, 'modal', variantIndices[primaryEntry.observation.id] ?? 0);

  return (
    <div className="space-y-2.5">
      {primaryEntry.kind !== 'quiet' ? (
        <p className="text-sm text-muted-foreground">{voicePrimaryLeadIn(personality, primaryEntry.kind)}</p>
      ) : null}
      <MochiBubble
        lead={primaryLine.lead}
        body={primaryLine.body}
        observation={primaryEntry.observation}
        kind={primaryEntry.kind}
        emphasis
        spotlighted={primaryEntry.observation.id === spotlightObservationId}
        onSelect={onSelect}
      />

      {restEntries.map(({ observation, kind }, index) => {
        const line = voiceObservation(observation, personality, 'modal', variantIndices[observation.id] ?? 0);
        const previousKind = index === 0 ? primaryEntry.kind : restEntries[index - 1].kind;
        return (
          <div key={observation.id} className="space-y-2">
            {kind === 'progress' && previousKind !== 'progress' ? (
              <p className="pt-1 text-sm text-muted-foreground">{voiceSupportingLeadIn(personality, kind)}</p>
            ) : null}
            <MochiBubble
              lead={line.lead}
              body={line.body}
              observation={observation}
              kind={kind}
              spotlighted={observation.id === spotlightObservationId}
              onSelect={onSelect}
            />
          </div>
        );
      })}
    </div>
  );
}

function MochiBubble({
  lead,
  body,
  observation,
  kind,
  emphasis = false,
  spotlighted = false,
  onSelect,
}: {
  lead: string;
  body: string;
  observation: MochiObservation;
  kind: MochiObservationKind;
  emphasis?: boolean;
  spotlighted?: boolean;
  onSelect: (observation: MochiObservation) => void;
}) {
  const target = observation.target;
  const actionLabel = target ? `Open ${getSectionDiscoveryMeta(target.section)?.label || 'section'}` : null;
  const surface = emphasis
    ? kind === 'progress' ? 'border border-emerald-500/25 bg-emerald-500/[0.07]' : 'border border-primary/25 bg-primary/[0.06]'
    : kind === 'progress' ? 'bg-emerald-500/[0.05]' : 'bg-muted/30';

  return (
    <div
      data-mochi-observation-id={observation.id}
      data-mochi-spotlight={spotlighted ? 'true' : undefined}
      className={`${emphasis ? 'w-full' : 'w-fit max-w-full sm:max-w-[88%]'} rounded-2xl rounded-bl-sm px-3.5 py-2.5 ${surface} ${spotlighted ? 'ring-2 ring-primary/40' : ''}`}
    >
      <p className={emphasis ? 'text-base text-foreground' : 'text-sm text-foreground'}>
        {lead ? <span className="font-semibold">{lead} </span> : null}
        <span className={emphasis ? 'font-medium' : lead ? 'text-muted-foreground' : ''}>{body}</span>
      </p>
      {actionLabel ? (
        <button
          type="button"
          onClick={() => onSelect(observation)}
          className="mt-2 inline-flex min-h-11 items-center rounded-lg border border-border/50 bg-background/70 px-2.5 text-xs font-bold text-foreground transition-colors hover:border-border hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}
