import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { Profile } from '@/lib/types';
import {
  buildWidgetSnapshot,
  WIDGET_SNAPSHOT_MAX_BYTES,
} from '@/lib/native/widget-snapshot';

const now = new Date(2026, 7, 15, 10, 0, 0);
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

describe('Work Tasks Android widget Phase 5 contracts', () => {
  it('registers a provider with the shared pinned-profile configuration and metadata', () => {
    const manifest = read('android/app/src/main/AndroidManifest.xml');
    const provider = read('android/app/src/main/res/xml/widget_work_tasks_info.xml');
    const configure = read('android/app/src/main/java/app/caizen/life/CaizenWidgetConfigureActivity.java');

    expect(manifest).toContain('android:name=".CaizenWorkTasksWidget"');
    expect(manifest).toContain('android:resource="@xml/widget_work_tasks_info"');
    expect(manifest).toContain('android:exported="false"');
    expect(provider).toContain('android:initialLayout="@layout/widget_work_tasks_small"');
    expect(provider).toContain('android:minWidth="110dp"');
    expect(provider).toContain('android:targetCellWidth="2"');
    expect(provider).toContain('android:widgetFeatures="reconfigurable"');
    expect(configure).toContain('workTasksWidget');
    expect(configure).toContain('WidgetBindingStore.WORK_TASKS');
    expect(configure).toContain('isWorkTasksWidget');
  });

  it('defines genuine small, medium, and large responsive compositions', () => {
    const widget = read('android/app/src/main/java/app/caizen/life/CaizenWorkTasksWidget.java');
    expect(widget).toContain('new SizeF(110f, 110f)');
    expect(widget).toContain('new SizeF(250f, 110f)');
    expect(widget).toContain('new SizeF(250f, 220f)');
    expect(widget).toContain('widget_work_tasks_small');
    expect(widget).toContain('widget_work_tasks_medium');
    expect(widget).toContain('widget_work_tasks_large');
    expect(widget).toContain('SIZE_SMALL.equals(size) ? 1 : SIZE_MEDIUM.equals(size) ? 3 : 6');
    for (const layout of [
      'widget_work_tasks_small.xml',
      'widget_work_tasks_medium.xml',
      'widget_work_tasks_large.xml',
    ]) {
      expect(read(`android/app/src/main/res/layout/${layout}`)).toContain('widget_work_tasks_root');
    }
  });

  it('consumes only the existing sanitized Work projection and preserves canonical ranking', () => {
    const snapshot = buildWidgetSnapshot(profile({
      workItems: [
        { id: 'undated', title: 'Undated', type: 'task', status: 'active', createdAt: now },
        { id: 'waiting', title: 'Waiting', type: 'task', status: 'waiting', dueDate: new Date(2026, 7, 14), createdAt: now },
        { id: 'upcoming', title: 'Upcoming', type: 'task', status: 'active', dueDate: new Date(2026, 7, 16), createdAt: now },
        { id: 'today', title: 'Today', type: 'task', status: 'active', dueDate: new Date(2026, 7, 15, 15), createdAt: now },
        { id: 'overdue-low', title: 'Overdue low', type: 'task', status: 'active', priority: 'low', dueDate: new Date(2026, 7, 14, 9), createdAt: now },
        { id: 'overdue-high', title: 'Overdue high', type: 'task', status: 'active', priority: 'high', dueDate: new Date(2026, 7, 14, 9), createdAt: now },
        { id: 'done', title: 'Done', type: 'task', status: 'done', createdAt: now },
        { id: 'archived', title: 'Archived', type: 'task', status: 'archived', createdAt: now },
        { id: 'note', title: 'Note', type: 'note', status: 'active', createdAt: now },
      ] as unknown as Profile['workItems'],
    }), { now });

    expect(snapshot.workTasks.items.map(item => item.id)).toEqual([
      'overdue-high',
      'overdue-low',
      'today',
      'upcoming',
      'waiting',
      'undated',
    ]);
    expect(snapshot.workTasks.openCount).toBe(6);
    expect(snapshot.workTasks.overdueCount).toBe(2);
    expect(snapshot.workTasks.items.every(item => item.occurrenceKey === 'once')).toBe(true);
    expect(JSON.stringify(snapshot.workTasks)).not.toContain('Done');
    expect(JSON.stringify(snapshot.workTasks)).not.toContain('Archived');
    expect(snapshot.workTasks.items.length).toBeLessThanOrEqual(8);
    expect(JSON.stringify(snapshot.workTasks).length).toBeLessThan(WIDGET_SNAPSHOT_MAX_BYTES);
  });

  it('keeps Work privacy fields out of the projection and makes redaction/action gating explicit', () => {
    const widget = read('android/app/src/main/java/app/caizen/life/CaizenWorkTasksWidget.java');
    const store = read('android/app/src/main/java/app/caizen/life/WidgetActionStore.java');
    const redaction = read('android/app/src/main/java/app/caizen/life/WidgetSnapshotStore.java');
    expect(widget).toContain('WidgetSnapshotStore.isRedacted(state)');
    expect(widget).toContain('boolean actionEnabled = !redacted');
    expect(widget).toContain('String title = redacted ? "Work task"');
    expect(widget).toContain('WidgetActionIds.workTaskComplete');
    expect(store).toContain('WidgetBindingStore.WORK_TASKS.equals(provider)');
    expect(store).toContain('"workTask.complete".equals(actionType)');
    expect(redaction).toContain('redactArray(workTasks.optJSONArray("items"), "Work task")');
    expect(JSON.stringify({ notes: 'private', link: 'https://private', attachmentAssetIds: ['secret'] }))
      .not.toContain('widget_work_tasks');
  });

  it('uses the shared direct workTask.complete lifecycle and exact Work routing', () => {
    const widget = read('android/app/src/main/java/app/caizen/life/CaizenWorkTasksWidget.java');
    const updater = read('android/app/src/main/java/app/caizen/life/CaizenWidgetUpdater.java');
    const shell = read('components/native/NativeAppShell.tsx');
    const context = read('lib/context.tsx');
    expect(widget).toContain('new Intent(context, CaizenWorkTasksWidget.class)');
    expect(widget).toContain('.put("actionType", "workTask.complete")');
    expect(widget).toContain('WidgetActionStore.enqueue(context, action)');
    expect(widget).toContain('deepLink(context, "work-task-row-"');
    expect(widget).toContain('"workhub", "task", recordId');
    expect(updater).toContain('CaizenWorkTasksWidget.class');
    expect(updater).toContain('refreshProviderForProfile(context, CaizenWorkTasksWidget.class');
    expect(updater).toContain('else if ("workTask.complete".equals(type)) refreshWorkTasksForProfile');
    expect(shell).toContain("action.actionType === 'workTask.complete'");
    expect(context).toContain('completeWorkItemForProfile');
  });

  it('preserves accepted-local, failure, profile, date, and revision boundaries', () => {
    const widget = read('android/app/src/main/java/app/caizen/life/CaizenWorkTasksWidget.java');
    const updater = read('android/app/src/main/java/app/caizen/life/CaizenWidgetUpdater.java');
    const binding = read('android/app/src/main/java/app/caizen/life/WidgetBindingStore.java');
    expect(widget).toContain('WidgetActionStore.listAccepted(context)');
    expect(widget).toContain('WidgetActionStore.failure(context, actionId)');
    expect(widget).toContain('!WidgetBindingStore.WORK_TASKS.equals(binding.optString("providerKind", ""))');
    expect(widget).toContain('!revision.equals(WidgetSnapshotStore.optString(state, "revision"))');
    expect(widget).toContain('!localTodayKey().equals(dateKey)');
    expect(widget).toContain('WidgetSnapshotStore.isConfigurationRequired(state)');
    expect(binding).toContain('CaizenWorkTasksWidget.class.getName()');
    expect(updater).toContain('refreshWorkTasksForProfile');
    expect(updater).not.toContain('refreshTodayForProfile(context, profileId);\n            }\n            else if ("workTask.complete"');
  });

  it('keeps v5/v6 compatibility and avoids adding Work fields to legacy projections', () => {
    const snapshot = read('lib/native/widget-snapshot.ts');
    const phase3 = read('tests/widget-phase3-extension.test.ts');
    expect(snapshot).toContain('source.version !== 5 && source.version !== 6 && source.version !== 7');
    expect(snapshot).toContain('workTasks: {');
    expect(phase3).toContain('legacy?.workTasks.items');
  });
});
