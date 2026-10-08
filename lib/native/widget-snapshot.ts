import { workspaceIsProtected } from '../storage/workspace-fence';
import type {
  DailyChecklistItem,
  ImportantDateItem,
  MusicItem,
  ProductivityItem,
  Profile,
} from '../types';
import { isNativeApp } from '../platform';
import { CaizenNative } from './calendar';
import {
  getRoutineFilter,
  isRoutineDoneForDate,
  isRoutineDueForDate,
  getRoutineOccurrenceKey,
} from '../lifehub/routine-schedule';

/**
 * Android home-screen widgets run in the launcher's process. They cannot read
 * the WebView's IndexedDB, so Caizen mirrors a deliberately tiny, sanitized
 * projection of the active profile into Android-readable storage.
 *
 * This snapshot is a PUBLIC surface: anything placed here can be read by
 * anyone holding the device and is rendered on the home screen. It therefore
 * carries only what a widget must draw - short titles, counts, timestamps and
 * status - and never journal text, finance amounts, health notes, vault
 * contents, attachments, credentials, tokens, or whole records.
 */
export const WIDGET_SNAPSHOT_VERSION = 7;
export const WIDGET_PROFILE_INDEX_VERSION = 1;

/** Hard ceiling on the serialized payload. Android SharedPreferences is not
 *  a database; a runaway snapshot would bloat every widget update. */
export const WIDGET_SNAPSHOT_MAX_BYTES = 24 * 1024;

export interface WidgetAppearance {
  background: string;
  card: string;
  primary: string;
  primaryForeground: string;
  foreground: string;
  mutedForeground: string;
  border: string;
}

const MAX_TITLE_LENGTH = 60;
const MAX_TASKS = 8;
const MAX_ROUTINES = 24;
const MAX_EVENTS = 6;
const MAX_TODAY_ITEMS = 8;
const MAX_WORK_TASKS = 8;

/** Mirrors WidgetBindingStore's ROUTINE_FILTER_* constants on the Android
 *  side — the set of frequency buckets a Routines widget instance can be
 *  configured to. 'other'-frequency routines only ever count toward 'all'. */
const ROUTINE_FREQUENCY_FILTERS = ['all', 'daily', 'weekly', 'biweekly', 'monthly'] as const;

export type WidgetWorkStatus =
  | 'office'
  | 'work_home'
  | 'travel'
  | 'holiday'
  | 'leave'
  | null;

export interface WidgetTask {
  id: string;
  title: string;
  dueAt: number | null;
  done: boolean;
}

export interface WidgetRoutine {
  id: string;
  title: string;
  done: boolean;
  dateKey: string;
  occurrenceKey: string;
  frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'other';
}

export type WidgetTodayItemKind = 'task' | 'routine';

/** Minimum identity needed by a future Today widget and its action bridge. */
export interface WidgetTodayItem {
  id: string;
  kind: WidgetTodayItemKind;
  title: string;
  dueAt: number | null;
  done: boolean;
  dateKey: string;
  occurrenceKey: string;
}

export interface WidgetTodayProjection {
  includeRoutines: false;
  items: WidgetTodayItem[];
  overdueTaskCount: number;
  dueTodayTaskCount: number;
  dueTodayRoutineCount: number;
  completedDueCount: number;
  totalDueCount: number;
  progress: number;
  nextEvent: WidgetEvent | null;
}

/**
 * Selects a mixed Today queue without letting a long task list hide every
 * routine. Overdue tasks remain first; the first routine is reserved only
 * when both kinds exist and the bounded surface has room for a mixed view.
 */
export function selectTodayItems(
  taskRows: WidgetTodayItem[],
  routineRows: WidgetTodayItem[],
  limit: number,
  startOfDayTime: number,
): WidgetTodayItem[] {
  if (limit <= 0) return [];
  const ranked = [...taskRows, ...routineRows].sort((first, second) => {
    const firstOverdue = first.kind === 'task' && first.dueAt !== null
      && first.dueAt < startOfDayTime;
    const secondOverdue = second.kind === 'task' && second.dueAt !== null
      && second.dueAt < startOfDayTime;
    if (firstOverdue !== secondOverdue) return firstOverdue ? -1 : 1;
    const firstDue = first.dueAt ?? Number.MAX_SAFE_INTEGER;
    const secondDue = second.dueAt ?? Number.MAX_SAFE_INTEGER;
    return firstDue - secondDue
      || (first.kind === second.kind ? 0 : first.kind === 'task' ? -1 : 1)
      || compareStableId(first.id, second.id);
  });

  const initial = ranked.slice(0, limit);
  if (
    taskRows.length > 0 &&
    routineRows.length > 0 &&
    limit > 1 &&
    !initial.some(item => item.kind === 'routine')
  ) {
    const routine = routineRows[0];
    return [
      ...ranked.filter(item => item !== routine).slice(0, limit - 1),
      routine,
    ];
  }
  return initial;
}

/** Sanitized Work task data. Notes, links, QA fields and media never enter it. */
export interface WidgetWorkTask {
  id: string;
  title: string;
  status: string;
  priority: 'low' | 'medium' | 'high' | null;
  dueAt: number | null;
  dateKey: string;
  occurrenceKey: 'once';
  projectId?: string;
}

export interface WidgetWorkTasksProjection {
  items: WidgetWorkTask[];
  openCount: number;
  overdueCount: number;
}

export interface WidgetEvent {
  id: string;
  title: string;
  startAt: number;
  kind: string;
}

/**
 * Per-day markers for the calendar widget's month grid, keyed by local
 * `YYYY-MM-DD`. Only day-level flags are mirrored - never the underlying
 * records - so the grid can be drawn without exposing what a day contains.
 */
export interface WidgetDayMarker {
  /** True when the day has at least one event (drives the event dot). */
  e?: boolean;
  /** Work status for the day, if any (drives the status bar colour). */
  w?: Exclude<WidgetWorkStatus, null>;
}

export interface WidgetSnapshot {
  version: number;
  profileId: string;
  profileName: string;
  /** Changes when the projected identity/action fields change. */
  revision: string;
  updatedAt: number;
  /** Local day markers covering the months the widget can page to. */
  days: Record<string, WidgetDayMarker>;
  todayTaskCount: number;
  todayRoutineCount: number;
  routineProgress: number;
  routineRowsOmitted: number;
  /** Canonical total/done counts per frequency filter, computed over the
   *  full due-routine set (never capped to MAX_ROUTINES). Keyed by
   *  'all' | 'daily' | 'weekly' | 'biweekly' | 'monthly'. */
  routineTotalsByFilter: Record<string, { total: number; done: number }>;
  workStatus: WidgetWorkStatus;
  nextEvent: WidgetEvent | null;
  tasks: WidgetTask[];
  routines: WidgetRoutine[];
  events: WidgetEvent[];
  today: WidgetTodayProjection;
  workTasks: WidgetWorkTasksProjection;
  music: {
    title: string;
    artist: string;
    url: string;
    sourceType: 'youtube' | 'spotify' | 'external';
    /** Widgets must not render transport controls for an embedded web
     *  player Android cannot command. There is no native media session. */
    controllable: false;
  } | null;
}

export const EMPTY_WIDGET_SNAPSHOT: WidgetSnapshot = {
  version: WIDGET_SNAPSHOT_VERSION,
  profileId: '',
  profileName: '',
  revision: '',
  updatedAt: 0,
  days: {},
  todayTaskCount: 0,
  todayRoutineCount: 0,
  routineProgress: 0,
  routineRowsOmitted: 0,
  routineTotalsByFilter: Object.fromEntries(
    ROUTINE_FREQUENCY_FILTERS.map(filter => [filter, { total: 0, done: 0 }]),
  ),
  workStatus: null,
  nextEvent: null,
  tasks: [],
  routines: [],
  events: [],
  today: {
    includeRoutines: false,
    items: [],
    overdueTaskCount: 0,
    dueTodayTaskCount: 0,
    dueTodayRoutineCount: 0,
    completedDueCount: 0,
    totalDueCount: 0,
    progress: 0,
    nextEvent: null,
  },
  workTasks: {
    items: [],
    openCount: 0,
    overdueCount: 0,
  },
  music: null,
};

/** Reads legacy single-profile/v6 values without pretending they have v7 data. */
export function readWidgetSnapshot(value: unknown): WidgetSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Partial<WidgetSnapshot>;
  if (source.version !== 5 && source.version !== 6 && source.version !== 7) return null;
  if (typeof source.profileId !== 'string') return null;
  const today = source.today && typeof source.today === 'object'
    ? source.today
    : EMPTY_WIDGET_SNAPSHOT.today;
  const workTasks = source.workTasks && typeof source.workTasks === 'object'
    ? source.workTasks
    : EMPTY_WIDGET_SNAPSHOT.workTasks;
  return {
    ...EMPTY_WIDGET_SNAPSHOT,
    ...source,
    today: {
      ...EMPTY_WIDGET_SNAPSHOT.today,
      ...today,
      includeRoutines: false,
      items: Array.isArray(today.items) ? today.items : [],
    },
    workTasks: {
      ...EMPTY_WIDGET_SNAPSHOT.workTasks,
      ...workTasks,
      items: Array.isArray(workTasks.items) ? workTasks.items : [],
    },
  };
}

export interface WidgetProfileIndexEntry {
  profileId: string;
  displayName: string;
  revision: string;
  updatedAt: number;
}

export interface WidgetProfileIndex {
  version: typeof WIDGET_PROFILE_INDEX_VERSION;
  activeProfileId: string;
  profiles: WidgetProfileIndexEntry[];
  appearance?: WidgetAppearance;
}

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function hexRgb(value: string): [number, number, number] | null {
  if (!HEX_COLOR.test(value)) return null;
  return [
    parseInt(value.slice(1, 3), 16),
    parseInt(value.slice(3, 5), 16),
    parseInt(value.slice(5, 7), 16),
  ];
}

function relativeLuminance(value: string): number {
  const rgb = hexRgb(value);
  if (!rgb) return 0;
  return rgb.reduce((sum, channel, index) => {
    const normalized = channel / 255;
    const linear = normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
    return sum + linear * [0.2126, 0.7152, 0.0722][index];
  }, 0);
}

function contrastRatio(first: string, second: string): number {
  const light = Math.max(relativeLuminance(first), relativeLuminance(second));
  const dark = Math.min(relativeLuminance(first), relativeLuminance(second));
  return (light + 0.05) / (dark + 0.05);
}

function normalizeWidgetAppearance(
  appearance: Partial<WidgetAppearance>,
): WidgetAppearance | undefined {
  const values = {
    background: appearance.background ?? '',
    card: appearance.card ?? '',
    primary: appearance.primary ?? '',
    primaryForeground: appearance.primaryForeground ?? '',
    foreground: appearance.foreground ?? '',
    mutedForeground: appearance.mutedForeground ?? '',
    border: appearance.border ?? '',
  };
  if (!Object.values(values).every(value => HEX_COLOR.test(value))) return undefined;

  // The web theme already chooses the accent, but a custom accent can be
  // visually unusable on a launcher surface. Keep the chosen color when it
  // has enough signal; otherwise fall back to the readable foreground pair.
  const primary = contrastRatio(values.primary, values.background) >= 3
    ? values.primary
    : values.foreground;
  const primaryForeground = contrastRatio(primary, values.primaryForeground) >= 3
    ? values.primaryForeground
    : contrastRatio(primary, '#ffffff') >= contrastRatio(primary, '#111827')
      ? '#ffffff'
      : '#111827';

  return { ...values, primary, primaryForeground };
}

function cssColorToHex(value: string): string | null {
  if (HEX_COLOR.test(value.trim())) return value.trim().toLowerCase();
  if (typeof document === 'undefined' || typeof window === 'undefined' || !document.body) return null;

  const probe = document.createElement('span');
  probe.style.color = value;
  probe.style.position = 'fixed';
  probe.style.visibility = 'hidden';
  document.body.appendChild(probe);
  const computed = window.getComputedStyle(probe).color;
  probe.remove();
  const match = computed.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!match) return null;
  return `#${[match[1], match[2], match[3]]
    .map(channel => Number(channel).toString(16).padStart(2, '0'))
    .join('')}`;
}

/** Reads the resolved browser theme without placing CSS syntax in native storage. */
export function readWidgetAppearance(): WidgetAppearance | undefined {
  if (typeof document === 'undefined' || typeof window === 'undefined') return undefined;
  const styles = window.getComputedStyle(document.documentElement);
  const read = (property: string) => cssColorToHex(styles.getPropertyValue(property).trim());
  return normalizeWidgetAppearance({
    background: read('--background') ?? undefined,
    card: read('--card') ?? undefined,
    primary: read('--primary') ?? undefined,
    primaryForeground: read('--primary-foreground') ?? undefined,
    foreground: read('--foreground') ?? undefined,
    mutedForeground: read('--muted-foreground') ?? undefined,
    border: read('--border') ?? undefined,
  });
}

/** Trims and length-caps a user string so a pathological title cannot blow
 *  the size budget or overflow a RemoteViews row. */
function safeTitle(value: unknown): string {
  if (typeof value !== 'string') return '';

  return value.replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE_LENGTH);
}

function toTimestamp(value: unknown): number | null {
  if (!value) return null;
  try {
    const time = new Date(value as string | number | Date).getTime();
    return Number.isFinite(time) ? time : null;
  } catch {
    return null;
  }
}

const WORK_STATUS_TYPES: Record<string, WidgetWorkStatus> = {
  office: 'office',
  work_home: 'work_home',
  travel: 'travel',
  holiday: 'holiday',
  leave: 'leave',
};

function safeHttpUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return '';

  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    return url.toString().slice(0, 500);
  } catch {
    return '';
  }
}

/** Stable, non-secret revision for native stale-action validation. */
function revisionFor(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function musicSourceType(item: MusicItem): 'youtube' | 'spotify' | 'external' {
  if (item.provider === 'youtube' || /youtu\.be|youtube\.com/i.test(item.url)) {
    return 'youtube';
  }

  if (item.provider === 'spotify' || /spotify\.com/i.test(item.url)) {
    return 'spotify';
  }

  return 'external';
}

/** Local `YYYY-MM-DD`, never routed through UTC. */
function toLocalDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const PRODUCTIVITY_OPEN_STATUSES = new Set([
  'pending',
  'in-progress',
  'deferred',
]);

const WORK_OPEN_STATUSES = new Set([
  'planned',
  'draft',
  'active',
  'waiting',
  'submitted',
]);

const PRIORITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 0,
  important: 1,
  medium: 1,
  normal: 2,
  low: 2,
  optional: 3,
};

function priorityRank(value: unknown): number {
  return PRIORITY_ORDER[typeof value === 'string' ? value : ''] ?? 4;
}

function safeRoutineDue(item: DailyChecklistItem, now: Date): boolean {
  try {
    return Boolean(item?.id) && isRoutineDueForDate(item, now);
  } catch {
    return false;
  }
}

function safeRoutineDone(item: DailyChecklistItem, now: Date): boolean {
  try {
    return isRoutineDoneForDate(item, now);
  } catch {
    return false;
  }
}

function safeRoutineOccurrenceKey(item: DailyChecklistItem, now: Date): string {
  try {
    return getRoutineOccurrenceKey(item, now);
  } catch {
    return '';
  }
}

function compareStableId(first: string, second: string): number {
  return first.localeCompare(second);
}

/**
 * Builds day-level markers for the calendar grid.
 *
 * Bounded to the months the widget can page to (previous through next two)
 * so the map cannot grow without limit on a profile with years of history.
 * Multi-day entries fill every day they span, which is what makes a week of
 * leave read correctly on the grid.
 */
function buildDayMarkers(
  importantDates: ImportantDateItem[],
  now: Date,
): Record<string, WidgetDayMarker> {
  const windowStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const windowEnd = new Date(now.getFullYear(), now.getMonth() + 3, 0);
  const markers: Record<string, WidgetDayMarker> = {};

  for (const item of importantDates) {
    if (!item || typeof item !== 'object') continue;
    const start = toTimestamp(item.date);
    if (start === null) continue;

    const end = toTimestamp(item.endDate) ?? start;
    const workStatus = WORK_STATUS_TYPES[item.type as string];

    const cursor = new Date(Math.max(start, windowStart.getTime()));
    cursor.setHours(12, 0, 0, 0);
    const last = Math.min(end, windowEnd.getTime());

    // Guards against a corrupt endDate before startDate producing no days.
    let guard = 0;
    while (cursor.getTime() <= last && guard < 200) {
      const key = toLocalDayKey(cursor);
      const marker = markers[key] ?? {};

      if (workStatus) {
        marker.w = workStatus;
      } else {
        marker.e = true;
      }

      markers[key] = marker;
      cursor.setDate(cursor.getDate() + 1);
      guard += 1;
    }
  }

  return markers;
}

/**
 * Projects a profile down to the widget snapshot. Pure and synchronous so it
 * can be unit tested without Capacitor.
 */
export function buildWidgetSnapshot(
  profile: Profile | undefined,
  options: { now?: Date; nowPlaying?: MusicItem | null } = {},
): WidgetSnapshot {
  if (!profile) return { ...EMPTY_WIDGET_SNAPSHOT };

  const now = options.now ?? new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  const productivityItems: ProductivityItem[] = Array.isArray(profile.productivityItems)
    ? profile.productivityItems
    : [];
  const checklistItems: DailyChecklistItem[] = Array.isArray(profile.dailyChecklistItems)
    ? profile.dailyChecklistItems
    : [];
  const importantDates: ImportantDateItem[] = Array.isArray(profile.importantDates)
    ? profile.importantDates
    : [];

  const taskCandidates: Array<WidgetTask & { dueAt: number; priority: number }> = productivityItems
    .filter(
      item =>
        typeof item?.id === 'string' &&
        item.type === 'task' &&
        PRODUCTIVITY_OPEN_STATUSES.has(item.status) &&
        item.deadline,
    )
    .map(item => ({
      id: item.id,
      title: safeTitle(item.title) || 'Task',
      dueAt: toTimestamp(item.deadline),
      done: false,
      priority: priorityRank(item.priority),
    }))
    .filter((task): task is WidgetTask & { dueAt: number; priority: number } => task.dueAt !== null)
    .sort((a, b) => a.dueAt - b.dueAt || a.priority - b.priority || compareStableId(a.id, b.id));

  const tasks = taskCandidates
    .slice(0, MAX_TASKS)
    .map(task => ({
      id: task.id,
      title: task.title,
      dueAt: task.dueAt,
      done: task.done,
    }));

  // Undated open Life Hub tasks: excluded from `taskCandidates` (which
  // requires a deadline) and from every due-today/overdue count below. They
  // exist only to fill remaining Today display capacity as a fallback when
  // overdue + due-today + due-today-routines don't fill the row budget, so
  // they must never inflate the due-today progress denominator.
  const undatedTaskCandidates: Array<{ id: string; title: string; priority: number }> = productivityItems
    .filter(
      item =>
        typeof item?.id === 'string' &&
        item.type === 'task' &&
        PRODUCTIVITY_OPEN_STATUSES.has(item.status) &&
        !item.deadline,
    )
    .map(item => ({
      id: item.id,
      title: safeTitle(item.title) || 'Task',
      priority: priorityRank(item.priority),
    }))
    .sort((a, b) => a.priority - b.priority || compareStableId(a.id, b.id));

  const routinesDueToday = checklistItems.filter(
    item => safeRoutineDue(item, now) && Boolean(safeRoutineOccurrenceKey(item, now)),
  );

  const routines: WidgetRoutine[] = routinesDueToday
    .map(item => ({
      id: item.id,
      title: safeTitle(item.title) || 'Routine',
      done: safeRoutineDone(item, now),
      dateKey: toLocalDayKey(now),
      occurrenceKey: safeRoutineOccurrenceKey(item, now),
      frequency: getRoutineFilter(item),
    }))
    .sort((a, b) => Number(a.done) - Number(b.done) || compareStableId(a.id, b.id))
    .slice(0, MAX_ROUTINES);

  const routinesDoneToday = routinesDueToday.filter(item => safeRoutineDone(item, now)).length;

  // Per-filter canonical totals, computed over the FULL due-routine set
  // (never the MAX_ROUTINES-capped `routines` row array). The Routines
  // widget can be configured to a single frequency filter, and its visible
  // progress bar must show the percentage for THAT filter's routines, not
  // the global "all" total divided by a differently-scoped count.
  const routineTotalsByFilter: Record<string, { total: number; done: number }> = {};
  for (const filter of ROUTINE_FREQUENCY_FILTERS) {
    const matching = filter === 'all'
      ? routinesDueToday
      : routinesDueToday.filter(item => getRoutineFilter(item) === filter);
    routineTotalsByFilter[filter] = {
      total: matching.length,
      done: matching.filter(item => safeRoutineDone(item, now)).length,
    };
  }

  const events: WidgetEvent[] = importantDates
    .filter(item => Boolean(item) && typeof item === 'object' && typeof item.id === 'string')
    .map(item => ({
      id: item.id,
      title: safeTitle(item.title),
      startAt: toTimestamp(item.date) ?? 0,
      kind: typeof item.type === 'string' ? item.type : 'personal',
    }))
    .filter(event => event.startAt >= startOfDay.getTime())
    .sort((a, b) => a.startAt - b.startAt)
    .slice(0, MAX_EVENTS);

  const todayTaskCandidates = taskCandidates.filter(
    task => task.dueAt < endOfDay.getTime(),
  );
  const overdueTaskCandidates = todayTaskCandidates.filter(
    task => task.dueAt < startOfDay.getTime(),
  );
  const dueTodayTaskCandidates = todayTaskCandidates.filter(
    task => task.dueAt >= startOfDay.getTime() && task.dueAt < endOfDay.getTime(),
  );
  const completedDueTodayTaskCount = productivityItems.filter(item => {
    if (item?.type !== 'task' || item.status !== 'completed') return false;
    const deadline = toTimestamp(item.deadline);
    return deadline !== null && deadline >= startOfDay.getTime() && deadline < endOfDay.getTime();
  }).length;

  const todayTaskRows: WidgetTodayItem[] = todayTaskCandidates.map(task => ({
    id: task.id,
    kind: 'task' as const,
    title: task.title,
    dueAt: task.dueAt,
    done: false,
    dateKey: toLocalDayKey(now),
    occurrenceKey: 'once',
  }));
  // Today is intentionally task-only. Calendar owns future events and the
  // dedicated Routines widget owns routine occurrences.
  //
  // Tier 4 fallback: when overdue + due-today tasks don't fill the display
  // budget, backfill with the highest-priority OPEN undated tasks. These
  // rows carry `dueAt: null` and are never counted in overdueTaskCount /
  // dueTodayTaskCount / completedDueCount / progress below, which all read
  // from the dated candidate lists only, not from `items`.
  const undatedFallbackRows: WidgetTodayItem[] = todayTaskRows.length >= MAX_TODAY_ITEMS
    ? []
    : undatedTaskCandidates
        .slice(0, MAX_TODAY_ITEMS - todayTaskRows.length)
        .map(task => ({
          id: task.id,
          kind: 'task' as const,
          title: task.title,
          dueAt: null,
          done: false,
          dateKey: toLocalDayKey(now),
          occurrenceKey: 'once',
        }));
  const todayItems = [...todayTaskRows, ...undatedFallbackRows].slice(0, MAX_TODAY_ITEMS);

  const workTaskCandidates: Array<WidgetWorkTask & { priorityRank: number; bucket: number }> =
    (Array.isArray(profile.workItems) ? profile.workItems : [])
      .filter(item =>
        typeof item?.id === 'string' &&
        item.type === 'task' &&
        typeof item.status === 'string' &&
        WORK_OPEN_STATUSES.has(item.status),
      )
      .map(item => {
        const dueAt = toTimestamp(item.dueDate ?? item.date);
        const bucket = item.status === 'waiting'
          ? 3
          : dueAt === null
            ? 4
          : dueAt < startOfDay.getTime()
            ? 0
            : dueAt < endOfDay.getTime()
              ? 1
              : 2;
        return {
          id: item.id,
          title: safeTitle(item.title) || 'Work task',
          status: item.status,
          priority: item.priority === 'low' || item.priority === 'medium' || item.priority === 'high'
            ? item.priority
            : null,
          dueAt,
          dateKey: toLocalDayKey(now),
          occurrenceKey: 'once' as const,
          ...(typeof item.projectId === 'string' && item.projectId.trim()
            ? { projectId: item.projectId.trim().slice(0, 120) }
            : {}),
          priorityRank: priorityRank(item.priority),
          bucket,
        };
      })
      .sort((a, b) =>
        a.bucket - b.bucket ||
        a.priorityRank - b.priorityRank ||
        (a.dueAt ?? Number.MAX_SAFE_INTEGER) - (b.dueAt ?? Number.MAX_SAFE_INTEGER) ||
        compareStableId(a.id, b.id),
      );

  // Work status is a whole-day marker: find one covering today.
  const workEntry = importantDates.find(item => {
    const mapped = WORK_STATUS_TYPES[item.type as string];
    if (!mapped) return false;

    const start = toTimestamp(item.date);
    if (start === null) return false;

    const end = toTimestamp(item.endDate) ?? start;

    return (
      start < endOfDay.getTime() && end >= startOfDay.getTime()
    );
  });

  const nowPlaying = options.nowPlaying;

  const projected = {
    version: WIDGET_SNAPSHOT_VERSION,
    profileId: profile.id,
    profileName: safeTitle(profile.name),
    revision: '',
    updatedAt: now.getTime(),
    days: buildDayMarkers(importantDates, now),
    todayTaskCount: todayTaskCandidates.length,
    todayRoutineCount: Math.max(0, routinesDueToday.length - routinesDoneToday),
    routineProgress:
      routinesDueToday.length > 0
        ? Math.round((routinesDoneToday / routinesDueToday.length) * 100)
        : 0,
    routineRowsOmitted: Math.max(0, routinesDueToday.length - routines.length),
    routineTotalsByFilter,
    workStatus: workEntry
      ? WORK_STATUS_TYPES[workEntry.type as string] ?? null
      : null,
    nextEvent: events[0] ?? null,
    tasks,
    routines,
    events,
    today: {
      includeRoutines: false as const,
      items: todayItems,
      overdueTaskCount: overdueTaskCandidates.length,
      dueTodayTaskCount: dueTodayTaskCandidates.length + completedDueTodayTaskCount,
      dueTodayRoutineCount: 0,
      completedDueCount: completedDueTodayTaskCount,
      totalDueCount: dueTodayTaskCandidates.length + completedDueTodayTaskCount,
      progress: (() => {
        const total = dueTodayTaskCandidates.length + completedDueTodayTaskCount;
        return total > 0
          ? Math.round((completedDueTodayTaskCount / total) * 100)
          : 0;
      })(),
      nextEvent: null,
    },
    workTasks: {
      items: workTaskCandidates.slice(0, MAX_WORK_TASKS).map(item => ({
        id: item.id,
        title: item.title,
        status: item.status,
        priority: item.priority,
        dueAt: item.dueAt,
        dateKey: item.dateKey,
        occurrenceKey: item.occurrenceKey,
        ...(item.projectId ? { projectId: item.projectId } : {}),
      })),
      openCount: workTaskCandidates.length,
      overdueCount: workTaskCandidates.filter(item => item.bucket === 0).length,
    },
    music: nowPlaying
      ? {
        title: safeTitle(nowPlaying.title),
        artist: safeTitle(nowPlaying.artist || 'Unknown artist'),
        url: safeHttpUrl(nowPlaying.url),
        sourceType: musicSourceType(nowPlaying),
        controllable: false as const,
      }
      : null,
  };

  projected.revision = revisionFor(
    JSON.stringify({ ...projected, revision: '', updatedAt: 0, music: null }),
  );
  return projected;
}

export function buildWidgetProfileIndex(
  profiles: Profile[],
  activeProfileId: string,
  snapshots: WidgetSnapshot[],
  appearance?: WidgetAppearance,
): WidgetProfileIndex {
  const snapshotsById = new Map(snapshots.map(snapshot => [snapshot.profileId, snapshot]));
  const index: WidgetProfileIndex = {
    version: WIDGET_PROFILE_INDEX_VERSION,
    activeProfileId,
    profiles: profiles
      .filter(profile => typeof profile?.id === 'string' && profile.id.trim())
      .map(profile => {
        const snapshot = snapshotsById.get(profile.id);
        return {
          profileId: profile.id,
          displayName: safeTitle(profile.name),
          revision: snapshot?.revision ?? '',
          updatedAt: snapshot?.updatedAt ?? 0,
        };
      }),
  };
  if (appearance) index.appearance = appearance;
  return index;
}

export function serializeWidgetProfileIndex(index: WidgetProfileIndex): string {
  return JSON.stringify(index);
}

/**
 * Serializes the snapshot, degrading gracefully rather than writing an
 * oversized payload: lists are dropped before counts, because a widget can
 * still render useful totals without per-record rows.
 */
export function widgetPayloadByteLength(payload: string): number {
  return new TextEncoder().encode(payload).byteLength;
}

export function serializeWidgetSnapshot(snapshot: WidgetSnapshot): string {
  let payload = JSON.stringify(snapshot);

  if (widgetPayloadByteLength(payload) <= WIDGET_SNAPSHOT_MAX_BYTES) return payload;

  const trimmed: WidgetSnapshot = {
    ...snapshot,
    tasks: snapshot.tasks.slice(0, 3),
    routines: snapshot.routines,
    events: snapshot.events.slice(0, 3),
    today: {
      ...snapshot.today,
      items: snapshot.today.items.slice(0, 3),
    },
    workTasks: {
      ...snapshot.workTasks,
      items: snapshot.workTasks.items.slice(0, 3),
    },
  };

  payload = JSON.stringify(trimmed);

  if (widgetPayloadByteLength(payload) <= WIDGET_SNAPSHOT_MAX_BYTES) return payload;

  const reducedRoutines = snapshot.routines.slice(0, 3);
  const reduced: WidgetSnapshot = {
    ...trimmed,
    routines: reducedRoutines,
    routineRowsOmitted: Math.max(
      snapshot.routineRowsOmitted,
      snapshot.routines.length - reducedRoutines.length,
    ),
  };
  payload = JSON.stringify(reduced);

  if (widgetPayloadByteLength(payload) <= WIDGET_SNAPSHOT_MAX_BYTES) return payload;

  // Day markers go before counts: the grid can fall back to plain dates, but
  // the headline numbers are what every widget needs.
  return JSON.stringify({
    ...reduced,
    days: {},
    tasks: [],
    routines: [],
    routineRowsOmitted: Math.max(
      reduced.routineRowsOmitted,
      snapshot.routineRowsOmitted + snapshot.routines.length,
    ),
    events: [],
    today: {
      ...trimmed.today,
      items: [],
    },
    workTasks: {
      ...trimmed.workTasks,
      items: [],
    },
  });
}

let writeTimer: ReturnType<typeof setTimeout> | null = null;
let lastPayload: string | null = null;

/**
 * Debounced, atomic-ish publish. The native side does the actual atomic
 * commit; this layer only avoids redundant writes and coalesces bursts of
 * saves (an import, or a rapid sequence of edits) into one update.
 *
 * Never throws: a widget mirror failing must not disturb the app.
 */
export async function publishWidgetSnapshots(
  profiles: Profile[],
  activeProfileId: string,
  options: {
    nowPlaying?: MusicItem | null;
    appearance?: WidgetAppearance;
    immediate?: boolean;
  } = {},
): Promise<boolean> {
  if (!isNativeApp() || workspaceIsProtected()) {
    if (writeTimer) { clearTimeout(writeTimer); writeTimer = null; }
    return false;
  }

  const write = async (): Promise<boolean> => {
    if (workspaceIsProtected()) return false;
    try {
      const snapshots = profiles.map(profile =>
        buildWidgetSnapshot(profile, {
          nowPlaying: profile.id === activeProfileId ? options.nowPlaying : null,
        }),
      );
      const projectionPayloads = snapshots.map(snapshot => ({
        profileId: snapshot.profileId,
        payload: serializeWidgetSnapshot(snapshot),
      }));
      const indexPayload = serializeWidgetProfileIndex(
        buildWidgetProfileIndex(profiles, activeProfileId, snapshots, options.appearance),
      );

      // `updatedAt` changes every build, so compare without it.
      const comparable = JSON.stringify({
        index: {
          ...JSON.parse(indexPayload),
          profiles: JSON.parse(indexPayload).profiles.map((entry: WidgetProfileIndexEntry) => ({
            ...entry,
            updatedAt: 0,
          })),
        },
        projections: projectionPayloads.map(entry => ({
          profileId: entry.profileId,
          snapshot: { ...JSON.parse(entry.payload), updatedAt: 0 },
        })),
      });

      if (comparable === lastPayload) return true;

      await CaizenNative.writeWidgetSnapshots({ indexPayload, projections: projectionPayloads });
      lastPayload = comparable;
      return true;
    } catch {
      // Intentionally silent: the payload may contain user titles, so the
      // failure must not be logged with its contents.
      return false;
    }
  };

  if (writeTimer) clearTimeout(writeTimer);

  if (options.immediate) {
    writeTimer = null;
    return write();
  }

  writeTimer = setTimeout(() => {
    writeTimer = null;
    void write();
  }, 800);
  // Non-immediate callers only requested a debounced mirror update. The
  // action reconciliation path uses `immediate` when it needs a durable
  // publication result before acknowledging native work.
  return true;
}

/** Compatibility wrapper for callers that still publish one profile. */
export async function publishWidgetSnapshot(
  profile: Profile | undefined,
  options: {
    nowPlaying?: MusicItem | null;
    appearance?: WidgetAppearance;
    immediate?: boolean;
  } = {},
): Promise<boolean> {
  if (!profile) {
    await clearWidgetSnapshot();
    return true;
  }
  return publishWidgetSnapshots([profile], profile.id, options);
}

/** Clears the mirror, e.g. when the last profile is deleted. */
export async function clearWidgetSnapshot(): Promise<void> {
  if (!isNativeApp() || workspaceIsProtected()) return;

  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  lastPayload = null;

  try {
    await CaizenNative.clearWidgetSnapshots();
  } catch {
    // Ignored - see publishWidgetSnapshot.
  }
}
