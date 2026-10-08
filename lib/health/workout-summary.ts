import type { ActivityEntry, DailyChecklistItem, WorkoutSession } from '../types';
import { getNextRoutineDueDate, getRoutineStatusForDate, isRoutineDueForDate } from '../lifehub/routine-schedule';

const timestamp = (value: Date | string | number | undefined) => {
  const parsed = value instanceof Date ? value : new Date(value || 0);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
};

export function getWorkoutCompletionCount(
  routineId: string | undefined,
  sessions: WorkoutSession[],
) {
  return sessions.filter(session =>
    session.status === 'completed' && (!routineId || session.routineId === routineId),
  ).length;
}

export function getWorkoutWeekSummary(
  sessions: WorkoutSession[],
  legacyEntries: ActivityEntry[],
  start: Date,
  end: Date,
) {
  const startAt = start.getTime();
  const endAt = end.getTime();
  const inRange = (date: Date | string) => {
    const value = timestamp(date);
    return value >= startAt && value <= endAt;
  };
  const newSessions = sessions.filter(session => session.status === 'completed' && inRange(session.startedAt));
  const legacy = legacyEntries.filter(entry => inRange(entry.date));
  return {
    sessions: newSessions.length + legacy.length,
    movementMinutes: newSessions.reduce((sum, session) => sum + (session.durationMinutes || 0), 0)
      + legacy.reduce((sum, entry) => sum + (entry.durationMinutes || 0), 0),
    newSessions,
    legacyEntries: legacy,
  };
}

export function getLatestCompletedWorkout(sessions: WorkoutSession[], legacyEntries: ActivityEntry[]) {
  const latestNew = sessions
    .filter(session => session.status === 'completed')
    .sort((a, b) => timestamp(b.completedAt || b.startedAt) - timestamp(a.completedAt || a.startedAt))[0];
  const latestLegacy = [...legacyEntries].sort((a, b) => timestamp(b.date) - timestamp(a.date))[0];
  if (!latestNew && !latestLegacy) return null;
  if (!latestLegacy || (latestNew && timestamp(latestNew.completedAt || latestNew.startedAt) >= timestamp(latestLegacy.date))) {
    return { kind: 'session' as const, value: latestNew };
  }
  return { kind: 'legacy' as const, value: latestLegacy };
}

export function getNextScheduledWorkout(
  items: DailyChecklistItem[],
  from = new Date(),
) {
  return items
    .filter(item => item.active && item.linkedEntityType === 'workout-routine' && Boolean(item.linkedEntityId))
    .map(item => ({ item, date: getNextRoutineDueDate(item, from) }))
    .filter(candidate => candidate.date !== null)
    .sort((a, b) => (a.date?.getTime() || 0) - (b.date?.getTime() || 0))[0] || null;
}

function scheduledTimeMinutes(value?: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value || '');
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

export function getScheduledWorkoutsForDate(
  items: DailyChecklistItem[],
  date: Date,
) {
  return items
    .filter(item => (
      item.active !== false
      && item.linkedEntityType === 'workout-routine'
      && Boolean(item.linkedEntityId)
      && isRoutineDueForDate(item, date)
    ))
    .map(item => ({
      item,
      status: getRoutineStatusForDate(item, date),
    }))
    .sort((a, b) => {
      const aTime = scheduledTimeMinutes(a.item.scheduledTime);
      const bTime = scheduledTimeMinutes(b.item.scheduledTime);
      if (aTime !== null && bTime !== null && aTime !== bTime) return aTime - bTime;
      if (aTime !== null) return -1;
      if (bTime !== null) return 1;
      const titleOrder = a.item.title.localeCompare(b.item.title);
      return titleOrder || a.item.id.localeCompare(b.item.id);
    });
}
