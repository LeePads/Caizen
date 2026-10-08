import { completeProductivityItemInProfile } from '@/lib/lifehub/completion';
import { getWorkItemIdFromLifeHubRecord } from '@/lib/lifehub/linked-context';
import { normalizeProductivityItem } from '@/lib/lifehub/normalization';
import type {
  ProductivityItem,
  ProductivityPriority,
  Profile,
  WorkItem,
  WorkLifeHubMirrorIntent,
} from '@/lib/types';
import { createEntityId } from '@/lib/utils';
import { completeLinkedLifeHubItemsForWorkTask } from './lifehub-completion';

export type ManagedLifeHubCompletionResult = {
  profile: Profile;
  status: 'applied' | 'alreadyApplied' | 'rejected';
  workTaskId?: string;
  workTransitioned?: boolean;
  completedTaskIds: string[];
  completedRoutineIds: string[];
};

export function workPriorityToLifeHub(priority?: WorkItem['priority']): ProductivityPriority {
  if (priority === 'high') return 'important';
  if (priority === 'low') return 'optional';
  return 'normal';
}

export function isManagedWorkMirror(item: ProductivityItem): boolean {
  return item.type === 'task' &&
    item.linkOrigin === 'workhub-mirror' &&
    Boolean(getWorkItemIdFromLifeHubRecord(item));
}

export function reconcileWorkLifeHubMirror(
  profile: Profile,
  workItems: WorkItem[],
  intent?: WorkLifeHubMirrorIntent,
  now = new Date(),
): Profile {
  if (!intent) return { ...profile, workItems };

  const workTask = workItems.find(item => item.id === intent.workTaskId && item.type === 'task');
  if (!workTask) return { ...profile, workItems };

  const existingMirror = (profile.productivityItems || []).find(item =>
    isManagedWorkMirror(item) && getWorkItemIdFromLifeHubRecord(item) === workTask.id,
  );

  if (!intent.enabled) {
    return {
      ...profile,
      workItems,
      productivityItems: (profile.productivityItems || []).map(item =>
        isManagedWorkMirror(item) && getWorkItemIdFromLifeHubRecord(item) === workTask.id
          ? normalizeProductivityItem({ ...item, linkedContext: undefined, linkOrigin: undefined })
          : item,
      ),
    };
  }

  const mirroredFields = {
    title: workTask.title,
    priority: workPriorityToLifeHub(workTask.priority),
    deadline: workTask.dueDate || undefined,
    linkedContext: { section: 'work' as const, type: 'work-item' as const, entityId: workTask.id },
    linkOrigin: 'workhub-mirror' as const,
  };
  const mirror = existingMirror
    ? normalizeProductivityItem({ ...existingMirror, ...mirroredFields })
    : normalizeProductivityItem({
        id: createEntityId('productivity'),
        ...mirroredFields,
        type: 'task',
        status: workTask.status === 'done' ? 'completed' : 'pending',
        completedAt: workTask.status === 'done' ? now : null,
        createdAt: now,
      });

  return {
    ...profile,
    workItems,
    productivityItems: existingMirror
      ? (profile.productivityItems || []).map(item => item.id === existingMirror.id ? mirror : item)
      : [...(profile.productivityItems || []), mirror],
  };
}

/** Completes the managed Life task, its Work owner, and any other Work-linked records once. */
export function completeManagedWorkMirrorFromLifeHub(
  profile: Profile,
  lifeTaskId: string,
  completedAt = new Date(),
): ManagedLifeHubCompletionResult {
  const lifeTask = (profile.productivityItems || []).find(item => item.id === lifeTaskId);
  if (!lifeTask || !isManagedWorkMirror(lifeTask)) {
    return { profile, status: 'rejected', completedTaskIds: [], completedRoutineIds: [] };
  }
  if (lifeTask.status === 'completed') {
    return { profile, status: 'alreadyApplied', completedTaskIds: [], completedRoutineIds: [] };
  }
  const workTaskId = getWorkItemIdFromLifeHubRecord(lifeTask);
  const workTask = (profile.workItems || []).find(item => item.id === workTaskId && item.type === 'task');
  if (!workTask || workTask.status === 'archived') {
    return { profile, status: 'rejected', completedTaskIds: [], completedRoutineIds: [] };
  }

  const lifeResult = completeProductivityItemInProfile(profile, lifeTaskId, completedAt);
  if (lifeResult.status !== 'applied') {
    return {
      profile,
      status: lifeResult.status,
      workTaskId,
      completedTaskIds: [],
      completedRoutineIds: [],
    };
  }

  const withCompletedWork: Profile = {
    ...lifeResult.profile,
    workItems: (lifeResult.profile.workItems || []).map(item =>
      item.id === workTaskId ? { ...item, status: 'done' } : item,
    ),
  };
  const linkedResult = completeLinkedLifeHubItemsForWorkTask(
    withCompletedWork,
    workTaskId!,
    completedAt,
  );
  return {
    profile: linkedResult.profile,
    status: 'applied',
    workTaskId,
    workTransitioned: workTask.status !== 'done',
    completedTaskIds: [lifeTaskId, ...linkedResult.completedTaskIds],
    completedRoutineIds: linkedResult.completedRoutineIds,
  };
}
