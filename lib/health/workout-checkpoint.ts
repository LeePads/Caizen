import type { WorkoutRunnerState } from './workout-runner';

const CHECKPOINT_PREFIX = 'caizen-workout-active-v1:';

export function getWorkoutCheckpointKey(profileId: string) {
  return `${CHECKPOINT_PREFIX}${profileId}`;
}

export function readWorkoutCheckpoint(profileId: string): WorkoutRunnerState | null {
  if (typeof window === 'undefined' || !profileId.trim()) return null;
  try {
    const raw = window.localStorage.getItem(getWorkoutCheckpointKey(profileId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WorkoutRunnerState;
    const reject = () => {
      window.localStorage.removeItem(getWorkoutCheckpointKey(profileId));
      return null;
    };
    const routineItems = parsed?.routine?.items;
    const routineExerciseIds = new Set(Array.isArray(routineItems) ? routineItems.map(item => item?.exerciseId).filter(id => typeof id === 'string') : []);
    if (
      !parsed
      || typeof parsed !== 'object'
      || !parsed.routine?.id
      || !Array.isArray(routineItems)
      || routineItems.length === 0
      || !Array.isArray(parsed.slots)
      || parsed.slots.length === 0
      || !['READY', 'WORK', 'REST', 'PAUSED', 'COMPLETE'].includes(parsed.phase)
      || !Number.isInteger(parsed.currentSlotIndex)
      || parsed.currentSlotIndex < 0
      || parsed.currentSlotIndex >= parsed.slots.length
      || !Number.isFinite(parsed.startedAt)
      || (parsed.phaseBeforePause !== undefined && !['WORK', 'REST'].includes(parsed.phaseBeforePause))
      || (parsed.phaseDeadlineAt !== undefined && !Number.isFinite(parsed.phaseDeadlineAt))
      || (parsed.phaseRemainingSeconds !== undefined && (!Number.isFinite(parsed.phaseRemainingSeconds) || parsed.phaseRemainingSeconds < 0))
      || (parsed.lastActiveAt !== undefined && !Number.isFinite(parsed.lastActiveAt))
      || !Number.isInteger(parsed.sequence)
      || !parsed.slots.every(slot => (
        slot
        && typeof slot.id === 'string'
        && typeof slot.exerciseId === 'string'
        && routineExerciseIds.has(slot.exerciseId)
        && typeof slot.exerciseName === 'string'
        && ['exercise', 'stretch'].includes(slot.kind)
        && ['timed', 'reps', 'hold', 'manual'].includes(slot.targetMode)
        && Number.isInteger(slot.setIndex)
        && slot.setIndex >= 0
        && Number.isInteger(slot.roundIndex)
        && slot.roundIndex >= 0
        && Number.isFinite(slot.restSeconds)
        && slot.restSeconds >= 0
        && ['pending', 'completed', 'skipped'].includes(slot.status)
      ))
    ) return reject();
    return parsed;
  } catch {
    try {
      window.localStorage.removeItem(getWorkoutCheckpointKey(profileId));
    } catch {
      // Ignore unavailable storage while rejecting malformed recovery data.
    }
    return null;
  }
}

export function writeWorkoutCheckpoint(profileId: string, state: WorkoutRunnerState) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(getWorkoutCheckpointKey(profileId), JSON.stringify(state));
  } catch {
    // Recovery is best effort and must never block the workout UI.
  }
}

export function clearWorkoutCheckpoint(profileId: string) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(getWorkoutCheckpointKey(profileId));
  } catch {
    // Ignore unavailable storage (private browsing or embedded WebView policy).
  }
}
