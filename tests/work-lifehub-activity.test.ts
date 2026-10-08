import { describe, expect, it } from 'vitest';
import type {
  DailyChecklistItem,
  ProductivityItem,
  TrashItem,
  WorkItem,
} from '@/lib/types';
import {
  deriveWorkLifeHubActivity,
  isWorkItemEligibleForNewLink,
  resolveWorkTarget,
} from '@/lib/work/lifehub-activity';
import {
  clearWorkLinksFromRoutines,
  clearWorkLinksFromTasks,
  getLifeHubLinkedContextNavigationDetail,
  getWorkItemIdsFromTrashData,
  normalizeLifeHubLinkedContext,
} from '@/lib/lifehub/linked-context';

const now = new Date('2026-08-27T15:00:00');
const workLink = {
  section: 'work' as const,
  type: 'work-item' as const,
  entityId: 'project-a',
};

function routine(id: string, overrides: Partial<DailyChecklistItem> = {}): DailyChecklistItem {
  return {
    id,
    title: id,
    frequency: 'daily',
    active: true,
    createdAt: new Date('2026-08-01T12:00:00'),
    ...overrides,
  };
}

function task(id: string, overrides: Partial<ProductivityItem> = {}): ProductivityItem {
  return {
    id,
    title: id,
    type: 'task',
    priority: 'normal',
    status: 'pending',
    createdAt: new Date('2026-08-01T12:00:00'),
    ...overrides,
  };
}

function workItem(id: string, type: 'project' | 'task', overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id,
    type,
    title: id,
    status: 'active',
    createdAt: new Date('2026-08-01T12:00:00'),
    ...(type === 'task' ? { projectId: 'project-a' } : {}),
    ...overrides,
  } as WorkItem;
}

function workTrash(...items: WorkItem[]): TrashItem {
  return {
    id: 'trash-work-a',
    source: 'workItems',
    sourceLabel: 'Work Project',
    itemId: items[0].id,
    title: items[0].title,
    deletedAt: new Date('2026-08-27T10:00:00'),
    deleteAfter: new Date('2026-09-27T10:00:00'),
    data: items,
  } as TrashItem;
}

describe('Work linked-context and Life Hub projection', () => {
  it('keeps canonical validation profile-independent and uses Work navigation', () => {
    expect(normalizeLifeHubLinkedContext({
      section: 'work',
      type: 'work-item',
      entityId: 'permanently-deleted-work-id',
    })).toEqual({
      section: 'work',
      type: 'work-item',
      entityId: 'permanently-deleted-work-id',
    });
    expect(normalizeLifeHubLinkedContext({ section: 'work', type: 'project', entityId: 'project-a' })).toBeUndefined();
    expect(getLifeHubLinkedContextNavigationDetail(workLink)).toEqual({
      section: 'workhub',
      feature: 'work-item',
      recordId: 'project-a',
    });
    expect(normalizeLifeHubLinkedContext({ section: 'journal', type: 'journal-entry' })).toEqual({
      section: 'journal',
      type: 'journal-entry',
    });
    expect(getLifeHubLinkedContextNavigationDetail({ section: 'journal', type: 'journal-entry' })).toEqual({
      section: 'lifehub',
      feature: 'journal-entry',
    });
  });

  it('offers only active Projects and project-child Work tasks for new links', () => {
    const project = workItem('project-a', 'project');
    const childTask = workItem('task-a', 'task');
    const archivedProject = workItem('project-archived', 'project', { status: 'archived' });
    const doneTask = workItem('task-done', 'task', { status: 'done' });
    const orphanTask = workItem('task-orphan', 'task', { projectId: 'missing-project' });
    const note = workItem('note-a', 'task', { type: 'note' as WorkItem['type'] });

    expect(isWorkItemEligibleForNewLink(project, [project])).toBe(true);
    expect(isWorkItemEligibleForNewLink(childTask, [project, childTask])).toBe(true);
    expect(isWorkItemEligibleForNewLink(archivedProject, [archivedProject])).toBe(false);
    expect(isWorkItemEligibleForNewLink(doneTask, [project, doneTask])).toBe(false);
    expect(isWorkItemEligibleForNewLink(orphanTask, [orphanTask])).toBe(false);
    expect(isWorkItemEligibleForNewLink(note, [note])).toBe(false);
  });

  it('preserves existing active, completed, archived, and trashed identity without fabricating active records', () => {
    const active = workItem('project-a', 'project');
    const completed = workItem('project-done', 'project', { status: 'done' });
    const archived = workItem('project-archived', 'project', { status: 'archived' });
    const trashed = workItem('task-trashed', 'task', { title: 'Trashed task' });
    const trash = workTrash(trashed);

    expect(resolveWorkTarget(active.id, [active])).toMatchObject({ state: 'active', title: active.title });
    expect(resolveWorkTarget(completed.id, [completed])).toMatchObject({ state: 'completed' });
    expect(resolveWorkTarget(archived.id, [archived])).toMatchObject({ state: 'archived' });
    expect(resolveWorkTarget(trashed.id, [], [trash])).toMatchObject({
      state: 'in-trash',
      title: 'Trashed task',
    });
    expect(resolveWorkTarget('missing', [], [trash])).toBeUndefined();
    expect(getWorkItemIdsFromTrashData(trash.data)).toEqual(['task-trashed']);
  });

  it('clears only permanently removed Work IDs while preserving Life Hub history and unrelated links', () => {
    const linkedRoutine = routine('linked', {
      linkedContext: workLink,
      completionHistory: [{ date: '2026-08-27', status: 'done' }],
    });
    const keptRoutine = routine('kept', {
      linkedContext: { ...workLink, entityId: 'project-kept' },
    });
    const linkedTask = task('linked-task', { linkedContext: workLink, linkOrigin: 'workhub-mirror' });
    const keptTask = task('kept-task', {
      linkedContext: { ...workLink, entityId: 'project-kept' },
    });

    const clearedRoutines = clearWorkLinksFromRoutines([linkedRoutine, keptRoutine], new Set(['project-a', 'child-a']));
    const clearedTasks = clearWorkLinksFromTasks([linkedTask, keptTask], new Set(['project-a', 'child-a']));

    expect(clearedRoutines[0].linkedContext).toBeUndefined();
    expect(clearedRoutines[0].completionHistory).toEqual(linkedRoutine.completionHistory);
    expect(clearedRoutines[1].linkedContext).toEqual(keptRoutine.linkedContext);
    expect(clearedTasks[0].linkedContext).toBeUndefined();
    expect(clearedTasks[0].linkOrigin).toBeUndefined();
    expect(clearedTasks[1].linkedContext).toEqual(keptTask.linkedContext);
  });

  it('derives compact today activity and task projections without mutating source records', () => {
    const completed = routine('completed', {
      linkedContext: workLink,
      completionHistory: [{ date: '2026-08-27', status: 'done', completedAt: new Date('2026-08-27T08:00:00'), linkedContext: workLink }],
    });
    const skipped = routine('skipped', {
      linkedContext: workLink,
      completionHistory: [{ date: '2026-08-27', status: 'skipped', linkedContext: workLink }],
    });
    const legacy = routine('legacy', {
      linkedContext: workLink,
      completionHistory: [{ date: '2026-08-27', status: 'done', completedAt: new Date('2026-08-27T07:00:00') }],
    });
    const pending = routine('pending', { linkedContext: workLink });
    const tasks = Array.from({ length: 4 }, (_, index) => task(`task-${index}`, { linkedContext: workLink }));
    const snapshot = structuredClone({ completed, skipped, legacy, pending, tasks });

    const activity = deriveWorkLifeHubActivity('project-a', [completed, skipped, legacy, pending], tasks, now);

    expect(activity).toMatchObject({
      linkedRoutineCount: 4,
      linkedTaskCount: 4,
      completedToday: 1,
      pendingToday: 2,
      skippedToday: 1,
      currentState: 'due',
    });
    expect(activity.lastExplicitRoutineActivityAt).toEqual(new Date('2026-08-27T12:00:00'));
    expect(activity.routines).toHaveLength(3);
    expect(activity.tasks).toHaveLength(3);
    expect({ completed, skipped, legacy, pending, tasks }).toEqual(snapshot);
  });

  it('keeps a saved occurrence with its former Work target after the routine is relinked', () => {
    const relinked = routine('relinked', {
      linkedContext: { ...workLink, entityId: 'project-b' },
      completionHistory: [{
        date: '2026-08-27',
        periodKey: 'day:2026-08-27',
        status: 'done',
        completedAt: new Date('2026-08-27T08:00:00'),
        linkedContext: workLink,
      }],
    });

    const formerTarget = deriveWorkLifeHubActivity('project-a', [relinked], [], now);
    const currentTarget = deriveWorkLifeHubActivity('project-b', [relinked], [], now);

    expect(formerTarget).toMatchObject({
      linkedRoutineCount: 1,
      completedToday: 1,
      pendingToday: 0,
      routines: [{ routineId: 'relinked', state: 'completed' }],
    });
    expect(currentTarget).toMatchObject({
      linkedRoutineCount: 1,
      completedToday: 0,
      pendingToday: 1,
      routines: [{ routineId: 'relinked', state: 'due' }],
    });
  });
});
