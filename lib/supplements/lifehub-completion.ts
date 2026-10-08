import type { Profile } from '@/lib/types';
import { getSupplementIdsFromLifeHubRecord, normalizeLifeHubLinkedContext } from '@/lib/lifehub/linked-context';
import { completeRoutineOccurrenceInProfile, type LifeHubCompletionResult } from '@/lib/lifehub/completion';

const SUPPLEMENT_COMPLETION_NOTE_PREFIX = 'Supplements taken:';

export function getSupplementCompletionNote(names: string[]): string | undefined {
  const normalizedNames = names.map(name => name.trim()).filter(Boolean);
  return normalizedNames.length
    ? `${SUPPLEMENT_COMPLETION_NOTE_PREFIX} ${normalizedNames.join(', ')}`
    : undefined;
}

export function isSupplementCompletionNote(note: string | undefined): boolean {
  return Boolean(note?.startsWith(SUPPLEMENT_COMPLETION_NOTE_PREFIX));
}

export function completeSupplementRoutineOccurrenceInProfile(
  profile: Profile,
  routineId: string,
  date: Date,
  supplementIds?: string[],
  completedAt = new Date(),
): LifeHubCompletionResult {
  const routine = (profile.dailyChecklistItems || []).find(item => item.id === routineId);
  const context = routine ? normalizeLifeHubLinkedContext(routine.linkedContext) : undefined;
  if (!routine || context?.section !== 'supplements' || context.type !== 'supplement') {
    return { profile, status: 'rejected', recordId: routineId };
  }

  const linkedIds = getSupplementIdsFromLifeHubRecord(routine);
  const selectedIds = (supplementIds === undefined ? linkedIds : supplementIds)
    .filter(id => linkedIds.includes(id));
  const selectedNames = selectedIds
    .map(id => profile.supplements.find(supplement => supplement.id === id)?.name)
    .filter((name): name is string => Boolean(name));

  return completeRoutineOccurrenceInProfile(
    profile,
    routineId,
    date,
    completedAt,
    { note: getSupplementCompletionNote(selectedNames) },
  );
}
