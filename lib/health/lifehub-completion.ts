import type {
  DailyChecklistItem,
  FoodEntry,
  HealthEvidenceEvent,
  HealthRoutineEvidence,
  MealType,
  Profile,
  SleepEntry,
  WorkoutRoutine,
  WorkoutSession,
} from '@/lib/types';
import { normalizeSleepDurationMinutes } from '@/lib/health/sleep';
import {
  completeRoutineOccurrenceInProfile,
} from '@/lib/lifehub/completion';
import {
  getRoutineOccurrence,
  isRoutineDueForDate,
} from '@/lib/lifehub/routine-schedule';
import {
  parseLocalDateValue,
  toLocalDateKey,
} from '@/lib/lifehub/date-utils';
import { getHealthTargetFromLinkedContext } from '@/lib/lifehub/linked-context';

export type TrackedMeal = Exclude<MealType, 'snack'>;

export type HealthEvidenceApplication = {
  profile: Profile;
  completedRoutineIds: string[];
};

const TRACKED_MEALS: readonly TrackedMeal[] = [
  'breakfast',
  'lunch',
  'dinner',
];

function isTrackedMeal(value: unknown): value is TrackedMeal {
  return TRACKED_MEALS.includes(value as TrackedMeal);
}

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function isSameLocalDate(
  value: Date | string | number | null | undefined,
  date: Date,
): boolean {
  return Boolean(
    isValidDate(date) &&
      parseLocalDateValue(value) &&
      toLocalDateKey(value) === toLocalDateKey(date),
  );
}

/** Pure predicate for the explicit current-day completed-session boundary. */
export function qualifiesCompletedWorkoutSession(
  session: Pick<WorkoutSession, 'status' | 'completedAt'> | null | undefined,
  currentDate: Date,
): boolean {
  const completedAt = parseLocalDateValue(session?.completedAt);
  return Boolean(
    session?.status === 'completed' &&
      completedAt &&
      isSameLocalDate(completedAt, currentDate),
  );
}

/**
 * Resolves the stable custom-routine identity carried by a session. The
 * source identity is canonical when present; routineId remains the legacy
 * fallback for older sessions.
 */
export function sessionMatchesCustomWorkoutRoutine(
  session: Pick<WorkoutSession, 'routineId' | 'sourceRoutineId'> | null | undefined,
  routine: Pick<WorkoutRoutine, 'id' | 'source'> | null | undefined,
): boolean {
  if (!session || !routine || routine.source !== 'custom') return false;
  const sourceRoutineId = typeof session.sourceRoutineId === 'string'
    ? session.sourceRoutineId.trim()
    : '';
  const routineId = typeof session.routineId === 'string'
    ? session.routineId.trim()
    : '';
  const sessionRoutineId = sourceRoutineId || routineId;
  return Boolean(sessionRoutineId) && sessionRoutineId === routine.id;
}

/** Pure predicate for a completed stretch snapshot in a completed session. */
export function hasCompletedStretchEvidence(
  session: Pick<WorkoutSession, 'status' | 'exercises'> | null | undefined,
): boolean {
  return Boolean(
    session?.status === 'completed' &&
      Array.isArray(session.exercises) &&
      session.exercises.some(exercise => exercise.kind === 'stretch' && exercise.status === 'completed'),
  );
}

/**
 * Returns a meal only when the saved input explicitly carried its meal
 * classification. Legacy records remain readable but are not evidence.
 */
export function getTrustedExplicitMealType(
  entry: Pick<FoodEntry, 'mealType' | 'mealTypeSource'> | null | undefined,
): MealType | undefined {
  if (entry?.mealTypeSource !== 'explicit') return undefined;
  return entry.mealType === 'breakfast' ||
    entry.mealType === 'lunch' ||
    entry.mealType === 'dinner' ||
    entry.mealType === 'snack'
    ? entry.mealType
    : undefined;
}

/** Pure predicate for the approved current-day SleepEntry evidence. */
export function isQualifyingSleepEvidence(
  entry: Pick<SleepEntry, 'date' | 'sleepDurationMinutes' | 'hours'> | null | undefined,
  currentDate: Date,
): boolean {
  return Boolean(
    entry &&
      isSameLocalDate(entry.date, currentDate) &&
      normalizeSleepDurationMinutes(entry) > 0,
  );
}

/** Pure current-day lookup for trusted Breakfast/Lunch/Dinner evidence. */
export function getTodaysTrustedMealEvidence(
  entries: Array<Pick<FoodEntry, 'date' | 'mealType' | 'mealTypeSource'>>,
  currentDate: Date,
): Set<TrackedMeal> {
  const meals = new Set<TrackedMeal>();
  for (const entry of entries) {
    const meal = getTrustedExplicitMealType(entry);
    if (isTrackedMeal(meal) && isSameLocalDate(entry.date, currentDate)) {
      meals.add(meal);
    }
  }
  return meals;
}

export function hasCompleteMealEvidenceToday(
  entries: Array<Pick<FoodEntry, 'date' | 'mealType' | 'mealTypeSource'>>,
  currentDate: Date,
): boolean {
  return getTodaysTrustedMealEvidence(entries, currentDate).size === TRACKED_MEALS.length;
}

function matchesEvidence(
  routine: DailyChecklistItem,
  event: HealthEvidenceEvent,
  profile: Profile,
  today: Date,
): boolean {
  const evidence: HealthRoutineEvidence | undefined = routine.healthRoutineEvidence;
  if (!evidence) return false;

  if (event.kind === 'sleep') {
    return evidence.mode === 'sleep-tracked' &&
      isQualifyingSleepEvidence(event.entry, today);
  }

  if (event.kind === 'food') {
    const meal = getTrustedExplicitMealType(event.entry);
    if (!meal || !isSameLocalDate(event.entry.date, today)) return false;
    if (evidence.mode === 'meal-tracked') return evidence.meal === meal;
    return evidence.mode === 'meals-complete' &&
      hasCompleteMealEvidenceToday(profile.health?.foodEntries || [], today);
  }

  if (event.kind === 'weight') {
    return evidence.mode === 'weight-logged' && isSameLocalDate(event.entry.date, today);
  }

  if (event.kind === 'fasting') {
    return evidence.mode === 'fast-completed' && Boolean(event.session.endedAt) && isSameLocalDate(event.session.endedAt, today);
  }

  if (event.kind === 'water') {
    const target = Number(profile.health?.targetWaterMl);
    if (evidence.mode !== 'water-target-reached' || !Number.isFinite(target) || target <= 0 || event.previousTotalMl >= target || !isSameLocalDate(event.date, today)) return false;
    const total = (profile.health?.waterEntries || [])
      .filter(entry => isSameLocalDate(entry.date, today))
      .reduce((sum, entry) => sum + (Number(entry.amountMl) || 0), 0);
    return total >= target;
  }

  if (!qualifiesCompletedWorkoutSession(event.session, today)) return false;
  if (evidence.mode === 'workout-completed') {
    return evidence.scope === 'any' || (
      evidence.scope === 'linked-workout-routine' &&
      matchesLinkedCustomWorkoutRoutine(routine, event.session, profile)
    );
  }
  if (evidence.mode !== 'stretch-completed' || !hasCompletedStretchEvidence(event.session)) return false;
  return evidence.scope === 'any' || (
    evidence.scope === 'linked-workout-routine' &&
    matchesLinkedCustomWorkoutRoutine(routine, event.session, profile)
  );
}

function matchesLinkedCustomWorkoutRoutine(
  routine: DailyChecklistItem,
  session: Pick<WorkoutSession, 'routineId' | 'sourceRoutineId'>,
  profile: Profile,
): boolean {
  const target = getHealthTargetFromLinkedContext(routine.linkedContext);
  if (target?.type !== 'workout-routine') return false;
  const linkedRoutine = (profile.health?.workoutRoutines || []).find(item => item.id === target.entityId);
  return sessionMatchesCustomWorkoutRoutine(session, linkedRoutine);
}

/**
 * Applies one explicit Health evidence event to eligible Life Hub Routines.
 * This is a pure profile transformation; the caller owns persistence and
 * feedback. Workout and stretch events are accepted only at the explicit
 * completed-session boundary supplied by the caller.
 */
export function applyHealthEvidenceToProfile(
  profile: Profile,
  event: HealthEvidenceEvent,
  completedAt = new Date(),
): HealthEvidenceApplication {
  if (!isValidDate(completedAt)) {
    return { profile, completedRoutineIds: [] };
  }

  const matchingRoutines = (profile.dailyChecklistItems || []).filter(routine =>
    matchesEvidence(routine, event, profile, completedAt),
  );

  let nextProfile = profile;
  const completedRoutineIds: string[] = [];
  for (const routine of matchingRoutines) {
    if (routine.active === false || !isRoutineDueForDate(routine, completedAt)) continue;
    if (getRoutineOccurrence(routine, completedAt)?.status === 'skipped') continue;

    const result = completeRoutineOccurrenceInProfile(
      nextProfile,
      routine.id,
      completedAt,
      completedAt,
      { requireDue: true },
    );
    if (result.status === 'applied') {
      nextProfile = result.profile;
      completedRoutineIds.push(routine.id);
    }
  }

  return { profile: nextProfile, completedRoutineIds };
}
