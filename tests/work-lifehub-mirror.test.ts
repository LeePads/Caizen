import { describe, expect, it } from 'vitest';
import type { Profile, WorkItem } from '@/lib/types';
import {
  completeManagedWorkMirrorFromLifeHub,
  reconcileWorkLifeHubMirror,
} from '@/lib/work/lifehub-mirror';

const now = new Date(2026, 7, 28, 12);
const workTask: WorkItem = {
  id: 'work-a',
  type: 'task',
  title: 'Ship release',
  projectId: 'project-a',
  priority: 'high',
  status: 'active',
  dueDate: new Date(2026, 7, 29, 12),
  createdAt: now,
};

function profile(): Profile {
  return {
    id: 'profile-a',
    name: 'Profile',
    workItems: [workTask],
    productivityItems: [],
    dailyChecklistItems: [],
    categoryXpEvents: [],
    masteryBondXpEvents: [],
    masteryBondClaims: [],
    createdAt: now,
  } as unknown as Profile;
}

describe('managed Work Life Hub mirror', () => {
  it('creates and updates one Work-owned Life Hub task', () => {
    const connected = reconcileWorkLifeHubMirror(
      profile(),
      [workTask],
      { workTaskId: workTask.id, enabled: true },
      now,
    );
    expect(connected.productivityItems).toHaveLength(1);
    expect(connected.productivityItems[0]).toMatchObject({
      title: 'Ship release',
      priority: 'important',
      linkOrigin: 'workhub-mirror',
      linkedContext: { section: 'work', type: 'work-item', entityId: 'work-a' },
    });

    const renamed = { ...workTask, title: 'Ship final release', priority: 'low' as const };
    const updated = reconcileWorkLifeHubMirror(
      connected,
      [renamed],
      { workTaskId: workTask.id, enabled: true },
      now,
    );
    expect(updated.productivityItems[0]).toMatchObject({ title: 'Ship final release', priority: 'optional' });
  });

  it('unlinks without deleting history and completes Work from the managed copy', () => {
    const connected = reconcileWorkLifeHubMirror(profile(), [workTask], { workTaskId: workTask.id, enabled: true }, now);
    const mirrorId = connected.productivityItems[0].id;
    const completed = completeManagedWorkMirrorFromLifeHub(connected, mirrorId, now);
    expect(completed.status).toBe('applied');
    expect(completed.workTransitioned).toBe(true);
    expect(completed.profile.workItems[0].status).toBe('done');
    expect(completed.profile.productivityItems[0].status).toBe('completed');

    const disconnected = reconcileWorkLifeHubMirror(
      completed.profile,
      completed.profile.workItems,
      { workTaskId: workTask.id, enabled: false },
      now,
    );
    expect(disconnected.productivityItems[0]).toMatchObject({ id: mirrorId, status: 'completed' });
    expect(disconnected.productivityItems[0].linkedContext).toBeUndefined();
    expect(disconnected.productivityItems[0].linkOrigin).toBeUndefined();
  });
});
