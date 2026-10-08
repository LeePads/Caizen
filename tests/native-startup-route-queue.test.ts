import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  enqueueNativeRoute,
  enqueueNativeReminderRoute,
  resetNativeRouteQueueForTests,
  subscribeToNativeRoutes,
  takePendingNativeRoute,
} from '@/lib/native/startup-route-queue';

describe('native startup route queue', () => {
  afterEach(resetNativeRouteQueueForTests);

  it('retains the newest route until a consumer mounts', () => {
    enqueueNativeRoute({ section: 'health' });
    enqueueNativeRoute({ section: 'lifehub', action: 'add-task' });

    expect(takePendingNativeRoute()).toEqual({
      section: 'lifehub',
      action: 'add-task',
    });
    expect(takePendingNativeRoute()).toBeNull();
  });

  it('delivers warm routes directly to the active consumer', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToNativeRoutes(listener);

    enqueueNativeRoute({ section: 'journal', action: 'add-journal' });
    expect(listener).toHaveBeenCalledWith({
      section: 'journal',
      action: 'add-journal',
    });
    expect(takePendingNativeRoute()).toBeNull();

    unsubscribe();
  });

  it('retains and maps notification targets before profile hydration', () => {
    enqueueNativeReminderRoute({
      profileId: 'profile-1',
      section: 'lifehub',
      recordId: 'task-1',
      kind: 'task',
    });

    expect(takePendingNativeRoute()).toEqual({
      profileId: 'profile-1',
      section: 'lifehub',
      recordId: 'task-1',
      action: 'tasks',
      source: 'notification',
    });
  });

  it('routes Work Hub calendar reminders to the Work Hub schedule record', () => {
    enqueueNativeReminderRoute({
      profileId: 'profile-1',
      section: 'workhub',
      recordId: 'event-1',
      kind: 'calendar',
    });

    expect(takePendingNativeRoute()).toEqual({
      profileId: 'profile-1',
      section: 'workhub',
      recordId: 'event-1',
      action: 'dates',
      source: 'notification',
    });
  });
});
