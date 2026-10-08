'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, ChevronLeft, CircleStop, Film, Image as ImageIcon, Minus, Pause, Play, Plus, SkipForward, Volume2, VolumeX } from 'lucide-react';
import type { WorkoutExerciseDefinition, WorkoutAnimationPreference, WorkoutLoadMode, WorkoutSession } from '@/lib/types';
import { deriveWorkoutExerciseCategory, inferWorkoutLoadMode, WORKOUT_EXERCISE_CATEGORY_LABELS } from '@/lib/health/workout-taxonomy';
import {
  buildWorkoutSession,
  completeCurrentWorkoutSlot,
  getRemainingSeconds,
  hasMeaningfulWorkoutProgress,
  pauseWorkout,
  previousWorkoutSlot,
  resumeWorkout,
  skipWorkoutRest,
  skipWorkoutSlot,
  startWorkout,
  tickWorkout,
  type WorkoutRunnerSlotActualData,
  type WorkoutRunnerState,
} from '@/lib/health/workout-runner';
import { clearWorkoutCheckpoint, writeWorkoutCheckpoint } from '@/lib/health/workout-checkpoint';
import { playWorkoutSound, unlockWorkoutSound } from '@/lib/health/workout-sound';
import { resolveRemoteExerciseAnimation } from '@/lib/health/exercise-media-provider';
import { getPreviousSetPerformance, getRecentCompletedExerciseSessions, getSessionHighlights } from '@/lib/health/workout-history';
import { deriveExercisePerformance, getSessionNextRepTargets, getSessionPersonalRecordHighlights, getSessionProgressionHighlights } from '@/lib/health/workout-performance';
import { scheduleRestOverNotification, cancelRestOverNotification } from '@/lib/health/workout-rest-notification';
import { formatExerciseDisplayName, formatWorkoutExerciseName } from '@/lib/health/workout-taxonomy';
import WorkoutReferenceMedia from './WorkoutReferenceMedia';
import { HealthOverflowMenu } from './HealthOverflowMenu';
import { getBuiltinWorkoutReferenceImage } from '@/lib/health/workout-media';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useOverlayLifecycle } from '@/hooks/use-overlay-lifecycle';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

type WorkoutRunnerProps = {
  profileId: string;
  androidPresentation?: boolean;
  initialState: WorkoutRunnerState;
  exercises: WorkoutExerciseDefinition[];
  sessions: WorkoutSession[];
  onSave: (session: ReturnType<typeof buildWorkoutSession>) => void;
  onDiscard: () => void;
  onLeave: () => void;
  onReviewHistory?: () => void;
};

const primaryButtonClass = 'workout-primary-action w-full';
const secondaryButtonClass = 'workout-secondary-action';
const workoutSoundPreferenceKey = 'caizen-workout-sound-enabled-v1';
const workoutAnimationPreferenceKey = 'caizen-workout-animation-v1';

const ANIMATION_PREFERENCE_CYCLE: WorkoutAnimationPreference[] = ['full', 'compact', 'off'];

function readAnimationPreference(): WorkoutAnimationPreference {
  if (typeof window === 'undefined') return 'full';
  try {
    const stored = window.localStorage.getItem(workoutAnimationPreferenceKey);
    return stored === 'compact' || stored === 'off' ? stored : 'full';
  } catch {
    return 'full';
  }
}

/** Weight is only asked for when the exercise isn't purely bodyweight — never fabricated from an exercise-level flag that doesn't exist. */
type SetInputs = { reps?: string; repsLeft?: string; repsRight?: string; weight?: string; effort?: string; effortScale?: 'rir' | 'rpe' };

const parseSetInputNumber = (raw?: string): number | undefined => {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : undefined;
};

const formatSeconds = (value: number) => {
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

function SetStepperField({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  step?: number;
}) {
  const adjust = (delta: number) => {
    const base = Number(value);
    const next = Math.max(0, (Number.isFinite(base) ? base : 0) + delta);
    onChange(String(next));
  };
  return (
    <div className="workout-stepper">
      <span className="workout-field-label">{label}</span>
      <div className="workout-stepper-controls" role="group" aria-label={`${label} adjustment`}>
        <Button type="button" variant="ghost" size="icon-lg" onClick={() => adjust(-step)} aria-label={`Decrease ${label}`}><Minus aria-hidden="true" /></Button>
        <input type="number" inputMode="decimal" className="workout-stepper-input" value={value} onChange={event => onChange(event.target.value)} aria-label={label} />
        <Button type="button" variant="ghost" size="icon-lg" onClick={() => adjust(step)} aria-label={`Increase ${label}`}><Plus aria-hidden="true" /></Button>
      </div>
    </div>
  );
}

const slotTargetLabel = (slot?: WorkoutRunnerState['slots'][number]) => {
  if (!slot) return '';
  if (slot.targetMode === 'reps') return `${slot.reps || 0} reps`;
  if (slot.targetMode === 'manual') return 'Complete when ready';
  return `${slot.durationSeconds || 0} sec${slot.targetMode === 'hold' ? ' hold' : ''}`;
};

/** Target display combined with weight, when relevant — e.g. "40 × 10" vs "10 reps". Display-only; never fabricates a unit the data model doesn't store. */
const targetDisplayText = (slot: WorkoutRunnerState['slots'][number] | undefined, weightRelevant: boolean): string => {
  if (!slot) return '';
  if (slot.targetMode === 'reps') {
    const reps = slot.reps || 0;
    return weightRelevant && slot.targetWeight !== undefined ? `${slot.targetWeight} × ${reps}` : `${reps} reps`;
  }
  if (slot.targetMode === 'manual') return 'Complete when ready';
  return `${formatSeconds(slot.durationSeconds || 0)}${slot.targetMode === 'hold' ? ' hold' : ''}`;
};

const loadLabel = (mode?: WorkoutLoadMode) => mode === 'assistance'
  ? 'Assistance'
  : mode === 'bodyweight-plus'
    ? 'Added load'
    : 'Load';

const modeAwareTargetDisplayText = (slot: WorkoutRunnerState['slots'][number] | undefined, mode?: WorkoutLoadMode): string => {
  if (!slot || slot.targetMode !== 'reps' || slot.targetWeight === undefined) return targetDisplayText(slot, mode !== undefined && mode !== 'none');
  if (mode === 'none') return `${slot.reps || 0} reps`;
  const prefix = mode === 'assistance' ? 'Assist ' : mode === 'bodyweight-plus' ? 'Added load ' : '';
  return `${prefix}${slot.targetWeight} × ${slot.reps || 0}`;
};

/** Same shape as targetDisplayText, but for the most recent completed session's actuals. Null when there's nothing meaningful to show. */
const previousDisplayText = (
  previous: { loadMode?: WorkoutLoadMode; actualReps?: number; actualRepsLeft?: number; actualRepsRight?: number; actualWeight?: number; actualWeightLeft?: number; actualWeightRight?: number; actualDurationSeconds?: number } | undefined,
  slot: WorkoutRunnerState['slots'][number] | undefined,
  mode?: WorkoutLoadMode,
): string | null => {
  if (!previous || !slot) return null;
  if (slot.targetMode === 'reps') {
    const previousMode = previous.loadMode ?? mode;
    const hasSideData = previous.actualRepsLeft !== undefined || previous.actualRepsRight !== undefined || previous.actualWeightLeft !== undefined || previous.actualWeightRight !== undefined;
    if (hasSideData) {
      const sideValue = (side: 'left' | 'right') => {
        const reps = side === 'left' ? previous.actualRepsLeft : previous.actualRepsRight;
        const weight = side === 'left' ? previous.actualWeightLeft : previous.actualWeightRight;
        if (reps === undefined && weight === undefined) return `${side === 'left' ? 'L' : 'R'} —`;
        const prefix = previousMode === 'assistance' ? 'Assist ' : previousMode === 'bodyweight-plus' ? 'Added ' : '';
        const value = weight !== undefined && previousMode !== 'none' ? `${prefix}${weight} × ${reps ?? '—'}` : `${reps ?? '—'} reps`;
        return `${side === 'left' ? 'L' : 'R'} ${value}`;
      };
      return `${sideValue('left')} · ${sideValue('right')}`;
    }
    if (previous.actualReps === undefined && previous.actualWeight === undefined) return null;
    if (previous.actualWeight !== undefined && previousMode === 'assistance') return `Assist ${previous.actualWeight} × ${previous.actualReps ?? '—'}`;
    if (previous.actualWeight !== undefined && previousMode === 'bodyweight-plus') return `Added load ${previous.actualWeight} × ${previous.actualReps ?? '—'}`;
    return previous.actualWeight !== undefined && previousMode !== 'none' ? `${previous.actualWeight} × ${previous.actualReps ?? '—'}` : `${previous.actualReps} reps`;
  }
  if (slot.targetMode === 'timed' || slot.targetMode === 'hold') {
    return previous.actualDurationSeconds !== undefined ? formatSeconds(previous.actualDurationSeconds) : null;
  }
  return null;
};

export default function WorkoutRunner({ profileId, androidPresentation = false, initialState, exercises, sessions, onSave, onDiscard, onLeave, onReviewHistory }: WorkoutRunnerProps) {
  const [state, setState] = useState<WorkoutRunnerState>(() => ({
    ...initialState,
    slots: initialState.slots.map(slot => {
      const exercise = exercises.find(item => item.id === slot.exerciseId);
      return { ...slot, loadMode: slot.loadMode ?? exercise?.loadMode ?? inferWorkoutLoadMode(exercise?.equipment, exercise?.name) };
    }),
  }));
  const [now, setNow] = useState(() => Date.now());
  const [showEndActions, setShowEndActions] = useState(false);
  const [showLeaveActions, setShowLeaveActions] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    if (typeof window === 'undefined') return true;
    try {
      return window.localStorage.getItem(workoutSoundPreferenceKey) !== 'false';
    } catch {
      return true;
    }
  });
  const [animationPreference, setAnimationPreference] = useState<WorkoutAnimationPreference>(readAnimationPreference);
  const [animationUrls, setAnimationUrls] = useState<Record<string, string | null>>({});
  const [setInputs, setSetInputs] = useState<Record<string, SetInputs>>({});
  const activeControlRef = useRef<HTMLButtonElement>(null);
  const endContinueButtonRef = useRef<HTMLButtonElement>(null);
  const leaveContinueButtonRef = useRef<HTMLButtonElement>(null);
  const runnerRef = useRef<HTMLElement>(null);
  const summaryHeadingRef = useRef<HTMLHeadingElement>(null);
  const previousPhaseRef = useRef(state.phase);
  const previousSlotIndexRef = useRef(state.currentSlotIndex);
  const previousStateRef = useRef(state);
  const lastCountdownCueRef = useRef<string | null>(null);

  const slot = state.slots[state.currentSlotIndex];
  const currentExercise = exercises.find(exercise => exercise.id === slot?.exerciseId);
  const exerciseLoadModes = useMemo(() => new Map(exercises.flatMap(exercise => {
    const mode = exercise.loadMode ?? inferWorkoutLoadMode(exercise.equipment, exercise.name);
    return mode ? [[exercise.id, mode] as const] : [];
  })), [exercises]);
  const resolveExerciseLoadMode = useCallback((exerciseId: string) => exerciseLoadModes.get(exerciseId), [exerciseLoadModes]);
  const remaining = state.phase === 'PAUSED'
    ? state.phaseRemainingSeconds ?? null
    : getRemainingSeconds(state, now);
  const completedSlotCount = state.slots.filter(item => item.status === 'completed').length;
  const skippedSlotCount = state.slots.filter(item => item.status === 'skipped').length;
  const progress = state.slots.length ? Math.round((completedSlotCount / state.slots.length) * 100) : 0;
  const currentRoutineItemIndex = slot
    ? state.routine.items.findIndex(item => slot.id.endsWith(`:${item.id}`))
    : -1;
  const currentRoutineItem = currentRoutineItemIndex >= 0 ? state.routine.items[currentRoutineItemIndex] : undefined;
  const currentItemSlots = currentRoutineItem && slot
    ? state.slots.filter(item => item.roundIndex === slot.roundIndex && item.id.endsWith(`:${currentRoutineItem.id}`))
    : [];
  const currentExerciseNumber = currentRoutineItemIndex >= 0 ? currentRoutineItemIndex + 1 : 1;
  const exerciseCount = state.routine.items.length || 1;
  const totalSets = currentItemSlots.length || 1;
  const totalRounds = Math.max(1, Number(state.routine.rounds) || 1);
  const previousSlot = state.slots[state.currentSlotIndex - 1];
  const nextSlot = state.slots[state.currentSlotIndex + 1];
  const previewSlot = state.phase === 'REST' ? slot : nextSlot;
  const previewExercise = exercises.find(exercise => exercise.id === previewSlot?.exerciseId);
  const activeSetNumber = Math.max(1, (slot?.setIndex ?? 0) + 1);
  const heroStaticImageSrc = currentExercise?.source === 'builtin' && !currentExercise.catalogSource ? getBuiltinWorkoutReferenceImage(currentExercise.id) : undefined;
  // Still images remain available when animation playback is turned off.
  const currentAnimationUrl = currentExercise?.catalogMediaId ? animationUrls[currentExercise.catalogMediaId] : undefined;
  const hasHeroPhoto = Boolean(currentExercise?.referencePhotoAssetId || heroStaticImageSrc)
    || Boolean(animationPreference !== 'off' && currentAnimationUrl);
  const unilateral = currentExercise?.sideMode === 'left-right';
  const currentLoadMode = slot?.loadMode ?? currentExercise?.loadMode ?? inferWorkoutLoadMode(currentExercise?.equipment, currentExercise?.name);
  const weightRelevant = currentLoadMode !== undefined && currentLoadMode !== 'none';
  // Display-only: getPreviousSetPerformance already returns actualDurationSeconds
  // regardless of target mode, so showing it for timed/hold slots here is just
  // reading more of what the existing helper already provides — the prefill
  // behavior itself (which only ever applies to reps inputs) is unchanged.
  const previousSetPerformance = useMemo(
    () => (slot && slot.targetMode !== 'manual' ? getPreviousSetPerformance(slot.exerciseId, sessions).get(slot.setIndex) : undefined),
    [slot, sessions],
  );
  const recentExerciseHistory = useMemo(
    () => currentExercise ? getRecentCompletedExerciseSessions(currentExercise.id, sessions, 2) : [],
    [currentExercise, sessions],
  );
  const currentExercisePerformance = useMemo(
    () => currentExercise ? deriveExercisePerformance(currentExercise.id, sessions, resolveExerciseLoadMode) : null,
    [currentExercise, sessions, resolveExerciseLoadMode],
  );
  const currentSetInputs = slot ? setInputs[slot.id] : undefined;
  const completionSession = useMemo(
    () => (state.phase === 'COMPLETE' ? buildWorkoutSession(state, state.slots.every(item => item.status === 'completed') ? 'completed' : 'partial', now) : null),
    [now, state],
  );
  const sessionHighlights = useMemo(() => (completionSession ? getSessionHighlights(completionSession) : []), [completionSession]);
  const progressionHighlights = useMemo(
    () => completionSession ? getSessionProgressionHighlights(completionSession, sessions, resolveExerciseLoadMode) : [],
    [completionSession, sessions, resolveExerciseLoadMode],
  );
  const personalRecordHighlights = useMemo(
    () => completionSession ? getSessionPersonalRecordHighlights(completionSession, sessions, resolveExerciseLoadMode) : [],
    [completionSession, sessions, resolveExerciseLoadMode],
  );
  const nextRepTargets = useMemo(() => completionSession ? getSessionNextRepTargets(completionSession) : [], [completionSession]);
  const nestedOverlayOpen = showEndActions || showLeaveActions || settingsOpen;
  useOverlayLifecycle(!nestedOverlayOpen, () => undefined, {
    containerRef: runnerRef,
    lockScroll: false,
    autoFocus: false,
    restoreFocus: false,
  });
  const phaseAnnouncement = state.phase === 'COMPLETE'
    ? 'Workout finished. Review your summary.'
    : state.phase === 'REST'
      ? `Rest. ${slot?.exerciseName ? formatWorkoutExerciseName(slot.exerciseName, slot.exerciseId) : 'Next set'} is up next.`
      : state.phase === 'PAUSED'
        ? `Workout paused during ${state.phaseBeforePause === 'REST' ? 'rest' : 'work'}.`
        : state.phase === 'READY'
          ? 'Workout ready to start.'
          : `${slot?.exerciseName ? formatWorkoutExerciseName(slot.exerciseName, slot.exerciseId) : 'Exercise'}, set ${activeSetNumber} of ${totalSets}.`;

  useEffect(() => {
    if (state.phase === 'COMPLETE') return;
    writeWorkoutCheckpoint(profileId, state);
  }, [profileId, state]);

  useEffect(() => {
    const onVisibility = () => {
      setNow(Date.now());
      if (document.visibilityState === 'hidden' && state.phase !== 'COMPLETE') writeWorkoutCheckpoint(profileId, state);
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onVisibility);
    };
  }, [profileId, state]);

  useEffect(() => {
    if (state.phase !== 'WORK' && state.phase !== 'REST') return;
    const timer = window.setInterval(() => {
      const currentNow = Date.now();
      setNow(currentNow);
      const transition = tickWorkout(state, currentNow);
      if (transition.state !== state) setState(transition.state);
    }, 500);
    return () => window.clearInterval(timer);
  }, [state]);

  useEffect(() => {
    if (nestedOverlayOpen || typeof window === 'undefined' || !window.matchMedia?.('(min-width: 1024px)').matches) return;
    if (state.phase === 'COMPLETE') summaryHeadingRef.current?.focus({ preventScroll: true });
    else activeControlRef.current?.focus({ preventScroll: true });
    // Only move focus when the active workout position or phase changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.currentSlotIndex, state.phase]);

  useEffect(() => {
    try {
      window.localStorage.setItem(workoutSoundPreferenceKey, String(soundEnabled));
    } catch {
      // A blocked preference store should not disable the timer or its controls.
    }
  }, [soundEnabled]);

  useEffect(() => {
    try {
      window.localStorage.setItem(workoutAnimationPreferenceKey, animationPreference);
    } catch {
      // Device-local presentation preference only; never block the runner on it.
    }
  }, [animationPreference]);

  // Resolves the current exercise's animation, and prefetches the next
  // different exercise's animation. Never preloads the whole routine/catalog.
  useEffect(() => {
    if (animationPreference === 'off') return undefined;
    const mediaIds = new Set<string>();
    if (currentExercise?.catalogMediaId) mediaIds.add(currentExercise.catalogMediaId);
    const upcomingExercise = nextSlot && nextSlot.exerciseId !== slot?.exerciseId
      ? exercises.find(exercise => exercise.id === nextSlot.exerciseId)
      : undefined;
    if (upcomingExercise?.catalogMediaId) mediaIds.add(upcomingExercise.catalogMediaId);
    const pending = [...mediaIds].filter(mediaId => !(mediaId in animationUrls));
    if (!pending.length) return undefined;
    let cancelled = false;
    void Promise.all(pending.map(async mediaId => {
      const exercise = currentExercise?.catalogMediaId === mediaId ? currentExercise : upcomingExercise;
      const url = await resolveRemoteExerciseAnimation(exercise);
      return [mediaId, url] as const;
    })).then(resolved => {
      if (cancelled) return;
      setAnimationUrls(current => {
        const next = { ...current };
        resolved.forEach(([mediaId, url]) => { next[mediaId] = url; });
        return next;
      });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animationPreference, currentExercise?.catalogMediaId, nextSlot?.exerciseId]);

  // Keeps the screen awake only while the workout is actively in progress.
  useEffect(() => {
    const active = state.phase === 'WORK' || state.phase === 'REST' || state.phase === 'PAUSED';
    if (!active || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return undefined;
    type ScreenWakeLock = { release: () => Promise<void>; addEventListener: (type: 'release', listener: () => void) => void };
    let sentinel: ScreenWakeLock | null = null;
    let disposed = false;
    let requestPending = false;
    const acquire = async () => {
      if (disposed || requestPending || sentinel || document.visibilityState !== 'visible') return;
      requestPending = true;
      let requested: ScreenWakeLock | null = null;
      try {
        requested = await (navigator as Navigator & { wakeLock: { request: (type: 'screen') => Promise<ScreenWakeLock> } }).wakeLock.request('screen');
      } catch {
        // Unsupported/denied wake lock must never affect the workout itself.
      } finally {
        requestPending = false;
      }
      if (!requested) return;
      if (disposed || document.visibilityState !== 'visible') {
        void requested.release().catch(() => undefined);
        return;
      }
      sentinel = requested;
      requested.addEventListener('release', () => {
        if (sentinel === requested) sentinel = null;
        if (!disposed && document.visibilityState === 'visible') void acquire();
      });
    };
    void acquire();
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !sentinel && !disposed) void acquire();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release().catch(() => undefined);
      sentinel = null;
    };
  }, [state.phase]);

  // Background rest-over cue (native only; no-op on web where the in-app timer already covers this).
  useEffect(() => {
    if (state.phase !== 'REST' || state.phaseDeadlineAt === undefined) return undefined;
    void scheduleRestOverNotification(profileId, slot?.exerciseName ? formatWorkoutExerciseName(slot.exerciseName, slot.exerciseId) : '', state.phaseDeadlineAt);
    return () => { void cancelRestOverNotification(profileId); };
  }, [profileId, slot?.exerciseName, state.phase, state.phaseDeadlineAt]);

  // Prefills each set's inputs once, from the most recent completed
  // session's working-set actuals when available, falling back to the
  // routine's planned target. Never re-prefills over a value the user
  // already edited or entered this session.
  useEffect(() => {
    if (state.phase !== 'WORK' || !slot || slot.targetMode !== 'reps') return;
    setSetInputs(current => {
      if (current[slot.id]) return current;
      const previousLoadModeMatches = previousSetPerformance?.loadMode === undefined || previousSetPerformance.loadMode === currentLoadMode;
      const leftLoad = previousSetPerformance?.actualWeightLeft;
      const rightLoad = previousSetPerformance?.actualWeightRight;
      const sharedPreviousSideLoad = !previousLoadModeMatches || (leftLoad !== undefined && rightLoad !== undefined && leftLoad !== rightLoad)
        ? undefined
        : leftLoad ?? rightLoad ?? previousSetPerformance?.actualWeight;
      return {
        ...current,
        [slot.id]: unilateral
          ? {
            repsLeft: String(previousSetPerformance?.actualRepsLeft ?? previousSetPerformance?.actualReps ?? slot.reps ?? ''),
            repsRight: String(previousSetPerformance?.actualRepsRight ?? previousSetPerformance?.actualReps ?? slot.reps ?? ''),
            weight: String(sharedPreviousSideLoad ?? slot.targetWeight ?? ''),
          }
          : {
            reps: String(previousSetPerformance?.actualReps ?? slot.reps ?? ''),
            weight: String((previousLoadModeMatches ? previousSetPerformance?.actualWeight : undefined) ?? slot.targetWeight ?? ''),
          },
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot?.id, state.phase]);

  useEffect(() => {
    const previousState = previousStateRef.current;
    const previousSlot = previousState.slots[previousState.currentSlotIndex];
    const completedTimedSlot = previousState.phase === 'WORK'
      && previousSlot?.status === 'pending'
      && (previousSlot.targetMode === 'timed' || previousSlot.targetMode === 'hold')
      && state.slots[previousState.currentSlotIndex]?.status === 'completed';
    if (soundEnabled && completedTimedSlot) void playWorkoutSound('set-complete');
    previousStateRef.current = state;
  }, [soundEnabled, state]);

  useEffect(() => {
    const phaseChanged = previousPhaseRef.current !== state.phase;
    const slotChanged = previousSlotIndexRef.current !== state.currentSlotIndex;
    if (soundEnabled && (phaseChanged || slotChanged)) {
      if (state.phase === 'COMPLETE') {
        void playWorkoutSound('complete');
      } else if (state.phase === 'WORK' || state.phase === 'REST') {
        void playWorkoutSound(state.phase === 'REST' ? 'rest' : 'work');
      }
    }
    previousPhaseRef.current = state.phase;
    previousSlotIndexRef.current = state.currentSlotIndex;
  }, [soundEnabled, state.currentSlotIndex, state.phase]);

  useEffect(() => {
    if (!soundEnabled || (state.phase !== 'WORK' && state.phase !== 'REST') || remaining === null || remaining < 1 || remaining > 3) return;

    const cueKey = `${state.currentSlotIndex}:${state.phase}:${remaining}`;
    if (lastCountdownCueRef.current === cueKey) return;
    lastCountdownCueRef.current = cueKey;
    void playWorkoutSound('countdown');
  }, [remaining, soundEnabled, state.currentSlotIndex, state.phase]);

  const transition = (next: WorkoutRunnerState) => setState(next);
  const onStart = () => {
    const next = startWorkout(state).state;
    void unlockWorkoutSound().finally(() => transition(next));
  };
  const onPause = () => transition(pauseWorkout(state).state);
  const onResume = () => {
    const next = resumeWorkout(state).state;
    void unlockWorkoutSound().finally(() => transition(next));
  };
  const buildActualData = (): WorkoutRunnerSlotActualData | undefined => {
    if (!slot || slot.targetMode !== 'reps') return undefined;
    const inputs = currentSetInputs;
    if (!inputs) return undefined;
    const data: WorkoutRunnerSlotActualData = unilateral
      ? { actualRepsLeft: parseSetInputNumber(inputs.repsLeft), actualRepsRight: parseSetInputNumber(inputs.repsRight), rir: undefined, rpe: undefined }
      : { actualReps: parseSetInputNumber(inputs.reps), rir: undefined, rpe: undefined };
    if (weightRelevant && unilateral) {
      data.actualWeightLeft = parseSetInputNumber(inputs.weight);
      data.actualWeightRight = parseSetInputNumber(inputs.weight);
    } else if (weightRelevant) data.actualWeight = parseSetInputNumber(inputs.weight);
    const effort = parseSetInputNumber(inputs.effort);
    if (effort !== undefined && Number.isInteger(effort)) {
      const scale = inputs.effortScale || 'rir';
      if (scale === 'rir' && effort >= 0 && effort <= 10) data.rir = effort;
      if (scale === 'rpe' && effort >= 1 && effort <= 10) data.rpe = effort;
    }
    return data;
  };
  const onDone = () => transition(completeCurrentWorkoutSlot(state, Date.now(), buildActualData()).state);
  const onSkip = () => transition(skipWorkoutSlot(state).state);
  const onPrevious = () => transition(previousWorkoutSlot(state).state);
  const onSkipRest = () => transition(skipWorkoutRest(state).state);
  const closeEndActions = () => setShowEndActions(false);
  const requestLeave = () => {
    if (!hasMeaningfulWorkoutProgress(state)) {
      clearWorkoutCheckpoint(profileId);
      onLeave();
      return;
    }
    setShowLeaveActions(true);
  };
  const canSaveCompleted = state.slots.length > 0 && state.slots.every(item => item.status === 'completed');

  const save = (status: 'completed' | 'partial', afterSave?: () => void) => {
    onSave(buildWorkoutSession(state, status));
    clearWorkoutCheckpoint(profileId);
    afterSave?.();
  };

  return (
    <>
      <Dialog open={showEndActions} onOpenChange={setShowEndActions}>
        <DialogContent className="workout-confirm-dialog" showCloseButton={false} allowOutsideDismiss={androidPresentation} onOpenAutoFocus={event => { event.preventDefault(); endContinueButtonRef.current?.focus({ preventScroll: true }); }}>
          <DialogHeader>
            <DialogTitle>End workout?</DialogTitle>
            <DialogDescription>End as incomplete records your current progress in workout history. You can also keep working or discard this workout.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="workout-confirm-actions">
            <Button ref={endContinueButtonRef} type="button" size="lg" onClick={closeEndActions}>Continue workout</Button>
            <Button type="button" variant="secondary" size="lg" onClick={() => save('partial')}>End as incomplete</Button>
            <Button type="button" variant="ghost" size="lg" className="workout-discard-action" onClick={onDiscard}>Discard workout</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showLeaveActions} onOpenChange={setShowLeaveActions}>
        <DialogContent className="workout-confirm-dialog" showCloseButton={false} allowOutsideDismiss={androidPresentation} onOpenAutoFocus={event => { event.preventDefault(); leaveContinueButtonRef.current?.focus({ preventScroll: true }); }}>
          <DialogHeader>
            <DialogTitle>Keep this workout?</DialogTitle>
            <DialogDescription>Your workout is in progress. Keep it to resume later, continue now, or discard it.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="workout-confirm-actions">
            <Button type="button" size="lg" onClick={() => { writeWorkoutCheckpoint(profileId, state); setShowLeaveActions(false); onLeave(); }}>Keep &amp; leave</Button>
            <Button ref={leaveContinueButtonRef} type="button" variant="secondary" size="lg" onClick={() => setShowLeaveActions(false)}>Continue workout</Button>
            <Button type="button" variant="ghost" size="lg" className="workout-discard-action" onClick={() => { clearWorkoutCheckpoint(profileId); setShowLeaveActions(false); onDiscard(); }}>Discard workout</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <section ref={runnerRef} aria-labelledby="workout-runner-title" className="workout-runner flex h-full min-h-0 flex-col">
      <header className="workout-runner-header">
      <div className="workout-header-inner">
          <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon-lg" onClick={requestLeave} aria-label="Back to Workout Today"><ChevronLeft aria-hidden="true" /></Button></TooltipTrigger><TooltipContent>{"Back to Workout Today"}</TooltipContent></Tooltip>
          <h2 id="workout-runner-title" className="workout-routine-name">{state.routine.name}</h2>
        <div className="workout-header-actions">
          <HealthOverflowMenu
            title="Workout settings"
            ariaLabel="Workout settings"
            androidPresentation={androidPresentation}
            onOpenChange={setSettingsOpen}
            triggerClassName="workout-settings-trigger"
            actions={[
              { label: soundEnabled ? 'Sound: On' : 'Sound: Off', icon: soundEnabled ? Volume2 : VolumeX, onSelect: () => setSoundEnabled(current => !current) },
              { label: `Animation: ${animationPreference === 'full' ? 'Full' : animationPreference === 'compact' ? 'Compact' : 'Off'}`, icon: Film, onSelect: () => setAnimationPreference(current => ANIMATION_PREFERENCE_CYCLE[(ANIMATION_PREFERENCE_CYCLE.indexOf(current) + 1) % ANIMATION_PREFERENCE_CYCLE.length]) },
            ]}
          />
          <Button type="button" variant="ghost" size="lg" className="workout-end-button" onClick={() => setShowEndActions(true)} disabled={state.phase === 'COMPLETE'} aria-label="End workout"><CircleStop aria-hidden="true" /><span className="workout-end-short">End</span><span className="workout-end-long">End workout</span></Button>
        </div>
      </div>

      <div className="workout-progress" role="progressbar" aria-label="Workout progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-valuetext={`${completedSlotCount} of ${state.slots.length} sets completed`}>
        <div className="workout-progress-copy">
          <span>{state.phase === 'COMPLETE' ? 'Workout finished' : `Exercise ${currentExerciseNumber} of ${exerciseCount}`}</span>
          <strong>{completedSlotCount} / {state.slots.length} sets <span aria-hidden="true">· {progress}%</span></strong>
        </div>
        <div className="workout-progress-track" aria-hidden="true"><div className="workout-progress-fill" style={{ width: `${progress}%` }} /></div>
      </div>
      </header>

      <div className="workout-runner-scroll">
        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{phaseAnnouncement}</p>
        {state.phase === 'COMPLETE' ? (
          <div className="workout-summary" role="region" aria-label="Workout summary">
            <h3 ref={summaryHeadingRef} tabIndex={-1} className="workout-summary-title">{canSaveCompleted ? 'Workout complete' : 'Workout finished'}</h3>
            {!canSaveCompleted ? <p className="workout-summary-note">Your progress will be saved as incomplete.</p> : null}
            <div className="workout-summary-stats">
              <div><strong>{Math.max(1, Math.round((Date.now() - state.startedAt) / 60000))}</strong><span>Minutes</span></div>
              <div><strong>{completedSlotCount}</strong><span>Sets completed</span></div>
              <div><strong>{skippedSlotCount}</strong><span>Skipped</span></div>
              <div><strong>{exerciseCount}</strong><span>Exercises</span></div>
            </div>
            {sessionHighlights.length ? <div className="workout-summary-highlights"><h4>Session highlights</h4><ul>{sessionHighlights.map(highlight => <li key={highlight.exerciseName + '-' + highlight.detail}><strong>{formatExerciseDisplayName(highlight.exerciseName)}</strong><span>{highlight.detail}</span></li>)}</ul></div> : null}
            {personalRecordHighlights.length ? <div className="workout-summary-highlights"><h4>Personal records</h4><ul>{personalRecordHighlights.map((highlight, index) => <li key={`${highlight.exerciseName}-${highlight.detail}-${index}`}><strong>{formatExerciseDisplayName(highlight.exerciseName)}</strong><span>{highlight.detail}</span></li>)}</ul></div> : null}
            {progressionHighlights.length ? <div className="workout-summary-highlights"><h4>Compared with last time</h4><ul>{progressionHighlights.map((highlight, index) => <li key={`${highlight.exerciseName}-${index}`}><strong>{formatExerciseDisplayName(highlight.exerciseName)}</strong><span>{highlight.detail}</span></li>)}</ul></div> : null}
            {nextRepTargets.length ? <div className="workout-summary-highlights"><h4>Next target</h4><ul>{nextRepTargets.map((target, index) => <li key={`${target.exerciseName}-${index}`}><strong>{formatExerciseDisplayName(target.exerciseName)}</strong><span>{target.detail}</span></li>)}</ul></div> : null}
            <div className="workout-summary-actions">
              <Button type="button" size="lg" className={primaryButtonClass} onClick={() => save(canSaveCompleted ? 'completed' : 'partial')}><Check aria-hidden="true" />Done for today</Button>
              <Button type="button" variant="secondary" size="lg" onClick={() => save(canSaveCompleted ? 'completed' : 'partial', onReviewHistory)}>Review history</Button>
            </div>
          </div>
        ) : (
          <div className={['workout-cockpit', animationPreference === 'off' && !hasHeroPhoto ? 'workout-cockpit--no-media' : ''].join(' ')}>
            <div className="workout-exercise-heading">
              <h3>{slot?.exerciseName ? formatWorkoutExerciseName(slot.exerciseName, slot.exerciseId) : 'Exercise'}</h3>
              <div className="workout-exercise-meta">
                {currentExercise ? <span>{WORKOUT_EXERCISE_CATEGORY_LABELS[deriveWorkoutExerciseCategory(currentExercise)]} · {currentExercise.category}</span> : null}
                <span>Set {activeSetNumber} of {totalSets}</span>
                {totalRounds > 1 ? <span>Round {(slot?.roundIndex ?? 0) + 1} of {totalRounds}</span> : null}
                {slot?.warmup ? <span className="workout-warmup">Warm-up</span> : null}
                {slot?.supersetGroupId ? <span>Superset</span> : null}
              </div>
            </div>
            {hasHeroPhoto || animationPreference !== 'off' ? <div className={['workout-media-stage', animationPreference === 'compact' ? 'workout-media-stage--compact' : '', !hasHeroPhoto ? 'workout-media-stage--empty' : ''].join(' ')} aria-label="Exercise demonstration"><div className="workout-media-inner">
              {hasHeroPhoto ? <WorkoutReferenceMedia variant="hero" fit="contain" profileId={profileId} exerciseName={slot?.exerciseName ? formatWorkoutExerciseName(slot.exerciseName, slot.exerciseId) : 'Exercise'} referencePhotoAssetId={currentExercise?.referencePhotoAssetId} staticImageSrc={heroStaticImageSrc} animationUrl={animationPreference === 'off' ? undefined : currentAnimationUrl} className="h-full w-full" /> : <div className="workout-media-empty"><ImageIcon aria-hidden="true" /><span>Exercise image unavailable</span></div>}
            </div></div> : null}
            <div className="workout-interaction">
              <div className="workout-set-surface">
                {state.phase === 'REST' || state.phase === 'PAUSED' ? <div className="workout-phase-display">
                  <h4>{state.phase === 'REST' ? 'Rest' : 'Paused'}</h4>
                  {remaining !== null ? <p className="workout-countdown" role="timer" aria-live="off" aria-label={remaining + ' seconds remaining'}>{formatSeconds(remaining)}</p> : null}
                  <p>{state.phase === 'REST' ? 'Next set: ' + (slot?.exerciseName ? formatWorkoutExerciseName(slot.exerciseName, slot.exerciseId) : 'workout complete') : state.phaseBeforePause === 'REST' ? 'Rest timer paused' : 'Set paused'}</p>
                  {state.phase === 'REST' && previousSlot?.exerciseName ? <p className="workout-completed-cue">Completed {formatWorkoutExerciseName(previousSlot.exerciseName, previousSlot.exerciseId)}</p> : null}
                </div> : null}
                {slot ? <div className="workout-targets">
                  <div><span className="workout-field-label">Target</span><strong>{modeAwareTargetDisplayText(slot, currentLoadMode)}</strong></div>
                  <div><span className="workout-field-label">Previous</span><strong className="workout-previous-value">{previousDisplayText(previousSetPerformance, slot, currentLoadMode) ?? 'No previous set'}</strong></div>
                </div> : null}
                {state.phase === 'WORK' && (slot?.targetMode === 'timed' || slot?.targetMode === 'hold') && remaining !== null ? <div className="workout-work-timer"><span className="workout-field-label">Time remaining</span><strong className="workout-countdown" role="timer" aria-live="off" aria-label={remaining + ' seconds remaining'}>{formatSeconds(remaining)}</strong></div> : null}
                {state.phase === 'WORK' && slot?.targetMode === 'reps' ? <div className="workout-actual"><h4>Your set</h4><div className={['workout-stepper-grid', unilateral || weightRelevant ? 'workout-stepper-grid--split' : ''].join(' ')}>
                  {unilateral ? <>
                    <SetStepperField label="Left" value={currentSetInputs?.repsLeft ?? ''} onChange={value => setSetInputs(current => ({ ...current, [slot.id]: { ...current[slot.id], repsLeft: value } }))} />
                    <SetStepperField label="Right" value={currentSetInputs?.repsRight ?? ''} onChange={value => setSetInputs(current => ({ ...current, [slot.id]: { ...current[slot.id], repsRight: value } }))} />
                  </> : <SetStepperField label="Reps" value={currentSetInputs?.reps ?? ''} onChange={value => setSetInputs(current => ({ ...current, [slot.id]: { ...current[slot.id], reps: value } }))} />}
                  {!unilateral && weightRelevant ? <SetStepperField label={loadLabel(currentLoadMode)} step={2.5} value={currentSetInputs?.weight ?? ''} onChange={value => setSetInputs(current => ({ ...current, [slot.id]: { ...current[slot.id], weight: value } }))} /> : null}
                </div>
                {unilateral && weightRelevant ? <div className="mt-3"><SetStepperField label={currentLoadMode === 'assistance' ? 'Assistance per side' : currentLoadMode === 'bodyweight-plus' ? 'Added load per side' : 'Load per side'} step={2.5} value={currentSetInputs?.weight ?? ''} onChange={value => setSetInputs(current => ({ ...current, [slot.id]: { ...current[slot.id], weight: value } }))} /></div> : null}
                {currentLoadMode === 'assistance' ? <p className="mt-2 text-xs text-muted-foreground">Record the assistance amount; lower values mean less help.</p> : null}
                <details className="mt-3 rounded-xl border border-border/60 px-3 py-2">
                  <summary className="flex min-h-10 cursor-pointer items-center text-sm font-semibold">Effort <span className="ml-1 font-normal text-muted-foreground">(optional)</span></summary>
                  <div className="mt-2 flex flex-wrap items-end gap-3 pb-1">
                    <label className="grid gap-1 text-xs font-semibold text-muted-foreground">Scale
                      <select className="field-input min-h-11 w-28" value={currentSetInputs?.effortScale || 'rir'} onChange={event => setSetInputs(current => ({ ...current, [slot.id]: { ...current[slot.id], effortScale: event.target.value as 'rir' | 'rpe', effort: '' } }))} aria-label="Effort scale">
                        <option value="rir">RIR</option><option value="rpe">RPE</option>
                      </select>
                    </label>
                    <label className="grid gap-1 text-xs font-semibold text-muted-foreground">Rating
                      <input className="field-input min-h-11 w-24 text-center" type="number" inputMode="numeric" min={(currentSetInputs?.effortScale || 'rir') === 'rir' ? 0 : 1} max="10" step="1" value={currentSetInputs?.effort ?? ''} onChange={event => setSetInputs(current => ({ ...current, [slot.id]: { ...current[slot.id], effortScale: current[slot.id]?.effortScale || 'rir', effort: event.target.value } }))} aria-label={`${(currentSetInputs?.effortScale || 'rir').toUpperCase()} rating, optional`} />
                    </label>
                    <p className="max-w-sm pb-2 text-xs text-muted-foreground">{(currentSetInputs?.effortScale || 'rir') === 'rir' ? 'Reps in reserve: 0 means no reps left.' : 'Rate effort from 1 to 10.'}</p>
                  </div>
                </details>
                </div> : null}
                <div className="workout-action">
                  {state.phase === 'READY' ? <Button ref={activeControlRef} type="button" size="lg" className={primaryButtonClass} onClick={onStart}><Play aria-hidden="true" />Start set</Button> : null}
                  {state.phase === 'WORK' ? <Button ref={activeControlRef} type="button" size="lg" className={primaryButtonClass} onClick={onDone} aria-label={slot?.targetMode === 'timed' || slot?.targetMode === 'hold' ? 'Finish early for ' + formatWorkoutExerciseName(slot.exerciseName, slot.exerciseId) : 'Complete set for ' + (slot?.exerciseName ? formatWorkoutExerciseName(slot.exerciseName, slot.exerciseId) : 'current exercise')}><Check aria-hidden="true" />{slot?.targetMode === 'timed' || slot?.targetMode === 'hold' ? 'Finish early' : 'Complete Set'}</Button> : null}
                  {state.phase === 'REST' ? <Button ref={activeControlRef} type="button" size="lg" className={primaryButtonClass} onClick={onSkipRest}>Skip Rest</Button> : null}
                  {state.phase === 'PAUSED' ? <Button ref={activeControlRef} type="button" size="lg" className={primaryButtonClass} onClick={onResume}><Play aria-hidden="true" />Resume</Button> : null}
                </div>
              </div>
              {state.phase !== 'READY' ? <nav className="workout-navigation" aria-label="Workout controls">
                <Button type="button" variant="ghost" size="lg" className={secondaryButtonClass} onClick={onPrevious} disabled={state.currentSlotIndex === 0}><ChevronLeft aria-hidden="true" />Previous set</Button>
                {state.phase === 'WORK' ? <Button type="button" variant="ghost" size="lg" className={secondaryButtonClass} onClick={onSkip} aria-label={'Skip set for ' + (slot?.exerciseName ? formatWorkoutExerciseName(slot.exerciseName, slot.exerciseId) : 'current exercise')}>Skip set<SkipForward aria-hidden="true" /></Button> : null}
                {state.phase === 'WORK' || state.phase === 'REST' ? <Button type="button" variant="ghost" size="lg" className={secondaryButtonClass} onClick={onPause} aria-label="Pause workout"><Pause aria-hidden="true" />Pause</Button> : null}
              </nav> : null}
              {previewSlot && state.phase !== 'REST' && !(state.phase === 'PAUSED' && state.phaseBeforePause === 'REST') ? <div className="workout-next">
                <span className="workout-field-label">{previewSlot.exerciseId === slot?.exerciseId ? 'Next set' : 'Up next'}</span>
                <div><strong>{formatWorkoutExerciseName(previewSlot.exerciseName, previewSlot.exerciseId)}</strong><span>{slotTargetLabel(previewSlot)}{previewExercise ? ' · ' + WORKOUT_EXERCISE_CATEGORY_LABELS[deriveWorkoutExerciseCategory(previewExercise)] + ' · ' + previewExercise.category : ''}</span></div>
              </div> : null}
              {currentExercise?.sideMode === 'left-right' ? <p className="workout-side-order" aria-label="Side order: left to right"><span>Left</span><ArrowRight aria-hidden="true" /><span>Right</span><span className="sr-only">Complete the left side, then switch to the right.</span></p> : null}
              <div className="workout-guidance">
                {currentExercise && (currentExercise.instructionSteps?.length || currentExercise.instructions || currentExercise.formCues?.length || currentExercise.notes) ? <details><summary>How to do it</summary>
                  {currentExercise.instructionSteps?.length ? <ol className="mt-2 list-decimal space-y-1 pl-5">{currentExercise.instructionSteps.map((step, index) => <li key={`${currentExercise.id}-runner-step-${index}`}>{step}</li>)}</ol> : currentExercise.instructions ? <p className="mt-2">{currentExercise.instructions}</p> : null}
                  {currentExercise.formCues?.length ? <ul className="mt-3 list-disc space-y-1 pl-5">{currentExercise.formCues.map((cue, index) => <li key={`${currentExercise.id}-runner-cue-${index}`}>{cue}</li>)}</ul> : null}
                  {currentExercise.notes ? <p className="mt-3 text-muted-foreground">{currentExercise.notes}</p> : null}
                </details> : null}
                {currentRoutineItem?.notes ? <details><summary>Exercise note</summary><p className="mt-2">{currentRoutineItem.notes}</p></details> : null}
                {recentExerciseHistory.length ? <details><summary>Recent</summary>
                  {currentExercisePerformance?.highestLoad || currentExercisePerformance?.lowestAssistance || currentExercisePerformance?.estimatedOneRepMax ? <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {currentExercisePerformance.lowestAssistance ? <span>Least assistance {currentExercisePerformance.lowestAssistance.value}</span> : currentExercisePerformance.highestLoad ? <span>{currentLoadMode === 'bodyweight-plus' ? 'Best added load' : 'Best entered load'} {currentExercisePerformance.highestLoad.value}</span> : null}
                    {currentExercisePerformance.estimatedOneRepMax ? <span>Estimated 1RM {currentExercisePerformance.estimatedOneRepMax.value.toFixed(1)} entered-load units</span> : null}
                  </div> : null}
                  <ol className="mt-2 space-y-3">{recentExerciseHistory.map(({ session, sets: historySets }) => <li key={session.id}>
                    <p className="text-xs font-semibold text-foreground">{new Date(session.completedAt || session.startedAt).toLocaleDateString()} · {session.routineName}</p>
                    <ul className="mt-1 space-y-1 text-xs">{historySets.map(historySet => {
                      const sideHistory = historySet.actualRepsLeft !== undefined || historySet.actualRepsRight !== undefined;
                      const historyLoadMode = historySet.loadMode ?? currentLoadMode;
                      const loadPrefix = historyLoadMode === 'assistance' ? 'Assist ' : historyLoadMode === 'bodyweight-plus' ? 'Added ' : '';
                      const line = sideHistory
                        ? `L ${historySet.actualRepsLeft ?? '—'}${historySet.actualWeightLeft !== undefined ? ` @ ${loadPrefix}${historySet.actualWeightLeft}` : ''} · R ${historySet.actualRepsRight ?? '—'}${historySet.actualWeightRight !== undefined ? ` @ ${loadPrefix}${historySet.actualWeightRight}` : ''}`
                        : historySet.actualWeight !== undefined ? `${loadPrefix}${historySet.actualWeight} × ${historySet.actualReps ?? '—'}` : historySet.actualReps !== undefined ? `${historySet.actualReps} reps` : historySet.actualDurationSeconds !== undefined ? `${historySet.actualDurationSeconds}s` : 'Set recorded';
                      return <li key={historySet.slotId}>{line}{historySet.rir !== undefined ? ` · RIR ${historySet.rir}` : historySet.rpe !== undefined ? ` · RPE ${historySet.rpe}` : ''}</li>;
                    })}</ul>
                  </li>)}</ol>
                </details> : null}
                {currentExercise?.referenceVideoUrl ? <details><summary>Tutorial video</summary><WorkoutReferenceMedia profileId={profileId} exerciseName={formatWorkoutExerciseName(currentExercise.name, currentExercise.id)} referenceVideoUrl={currentExercise.referenceVideoUrl} variant="stage" className="mt-3" /></details> : null}
              </div>
            </div>
          </div>
        )}
      </div>
      </section>
    </>
  );
}
