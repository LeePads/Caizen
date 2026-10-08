import type { Profile } from '../types';
import type { StoredAppState } from './app-repository';
import {
  normalizePersonalVaultItem,
  normalizePersonalVaultTaxonomy,
} from '../personal-vault/normalization';
import {
  catalogDuplicateIds,
  normalizeCatalogProfile,
} from '../catalog/normalization';
import { normalizePet } from '../pets/normalization';
import {
  normalizeUpcomingMoneyReminderDate,
  normalizeUpcomingMoneyReminderTime,
} from '../upcoming-money';
import { normalizeWorkItemAttachments } from '../work-attachments';
import { normalizeWorkTypeDefinitions } from '../workhub/custom-fields';
import { normalizeSleepEntryRecord } from '../health/sleep';
import { hasInvalidFastingInterval } from '../health/fasting';
import { normalizeCareerCollections } from '../career/normalization';
export { CAIZEN_BACKUP_SCHEMA_VERSION } from './backup-schema';

type UnknownRecord = Record<string, unknown>;

type DateRule = {
  field: string;
  aliases?: string[];
  required?: boolean;
  dateOnly?: boolean;
  /**
   * Accept a bare epoch number for this field. Off by default: a raw number is
   * indistinguishable from an unrelated integer, so it is only trusted where
   * the schema is known to have emitted one.
   */
  allowEpoch?: boolean;
};

export type ImportDateIssue = {
  profileId: string;
  collection: string;
  recordId: string;
  field: string;
  kind: 'invalid' | 'missing';
  rawValue?: unknown;
  message: string;
  /**
   * Whether this field is load-bearing (e.g. `transactions.date`). Only
   * required-field issues block the whole import via `canImport` - a corrupt
   * or missing bookkeeping timestamp (`createdAt`, `updatedAt`, `completedAt`
   * on most collections) is reported but does not stop an otherwise-good
   * import. Legacy exports created before the exporter's Date-handling fix can
   * carry a genuinely unrecoverable `{}` in these fields; blocking the entire
   * file over metadata that was never required in the first place made those
   * backups unimportable even though every real value was intact.
   */
  required: boolean;
};

/**
 * One aggregated problem, not one per record.
 *
 * A 5,000-row transaction history with three date rules used to emit 15,000
 * near-identical warning strings, all retained in memory and all rendered into
 * the preview. Grouping happens at generation so the volume never exists.
 */
export type ImportWarningGroup = {
  /** Collection the problem belongs to, e.g. `transactions`, `health.foodEntries`. */
  module: string;
  field: string;
  kind: 'invalid' | 'missing' | 'duplicate' | 'conflict';
  /** How many records are affected. */
  count: number;
  /** One-line summary suitable for a collapsed row. */
  summary: string;
  /** Up to three concrete examples, for the expanded view. */
  examples: string[];
};

/**
 * Detailed issues are capped so a corrupt file cannot exhaust memory. The
 * counts above stay exact regardless.
 */
export const MAX_RETAINED_DATE_ISSUES = 500;

export type ImportIntegrityReport = {
  format: string;
  schemaVersion: number | null;
  profileCount: number;
  recordCounts: Record<string, number>;
  earliestDate: string | null;
  latestDate: string | null;
  /** Total unreadable date values, including non-required bookkeeping fields. */
  invalidDateCount: number;
  /** Missing required dates. Always blocking - see canImport. */
  missingDateCount: number;
  /**
   * Of `invalidDateCount`, how many are on a `required` field and therefore
   * actually block `canImport`. A corrupt `createdAt`/`updatedAt` is reported
   * (and the field is dropped) but does not stop an otherwise-good import.
   */
  blockingInvalidCount: number;
  duplicateIds: string[];
  profileConflicts: string[];
  mediaCount: number;
  /** Bounded: one line per warning group, never one per record. */
  warnings: string[];
  warningGroups: ImportWarningGroup[];
  /** Capped at MAX_RETAINED_DATE_ISSUES; see `dateIssuesTruncated`. */
  dateIssues: ImportDateIssue[];
  dateIssuesTruncated: boolean;
  totalDateIssueCount: number;
  canImport: boolean;
};

export type PreparedImport = {
  state: StoredAppState;
  media: UnknownRecord[];
  report: ImportIntegrityReport;
};

const PROFILE_DATE_RULES: Record<string, DateRule[]> = {
  wallets: [
    { field: 'goalDeadline', aliases: ['deadline'], dateOnly: true },
    { field: 'createdAt', aliases: ['created_at'] },
    { field: 'updatedAt', aliases: ['updated_at'] },
  ],
  transactions: [
    {
      field: 'date',
      aliases: ['transactionDate', 'transaction_date'],
      required: true,
      dateOnly: true,
    },
    { field: 'createdAt', aliases: ['created_at'] },
    { field: 'updatedAt', aliases: ['updated_at'] },
  ],
  inventoryItems: [
    {
      field: 'purchaseDate',
      aliases: ['purchasedAt', 'purchase_date'],
      required: true,
      dateOnly: true,
    },
    { field: 'createdAt', aliases: ['created_at'] },
    { field: 'updatedAt', aliases: ['updated_at'] },
  ],
  wishlistItems: [
    { field: 'purchaseDate', aliases: ['purchasedAt'], dateOnly: true },
    { field: 'targetDate', aliases: ['target_date'], dateOnly: true },
    { field: 'createdAt', aliases: ['created_at'] },
    { field: 'updatedAt', aliases: ['updated_at'] },
  ],
  upcomingMoneyItems: [
    { field: 'dueDate', aliases: ['due_date'], dateOnly: true },
    { field: 'reminderDate', aliases: ['reminder_date'], dateOnly: true },
    { field: 'completedAt', aliases: ['completed_at'] },
    { field: 'createdAt', aliases: ['created_at'] },
    { field: 'updatedAt', aliases: ['updated_at'] },
  ],
  journalEntries: [
    {
      field: 'date',
      aliases: ['entryDate', 'entry_date'],
      required: true,
      dateOnly: true,
    },
    { field: 'createdAt', aliases: ['created_at'] },
    { field: 'updatedAt', aliases: ['updated_at'] },
  ],
  games: [
    { field: 'playingSince', aliases: ['startedAt'], dateOnly: true },
    { field: 'releaseDate', aliases: ['released', 'release_date'], dateOnly: true },
    { field: 'createdAt', aliases: ['created_at'] },
    { field: 'updatedAt', aliases: ['updated_at'] },
  ],
  gameGuides: [
    { field: 'createdAt', aliases: ['created_at'] },
    { field: 'updatedAt', aliases: ['updated_at'] },
  ],
  productivityItems: [
    { field: 'deadline', aliases: ['dueDate', 'due_date'], dateOnly: true },
    { field: 'completedAt', aliases: ['completed_at'] },
    { field: 'failedAt', aliases: ['failed_at'] },
    { field: 'createdAt', aliases: ['created_at'] },
    { field: 'updatedAt', aliases: ['updated_at'] },
  ],
  mediaItems: [
    { field: 'createdAt', aliases: ['created_at'] },
    { field: 'updatedAt', aliases: ['updated_at'] },
  ],
  books: [
    { field: 'startedAt', aliases: ['started_at'], dateOnly: true },
    { field: 'finishedAt', aliases: ['finished_at'], dateOnly: true },
    { field: 'createdAt', aliases: ['created_at'] },
    { field: 'updatedAt', aliases: ['updated_at'] },
  ],
  musicItems: [
    { field: 'lastPlayedAt', aliases: ['last_played_at'] },
    { field: 'createdAt', aliases: ['created_at'] },
    { field: 'updatedAt', aliases: ['updated_at'] },
  ],
  workItems: [
    { field: 'date', aliases: ['workDate', 'work_date'], dateOnly: true },
    { field: 'dueDate', aliases: ['deadline', 'due_date'], dateOnly: true },
    { field: 'completedAt', aliases: ['completed_at'] },
    { field: 'createdAt', aliases: ['created_at'] },
    { field: 'updatedAt', aliases: ['updated_at'] },
  ],
  personalVaultItems: [
    { field: 'date', aliases: ['issuedAt', 'issued_at'], dateOnly: true },
    { field: 'expiryDate', aliases: ['expiresAt', 'expiry_date'], dateOnly: true },
    { field: 'createdAt', aliases: ['created_at'] },
    { field: 'updatedAt', aliases: ['updated_at'] },
  ],
  trashItems: [
    { field: 'deletedAt', aliases: ['deleted_at'], required: true },
    { field: 'deleteAfter', aliases: ['delete_after'] },
  ],
  skincareProducts: [
    { field: 'purchaseDate', aliases: ['purchasedAt'], dateOnly: true },
    { field: 'startDate', aliases: ['startedAt'], dateOnly: true },
    { field: 'expiryDate', aliases: ['expiresAt'], dateOnly: true },
    { field: 'emptiedAt', aliases: ['finishedAt'], dateOnly: true },
    { field: 'createdAt', aliases: ['created_at'] },
  ],
  skincareUsageEvents: [
    { field: 'usedAt', aliases: ['used_at'], required: true },
    { field: 'createdAt', aliases: ['created_at'] },
  ],
  dailyChecklistItems: [
    { field: 'startDate', aliases: ['startedAt'], dateOnly: true },
    { field: 'completedAt', aliases: ['lastCompletedAt', 'completed_at'] },
    { field: 'createdAt', aliases: ['created_at'] },
    { field: 'updatedAt', aliases: ['updated_at'] },
  ],
  importantDates: [
    {
      field: 'date',
      aliases: ['start', 'startDate', 'eventDate'],
      required: true,
      dateOnly: true,
    },
    { field: 'endDate', aliases: ['end', 'endsAt'], dateOnly: true },
    { field: 'createdAt', aliases: ['created_at'] },
    { field: 'updatedAt', aliases: ['updated_at'] },
  ],
  supplements: [
    { field: 'purchaseDate', aliases: ['purchasedAt'], dateOnly: true },
    { field: 'startDate', aliases: ['startedAt'], dateOnly: true },
    { field: 'expiryDate', aliases: ['expiresAt'], dateOnly: true },
    { field: 'createdAt', aliases: ['created_at'] },
    { field: 'updatedAt', aliases: ['updated_at'] },
  ],
  balanceCheckIns: [
    { field: 'completedAt', aliases: ['completed_at'], required: true },
  ],
  balanceProjectionRows: [
    { field: 'date', aliases: ['month', 'periodStart'], dateOnly: true },
    { field: 'createdAt', aliases: ['created_at'] },
    { field: 'updatedAt', aliases: ['updated_at'] },
  ],
  careerSkills: [
    { field: 'createdAt', aliases: ['created_at'] },
    { field: 'updatedAt', aliases: ['updated_at'] },
  ],
  careerCourses: [
    { field: 'startDate', aliases: ['startedAt', 'started_at'], dateOnly: true },
    { field: 'completionDate', aliases: ['completedAt', 'completed_at'], dateOnly: true },
    { field: 'createdAt', aliases: ['created_at'] },
    { field: 'updatedAt', aliases: ['updated_at'] },
  ],
  careerCredentials: [
    { field: 'issuedDate', aliases: ['issuedAt', 'issued_at'], dateOnly: true },
    { field: 'expiryDate', aliases: ['expiresAt', 'expiry_date'], dateOnly: true },
    { field: 'createdAt', aliases: ['created_at'] },
    { field: 'updatedAt', aliases: ['updated_at'] },
  ],
  budgets: [
    { field: 'createdAt', aliases: ['created_at'], required: true },
    { field: 'updatedAt', aliases: ['updated_at'], required: true },
  ],
  financialCategories: [
    { field: 'createdAt', aliases: ['created_at'] },
    { field: 'updatedAt', aliases: ['updated_at'] },
  ],
};

/**
 * Date-bearing fields that live directly on the profile rather than inside a
 * collection. These were previously unvalidated entirely, so a corrupt value
 * passed straight through into IndexedDB.
 */
const PROFILE_ROOT_DATE_RULES: DateRule[] = [
  // Validated but not required: legacy exports omit it and the app already
  // defaults a missing profile createdAt, so blocking the whole import over it
  // would be disproportionate. A value that IS present must still be readable.
  { field: 'createdAt', aliases: ['created_at'] },
  { field: 'updatedAt', aliases: ['updated_at'] },
];

/** Nested single-object owners: `<path>` is reported as the collection name. */
const NESTED_OBJECT_DATE_RULES: Array<{ path: string[]; rules: DateRule[] }> = [
  { path: ['pet'], rules: [{ field: 'createdAt', aliases: ['created_at'] }] },
  {
    path: ['health', 'vapeTracker'],
    rules: [{ field: 'quitDate', aliases: ['quit_date', 'startedAt'], dateOnly: true }],
  },
];

/** Nested arrays that hang off a single object rather than a profile collection. */
const NESTED_ARRAY_DATE_RULES: Array<{ path: string[]; rules: DateRule[] }> = [
  {
    path: ['achievementUnlocks'],
    rules: [
      { field: 'unlockedAt', aliases: ['unlocked_at'], required: true },
      { field: 'seenAt', aliases: ['seen_at'] },
    ],
  },
  {
    path: ['milestoneUnlocks'],
    rules: [
      { field: 'achievedAt', aliases: ['achieved_at'], required: true },
      { field: 'seenAt', aliases: ['seen_at'] },
    ],
  },
  {
    path: ['masteryMilestones'],
    rules: [
      { field: 'reachedAt', aliases: ['reached_at'], required: true },
      { field: 'seenAt', aliases: ['seen_at'] },
    ],
  },
  {
    path: ['pet', 'recentRewards'],
    rules: [{ field: 'earnedAt', aliases: ['earned_at'], required: true }],
  },
  {
    path: ['categoryXpEvents'],
    rules: [{ field: 'occurredAt', aliases: ['occurred_at'], required: true }],
  },
  {
    path: ['masteryBondXpEvents'],
    rules: [{ field: 'occurredAt', aliases: ['occurred_at'], required: true }],
  },
  {
    path: ['masteryBondClaims'],
    rules: [{ field: 'processedAt', aliases: ['processed_at'], required: true }],
  },
];

const HEALTH_DATE_RULES: Record<string, DateRule[]> = {
  weightEntries: [
    {
      field: 'date',
      aliases: ['recordedAt', 'recorded_at'],
      required: true,
      dateOnly: true,
    },
    { field: 'createdAt', aliases: ['created_at'] },
  ],
  waterEntries: [
    { field: 'date', aliases: ['loggedAt', 'logged_at'], required: true, dateOnly: true },
    { field: 'createdAt', aliases: ['created_at'] },
  ],
  bodyMeasurementEntries: [
    { field: 'date', aliases: ['recordedAt', 'recorded_at'], required: true, dateOnly: true },
    { field: 'createdAt', aliases: ['created_at'] },
  ],
  nutritionEntries: [
    {
      field: 'date',
      aliases: ['loggedAt', 'mealDate', 'logged_at'],
      required: true,
      dateOnly: true,
    },
    { field: 'createdAt', aliases: ['created_at'] },
  ],
  foodEntries: [
    {
      field: 'date',
      aliases: ['loggedAt', 'mealDate', 'logged_at', 'meal_date'],
      required: true,
      dateOnly: true,
    },
    { field: 'createdAt', aliases: ['created_at'] },
    { field: 'updatedAt', aliases: ['updated_at'] },
  ],
  foodTemplates: [
    { field: 'createdAt', aliases: ['created_at'] },
    { field: 'updatedAt', aliases: ['updated_at'] },
  ],
  mealTemplates: [
    { field: 'createdAt', aliases: ['created_at'] },
    { field: 'updatedAt', aliases: ['updated_at'] },
  ],
  activityEntries: [
    {
      field: 'date',
      aliases: ['startedAt', 'workoutDate', 'started_at', 'workout_date'],
      required: true,
      dateOnly: true,
    },
    { field: 'createdAt', aliases: ['created_at'] },
    { field: 'updatedAt', aliases: ['updated_at'] },
  ],
  fastingSessions: [
    { field: 'startedAt', aliases: ['started_at'], required: true },
    { field: 'endedAt', aliases: ['ended_at'] },
    { field: 'createdAt', aliases: ['created_at'] },
    { field: 'updatedAt', aliases: ['updated_at'] },
  ],
  workoutEntries: [
    {
      field: 'date',
      aliases: ['startedAt', 'workoutDate', 'started_at'],
      required: true,
      dateOnly: true,
    },
    { field: 'createdAt', aliases: ['created_at'] },
  ],
  workoutExercises: [
    { field: 'createdAt', aliases: ['created_at'] },
    { field: 'updatedAt', aliases: ['updated_at'] },
  ],
  workoutRoutines: [
    { field: 'createdAt', aliases: ['created_at'] },
    { field: 'updatedAt', aliases: ['updated_at'] },
  ],
  workoutSessions: [
    { field: 'startedAt', aliases: ['started_at'], required: true },
    { field: 'completedAt', aliases: ['completed_at'] },
    { field: 'createdAt', aliases: ['created_at'] },
  ],
  sleepEntries: [
    {
      field: 'date',
      aliases: ['sleepDate', 'startedAt'],
      required: true,
      dateOnly: true,
    },
    { field: 'createdAt', aliases: ['created_at'] },
  ],
  noXTrackers: [
    { field: 'startDate', aliases: ['startedAt'], required: true, dateOnly: true },
    { field: 'createdAt', aliases: ['created_at'] },
  ],
};

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;

const isRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

function isValidDateOnly(value: string) {
  const match = DATE_ONLY_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(year, month - 1, day, 12, 0, 0);
  return (
    candidate.getFullYear() === year &&
    candidate.getMonth() === month - 1 &&
    candidate.getDate() === day
  );
}

/** `YYYY-MM-DD` in the *local* calendar, never UTC. */
export function toLocalDateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(
    value.getDate(),
  ).padStart(2, '0')}`;
}

/**
 * Epoch numbers are ambiguous (seconds vs milliseconds) and a bare number is
 * indistinguishable from an unrelated integer field, so they are only accepted
 * from rules that explicitly opt in. The window below spans 1990-01-01 to
 * 2100-01-01, which covers every plausible personal-records timestamp.
 */
const EPOCH_MS_MIN = Date.UTC(1990, 0, 1);
const EPOCH_MS_MAX = Date.UTC(2100, 0, 1);

function fromEpoch(value: number): Date | null {
  if (!Number.isFinite(value)) return null;
  const asMilliseconds = value >= EPOCH_MS_MIN && value <= EPOCH_MS_MAX ? value : null;
  const asSeconds =
    value * 1000 >= EPOCH_MS_MIN && value * 1000 <= EPOCH_MS_MAX ? value * 1000 : null;
  const resolved = asMilliseconds ?? asSeconds;
  return resolved === null ? null : new Date(resolved);
}

/**
 * Recognised timestamp wrapper shapes found in real exports. Each is matched on
 * its exact key shape and its inner value must itself normalise - an arbitrary
 * object is never coerced into a date.
 */
function unwrapTimestampObject(value: UnknownRecord): unknown | null {
  const keys = Object.keys(value);

  // Firestore / Firebase admin: { seconds, nanoseconds } or { _seconds, _nanoseconds }
  const seconds = value.seconds ?? value._seconds;
  const nanoseconds = value.nanoseconds ?? value._nanoseconds;
  if (typeof seconds === 'number' && (nanoseconds === undefined || typeof nanoseconds === 'number')) {
    const millis = seconds * 1000 + Math.floor((typeof nanoseconds === 'number' ? nanoseconds : 0) / 1e6);
    return Number.isFinite(millis) ? new Date(millis) : null;
  }

  // MongoDB extended JSON: { $date: ... }
  if (keys.length === 1 && '$date' in value) return value.$date;

  // Hand-rolled wrappers seen in older Caizen/website exports.
  for (const key of ['iso', 'isoString', 'value', 'date', 'timestamp']) {
    if (keys.length === 1 && key in value) return value[key];
  }

  return null;
}

/**
 * Normalises any supported date representation.
 *
 * `dateOnly` fields are narrowed to the LOCAL calendar date. A full timestamp
 * such as "2026-06-20T17:00:00.000Z" was written as local midnight-ish in
 * UTC+08:00, so the intended calendar day is 2026-06-21. Narrowing via
 * toISOString() would bucket it on 2026-06-20 - that off-by-one is what made
 * imported records appear to collapse onto neighbouring days.
 *
 * Returns `null` for anything not positively recognised. Arbitrary objects are
 * rejected, never coerced.
 */
function normalizeDateValue(value: unknown, dateOnly: boolean, allowEpoch = false): string | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return dateOnly ? toLocalDateKey(value) : value.toISOString();
  }

  if (typeof value === 'number') {
    if (!allowEpoch) return null;
    const parsed = fromEpoch(value);
    if (!parsed || Number.isNaN(parsed.getTime())) return null;
    return dateOnly ? toLocalDateKey(parsed) : parsed.toISOString();
  }

  if (isRecord(value)) {
    const inner = unwrapTimestampObject(value);
    if (inner === null || inner === undefined) return null;
    // Wrapper payloads carry their own epoch semantics, so epoch is allowed here.
    return normalizeDateValue(inner, dateOnly, true);
  }

  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  // A bare calendar date is already timezone-independent; keep it verbatim.
  if (isValidDateOnly(trimmed)) return trimmed;

  // Something shaped like YYYY-MM-DD that is not a real calendar date must be
  // rejected outright. Date.parse() would silently roll it over - it turns
  // "2026-02-30" into March 2 - which would fabricate a date the user never
  // entered instead of reporting corrupt input.
  if (DATE_ONLY_PATTERN.test(trimmed)) return null;

  if (ISO_TIMESTAMP_PATTERN.test(trimmed) && !Number.isNaN(Date.parse(trimmed))) {
    return dateOnly ? toLocalDateKey(new Date(trimmed)) : trimmed;
  }

  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return null;
  return dateOnly ? toLocalDateKey(new Date(parsed)) : new Date(parsed).toISOString();
}

/**
 * Human-readable description of a value that failed to parse, for the warning
 * report. Never uses String(value) - that is what produced "[object Object]".
 */
export function describeRawValue(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'string') return `"${value.length > 60 ? `${value.slice(0, 60)}...` : value}"`;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return 'an invalid Date';
  if (Array.isArray(value)) return `an array of ${value.length} item(s)`;
  if (isRecord(value)) {
    const keys = Object.keys(value);
    if (!keys.length) return 'an empty object';
    return `an object with keys: ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? ', ...' : ''}`;
  }
  return `a ${typeof value} value`;
}

function getRawDate(record: UnknownRecord, rule: DateRule) {
  if (record[rule.field] !== undefined && record[rule.field] !== null && record[rule.field] !== '') {
    return { source: rule.field, value: record[rule.field] };
  }
  for (const alias of rule.aliases ?? []) {
    if (record[alias] !== undefined && record[alias] !== null && record[alias] !== '') {
      return { source: alias, value: record[alias] };
    }
  }
  return null;
}

function recordDate(
  value: string,
  dateValues: number[],
) {
  // Date-only values are anchored at local noon so the earliest/latest summary
  // cannot drift across a day boundary in either direction. The timezone was
  // previously hardcoded to +08:00, which was wrong everywhere but Manila.
  let timestamp: number;
  if (isValidDateOnly(value)) {
    const [year, month, day] = value.split('-').map(Number);
    timestamp = new Date(year, month - 1, day, 12, 0, 0).getTime();
  } else {
    timestamp = Date.parse(value);
  }
  if (!Number.isNaN(timestamp)) dateValues.push(timestamp);
}

function normalizeCompletionHistory(
  record: UnknownRecord,
  profileId: string,
  collection: string,
  recordId: string,
  issues: ImportDateIssue[],
  dateValues: number[],
) {
  if (!Array.isArray(record.completionHistory)) return;
  record.completionHistory = record.completionHistory.map((entry, index) => {
    if (!isRecord(entry)) return entry;
    const next = { ...entry };
    const raw = getRawDate(next, {
      field: 'date',
      aliases: ['completedAt', 'completionDate'],
      required: true,
      dateOnly: true,
    });
    const normalized = raw ? normalizeDateValue(raw.value, true) : null;
    if (normalized) {
      next.date = normalized;
      recordDate(normalized, dateValues);
    } else {
      issues.push({
        profileId,
        collection,
        recordId,
        field: `completionHistory[${index}].date`,
        kind: raw ? 'invalid' : 'missing',
        rawValue: raw?.value,
        required: true,
        message: raw
          ? `Routine completion date could not be read (${describeRawValue(raw.value)}).`
          : 'Routine completion history is missing its date.',
      });
    }
    return next;
  });
}

function normalizeUpcomingMoneyReminderState(record: UnknownRecord): void {
  const reminderDate = normalizeUpcomingMoneyReminderDate(record.reminderDate);
  const reminderTime = normalizeUpcomingMoneyReminderTime(record.reminderTime);
  const enabled = record.reminderEnabled === true && Boolean(reminderDate && reminderTime);

  if (!enabled) {
    record.reminderEnabled = false;
    delete record.reminderDate;
    delete record.reminderTime;
    return;
  }

  record.reminderEnabled = true;
  record.reminderDate = reminderDate;
  record.reminderTime = reminderTime;
}

function normalizeCollection(
  input: unknown,
  profileId: string,
  collection: string,
  rules: DateRule[],
  issues: ImportDateIssue[],
  duplicates: string[],
  dateValues: number[],
) {
  if (!Array.isArray(input)) return [];
  const ids = new Set<string>();
  const normalizedValues = input.map((value, index) => {
    if (!isRecord(value)) return value;
    const cloned = structuredClone(value);
    const record =
      collection === 'personalVaultItems'
        ? (normalizePersonalVaultItem(cloned, index) as UnknownRecord | null) || cloned
        : cloned;
    const recordId =
      typeof record.id === 'string' && record.id.trim()
        ? record.id
        : `missing-id-${index}`;
    if (ids.has(recordId)) duplicates.push(`${profileId}:${collection}:${recordId}`);
    ids.add(recordId);

    normalizeRecordFields(record, rules, profileId, collection, recordId, issues, dateValues);
    if (collection === 'health.fastingSessions' && hasInvalidFastingInterval(record)) {
      issues.push({
        profileId,
        collection,
        recordId,
        field: 'endedAt',
        kind: 'invalid',
        rawValue: record.endedAt,
        required: true,
        message: 'health.fastingSessions.endedAt is earlier than startedAt; this fasting record was excluded from import.',
      });
      return undefined;
    }
    if (collection === 'workItems') {
      const normalized = normalizeWorkItemAttachments(record);
      if (!Object.hasOwn(normalized, 'attachmentAssetIds')) {
        delete record.attachmentAssetIds;
      }
      Object.assign(record, normalized);
    }
    if (collection === 'upcomingMoneyItems') {
      normalizeUpcomingMoneyReminderState(record);
    }
    if (collection === 'health.sleepEntries') {
      Object.assign(record, normalizeSleepEntryRecord(record));
    }
    if (collection === 'health.foodEntries' || collection === 'health.foodTemplates') {
      for (const field of collection === 'health.foodEntries' ? ['sugar', 'amount'] : ['sugarPerGram']) {
        if (!(field in record)) continue;
        const value = Number(record[field]);
        if (Number.isFinite(value) && value >= 0) record[field] = value;
        else delete record[field];
      }
    }
    normalizeCompletionHistory(record, profileId, collection, recordId, issues, dateValues);
    return record;
  });
  return normalizedValues.filter(value => value !== undefined);
}

/**
 * Applies date rules to a single record in place. Shared by collection rows,
 * the profile root, and nested single-object owners such as `pet` and
 * `health.vapeTracker`.
 */
function normalizeRecordFields(
  record: UnknownRecord,
  rules: DateRule[],
  profileId: string,
  collection: string,
  recordId: string,
  issues: ImportDateIssue[],
  dateValues: number[],
) {
  for (const rule of rules) {
    const raw = getRawDate(record, rule);
    if (!raw) {
      if (rule.required) {
        issues.push({
          profileId,
          collection,
          recordId,
          field: rule.field,
          kind: 'missing',
          required: true,
          // Missing dates are reported, never backfilled - substituting the
          // import date would collapse every such record onto one day.
          message: `${collection}.${rule.field} is required but missing.`,
        });
      }
      continue;
    }
    const normalized = normalizeDateValue(
      raw.value,
      Boolean(rule.dateOnly),
      Boolean(rule.allowEpoch),
    );
    if (!normalized) {
      issues.push({
        profileId,
        collection,
        recordId,
        field: rule.field,
        kind: 'invalid',
        rawValue: raw.value,
        required: Boolean(rule.required),
        message: rule.required
          ? `${collection}.${rule.field} could not be read as a date (${describeRawValue(raw.value)}).`
          : `${collection}.${rule.field} could not be read as a date (${describeRawValue(raw.value)}) and was cleared; this field is not required.`,
      });
      // Unreadable and not load-bearing: drop it rather than writing the
      // corrupt raw value (often a bare `{}` from a pre-fix export) forward
      // into the imported record.
      if (!rule.required) delete record[rule.field];
      continue;
    }
    record[rule.field] = normalized;
    recordDate(normalized, dateValues);
  }
}

/** Walks a dotted path, returning `undefined` if any segment is missing. */
function resolvePath(root: UnknownRecord, path: string[]): unknown {
  let current: unknown = root;
  for (const segment of path) {
    if (!isRecord(current)) return undefined;
    current = current[segment];
  }
  return current;
}

const plural = (count: number, singular: string, pluralForm = `${singular}s`) =>
  `${count.toLocaleString()} ${count === 1 ? singular : pluralForm}`;

/**
 * Collapses per-record issues into one group per (module, field, kind).
 * Groups are ordered by impact so the worst problem is read first.
 */
function groupWarnings(
  issues: ImportDateIssue[],
  duplicateIds: string[],
  profileConflicts: string[],
): ImportWarningGroup[] {
  const buckets = new Map<string, { issue: ImportDateIssue; count: number; examples: string[] }>();

  for (const issue of issues) {
    const key = `${issue.collection}|${issue.field}|${issue.kind}`;
    const bucket = buckets.get(key);
    if (!bucket) {
      buckets.set(key, { issue, count: 1, examples: [issue.message] });
      continue;
    }
    bucket.count += 1;
    // Keep up to three DISTINCT examples; identical messages add nothing.
    if (bucket.examples.length < 3 && !bucket.examples.includes(issue.message)) {
      bucket.examples.push(issue.message);
    }
  }

  const groups: ImportWarningGroup[] = [...buckets.values()].map(({ issue, count, examples }) => ({
    module: issue.collection,
    field: issue.field,
    kind: issue.kind,
    count,
    // The module name is rendered separately by the preview, so it is not
    // repeated here.
    summary:
      issue.kind === 'missing'
        ? `${plural(count, 'record')} missing a required ${issue.field}.`
        : `${plural(count, 'record')} with an unreadable ${issue.field}.`,
    examples,
  }));

  if (duplicateIds.length) {
    groups.push({
      module: 'ids',
      field: 'id',
      kind: 'duplicate',
      count: duplicateIds.length,
      summary: `${plural(duplicateIds.length, 'duplicate ID', 'duplicate IDs')} need correction before import.`,
      examples: duplicateIds.slice(0, 3),
    });
  }

  if (profileConflicts.length) {
    groups.push({
      module: 'profiles',
      field: 'id',
      kind: 'conflict',
      count: profileConflicts.length,
      summary: `${plural(profileConflicts.length, 'profile')} already exist on this device.`,
      examples: profileConflicts.slice(0, 3),
    });
  }

  return groups.sort((left, right) => right.count - left.count);
}

function extractEnvelope(payload: unknown) {
  if (!isRecord(payload)) throw new Error('The import file must contain a JSON object.');
  if (payload.format === 'caizen-data' && isRecord(payload.data)) {
    return {
      format: 'caizen-data',
      schemaVersion: typeof payload.version === 'number' ? payload.version : null,
      state: payload.data,
      media: Array.isArray(payload.media) ? payload.media : [],
    };
  }
  if (typeof payload.profiles === 'string') {
    return {
      format: 'caizen-legacy-web',
      schemaVersion:
        typeof payload.version === 'number'
          ? payload.version
          : Number.parseInt(String(payload.version || ''), 10) || null,
      state: {
        profiles: JSON.parse(payload.profiles),
        currentProfileId: '',
      },
      media: [],
    };
  }
  return {
    format: 'caizen-state',
    schemaVersion:
      typeof payload.schemaVersion === 'number' ? payload.schemaVersion : null,
    state: payload,
    media: Array.isArray(payload.media) ? payload.media : [],
  };
}

export function prepareImport(
  payload: unknown,
  existingProfileIds: string[] = [],
): PreparedImport {
  const envelope = extractEnvelope(payload);
  if (!isRecord(envelope.state) || !Array.isArray(envelope.state.profiles)) {
    throw new Error('The import does not contain a profiles array.');
  }

  const issues: ImportDateIssue[] = [];
  const duplicateIds: string[] = [];
  const recordCounts: Record<string, number> = {};
  const dateValues: number[] = [];
  const profileIds = new Set<string>();
  const profileConflicts: string[] = [];
  const existingIds = new Set(existingProfileIds);

  const profiles = envelope.state.profiles.map((input, profileIndex) => {
    if (!isRecord(input)) throw new Error(`Profile ${profileIndex + 1} is invalid.`);
    const profile = structuredClone(input);
    const profileId =
      typeof profile.id === 'string' && profile.id.trim()
        ? profile.id
        : `missing-profile-${profileIndex}`;
    if (profileIds.has(profileId)) duplicateIds.push(`profile:${profileId}`);
    profileIds.add(profileId);
    if (existingIds.has(profileId)) profileConflicts.push(profileId);

    // Catalog normalizers repair the prepared state before persistence, but
    // the original collision remains a blocking import warning so the user
    // explicitly reviews an export that contained ambiguous identity.
    for (const collection of ['games', 'gameGuides', 'musicItems']) {
      for (const id of catalogDuplicateIds(profile, collection)) {
        duplicateIds.push(`${profileId}:${collection}:${id}`);
      }
    }
    Object.assign(profile, normalizeCatalogProfile(profile));

    if (Array.isArray(profile.workTypes)) {
      profile.workTypes = normalizeWorkTypeDefinitions(profile.workTypes);
    }

    if (Array.isArray(profile.personalVaultTaxonomy)) {
      profile.personalVaultTaxonomy = normalizePersonalVaultTaxonomy(
        profile.personalVaultTaxonomy,
      );
    }

    for (const [collection, rules] of Object.entries(PROFILE_DATE_RULES)) {
      if (!Array.isArray(profile[collection])) continue;
      recordCounts[collection] = (recordCounts[collection] ?? 0) + profile[collection].length;
      profile[collection] = normalizeCollection(
        profile[collection],
        profileId,
        collection,
        rules,
        issues,
        duplicateIds,
        dateValues,
      );
    }

    const normalizedCareer = normalizeCareerCollections(
      profile.careerSkills,
      profile.careerCourses,
      profile.careerCredentials,
    );
    profile.careerSkills = normalizedCareer.skills;
    profile.careerCourses = normalizedCareer.courses;
    profile.careerCredentials = normalizedCareer.credentials;

    const health = isRecord(profile.health) ? structuredClone(profile.health) : {};
    for (const [collection, rules] of Object.entries(HEALTH_DATE_RULES)) {
      if (!Array.isArray(health[collection])) continue;
      recordCounts[collection] = (recordCounts[collection] ?? 0) + health[collection].length;
      health[collection] = normalizeCollection(
        health[collection],
        profileId,
        `health.${collection}`,
        rules,
        issues,
        duplicateIds,
        dateValues,
      );
    }
    profile.health = health;

    normalizeRecordFields(
      profile,
      PROFILE_ROOT_DATE_RULES,
      profileId,
      'profile',
      profileId,
      issues,
      dateValues,
    );

    for (const { path, rules } of NESTED_OBJECT_DATE_RULES) {
      const owner = resolvePath(profile, path);
      if (!isRecord(owner)) continue;
      normalizeRecordFields(
        owner,
        rules,
        profileId,
        path.join('.'),
        profileId,
        issues,
        dateValues,
      );
    }

    for (const { path, rules } of NESTED_ARRAY_DATE_RULES) {
      const owner = resolvePath(profile, path.slice(0, -1));
      const key = path[path.length - 1];
      if (!isRecord(owner) || !Array.isArray(owner[key])) continue;
      const collection = path.join('.');
      recordCounts[collection] = (recordCounts[collection] ?? 0) + owner[key].length;
      owner[key] = normalizeCollection(
        owner[key],
        profileId,
        collection,
        rules,
        issues,
        duplicateIds,
        dateValues,
      );
    }

    // Date validation above still reports malformed required Pet timestamps;
    // this canonical boundary prevents malformed economy/ownership state from
    // being persisted when the import is accepted.
    profile.pet = normalizePet(profile.pet);

    return profile as unknown as Profile;
  });

  const invalidDateCount = issues.filter((issue) => issue.kind === 'invalid').length;
  const missingDateCount = issues.filter((issue) => issue.kind === 'missing').length;
  // Only load-bearing fields block the whole import. `missing`-kind issues are
  // already required-only by construction (see normalizeRecordFields), but
  // `invalid`-kind issues are reported for every field regardless, so they
  // need an explicit filter here.
  const blockingInvalidCount = issues.filter(
    (issue) => issue.kind === 'invalid' && issue.required,
  ).length;
  const blockingIssueCount = blockingInvalidCount + missingDateCount;
  const warningGroups = groupWarnings(issues, duplicateIds, profileConflicts);
  const warnings = warningGroups.map((group) => group.summary);
  const sortedDates = dateValues.sort((left, right) => left - right);
  const state: StoredAppState = {
    profiles,
    currentProfileId:
      typeof envelope.state.currentProfileId === 'string' &&
      profiles.some((profile) => profile.id === envelope.state.currentProfileId)
        ? envelope.state.currentProfileId
        : profiles[0]?.id ?? '',
  };

  return {
    state,
    media: envelope.media,
    report: {
      format: envelope.format,
      schemaVersion: envelope.schemaVersion,
      profileCount: profiles.length,
      recordCounts,
      earliestDate: sortedDates.length ? new Date(sortedDates[0]).toISOString() : null,
      latestDate: sortedDates.length
        ? new Date(sortedDates[sortedDates.length - 1]).toISOString()
        : null,
      invalidDateCount,
      missingDateCount,
      blockingInvalidCount,
      duplicateIds,
      profileConflicts,
      mediaCount: envelope.media.length,
      warnings,
      warningGroups,
      dateIssues: issues.slice(0, MAX_RETAINED_DATE_ISSUES),
      dateIssuesTruncated: issues.length > MAX_RETAINED_DATE_ISSUES,
      totalDateIssueCount: issues.length,
      canImport: blockingIssueCount === 0 && duplicateIds.length === 0,
    },
  };
}

export function parseAndPrepareImport(
  json: string,
  existingProfileIds: string[] = [],
) {
  return prepareImport(JSON.parse(json), existingProfileIds);
}

function remapProfileReferences(value: unknown, from: string, to: string): unknown {
  if (Array.isArray(value)) {
    return value.map((child) => remapProfileReferences(child, from, to));
  }
  if (!isRecord(value)) return value;
  const output: UnknownRecord = {};
  for (const [key, child] of Object.entries(value)) {
    output[key] =
      key === 'profileId' && child === from
        ? to
        : remapProfileReferences(child, from, to);
  }
  return output;
}

/**
 * Timestamp used to decide which side of a merge conflict is newer.
 * `updatedAt` is authoritative; `createdAt` is the fallback for records that
 * never carried one. Returns `null` when neither is readable.
 */
function recordModifiedAt(value: unknown): number | null {
  if (!isRecord(value)) return null;
  for (const field of ['updatedAt', 'updated_at', 'createdAt', 'created_at']) {
    const normalized = normalizeDateValue(value[field], false, true);
    if (normalized) {
      const parsed = Date.parse(normalized);
      if (!Number.isNaN(parsed)) return parsed;
    }
  }
  return null;
}

/**
 * True only when `incoming` is provably newer than `existing`. An unknown or
 * equal timestamp keeps the local record, so a merge can never silently
 * discard local edits it cannot prove are stale.
 */
function isNewerRecord(incoming: unknown, existing: unknown): boolean {
  const incomingAt = recordModifiedAt(incoming);
  const existingAt = recordModifiedAt(existing);
  if (incomingAt === null) return false;
  if (existingAt === null) return true;
  return incomingAt > existingAt;
}

function mergeRecordArrays(localItems: unknown[], importedItems: unknown[]): unknown[] {
  const merged = new Map<string, unknown>();
  const identity = (item: unknown, source: 'local' | 'imported', index: number) => {
    if (isRecord(item) && typeof item.id === 'string' && item.id.trim()) {
      return `id:${item.id}`;
    }
    if (isRecord(item) && typeof item.milestoneId === 'string' && item.milestoneId.trim()) {
      return `milestone:${item.milestoneId}`;
    }
    if (item === null || (typeof item !== 'object' && typeof item !== 'function')) {
      return `value:${typeof item}:${String(item)}`;
    }
    return `${source}:anonymous:${index}`;
  };

  localItems.forEach((item, index) => {
    merged.set(identity(item, 'local', index), structuredClone(item));
  });
  importedItems.forEach((item, index) => {
    const key = identity(item, 'imported', index);
    const existing = merged.get(key);
    if (existing === undefined || isNewerRecord(item, existing)) {
      merged.set(key, structuredClone(item));
    }
  });

  return [...merged.values()];
}

/**
 * Merge a nested profile object without treating a nested collection as one
 * indivisible value. This is intentionally generic so Health can retain both
 * legacy and newer subcollections without creating a second import system.
 */
function mergeNestedValue(localValue: unknown, importedValue: unknown): unknown {
  if (Array.isArray(localValue) && Array.isArray(importedValue)) {
    return mergeRecordArrays(localValue, importedValue);
  }

  if (isRecord(localValue) && isRecord(importedValue)) {
    const merged = structuredClone(localValue);
    for (const [key, value] of Object.entries(importedValue)) {
      merged[key] = Object.prototype.hasOwnProperty.call(localValue, key)
        ? mergeNestedValue(localValue[key], value)
        : structuredClone(value);
    }
    return merged;
  }

  return importedValue === undefined
    ? structuredClone(localValue)
    : structuredClone(importedValue);
}

export function createProfilesForImport(
  imported: StoredAppState,
  current: StoredAppState | null,
  mode: 'new-profiles' | 'merge' | 'replace',
): StoredAppState {
  if (mode === 'replace' || !current) return structuredClone(imported);
  if (mode === 'new-profiles') {
    const existing = new Set(current.profiles.map((profile) => profile.id));
    const profiles = imported.profiles.map((profile) => {
      if (!existing.has(profile.id)) return profile;
      const nextId = `${profile.id}-imported-${crypto.randomUUID().slice(0, 8)}`;
      return {
        ...(remapProfileReferences(profile, profile.id, nextId) as Profile),
        id: nextId,
        name: `${profile.name} (Imported)`,
      };
    });
    return {
      profiles: [...current.profiles, ...profiles],
      // The whole point of this mode is to add a profile the user has not
      // seen yet, so switch to it. `current.currentProfileId || ...` (the
      // previous logic) always kept the existing profile active - since one
      // already exists on this device (that's what "profile already exists"
      // means), the import silently added a second profile the user then
      // had to know to switch to manually, which read as "nothing imported".
      currentProfileId: profiles[0]?.id || current.currentProfileId || '',
    };
  }

  const importedById = new Map(imported.profiles.map((profile) => [profile.id, profile]));
  const matchedProfileIds = new Set<string>();
  const profiles = current.profiles.map((profile) => {
    const incoming = importedById.get(profile.id);
    if (!incoming) return profile;
    importedById.delete(profile.id);
    matchedProfileIds.add(profile.id);
    const merged = { ...profile, ...incoming } as UnknownRecord;
    const localHealth = (profile as unknown as UnknownRecord).health;
    const importedHealth = (incoming as unknown as UnknownRecord).health;
    if (localHealth !== undefined || importedHealth !== undefined) {
      merged.health = mergeNestedValue(localHealth, importedHealth);
    }
    for (const key of new Set([...Object.keys(profile), ...Object.keys(incoming)])) {
      const localValue = (profile as unknown as UnknownRecord)[key];
      const importedValue = (incoming as unknown as UnknownRecord)[key];
      if (Array.isArray(localValue) && Array.isArray(importedValue)) {
        // Newest wins for keyed records; ties keep local data. Primitive arrays
        // (such as date-key lists) are unioned without inventing record IDs.
        merged[key] = mergeRecordArrays(localValue, importedValue);
      }
    }
    return merged as unknown as Profile;
  });
  // Anything left in importedById never matched a current profile ID, so it
  // was appended as a new profile rather than merged into an existing one.
  const appended = [...importedById.values()];
  return {
    profiles: [...profiles, ...appended],
    // If an existing profile was matched and merged in place, its own records
    // just changed, so staying on it is correct. If nothing matched (e.g. the
    // website export's profile ID differs from this device's local profile,
    // which happens whenever they were created independently), every
    // imported profile was appended as new and current.currentProfileId
    // still points at an unaffected profile - switch to the appended one so
    // the merge is actually visible.
    currentProfileId:
      matchedProfileIds.size > 0
        ? current.currentProfileId
        : appended[0]?.id || current.currentProfileId || imported.currentProfileId || '',
  };
}
