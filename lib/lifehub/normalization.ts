import { parseLocalDateKey } from './date-utils';
import { normalizeRoutineFrequency } from './routine-schedule';
import type {
  DailyChecklistItem,
  ImportantDateItem,
  ProductivityItem,
  RoutineGoal,
  RoutineGoalUnit,
  RoutineProgressEntry,
  RoutineScheduleRevision,
} from '../types';
import { createEntityId } from '../utils';
import { normalizeLifeHubLinkedContext } from './linked-context';
import { normalizeHealthRoutineEvidence } from '../health/normalization';
import { normalizeExternalWebUrl } from '../native/open-link';

const finiteNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

export const normalizeLifeHubFiniteNumber = (value: unknown, fallback = 0): number =>
  finiteNumber(value) ?? fallback;

export const normalizeLifeHubOptionalFiniteNumber = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === '') return undefined;
  return finiteNumber(value);
};

export const normalizeLifeHubNonNegative = (value: unknown, fallback = 0): number =>
  Math.max(0, normalizeLifeHubFiniteNumber(value, fallback));

export const normalizeLifeHubOptionalNonNegative = (value: unknown): number | undefined => {
  const normalized = normalizeLifeHubOptionalFiniteNumber(value);
  return normalized === undefined ? undefined : Math.max(0, normalized);
};

export const normalizeLifeHubOptionalAtLeast = (
  value: unknown,
  minimum: number,
): number | undefined => {
  if (value === null || value === undefined || value === '') return undefined;
  return Math.max(minimum, normalizeLifeHubFiniteNumber(value, minimum));
};

export const normalizeLifeHubOptionalPercent = (value: unknown): number | undefined => {
  const normalized = normalizeLifeHubOptionalFiniteNumber(value);
  return normalized === undefined ? undefined : Math.min(100, Math.max(0, normalized));
};

const normalizeDateValue = (value: unknown): Date | undefined => {
  if (!value) return undefined;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : new Date(value);
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return parseLocalDateKey(value) || undefined;
  }
  const date = new Date(value as string | number);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const ROUTINE_GOAL_UNITS = new Set<RoutineGoalUnit>([
  'times', 'episodes', 'chapters', 'pages', 'minutes', 'hours', 'km', 'glasses', 'items', 'custom',
]);

function normalizeRoutineGoal(value: unknown): RoutineGoal | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as { target?: unknown; unit?: unknown; customUnit?: unknown };
  const target = finiteNumber(candidate.target);
  const unit = typeof candidate.unit === 'string' && ROUTINE_GOAL_UNITS.has(candidate.unit as RoutineGoalUnit)
    ? candidate.unit as RoutineGoalUnit
    : undefined;
  const customUnit = typeof candidate.customUnit === 'string' ? candidate.customUnit.trim().slice(0, 32) : '';
  if (!target || target <= 0 || !unit || (unit === 'custom' && !customUnit)) return undefined;
  return { target, unit, ...(unit === 'custom' ? { customUnit } : {}) };
}

function normalizeRoutineProgress(value: unknown): RoutineProgressEntry[] {
  if (!Array.isArray(value)) return [];
  const byPeriod = new Map<string, RoutineProgressEntry>();
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const candidate = raw as Record<string, unknown>;
    const periodKey = typeof candidate.periodKey === 'string' ? candidate.periodKey.trim() : '';
    const date = typeof candidate.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(candidate.date) ? candidate.date : '';
    const amount = finiteNumber(candidate.value);
    const target = finiteNumber(candidate.target);
    const unit = typeof candidate.unit === 'string' && ROUTINE_GOAL_UNITS.has(candidate.unit as RoutineGoalUnit)
      ? candidate.unit as RoutineGoalUnit
      : undefined;
    if (!periodKey || !date || amount === undefined || amount < 0 || !target || target <= 0 || !unit) continue;
    const customUnit = typeof candidate.customUnit === 'string' ? candidate.customUnit.trim().slice(0, 32) : '';
    if (unit === 'custom' && !customUnit) continue;
    const normalized: RoutineProgressEntry = {
      periodKey,
      date,
      value: amount,
      target,
      unit,
      ...(unit === 'custom' ? { customUnit } : {}),
      updatedAt: normalizeDateValue(candidate.updatedAt) || new Date(`${date}T12:00:00`),
    };
    const previous = byPeriod.get(periodKey);
    if (!previous || previous.updatedAt <= normalized.updatedAt) byPeriod.set(periodKey, normalized);
  }
  return [...byPeriod.values()];
}

function normalizeRoutineScheduleRevisions(value: unknown): RoutineScheduleRevision[] {
  if (!Array.isArray(value)) return [];
  const revisions = value.flatMap(raw => {
    if (!raw || typeof raw !== 'object') return [];
    const candidate = raw as Record<string, unknown>;
    const effectiveFrom = typeof candidate.effectiveFrom === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(candidate.effectiveFrom)
      ? candidate.effectiveFrom
      : '';
    if (!effectiveFrom) return [];
    const weekdays = Array.isArray(candidate.weekdays)
      ? [...new Set(candidate.weekdays.filter((day): day is number => Number.isInteger(day) && Number(day) >= 0 && Number(day) <= 6))]
      : undefined;
    const weekday = typeof candidate.weekday === 'string' ? candidate.weekday.trim().toLowerCase() : undefined;
    const rawDayOfMonth = finiteNumber(candidate.dayOfMonth);
    return [{
      effectiveFrom,
      frequency: normalizeRoutineFrequency(typeof candidate.frequency === 'string' ? candidate.frequency : undefined),
      weekdays,
      weekday,
      intervalDays: normalizeLifeHubOptionalAtLeast(candidate.intervalDays, 1),
      anchorDate: normalizeDateValue(candidate.anchorDate),
      dayOfMonth: rawDayOfMonth === undefined ? undefined : Math.max(1, Math.min(31, rawDayOfMonth)),
    } satisfies RoutineScheduleRevision];
  });
  return revisions.sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom));
}

export function normalizeProductivityItem(item: any): ProductivityItem {
  const type = ['task', 'goal', 'idea', 'reminder'].includes(item?.type)
    ? item.type
    : 'task';
  const linkedContext = type === 'task' ? normalizeLifeHubLinkedContext(item?.linkedContext) : undefined;
  const photoAssetIds = Array.isArray(item?.photoAssetIds)
    ? item.photoAssetIds
        .filter((id: unknown): id is string => typeof id === 'string' && Boolean(id.trim()))
        .slice(0, 1)
    : undefined;
  const archivedAt = item?.archivedAt === null
    ? null
    : normalizeDateValue(item?.archivedAt);
  return {
    ...item,
    id: item?.id || createEntityId('productivity'),
    title: item?.title || 'Untitled item',
    type,
    priority: ['critical', 'important', 'normal', 'optional'].includes(item?.priority)
      ? item.priority
      : 'normal',
    status: ['pending', 'in-progress', 'deferred', 'completed', 'failed', 'dropped'].includes(
      item?.status,
    )
      ? item.status
      : 'pending',
    progress: normalizeLifeHubOptionalPercent(item?.progress),
    deadline: normalizeDateValue(item?.deadline),
    previousDeadline: normalizeDateValue(item?.previousDeadline),
    completedAt: normalizeDateValue(item?.completedAt) || null,
    failedAt: normalizeDateValue(item?.failedAt) || null,
    deferredAt: normalizeDateValue(item?.deferredAt) || null,
    deferCount: normalizeLifeHubNonNegative(item?.deferCount, 0),
    estimatedMinutes: normalizeLifeHubOptionalAtLeast(item?.estimatedMinutes, 1),
    reminderLeadMinutes: normalizeLifeHubOptionalNonNegative(item?.reminderLeadMinutes),
    photoAssetIds,
    visualReferenceUrl: normalizeExternalWebUrl(item?.visualReferenceUrl) || undefined,
    showInCalendar: typeof item?.showInCalendar === 'boolean' ? item.showInCalendar : undefined,
    archivedAt,
    linkedContext,
    linkOrigin:
      type === 'task' &&
      item?.linkOrigin === 'workhub-mirror' &&
      linkedContext?.section === 'work' &&
      linkedContext.type === 'work-item'
        ? 'workhub-mirror'
        : undefined,
    createdAt: normalizeDateValue(item?.createdAt) || new Date(),
  };
}

export function normalizeRoutineItem(item: any): DailyChecklistItem {
  const createdAt = normalizeDateValue(item?.createdAt) || new Date();
  const completionHistory = Array.isArray(item?.completionHistory)
    ? item.completionHistory
        .filter((entry: any) => entry?.date)
        .map((entry: any) => ({
          ...entry,
          date: String(entry.date).slice(0, 10),
          status: entry.status === 'skipped' ? 'skipped' : 'done',
          completedAt: normalizeDateValue(entry.completedAt),
          linkedContext: normalizeLifeHubLinkedContext(entry.linkedContext),
          linkedTitleSnapshot: typeof entry.linkedTitleSnapshot === 'string'
            ? entry.linkedTitleSnapshot.trim().slice(0, 120) || undefined
            : undefined,
        }))
    : [];

  return {
    ...item,
    id: item?.id || createEntityId('checklist'),
    title: item?.title || 'Untitled routine',
    frequency: normalizeRoutineFrequency(item?.frequency),
    active: item?.active !== false,
    weekdays: Array.isArray(item?.weekdays)
      ? item.weekdays.filter(
          (day: unknown) => Number.isInteger(day) && Number(day) >= 0 && Number(day) <= 6,
        )
      : undefined,
    reminderDays: Array.isArray(item?.reminderDays)
      ? item.reminderDays.filter(
          (day: unknown) => Number.isInteger(day) && Number(day) >= 0 && Number(day) <= 6,
        )
      : undefined,
    intervalDays: normalizeLifeHubOptionalAtLeast(item?.intervalDays, 1),
    anchorDate: normalizeDateValue(item?.anchorDate) || createdAt,
    dayOfMonth:
      item?.dayOfMonth == null
        ? undefined
        : Math.max(1, Math.min(31, normalizeLifeHubFiniteNumber(item.dayOfMonth, 1))),
    targetCount:
      item?.targetCount == null
        ? 1
        : normalizeLifeHubOptionalAtLeast(item.targetCount, 1) ?? 1,
    goal: normalizeRoutineGoal(item?.goal),
    progressHistory: normalizeRoutineProgress(item?.progressHistory),
    scheduleTrackingStartedAt:
      typeof item?.scheduleTrackingStartedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.scheduleTrackingStartedAt)
        ? item.scheduleTrackingStartedAt
        : undefined,
    scheduleRevisions: normalizeRoutineScheduleRevisions(item?.scheduleRevisions),
    linkedGameId:
      typeof item?.linkedGameId === 'string' && item.linkedGameId.trim()
        ? item.linkedGameId.trim()
        : undefined,
    linkedContext: normalizeLifeHubLinkedContext(item?.linkedContext),
    healthRoutineEvidence: normalizeHealthRoutineEvidence(item?.healthRoutineEvidence),
    completionHistory,
    completionCount: Math.max(
      completionHistory.filter((entry: any) => entry.status === 'done').length,
      normalizeLifeHubNonNegative(item?.completionCount, 0),
    ),
    progressBaselineDate: normalizeDateValue(item?.progressBaselineDate),
    completedAt: normalizeDateValue(item?.completedAt) || null,
    createdAt,
  };
}

export function normalizeImportantDateItem(item: any): ImportantDateItem {
  return {
    ...item,
    id: item?.id || createEntityId('date'),
    title: item?.title || 'Untitled date',
    type: item?.type || 'personal',
    date: normalizeDateValue(item?.date) || new Date(),
    endDate: normalizeDateValue(item?.endDate) || null,
    repeat: ['none', 'monthly', 'yearly'].includes(item?.repeat) ? item.repeat : 'none',
    status: ['upcoming', 'completed', 'dismissed'].includes(item?.status)
      ? item.status
      : 'upcoming',
    resolvedAt: normalizeDateValue(item?.resolvedAt) || null,
    resolutionHistory: Array.isArray(item?.resolutionHistory)
      ? item.resolutionHistory.map((entry: any) => ({
          ...entry,
          occurrenceDate: normalizeDateValue(entry.occurrenceDate) || new Date(),
          resolvedAt: normalizeDateValue(entry.resolvedAt) || new Date(),
          status: entry.status === 'dismissed' ? 'dismissed' : 'completed',
        }))
      : [],
    amount: normalizeLifeHubOptionalNonNegative(item?.amount),
    customReminderDays: normalizeLifeHubOptionalNonNegative(item?.customReminderDays),
    createdAt: normalizeDateValue(item?.createdAt) || new Date(),
  };
}
