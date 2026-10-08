import { hasMeaningfulJournalEntry } from '@/lib/journal-content';
import { completeRoutineOccurrenceInProfile } from '@/lib/lifehub/completion';
import { normalizeLifeHubLinkedContext } from '@/lib/lifehub/linked-context';
import {
  getRoutineOccurrence,
  isRoutineDueForDate,
} from '@/lib/lifehub/routine-schedule';
import type { JournalEntry, Profile } from '@/lib/types';

export type JournalEvidenceApplication = {
  profile: Profile;
  completedRoutineIds: string[];
};

export function isMeaningfulJournalEvidence(entry: JournalEntry): boolean {
  return Boolean(entry.title?.trim()) || hasMeaningfulJournalEntry(entry);
}

/** Applies one committed Journal entry to recurring Journal-linked routines. */
export function applyJournalEvidenceToProfile(
  profile: Profile,
  entry: JournalEntry,
  completedAt = new Date(),
): JournalEvidenceApplication {
  if (!isMeaningfulJournalEvidence(entry)) {
    return { profile, completedRoutineIds: [] };
  }

  const evidenceDate = new Date(entry.date);
  if (Number.isNaN(evidenceDate.getTime()) || Number.isNaN(completedAt.getTime())) {
    return { profile, completedRoutineIds: [] };
  }

  const matching = (profile.dailyChecklistItems || []).filter(routine => {
    const context = normalizeLifeHubLinkedContext(routine.linkedContext);
    return context?.section === 'journal' &&
      context.type === 'journal-entry' &&
      routine.active !== false &&
      isRoutineDueForDate(routine, evidenceDate) &&
      getRoutineOccurrence(routine, evidenceDate)?.status !== 'skipped';
  });

  let nextProfile = profile;
  const completedRoutineIds: string[] = [];
  for (const routine of matching) {
    const result = completeRoutineOccurrenceInProfile(
      nextProfile,
      routine.id,
      evidenceDate,
      completedAt,
      { requireDue: true },
    );
    if (result.status === 'applied') {
      nextProfile = result.profile;
      completedRoutineIds.push(routine.id);
    }
  }

  return { profile: nextProfile, completedRoutineIds };
}
