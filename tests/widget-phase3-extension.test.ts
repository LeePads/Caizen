import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Profile } from '@/lib/types';
import {
  buildWidgetSnapshot,
  readWidgetSnapshot,
  WIDGET_SNAPSHOT_MAX_BYTES,
  WIDGET_SNAPSHOT_VERSION,
} from '@/lib/native/widget-snapshot';
import {
  createWidgetActionId,
  normalizeWidgetAction,
  widgetActionAllowedForProvider,
  type WidgetAction,
} from '@/lib/native/widget-actions';

const now = new Date('2026-08-15T10:00:00');
const read = (path: string) => readFileSync(path, 'utf8');

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: 'profile-a',
    name: 'Cai',
    wallets: [],
    inventoryItems: [],
    wishlistItems: [],
    journalEntries: [],
    games: [],
    gameGuides: [],
    productivityItems: [],
    mediaItems: [],
    musicItems: [],
    workItems: [],
    personalVaultItems: [],
    trashItems: [],
    skincareProducts: [],
    dailyChecklistItems: [],
    importantDates: [],
    supplements: [],
    upcomingMoneyItems: [],
    health: {} as Profile['health'],
    createdAt: now,
    ...overrides,
  } as unknown as Profile;
}

function action(overrides: Partial<WidgetAction> = {}): WidgetAction {
  return {
    schemaVersion: 1,
    actionId: 'action-id',
    actionType: 'task.complete',
    sourceWidgetId: 12,
    profileId: 'profile-a',
    recordId: 'task-a',
    localDateKey: '2026-08-15',
    occurrenceKey: 'once',
    snapshotRevision: 'revision-a',
    createdAt: now.getTime(),
    ...overrides,
  };
}

describe('Phase 3 shared widget projection and action foundation', () => {
  it('publishes a bounded v7 Today contract with local-day progress and routine reservation', () => {
    const manyTasks = Array.from({ length: 10 }, (_, index) => ({
      id: `task-${index}`,
      title: `Task ${index}`,
      type: 'task',
      priority: 'normal',
      status: 'pending',
      deadline: new Date(`2026-08-15T${String(8 + index).padStart(2, '0')}:00:00`),
      createdAt: now,
    }));
    const snapshot = buildWidgetSnapshot(profile({
      productivityItems: [
        {
          id: 'overdue',
          title: 'Overdue task',
          type: 'task',
          priority: 'critical',
          status: 'pending',
          deadline: new Date('2026-08-14T23:00:00'),
          createdAt: now,
        },
        {
          id: 'done-today',
          title: 'Finished task',
          type: 'task',
          priority: 'normal',
          status: 'completed',
          deadline: new Date('2026-08-15T07:00:00'),
          createdAt: now,
        },
        ...manyTasks,
      ] as unknown as Profile['productivityItems'],
      dailyChecklistItems: [
        {
          id: 'routine-a',
          title: 'Morning routine',
          frequency: 'daily',
          scheduledTime: '06:30',
          active: true,
          completedAt: null,
          createdAt: now,
        },
      ] as unknown as Profile['dailyChecklistItems'],
    }), { now });

    expect(snapshot.version).toBe(WIDGET_SNAPSHOT_VERSION);
    expect(snapshot.version).toBe(7);
    expect(snapshot.today.includeRoutines).toBe(false);
    expect(snapshot.today.items[0]).toMatchObject({ id: 'overdue', kind: 'task' });
    expect(snapshot.today.items.some(item => item.kind === 'routine')).toBe(false);
    expect(snapshot.today.overdueTaskCount).toBe(1);
    expect(snapshot.today.dueTodayTaskCount).toBe(11);
    expect(snapshot.today.dueTodayRoutineCount).toBe(0);
    expect(snapshot.today.totalDueCount).toBe(11);
    expect(snapshot.today.completedDueCount).toBe(1);
    expect(snapshot.today.progress).toBe(9);
    expect(JSON.stringify(snapshot)).not.toContain('Finished task');
    expect(JSON.stringify(snapshot)).not.toContain('health');
    expect(JSON.stringify(snapshot)).not.toContain('wallet');
    expect(JSON.stringify(snapshot).length).toBeLessThan(WIDGET_SNAPSHOT_MAX_BYTES);
  });

  it('filters and deterministically sorts sanitized Work task rows', () => {
    const snapshot = buildWidgetSnapshot(profile({
      workItems: [
        {
          id: 'waiting', title: 'Waiting task', type: 'task', status: 'waiting',
          notes: 'private note', link: 'https://private.example',
          createdAt: now,
        },
        {
          id: 'overdue', title: 'Overdue work', type: 'task', status: 'active',
          priority: 'high', dueDate: new Date('2026-08-14T09:00:00'),
          attachmentAssetIds: ['secret-file'], notes: 'QA details', createdAt: now,
        },
        { id: 'done', title: 'Done work', type: 'task', status: 'done', createdAt: now },
        { id: 'archived', title: 'Archived work', type: 'task', status: 'archived', createdAt: now },
        { id: 'note', title: 'A note', type: 'note', status: 'active', createdAt: now },
      ] as unknown as Profile['workItems'],
    }), { now });

    expect(snapshot.workTasks.items.map(item => item.id)).toEqual(['overdue', 'waiting']);
    expect(snapshot.workTasks.openCount).toBe(2);
    expect(snapshot.workTasks.overdueCount).toBe(1);
    expect(snapshot.workTasks.items[0]).toMatchObject({
      occurrenceKey: 'once',
      dateKey: '2026-08-15',
      priority: 'high',
    });
    expect(JSON.stringify(snapshot.workTasks)).not.toContain('private note');
    expect(JSON.stringify(snapshot.workTasks)).not.toContain('secret-file');
    expect(JSON.stringify(snapshot.workTasks)).not.toContain('QA details');
  });

  it('reads v5 and v6 projections with safe v7 defaults', () => {
    for (const version of [5, 6]) {
      const legacy = readWidgetSnapshot({
        version,
        profileId: 'profile-a',
        profileName: 'Cai',
        revision: 'r',
        updatedAt: now.getTime(),
        tasks: [],
        routines: [],
        events: [],
      });
      expect(legacy?.version).toBe(version);
      expect(legacy?.today.items).toEqual([]);
      expect(legacy?.workTasks.items).toEqual([]);
    }
    expect(readWidgetSnapshot({ version: 4, profileId: 'profile-a' })).toBeNull();
  });

  it('normalizes all bounded actions and enforces provider permissions', async () => {
    expect(normalizeWidgetAction(action())).toMatchObject({ actionType: 'task.complete' });
    expect(normalizeWidgetAction(action({ actionType: 'workTask.complete', occurrenceKey: 'day:2026-08-15' }))).toBeNull();
    expect(normalizeWidgetAction(action({ actionType: 'workTask.complete', recordId: 'work-a' })))
      .toMatchObject({ occurrenceKey: 'once' });
    expect(normalizeWidgetAction(action({ actionType: 'routine.complete', occurrenceKey: 'day:2026-08-15' })))
      .toMatchObject({ actionType: 'routine.complete' });
    expect(normalizeWidgetAction(action({ localDateKey: '2026-8-15' }))).toBeNull();
    expect(widgetActionAllowedForProvider('today', 'task.complete')).toBe(true);
    expect(widgetActionAllowedForProvider('today', 'routine.complete')).toBe(false);
    expect(widgetActionAllowedForProvider('routines', 'task.complete')).toBe(false);
    expect(widgetActionAllowedForProvider('workTasks', 'workTask.complete')).toBe(true);
    expect(widgetActionAllowedForProvider('workTasks', 'task.complete')).toBe(false);

    const taskId = await createWidgetActionId('task.complete', 'profile-a', 'task-a', 'once');
    const sameTaskId = await createWidgetActionId('task.complete', 'profile-a', 'task-a', 'once');
    const differentTypeId = await createWidgetActionId('workTask.complete', 'profile-a', 'task-a', 'once');
    expect(taskId).toBe(sameTaskId);
    expect(taskId).not.toBe(differentTypeId);
    expect(taskId).toMatch(/^[a-f0-9]{64}$/);
  });

  it('keeps provider-aware action and reconciliation contracts explicit', () => {
    const manifest = read('android/app/src/main/AndroidManifest.xml');
    const store = read('android/app/src/main/java/app/caizen/life/WidgetActionStore.java');
    const binding = read('android/app/src/main/java/app/caizen/life/WidgetBindingStore.java');
    const updater = read('android/app/src/main/java/app/caizen/life/CaizenWidgetUpdater.java');
    const shell = read('components/native/NativeAppShell.tsx');
    expect(manifest).toContain('CaizenTodayWidget');
    expect(manifest).toContain('CaizenWorkTasksWidget');
    for (const actionType of ['routine.complete', 'task.complete', 'workTask.complete']) {
      expect(store).toContain(actionType);
      expect(shell).toContain(actionType);
    }
    expect(binding).toContain('includeRoutines');
    expect(binding).toContain('providerKind');
    expect(updater).toContain('refreshRoutinesForProfile');
    expect(updater).toContain('refreshTodayForProfile');
    expect(updater).toContain('refreshWorkTasksForProfile');
    expect(shell).not.toContain('changedRevisionIds');
  });

  it('routes task and Work completion through profile-targeted canonical paths', () => {
    const context = read('lib/context.tsx');
    const completion = read('lib/lifehub/completion.ts');
    const workHub = read('components/sections/WorkHubSection.tsx');
    const shell = read('components/native/NativeAppShell.tsx');
    expect(context).toContain('completeProductivityItemForProfile');
    expect(context).toContain('completeWorkItemForProfile');
    expect(context).toContain('profilesRef.current.find(item => item.id === profileId)');
    expect(completion).not.toContain('recordCategoryXpEvent');
    expect(completion).not.toContain('recordMasteryBondEvent');
    expect(completion).not.toContain('applyPetReward');
    expect(workHub).toContain('context.completeWorkItemForProfile(profile.id, item.id)');
    expect(shell).toContain("action.actionType === 'task.complete'");
    expect(shell).toContain("action.actionType === 'workTask.complete'");
    expect(shell).toContain('recordWidgetActionReceipt(action.profileId, action.actionId)');
    expect(shell).toContain('widgetActionsAwaitingSave');
  });

  it('keeps accepted-local, retry, rejection, receipt, and restore boundaries explicit', () => {
    const actions = read('android/app/src/main/java/app/caizen/life/WidgetActionStore.java');
    const shell = read('components/native/NativeAppShell.tsx');
    const backup = read('lib/cloud-backup.ts');
    expect(actions).toContain('KEY_ACCEPTED');
    expect(actions).toContain('retryableFailure');
    expect(actions).toContain('queue_full');
    expect(actions).toContain('syncState');
    expect(shell).toContain("reason: 'wrong-date'");
    expect(shell).toContain("reason: 'stale'");
    expect(shell).toContain("reason: 'missing-record'");
    expect(backup).toContain('options.expectedProfileId !== profile.id');
    expect(backup).toContain('expectedUpdatedAt');
  });
});
