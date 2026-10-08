import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { getScheduledWorkoutsForDate } from '@/lib/health/workout-summary';
import type { DailyChecklistItem } from '@/lib/types';

const workspaceSource = readFileSync(resolve(process.cwd(), 'components/health/WorkoutWorkspace.tsx'), 'utf8');
const healthSource = readFileSync(resolve(process.cwd(), 'components/sections/HealthSection.tsx'), 'utf8');

const scheduledRoutine = (patch: Partial<DailyChecklistItem> = {}): DailyChecklistItem => ({
  id: 'schedule-1',
  title: 'Workout · Morning reset',
  frequency: 'daily',
  active: true,
  linkedEntityType: 'workout-routine',
  linkedEntityId: 'routine-1',
  createdAt: new Date(2026, 0, 1, 12),
  ...patch,
});

describe('Workout final release hardening', () => {
  it('restores Exercise Detail focus through the shared Dialog lifecycle', () => {
    expect(workspaceSource).toContain('onCloseAutoFocus');
    expect(workspaceSource).toContain('onRestoreFocus={restoreExerciseDetailFocus}');
    expect(workspaceSource).not.toContain('window.setTimeout(() => exerciseTriggerRef.current?.focus');
  });

  it('does not expose an implicit first-routine start path or duplicate Today launches', () => {
    expect(workspaceSource).not.toContain('begin(routines[0])');
    expect(workspaceSource).not.toContain('Start a routine');
    expect(workspaceSource).toContain('Choose a starter routine');
    expect(workspaceSource).toContain('scheduledRoutineEntries');
  });

  it('finds scheduled routines for the selected local date and sorts timed entries first', () => {
    const date = new Date(2026, 7, 25, 12);
    const entries = getScheduledWorkoutsForDate([
      scheduledRoutine({ id: 'untimed', title: 'Workout · Untimed', linkedEntityId: 'routine-untimed' }),
      scheduledRoutine({ id: 'late', title: 'Workout · Late', linkedEntityId: 'routine-late', scheduledTime: '19:00' }),
      scheduledRoutine({ id: 'early', title: 'Workout · Early', linkedEntityId: 'routine-early', scheduledTime: '07:30' }),
      scheduledRoutine({ id: 'inactive', active: false, linkedEntityId: 'routine-inactive', scheduledTime: '06:00' }),
      scheduledRoutine({ id: 'future', anchorDate: new Date(2026, 7, 26, 12), linkedEntityId: 'routine-future' }),
    ], date);

    expect(entries.map(entry => entry.item.id)).toEqual(['early', 'late', 'untimed']);
    expect(entries.every(entry => entry.status === 'pending')).toBe(true);
  });

  it('preserves occurrence status without mutating Calendar records', () => {
    const date = new Date(2026, 7, 25, 12);
    const done = scheduledRoutine({
      id: 'done',
      completionHistory: [{ date: '2026-08-25', status: 'done' }],
    });
    const skipped = scheduledRoutine({
      id: 'skipped',
      title: 'Workout · Skipped',
      completionHistory: [{ date: '2026-08-25', status: 'skipped' }],
    });
    const before = JSON.stringify([done, skipped]);
    const entries = getScheduledWorkoutsForDate([done, skipped], date);

    expect(entries.find(entry => entry.item.id === 'done')?.status).toBe('done');
    expect(entries.find(entry => entry.item.id === 'skipped')?.status).toBe('skipped');
    expect(JSON.stringify([done, skipped])).toBe(before);
  });

  it('keeps Health tabs at the web touch-target baseline', () => {
    expect(healthSource).toContain('h-11');
    expect(healthSource).toContain('min-w-11');
    expect(workspaceSource).toContain('min-h-11 items-center gap-1 px-2');
  });
});
