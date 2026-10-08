import type { Profile } from '@/lib/types';
import { completeRoutineOccurrenceInProfile, type LifeHubCompletionResult } from '@/lib/lifehub/completion';
import { getRoutineOccurrenceKey } from '@/lib/lifehub/routine-schedule';
import { getSkincareProductIdsFromLinkedContext, normalizeLifeHubLinkedContext } from '@/lib/lifehub/linked-context';
import { addSkincareUsageEvent, routineSkincareUsageEventId } from './usage';

export type SkincareRoutineCompletionResult = LifeHubCompletionResult & { usageEventIds: string[] };

/** Completes a Skincare-linked routine and records selected product use in one profile mutation. */
export function completeSkincareRoutineOccurrenceInProfile(
  profile: Profile,
  routineId: string,
  date: Date,
  productIds?: readonly string[],
  completedAt = new Date(),
): SkincareRoutineCompletionResult {
  const routine = (profile.dailyChecklistItems || []).find(item => item.id === routineId);
  if (!routine) return { profile, status: 'rejected', recordId: routineId, usageEventIds: [] };
  const context = normalizeLifeHubLinkedContext(routine.linkedContext);
  if (context?.section !== 'skincare' || context.type !== 'product') {
    return { profile, status: 'rejected', recordId: routineId, usageEventIds: [] };
  }
  // Keep the canonical Routine completion semantics (including its existing
  // recoverable skipped-occurrence behavior); this helper only composes the
  // optional product evidence after completion is accepted.
  const completion = completeRoutineOccurrenceInProfile(profile, routineId, date, completedAt);
  if (completion.status !== 'applied') return { ...completion, usageEventIds: [] };

  const linkedIds = getSkincareProductIdsFromLinkedContext(context);
  const selected = new Set((productIds === undefined ? linkedIds : productIds).filter(id => linkedIds.includes(id)));
  const periodKey = getRoutineOccurrenceKey(routine, date);
  const routineCompletionId = `${routineId}:${periodKey}`;
  let nextProfile = completion.profile;
  const usageEventIds: string[] = [];
  for (const productId of selected) {
    const eventId = routineSkincareUsageEventId(routineCompletionId, productId);
    const product = nextProfile.skincareProducts.find(item => item.id === productId);
    if (!product || product.status === 'emptied') continue;
    nextProfile = addSkincareUsageEvent(nextProfile, {
      id: eventId,
      productId,
      usedAt: completedAt,
      source: 'routine',
      routineId,
      routineCompletionId,
      productNameSnapshot: product.name,
    });
    usageEventIds.push(eventId);
  }
  return { ...completion, profile: nextProfile, usageEventIds };
}
