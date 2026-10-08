import type {
  DailyChecklistItem,
  HealthProfile,
  ImportantDateItem,
  NoXTracker,
  ProductivityItem,
} from '@/lib/types';
import { getStreakActiveDays, normalizePauseHistory } from '@/lib/health/streak-timeline';
import { isRoutineDoneForDate, isRoutineDueForDate } from './routine-schedule';
import {
  addLocalDays,
  endOfLocalDay,
  isSameLocalDay,
  startOfLocalDay,
  toLocalDateKey,
} from './date-utils';
import { personalVaultPlanningProjection } from '@/lib/personal-vault/planning';
import type { PersonalVaultItem } from '@/lib/types';

export type CalendarSourceKey =
  | 'dates'
  | 'tasks'
  | 'inventory'
  | 'wishlist'
  | 'skincare'
  | 'supplements'
  | 'health'
  | 'vault'
  | 'work'
  | 'history';

export type LifeHubCalendarEvent = {
  id: string;
  recordId: string;
  title: string;
  date: Date;
  endDate?: Date | null;
  type: string;
  source:
    | 'date'
    | 'task'
    | 'inventory'
    | 'wishlist'
    | 'skincare'
    | 'supplements'
    | 'routine'
    | 'streak'
    | 'vault'
    | 'work';
  section: CalendarSourceKey;
  priority: string;
  status?: string;
  repeat?: ImportantDateItem['repeat'];
  trackAsOverdue?: boolean;
  amount?: number;
  notes?: string;
  link?: string;
  projectId?: string;
  projectName?: string | null;
  virtual?: boolean;
  linkedEntityType?: DailyChecklistItem['linkedEntityType'];
  linkedEntityId?: string;
  hasScheduledTime?: boolean;
  streakTimelineEntry?:
    | { kind: 'pause'; id: string }
    | { kind: 'reset'; index: number };
};

type CalendarInputs = {
  importantDates?: ImportantDateItem[];
  productivityItems?: ProductivityItem[];
  inventoryItems?: any[];
  wishlistItems?: any[];
  skincareProducts?: any[];
  supplements?: any[];
  personalVaultItems?: PersonalVaultItem[];
  workItems?: any[];
  dailyChecklistItems?: DailyChecklistItem[];
  health?: HealthProfile | null;
  rangeStart: Date;
  rangeEnd: Date;
  filters: Partial<Record<CalendarSourceKey, boolean>>;
};

const isEnabled = (
  filters: Partial<Record<CalendarSourceKey, boolean>>,
  section: CalendarSourceKey,
) => filters[section] !== false;

const WORK_DATE_TYPES = new Set(['office', 'work_home', 'travel', 'holiday', 'leave']);
const RESOLVABLE_DATE_TYPES = new Set([
  'bill',
  'subscription',
  'renewal',
  'warranty',
  'restock',
  'deadline',
]);

export function isActionableCalendarDate(
  event: Pick<LifeHubCalendarEvent, 'source' | 'section' | 'type' | 'trackAsOverdue' | 'virtual'>,
) {
  return (
    event.source === 'date' &&
    event.section !== 'history' &&
    event.trackAsOverdue === true &&
    !WORK_DATE_TYPES.has(event.type) &&
    RESOLVABLE_DATE_TYPES.has(event.type)
  );
}

function pushOccurrence(
  target: LifeHubCalendarEvent[],
  item: ImportantDateItem,
  date: Date,
  projectName?: string | null,
  virtual = false,
) {
  const completed = item.status === 'completed';
  const workRelated = Boolean(item.projectId) || WORK_DATE_TYPES.has(item.type);
  target.push({
    id: virtual ? `${item.id}:${toLocalDateKey(date)}` : item.id,
    recordId: item.id,
    title: item.title,
    date,
    endDate: item.endDate ? new Date(item.endDate) : null,
    type: item.type,
    source: 'date',
    section: workRelated ? 'work' : completed ? 'history' : 'dates',
    priority: item.priority || 'none',
    status: item.status || 'upcoming',
    repeat: item.repeat,
    trackAsOverdue: item.trackAsOverdue === true,
    amount: item.amount,
    notes: item.notes,
    link: item.link,
    projectId: item.projectId,
    projectName,
    virtual,
  });
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function recurringDateForYear(base: Date, year: number) {
  return new Date(
    year,
    base.getMonth(),
    Math.min(base.getDate(), daysInMonth(year, base.getMonth())),
    12,
  );
}

function importantDateOccurrences(
  item: ImportantDateItem,
  rangeStart: Date,
  rangeEnd: Date,
  projectName?: string | null,
): LifeHubCalendarEvent[] {
  if (item.status === 'dismissed') return [];
  const result: LifeHubCalendarEvent[] = [];
  const base = new Date(item.date);
  if (Number.isNaN(base.getTime())) return result;

  if (item.repeat === 'none') {
    if (base <= endOfLocalDay(rangeEnd) && (item.endDate ? new Date(item.endDate) : base) >= startOfLocalDay(rangeStart)) {
      pushOccurrence(result, item, base, projectName, false);
    }
    return result;
  }

  if (item.repeat === 'monthly') {
    const cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1, 12);
    const finalMonth = new Date(rangeEnd.getFullYear(), rangeEnd.getMonth(), 1, 12);
    const firstAllowed = startOfLocalDay(base);
    const lastAllowed = item.endDate ? endOfLocalDay(new Date(item.endDate)) : null;
    while (cursor <= finalMonth) {
      const occurrence = new Date(
        cursor.getFullYear(),
        cursor.getMonth(),
        Math.min(base.getDate(), daysInMonth(cursor.getFullYear(), cursor.getMonth())),
        12,
      );
      if (
        occurrence >= startOfLocalDay(rangeStart) &&
        occurrence <= endOfLocalDay(rangeEnd) &&
        occurrence >= firstAllowed &&
        (!lastAllowed || occurrence <= lastAllowed)
      ) {
        pushOccurrence(result, item, occurrence, projectName, true);
      }
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return result;
  }

  for (let year = rangeStart.getFullYear(); year <= rangeEnd.getFullYear(); year += 1) {
    const occurrence = recurringDateForYear(base, year);
    const firstAllowed = startOfLocalDay(base);
    const lastAllowed = item.endDate ? endOfLocalDay(new Date(item.endDate)) : null;
    if (
      occurrence >= startOfLocalDay(rangeStart) &&
      occurrence <= endOfLocalDay(rangeEnd) &&
      occurrence >= firstAllowed &&
      (!lastAllowed || occurrence <= lastAllowed)
    ) {
      pushOccurrence(result, item, occurrence, projectName, true);
    }
  }
  return result;
}


function withinRange(date: Date, rangeStart: Date, rangeEnd: Date) {
  return date >= startOfLocalDay(rangeStart) && date <= endOfLocalDay(rangeEnd);
}

function withScheduledTime(date: Date, time?: string) {
  const next = new Date(date);
  const match = /^(\d{1,2}):(\d{2})$/.exec(time || '');
  if (match) next.setHours(Number(match[1]), Number(match[2]), 0, 0);
  else next.setHours(12, 0, 0, 0);
  return next;
}

function pushStreakEvent(
  events: LifeHubCalendarEvent[],
  tracker: NoXTracker,
  date: Date,
  type: string,
  title: string,
  status?: string,
  streakTimelineEntry?: LifeHubCalendarEvent['streakTimelineEntry'],
) {
  events.push({
    id: `streak:${tracker.id}:${type}:${toLocalDateKey(date)}`,
    recordId: tracker.id,
    title,
    date,
    type,
    source: 'streak',
    section: 'health',
    priority: type.includes('milestone') ? 'medium' : 'none',
    status,
    notes: tracker.notes,
    virtual: true,
    streakTimelineEntry,
  });
}

export function buildLifeHubCalendarEvents({
  importantDates = [],
  productivityItems = [],
  inventoryItems = [],
  wishlistItems = [],
  skincareProducts = [],
  supplements = [],
  personalVaultItems = [],
  workItems = [],
  dailyChecklistItems = [],
  health,
  rangeStart,
  rangeEnd,
  filters,
}: CalendarInputs): LifeHubCalendarEvent[] {
  const workProjects = new Map(
    workItems
      .filter(item => item.type === 'project')
      .map(item => [item.id, item.title]),
  );

  const events: LifeHubCalendarEvent[] = [];
  for (const item of importantDates) {
    const projectName = item.projectId ? workProjects.get(item.projectId) || null : null;
    for (const occurrence of importantDateOccurrences(item, rangeStart, rangeEnd, projectName)) {
      if (isEnabled(filters, occurrence.section)) events.push(occurrence);
    }
  }

  if (isEnabled(filters, 'history')) {
    for (const item of importantDates) {
      if (item.repeat === 'none') continue;
      for (const resolution of item.resolutionHistory || []) {
        const date = new Date(resolution.occurrenceDate);
        if (date < startOfLocalDay(rangeStart) || date > endOfLocalDay(rangeEnd)) continue;
        events.push({
          id: `date-history:${item.id}:${toLocalDateKey(date)}`,
          recordId: item.id,
          title: `${item.title} resolved`,
          date,
          type: `${item.type} resolved`,
          source: 'date',
          section: 'history',
          priority: 'none',
          status: resolution.status,
          amount: item.amount,
          notes: item.notes,
          link: item.link,
          projectId: item.projectId,
          projectName: item.projectId ? workProjects.get(item.projectId) || null : null,
          virtual: true,
        });
      }
    }
  }

  if (isEnabled(filters, 'tasks')) {
    for (const item of productivityItems) {
      if (!item.deadline || !['task', 'reminder'].includes(item.type)) continue;
      // Tasks retain their historical projection behavior. Reminders can opt
      // out explicitly; an absent value keeps legacy reminders visible.
      if (item.type === 'reminder' && item.showInCalendar === false) continue;
      if (['completed', 'failed', 'dropped'].includes(item.status)) continue;
      const date = new Date(item.deadline);
      if (date < startOfLocalDay(rangeStart) || date > endOfLocalDay(rangeEnd)) continue;
      events.push({
        id: item.id,
        recordId: item.id,
        title: item.title,
        date,
        type: item.type === 'reminder' ? 'reminder' : 'task deadline',
        source: 'task',
        section: 'tasks',
        priority: item.priority,
        status: item.status,
        notes: item.description || item.notes,
      });
    }
  }

  if (isEnabled(filters, 'history')) {
    for (const item of inventoryItems) {
      if (!item.purchaseDate) continue;
      const date = new Date(item.purchaseDate);
      if (date < startOfLocalDay(rangeStart) || date > endOfLocalDay(rangeEnd)) continue;
      events.push({ id: `inventory:${item.id}`, recordId: item.id, title: `${item.name} bought`, date, type: 'inventory bought', source: 'inventory', section: 'history', priority: 'none' });
    }
    for (const item of wishlistItems) {
      if (!item.isBought || !item.purchaseDate) continue;
      const date = new Date(item.purchaseDate);
      if (date < startOfLocalDay(rangeStart) || date > endOfLocalDay(rangeEnd)) continue;
      events.push({ id: `wishlist:${item.id}`, recordId: item.id, title: `${item.name} bought`, date, type: 'wishlist bought', source: 'wishlist', section: 'history', priority: 'none' });
    }
    for (const item of skincareProducts) {
      if (item.purchaseDate) {
        const date = new Date(item.purchaseDate);
        if (date >= startOfLocalDay(rangeStart) && date <= endOfLocalDay(rangeEnd)) {
          events.push({ id: `skincare:${item.id}:purchase`, recordId: item.id, title: `${item.name} bought`, date, type: 'skincare bought', source: 'skincare', section: 'history', priority: 'none' });
        }
      }
      if (item.emptiedAt) {
        const date = new Date(item.emptiedAt);
        if (date >= startOfLocalDay(rangeStart) && date <= endOfLocalDay(rangeEnd)) {
          events.push({ id: `skincare:${item.id}:finished`, recordId: item.id, title: `${item.name} finished`, date, type: 'skincare finished', source: 'skincare', section: 'history', priority: 'none' });
        }
      }
    }
  }

  if (isEnabled(filters, 'supplements')) {
    for (const item of supplements) {
      if (!item.expiryDate) continue;
      const date = new Date(item.expiryDate);
      if (date < startOfLocalDay(rangeStart) || date > endOfLocalDay(rangeEnd)) continue;
      events.push({ id: `supplement:${item.id}`, recordId: item.id, title: `${item.name} expires`, date, type: 'supplement expiry', source: 'supplements', section: 'supplements', priority: 'medium' });
    }
  }

  if (isEnabled(filters, 'vault')) {
    for (const item of personalVaultItems) {
      const projection = personalVaultPlanningProjection(item);
      if (!projection) continue;
      const rawDate = projection.expiryDate || projection.date;
      if (!rawDate) continue;
      const date = new Date(rawDate);
      if (date < startOfLocalDay(rangeStart) || date > endOfLocalDay(rangeEnd)) continue;
      events.push({ id: `vault:${projection.id}`, recordId: projection.id, title: projection.expiryDate ? `${projection.title} expires` : projection.title, date, type: projection.expiryDate ? 'vault expiry' : 'vault date', source: 'vault', section: 'vault', priority: projection.expiryDate ? 'medium' : 'none' });
    }
  }

  if (isEnabled(filters, 'work')) {
    for (const item of workItems) {
      if (!item.dueDate || item.type !== 'task' || ['done', 'archived'].includes(item.status)) continue;
      const date = new Date(item.dueDate);
      if (date < startOfLocalDay(rangeStart) || date > endOfLocalDay(rangeEnd)) continue;
      events.push({ id: `work:${item.id}`, recordId: item.id, title: item.title, date, type: 'work deadline', source: 'work', section: 'work', priority: item.severity || item.priority || 'medium', status: item.status, projectId: item.projectId });
    }
  }

  if (isEnabled(filters, 'health')) {
    for (const routine of dailyChecklistItems) {
      if (
        routine.active === false ||
        !['workout-plan', 'workout-routine'].includes(routine.linkedEntityType || '') ||
        !routine.linkedEntityId
      ) continue;

      for (
        let date = startOfLocalDay(rangeStart);
        date <= endOfLocalDay(rangeEnd);
        date = addLocalDays(date, 1)
      ) {
        if (!isRoutineDueForDate(routine, date)) continue;
        const done = isRoutineDoneForDate(routine, date);
        events.push({
          id: `routine:${routine.id}:${toLocalDateKey(date)}`,
          recordId: routine.id,
          title: routine.title,
          date: withScheduledTime(date, routine.scheduledTime),
          hasScheduledTime: Boolean(routine.scheduledTime),
          type: 'workout routine',
          source: 'routine',
          section: 'health',
          priority: done ? 'none' : 'medium',
          status: done ? 'completed' : 'scheduled',
          virtual: true,
          linkedEntityType: routine.linkedEntityType,
          linkedEntityId: routine.linkedEntityId,
        });
      }
    }

    for (const tracker of health?.noXTrackers || []) {
      const start = new Date(tracker.startDate);
      if (withinRange(start, rangeStart, rangeEnd)) {
        pushStreakEvent(events, tracker, start, 'streak start', `${tracker.name} started`);
      }

      for (const period of normalizePauseHistory(tracker)) {
        const pausedAt = new Date(period.pausedAt);
        if (withinRange(pausedAt, rangeStart, rangeEnd)) {
          pushStreakEvent(events, tracker, pausedAt, 'streak paused', `${tracker.name} paused`, 'paused', { kind: 'pause', id: period.id });
        }
        if (period.resumedAt) {
          const resumedAt = new Date(period.resumedAt);
          if (withinRange(resumedAt, rangeStart, rangeEnd)) {
            pushStreakEvent(events, tracker, resumedAt, 'streak resumed', `${tracker.name} resumed`, 'active', { kind: 'pause', id: period.id });
          }
        }
      }

      for (const [resetIndex, reset] of (tracker.resetHistory || []).entries()) {
        const resetAt = new Date(reset.resetAt);
        if (withinRange(resetAt, rangeStart, rangeEnd)) {
          pushStreakEvent(events, tracker, resetAt, 'streak reset', `${tracker.name} reset`, 'reset', { kind: 'reset', index: resetIndex });
        }
      }

      if (tracker.showMilestonesInCalendar === false) continue;
      const milestones = new Set([7, 30, 90, 180, 365]);
      for (
        let date = startOfLocalDay(rangeStart);
        date <= endOfLocalDay(rangeEnd);
        date = addLocalDays(date, 1)
      ) {
        const days = getStreakActiveDays(tracker, date);
        if (milestones.has(days)) {
          pushStreakEvent(
            events,
            tracker,
            date,
            `streak milestone ${days}`,
            `${tracker.name} · ${days}-day milestone`,
            'milestone',
          );
        }
      }
    }
  }

  return events
    .filter(event => !Number.isNaN(event.date.getTime()))
    .sort((a, b) => a.date.getTime() - b.date.getTime() || a.title.localeCompare(b.title));
}

export function eventsForDay(events: LifeHubCalendarEvent[], day: Date): LifeHubCalendarEvent[] {
  return events.filter(event => {
    const end = event.endDate || event.date;
    return startOfLocalDay(day) >= startOfLocalDay(event.date) && startOfLocalDay(day) <= startOfLocalDay(end);
  });
}

export function isEventToday(event: LifeHubCalendarEvent): boolean {
  return isSameLocalDay(event.date, new Date());
}

export function getAgendaGroups(events: LifeHubCalendarEvent[], referenceDate = new Date()) {
  const today = startOfLocalDay(referenceDate);
  const tomorrow = addLocalDays(today, 1);
  const weekEnd = addLocalDays(today, 7);
  const seen = new Set<string>();
  const sortedEvents = [...events]
    .sort((a, b) => a.date.getTime() - b.date.getTime() || a.title.localeCompare(b.title))
    .filter(event => {
      const key = `${event.source}:${event.id}:${toLocalDateKey(event.date)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return [
    { key: 'overdue', label: 'Overdue', events: sortedEvents.filter(event => startOfLocalDay(event.date) < today) },
    { key: 'today', label: 'Today', events: sortedEvents.filter(event => isSameLocalDay(event.date, today)) },
    { key: 'tomorrow', label: 'Tomorrow', events: sortedEvents.filter(event => isSameLocalDay(event.date, tomorrow)) },
    // Compare calendar days rather than timestamps. An event later on
    // tomorrow's date must remain in Tomorrow, not also leak into This week.
    { key: 'week', label: 'This week', events: sortedEvents.filter(event => {
      const eventDay = startOfLocalDay(event.date);
      return eventDay > tomorrow && eventDay <= weekEnd;
    }) },
    { key: 'later', label: 'Later', events: sortedEvents.filter(event => startOfLocalDay(event.date) > weekEnd) },
  ].filter(group => group.events.length > 0);
}
