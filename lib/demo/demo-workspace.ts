import { toLocalDateKey } from '@/lib/utils';

export const DEMO_MODE_KEY = 'life-manager-demo-mode';
export const DEMO_BACKUP_KEY = 'life-manager-real-data-before-demo';
export const DEMO_LOADED_AT_KEY = 'life-manager-demo-loaded-at';
export const DEMO_VERSION_KEY = 'life-manager-demo-version';
export const DEMO_COMPASS_DISMISSED_KEY = 'caizen-demo-compass-dismissed-v1';
export const DEMO_ENTRY_SECTION_KEY = 'caizen-demo-entry-section-v1';

// The template filename is permanent; bump DEMO_CONTENT_VERSION for content revisions.
export const DEMO_CONTENT_VERSION = 'demo-v5';
export const DEMO_TEMPLATE_ANCHOR = '2026-09-30';
export const DEMO_TEMPLATE_URL = '/caizen-demo.json';
// Matches the profile name inside DEMO_TEMPLATE_URL so UI copy never has to load the template.
export const DEMO_PROFILE_DISPLAY_NAME = 'John';

export const DEMO_ENTRY_SECTIONS = [
  'dashboard',
  'balance',
  'inventory',
  'skincare',
  'health',
  'entertainment',
  'music',
  'lifehub',
  'workhub',
  'personalhub',
] as const;

export type DemoEntrySection = (typeof DEMO_ENTRY_SECTIONS)[number];

export function isDemoEntrySection(value: string | null): value is DemoEntrySection {
  return Boolean(value && (DEMO_ENTRY_SECTIONS as readonly string[]).includes(value));
}

export function isDemoModeActive(): boolean {
  return typeof window !== 'undefined' && window.localStorage.getItem(DEMO_MODE_KEY) === 'true';
}

const DATE_ONLY_PATHS = new Set([
  'profiles[].wallets[].goalDeadline',
  'profiles[].inventoryItems[].purchaseDate',
  'profiles[].wishlistItems[].purchaseDate',
  'profiles[].wishlistItems[].targetDate',
  'profiles[].upcomingMoneyItems[].dueDate',
  'profiles[].journalEntries[].date',
  'profiles[].games[].playingSince',
  'profiles[].productivityItems[].deadline',
  'profiles[].workItems[].date',
  'profiles[].workItems[].dueDate',
  'profiles[].personalVaultItems[].date',
  'profiles[].personalVaultItems[].expiryDate',
  'profiles[].skincareProducts[].purchaseDate',
  'profiles[].skincareProducts[].startDate',
  'profiles[].skincareProducts[].expiryDate',
  'profiles[].supplements[].purchaseDate',
  'profiles[].supplements[].startDate',
  'profiles[].supplements[].expiryDate',
  'profiles[].dailyChecklistItems[].anchorDate',
  'profiles[].dailyChecklistItems[].startDate',
  'profiles[].dailyChecklistItems[].completionHistory[].date',
  'profiles[].importantDates[].date',
  'profiles[].importantDates[].endDate',
  'profiles[].balanceCheckIns[].weekKey',
  'profiles[].balanceProjectionRows[].date',
  'profiles[].health.activityEntries[].date',
  'profiles[].health.foodEntries[].date',
  'profiles[].health.foodLogCompletedDates[]',
  'profiles[].health.sleepEntries[].date',
  'profiles[].health.weightEntries[].date',
  'profiles[].health.noXTrackers[].startDate',
  'profiles[].health.workoutSessions[].scheduleDate',
  'profiles[].balanceProjectionRows[].recurrence.startDateKey',
  'profiles[].balanceProjectionRows[].recurrence.nextDueDateKey',
  'profiles[].trashItems[].data.date',
]);

const TIMESTAMP_PATHS = new Set([
  'profiles[].transactions[].date',
  'profiles[].transactions[].createdAt',
  'profiles[].transactions[].updatedAt',
  'profiles[].skincareUsageEvents[].usedAt',
  'profiles[].skincareUsageEvents[].createdAt',
  'profiles[].skincareProducts[].emptiedAt',
  'profiles[].createdAt',
  'profiles[].achievementUnlocks[].unlockedAt',
  'profiles[].wallets[].createdAt',
  'profiles[].wallets[].updatedAt',
  'profiles[].inventoryItems[].createdAt',
  'profiles[].inventoryItems[].currentValueUpdatedAt',
  'profiles[].wishlistItems[].createdAt',
  'profiles[].upcomingMoneyItems[].createdAt',
  'profiles[].upcomingMoneyItems[].updatedAt',
  'profiles[].journalEntries[].createdAt',
  'profiles[].games[].createdAt',
  'profiles[].gameGuides[].createdAt',
  'profiles[].mediaItems[].completedAt',
  'profiles[].mediaItems[].createdAt',
  'profiles[].mediaItems[].startedAt',
  'profiles[].musicItems[].createdAt',
  'profiles[].musicItems[].lastPlayedAt',
  'profiles[].productivityItems[].completedAt',
  'profiles[].productivityItems[].createdAt',
  'profiles[].productivityItems[].deferredAt',
  'profiles[].productivityItems[].previousDeadline',
  'profiles[].productivityItems[].updatedAt',
  'profiles[].workItems[].completedAt',
  'profiles[].workItems[].createdAt',
  'profiles[].workItems[].updatedAt',
  'profiles[].personalVaultItems[].createdAt',
  'profiles[].skincareProducts[].createdAt',
  'profiles[].dailyChecklistItems[].completedAt',
  'profiles[].dailyChecklistItems[].createdAt',
  'profiles[].dailyChecklistItems[].updatedAt',
  'profiles[].dailyChecklistItems[].completionHistory[].completedAt',
  'profiles[].importantDates[].createdAt',
  'profiles[].importantDates[].resolvedAt',
  'profiles[].importantDates[].resolutionHistory[].resolvedAt',
  'profiles[].supplements[].createdAt',
  'profiles[].balanceCheckIns[].completedAt',
  'profiles[].balanceProjectionRows[].createdAt',
  'profiles[].health.activityEntries[].createdAt',
  'profiles[].health.foodEntries[].createdAt',
  'profiles[].health.foodTemplates[].createdAt',
  'profiles[].health.mealTemplates[].createdAt',
  'profiles[].health.noXTrackers[].createdAt',
  'profiles[].health.sleepEntries[].createdAt',
  'profiles[].health.weightEntries[].createdAt',
  'profiles[].health.waterEntries[].date',
  'profiles[].health.waterEntries[].createdAt',
  'profiles[].health.bodyMeasurementEntries[].date',
  'profiles[].health.bodyMeasurementEntries[].createdAt',
  'profiles[].health.fastingSessions[].startedAt',
  'profiles[].health.fastingSessions[].endedAt',
  'profiles[].health.fastingSessions[].createdAt',
  'profiles[].health.fastingSessions[].updatedAt',
  'profiles[].health.workoutSessions[].startedAt',
  'profiles[].health.workoutSessions[].completedAt',
  'profiles[].health.workoutSessions[].createdAt',
  'profiles[].health.workoutSessions[].exercises[].completedAt',
  'profiles[].health.workoutRoutines[].createdAt',
  'profiles[].health.workoutRoutines[].updatedAt',
  'profiles[].health.workoutExercises[].createdAt',
  'profiles[].health.workoutExercises[].updatedAt',
  'profiles[].health.workoutPlans[].createdAt',
  'profiles[].health.workoutPlans[].updatedAt',
  'profiles[].health.noXTrackers[].updatedAt',
  'profiles[].health.noXTrackers[].resetHistory[].resetAt',
  'profiles[].health.noXTrackers[].resetHistory[].previousStartDate',
  'profiles[].books[].createdAt',
  'profiles[].books[].updatedAt',
  'profiles[].milestoneUnlocks[].achievedAt',
  'profiles[].milestoneUnlocks[].seenAt',
  'profiles[].upcomingMoneyItems[].completedAt',
  'profiles[].productivityItems[].failedAt',
  'profiles[].mediaItems[].updatedAt',
  'profiles[].careerSkills[].createdAt',
  'profiles[].careerCourses[].startDate',
  'profiles[].careerCourses[].completionDate',
  'profiles[].careerCourses[].createdAt',
  'profiles[].careerCredentials[].issuedDate',
  'profiles[].careerCredentials[].expiryDate',
  'profiles[].careerCredentials[].createdAt',
  'profiles[].careerCredentials[].updatedAt',
  'profiles[].importantDates[].resolutionHistory[].occurrenceDate',
  'profiles[].balanceProjectionRows[].updatedAt',
  'profiles[].budgets[].createdAt',
  'profiles[].budgets[].updatedAt',
  'profiles[].pet.createdAt',
  'profiles[].pet.recentRewards[].earnedAt',
  'profiles[].trashItems[].deletedAt',
  'profiles[].trashItems[].deleteAfter',
  'profiles[].trashItems[].data.createdAt',
  'profiles[].trashItems[].data.resolvedAt',
]);

const MONTH_KEY_PATHS = new Set([
  'profiles[].balanceProjectionRows[].cycleKey',
  'profiles[].budgets[].month',
]);

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

function calendarDayOrdinal(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`Invalid Demo calendar date: ${value}`);

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new Error(`Invalid Demo calendar date: ${value}`);
  }
  return timestamp / 86_400_000;
}

function addCalendarDays(value: string, days: number): string {
  const timestamp = (calendarDayOrdinal(value) + days) * 86_400_000;
  return new Date(timestamp).toISOString().slice(0, 10);
}

function shiftDateOnlyValue(value: string, days: number, path: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})(?:$|T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$)/.exec(value);
  if (
    !match ||
    (value !== match[1] && Number.isNaN(new Date(value).getTime()))
  ) throw new Error(`The Demo template has an invalid date at ${path}.`);
  calendarDayOrdinal(match[1]);
  return addCalendarDays(match[1], days);
}

function shiftTimestampValue(value: string, days: number, path: string): string {
  const parsed = new Date(value);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value) || Number.isNaN(parsed.getTime())) {
    throw new Error(`The Demo template has an invalid timestamp at ${path}.`);
  }
  parsed.setDate(parsed.getDate() + days);
  return parsed.toISOString();
}

function shiftMonthKeyValue(value: string, days: number, path: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) throw new Error(`The Demo template has an invalid month at ${path}.`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new Error(`The Demo template has an invalid month at ${path}.`);
  const shifted = new Date(Date.UTC(year, month - 1, 1));
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
}

function isRecord(value: JsonValue): value is { [key: string]: JsonValue } {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function profileDateWorkFieldIds(profile: { [key: string]: JsonValue }): Set<string> {
  const ids = new Set<string>();
  if (!Array.isArray(profile.workTypes)) return ids;
  for (const type of profile.workTypes) {
    if (!isRecord(type) || !Array.isArray(type.fields)) continue;
    for (const field of type.fields) {
      if (isRecord(field) && field.type === 'date' && typeof field.id === 'string' && field.id.trim()) {
        ids.add(field.id.trim());
      }
    }
  }
  return ids;
}

function shiftKnownDates(value: JsonValue, path: string, days: number, customDateFieldIds = new Set<string>()): JsonValue {
  if (Array.isArray(value)) {
    return value.map(item => shiftKnownDates(item, `${path}[]`, days, customDateFieldIds));
  }

  if (isRecord(value)) {
    const dateFieldIds = path === 'profiles[]' ? profileDateWorkFieldIds(value) : customDateFieldIds;
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => {
        const childPath = path ? `${path}.${key}` : key;
        const isCustomDate = path.endsWith('.customFieldValues') && dateFieldIds.has(key);
        return [
          key,
          isCustomDate && typeof entry === 'string'
            ? shiftDateOnlyValue(entry, days, childPath)
            : shiftKnownDates(entry, childPath, days, dateFieldIds),
        ];
      }),
    ) as { [key: string]: JsonValue };
  }

  if (typeof value !== 'string' || !value) return value;
  if (DATE_ONLY_PATHS.has(path)) return shiftDateOnlyValue(value, days, path);
  if (TIMESTAMP_PATHS.has(path)) return shiftTimestampValue(value, days, path);
  if (MONTH_KEY_PATHS.has(path)) return shiftMonthKeyValue(value, days, path);
  return value;
}

/** Materializes only known Demo date fields without mutating the fetched template. */
export function materializeDemoWorkspace(templateJson: string, targetLocalDate: string): string {
  const dayDelta = calendarDayOrdinal(targetLocalDate) - calendarDayOrdinal(DEMO_TEMPLATE_ANCHOR);
  let template: JsonValue;
  try {
    template = JSON.parse(templateJson) as JsonValue;
  } catch {
    throw new Error('The Demo template is not valid JSON.');
  }

  // The template may be a `caizen-data` export envelope; known-date paths are
  // relative to its workspace state, so rebase `data` and keep the envelope.
  const envelope = isRecord(template) && template.format === 'caizen-data' && isRecord(template.data) ? template : null;
  const shifted = shiftKnownDates(envelope ? envelope.data : template, '', dayDelta);
  if (isRecord(shifted) && Array.isArray(shifted.profiles)) {
    for (const profile of shifted.profiles) {
      if (!isRecord(profile)) continue;
      if (Array.isArray(profile.balanceProjectionRows)) for (const row of profile.balanceProjectionRows) {
        if (isRecord(row) && typeof row.cycleKey === 'string') row.cycleKey = targetLocalDate.slice(0, 7);
      }
      if (!Array.isArray(profile.dailyChecklistItems)) continue;
      for (const routine of profile.dailyChecklistItems) {
        if (!isRecord(routine)) continue;
        const history: JsonValue[] = [];
        for (let offset = -14; offset < 0; offset++) {
          const date = addCalendarDays(targetLocalDate, offset);
          const weekday = new Date(date + 'T12:00:00Z').getUTCDay();
          const selectedDays = Array.isArray(routine.weekdays) ? routine.weekdays : [0];
          const due = routine.frequency === 'daily' ||
            routine.frequency === 'weekdays' && weekday >= 1 && weekday <= 5 ||
            ['weekly', 'specific_weekday'].includes(String(routine.frequency)) && selectedDays.includes(weekday) ||
            routine.frequency === 'monthly' && Number(date.slice(8)) === Number(routine.dayOfMonth || 1) ||
            routine.frequency === 'biweekly' && typeof routine.anchorDate === 'string' && (calendarDayOrdinal(date) - calendarDayOrdinal(routine.anchorDate)) % 14 === 0;
          if (due && offset !== -3) history.push({ date, status: 'done', completedAt: date + 'T04:00:00.000Z', ...(routine.linkedContext ? { linkedContext: routine.linkedContext } : {}) });
        }
        routine.completionHistory = history;
        routine.completionCount = history.length;
        routine.completedAt = history.length ? (history[history.length - 1] as Record<string, JsonValue>).completedAt : null;
      }
    }
  }
  return JSON.stringify(envelope ? { ...envelope, data: shifted } : shifted);
}

export function getDemoTodayKey(now = new Date()): string {
  return toLocalDateKey(now);
}
