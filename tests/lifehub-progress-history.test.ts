import { describe, expect, it } from 'vitest';
import type { Profile } from '@/lib/types';
import { changeRoutineProgressInProfile } from '@/lib/lifehub/completion';
import { deriveProgressHistory, getRoutineProgressForDate } from '@/lib/lifehub/progress-history';
import { getRoutineOccurrence, getRoutineOccurrenceKey, recordRoutineScheduleRevision } from '@/lib/lifehub/routine-schedule';
import { normalizeRoutineItem } from '@/lib/lifehub/normalization';

const day = new Date(2026, 8, 7, 12);
const stamp = new Date(2026, 8, 7, 12);

function routine(overrides: Record<string, unknown> = {}) {
  return normalizeRoutineItem({
    id: 'routine-reading',
    title: 'Read a book',
    frequency: 'daily',
    anchorDate: new Date(2026, 7, 1, 12),
    createdAt: new Date(2026, 7, 1, 12),
    goal: { target: 2, unit: 'chapters' },
    ...overrides,
  });
}

function profileWith(item: ReturnType<typeof routine>, extra: Partial<Profile> = {}): Profile {
  return { ...extra, dailyChecklistItems: [item] } as unknown as Profile;
}

describe('measurable Life Hub routine occurrences', () => {
  it('snapshots the target and link when progress crosses the goal', () => {
    const item = routine({ linkedContext: { section: 'entertainment', type: 'book', entityId: 'book-1' } });
    const profile = profileWith(item, { books: [{ id: 'book-1', title: 'Atomic Habits' }] as Profile['books'] });
    const partial = changeRoutineProgressInProfile(profile, item.id, day, { kind: 'set', value: 1 }, stamp).profile;
    const changedGoal = {
      ...partial,
      dailyChecklistItems: partial.dailyChecklistItems.map(current => ({ ...current, goal: { target: 10, unit: 'pages' as const } })),
    };
    const completed = changeRoutineProgressInProfile(changedGoal, item.id, day, { kind: 'set', value: 2 }, new Date(stamp.getTime() + 1000));
    const saved = completed.profile.dailyChecklistItems[0];
    const occurrence = getRoutineOccurrence(saved, day);

    expect(saved.progressHistory?.[0]).toMatchObject({ value: 2, target: 2, unit: 'chapters' });
    expect(occurrence).toMatchObject({ status: 'done', linkedContext: item.linkedContext, linkedTitleSnapshot: 'Atomic Habits' });
  });

  it('keeps measured value after a correction removes the automatic completion', () => {
    const initial = routine({ goal: { target: 3, unit: 'pages' } });
    const reached = changeRoutineProgressInProfile(profileWith(initial), initial.id, day, { kind: 'set', value: 3 }, stamp);
    const corrected = changeRoutineProgressInProfile(reached.profile, initial.id, day, { kind: 'set', value: 1.5 }, new Date(stamp.getTime() + 1000));
    const saved = corrected.profile.dailyChecklistItems[0];

    expect(getRoutineOccurrence(saved, day)).toBeUndefined();
    expect(getRoutineProgressForDate(saved, day)).toMatchObject({ value: 1.5, target: 3, unit: 'pages' });
  });

  it('does not complete again after manual undo when the value stays above target', () => {
    const initial = routine({ goal: { target: 1, unit: 'episodes' } });
    const reached = changeRoutineProgressInProfile(profileWith(initial), initial.id, day, { kind: 'set', value: 1 }, stamp);
    const undone = {
      ...reached.profile,
      dailyChecklistItems: reached.profile.dailyChecklistItems.map(current => ({ ...current, completionHistory: [], completionCount: 0, completedAt: null })),
    };
    const edited = changeRoutineProgressInProfile(undone, initial.id, day, { kind: 'adjust', delta: 1 }, new Date(stamp.getTime() + 1000));

    expect(getRoutineOccurrence(edited.profile.dailyChecklistItems[0], day)).toBeUndefined();
    expect(getRoutineProgressForDate(edited.profile.dailyChecklistItems[0], day)?.value).toBe(2);
  });

  it('keeps progress separate from a skipped occurrence', () => {
    const initial = routine({
      goal: { target: 2, unit: 'chapters' },
      completionHistory: [{ date: '2026-09-07', periodKey: getRoutineOccurrenceKey(routine(), day), status: 'skipped' }],
    });
    const result = changeRoutineProgressInProfile(profileWith(initial), initial.id, day, { kind: 'set', value: 2 }, stamp);
    const saved = result.profile.dailyChecklistItems[0];

    expect(getRoutineOccurrence(saved, day)?.status).toBe('skipped');
    expect(getRoutineProgressForDate(saved, day)?.value).toBe(2);
  });

  it('records cadence revisions without reusing old period keys or rewriting old outcomes', () => {
    const initial = routine({
      frequency: 'weekly',
      completionHistory: [{ date: '2026-09-07', periodKey: 'week:2026-09-07', status: 'done' }],
    });
    const next = recordRoutineScheduleRevision(initial, { ...initial, frequency: 'biweekly' }, day);
    const newKey = getRoutineOccurrenceKey(next, day);

    expect(next.completionHistory).toEqual(initial.completionHistory);
    expect(getRoutineOccurrenceKey(next, new Date(2026, 8, 6, 12))).toBe('legacy:2026-09-06');
    expect(newKey).toBe('revision:2026-09-07:week:2026-09-07');
    expect(newKey).not.toBe(initial.completionHistory?.[0]?.periodKey);
    expect(getRoutineOccurrence(next, day)?.status).toBe('done');
  });

  it('shows one saved partial measurement in Outcomes without creating completion history', () => {
    const measured = routine({
      progressHistory: [{ periodKey: getRoutineOccurrenceKey(routine(), day), date: '2026-09-07', value: 0.5, target: 2, unit: 'chapters', updatedAt: stamp }],
    });
    const history = deriveProgressHistory([], [measured], 'month', day);

    expect(history.entries).toHaveLength(1);
    expect(history.entries[0]).toMatchObject({ source: 'routine', status: 'in-progress', measuredProgress: { value: 0.5, target: 2, unit: 'chapters' } });
    expect(measured.completionHistory).toEqual([]);
  });
});
