import { describe, expect, it } from 'vitest';
import type { DailyChecklistItem, ProductivityItem } from '@/lib/types';
import { deriveHealthLifeHubActivity } from '@/lib/health/lifehub-activity';
import { toLocalDateKey } from '@/lib/lifehub/date-utils';

const now = new Date('2026-08-27T12:00:00');
const linkedContext = { section: 'health' as const, type: 'workout-plan' as const, entityId: 'plan-1' };

const routine = (id: string, overrides: Partial<DailyChecklistItem> = {}): DailyChecklistItem => ({
  id,
  title: id,
  frequency: 'daily',
  active: true,
  anchorDate: now,
  createdAt: now,
  linkedContext,
  ...overrides,
});

const task = (id: string, overrides: Partial<ProductivityItem> = {}): ProductivityItem => ({
  id,
  title: id,
  type: 'task',
  priority: 'normal',
  status: 'pending',
  createdAt: now,
  linkedContext,
  ...overrides,
});

describe('Health Life Hub activity projection', () => {
  it('derives today counts, current state, explicit activity, compact rows, and navigation metadata', () => {
    const completed = routine('completed', {
      completionHistory: [{ date: '2026-08-27', status: 'done', completedAt: new Date('2026-08-27T08:00:00'), linkedContext }],
    });
    const skipped = routine('skipped', { completionHistory: [{ date: '2026-08-27', status: 'skipped', linkedContext }] });
    const legacy = routine('legacy', { completionHistory: [{ date: '2026-08-27', status: 'done' }] });
    const pending = routine('pending');
    const tasks = Array.from({ length: 4 }, (_, index) => task(`task-${index}`, index === 0 ? { status: 'completed', completedAt: now } : {}));
    const activity = deriveHealthLifeHubActivity({ type: 'workout-plan', entityId: 'plan-1' }, [completed, skipped, legacy, pending], tasks, now);

    expect(activity).toMatchObject({
      linkedRoutineCount: 4,
      linkedTaskCount: 4,
      completedToday: 1,
      pendingToday: 2,
      skippedToday: 1,
      currentState: 'due',
    });
    expect(activity.lastExplicitRoutineActivityAt).toBeTruthy();
    expect(toLocalDateKey(activity.lastExplicitRoutineActivityAt!)).toBe('2026-08-27');
    expect(activity.routines).toHaveLength(3);
    expect(activity.tasks).toHaveLength(3);
    expect(activity.routines[0].navigation).toEqual({ section: 'lifehub', feature: 'routine', recordId: 'pending' });
    expect(activity.tasks[0].navigation).toEqual({ section: 'lifehub', feature: 'tasks', recordId: 'task-1' });
  });

  it('does not mutate source records and excludes unrelated links', () => {
    const source = routine('source');
    const unrelated = routine('other', { linkedContext: { section: 'health', type: 'workout-routine', entityId: 'routine-1' } });
    const snapshot = structuredClone({ source, unrelated });
    const activity = deriveHealthLifeHubActivity({ type: 'workout-plan', entityId: 'plan-1' }, [source, unrelated], [], now);
    expect(activity.linkedRoutineCount).toBe(1);
    expect({ source, unrelated }).toEqual(snapshot);
  });
});
