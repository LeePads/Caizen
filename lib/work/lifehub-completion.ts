import type { Profile } from '@/lib/types';
import { getWorkItemIdFromLifeHubRecord } from '@/lib/lifehub/linked-context';
import {
  completeProductivityItemInProfile,
  completeRoutineOccurrenceInProfile,
} from '@/lib/lifehub/completion';

export type WorkLifeHubCompletionResult = {
  profile: Profile;
  completedTaskIds: string[];
  completedRoutineIds: string[];
};

/**
 * Work-specific completion orchestration. This is intentionally event-driven
 * and only called after an existing Work task has explicitly transitioned to
 * done through the Work mutation path.
 */
export function completeLinkedLifeHubItemsForWorkTask(
  profile: Profile,
  workTaskId: string,
  completedAt = new Date(),
): WorkLifeHubCompletionResult {
  let nextProfile = profile;
  const completedTaskIds: string[] = [];
  const completedRoutineIds: string[] = [];
  const workTask = (profile.workItems || []).find(item => item.id === workTaskId);
  if (!workTask || workTask.type !== 'task' || workTask.status !== 'done') {
    return { profile, completedTaskIds, completedRoutineIds };
  }
  const today = new Date(completedAt);

  const linkedTasks = (profile.productivityItems || []).filter(
    item => item.type === 'task' && getWorkItemIdFromLifeHubRecord(item) === workTaskId,
  );
  const linkedRoutines = (profile.dailyChecklistItems || []).filter(
    item => getWorkItemIdFromLifeHubRecord(item) === workTaskId,
  );

  for (const item of linkedTasks) {
    const result = completeProductivityItemInProfile(
      nextProfile,
      item.id,
      completedAt,
    );
    if (result.status === 'applied') {
      nextProfile = result.profile;
      completedTaskIds.push(item.id);
    }
  }

  for (const item of linkedRoutines) {
    const result = completeRoutineOccurrenceInProfile(
      nextProfile,
      item.id,
      today,
      completedAt,
      { requireDue: true },
    );
    if (result.status === 'applied') {
      nextProfile = result.profile;
      completedRoutineIds.push(item.id);
    }
  }

  return { profile: nextProfile, completedTaskIds, completedRoutineIds };
}
