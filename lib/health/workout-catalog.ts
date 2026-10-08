import type {
  WorkoutExerciseDefinition,
  WorkoutRoutine,
  WorkoutRoutineItem,
  WorkoutTargetMode,
} from '../types';
import { calculateWorkoutDuration } from './workout-duration';
import { OPENGYM_WORKOUT_CATALOG } from './opengym-catalog';

const inferExerciseCategory = (name: string, bodyArea: string, kind: 'exercise' | 'stretch') => {
  const text = `${name} ${bodyArea}`.toLocaleLowerCase();
  if (kind === 'stretch') return /(cat-cow|ankle|spinal|rotation|side bend|circle)/.test(text) ? 'mobility' as const : 'stretching' as const;
  return /(jump|jack|high[- ]knees|kick|climber|burpee|cardio|step-up)/.test(text) ? 'cardio' as const : 'strength' as const;
};

const movement = (
  id: string,
  name: string,
  category: string,
  equipment: string,
  targetMode: WorkoutTargetMode,
  options: Partial<WorkoutExerciseDefinition> = {},
): WorkoutExerciseDefinition => {
  const guidance = getMovementGuidance(name, category, 'exercise');
  return {
    id,
    name,
    kind: 'exercise',
    category,
    equipment,
    difficulty: 'moderate',
    targetMode,
    defaultReps: targetMode === 'reps' ? 10 : undefined,
    defaultDurationSeconds: targetMode === 'timed' || targetMode === 'hold' ? 30 : undefined,
    defaultSets: 1,
    defaultRestSeconds: 30,
    source: 'builtin',
    exerciseCategory: inferExerciseCategory(name, category, 'exercise'),
    ...guidance,
    instructions: guidance.instructionSteps.join(' '),
    ...options,
  };
};

function getMovementGuidance(name: string, category: string, kind: 'exercise' | 'stretch') {
  const lowerName = name.toLocaleLowerCase();
  const purpose = kind === 'stretch'
    ? `Gentle mobility for ${category.toLocaleLowerCase()}.`
    : `A controlled ${category.toLocaleLowerCase()} movement.`;

  if (kind === 'stretch') {
    return {
      purpose,
      instructionSteps: [
        `Set up for ${lowerName} with a tall, comfortable posture.`,
        `Move slowly into the position and hold for the suggested time.`,
        'Return to neutral with control while breathing evenly.',
      ],
      formCues: ['Keep the movement gentle and controlled.', 'Do not force the range of motion.'],
    };
  }

  if (lowerName.includes('squat')) {
    return {
      purpose: 'A lower-body strength movement for the legs and glutes.',
      instructionSteps: ['Stand with feet stable and your chest comfortably lifted.', 'Bend your knees and hips to lower with control.', 'Press through your feet to return to standing.'],
      formCues: ['Keep your knees tracking in line with your feet.', 'Keep your weight balanced through the whole foot.'],
    };
  }
  if (lowerName.includes('lunge')) {
    return {
      purpose: 'A single-leg lower-body movement for the legs and glutes.',
      instructionSteps: ['Stand tall and step one foot forward or back.', 'Lower until both knees are comfortably bent.', 'Push through the front foot to return to standing.'],
      formCues: ['Keep your front knee tracking over your foot.', 'Use a shorter step if balance feels limited.'],
    };
  }
  if (lowerName.includes('push-up') || lowerName.includes('dip')) {
    return {
      purpose: 'An upper-body pressing movement for the chest, shoulders, and arms.',
      instructionSteps: ['Set your hands on a stable surface with your body aligned.', 'Bend your elbows to lower your chest with control.', 'Press through your hands to return to the start.'],
      formCues: ['Keep your torso in one steady line.', 'Keep your elbows controlled rather than flaring wide.'],
    };
  }
  if (lowerName.includes('plank') || lowerName.includes('dead bug') || lowerName.includes('bird dog') || lowerName.includes('crunch') || lowerName.includes('leg raise')) {
    return {
      purpose: 'A controlled core and stability movement.',
      instructionSteps: [`Set up for ${lowerName} with your spine in a comfortable neutral position.`, 'Brace gently and complete the movement without rushing.', 'Return to the starting position before the next repetition.'],
      formCues: ['Keep the movement controlled instead of using momentum.', 'Breathe steadily throughout the set.'],
    };
  }
  if (lowerName.includes('jack') || lowerName.includes('knees') || lowerName.includes('kicks') || lowerName.includes('climber') || lowerName.includes('burpee')) {
    return {
      purpose: 'A simple full-body or cardio movement to raise activity.',
      instructionSteps: [`Start in a stable position for ${lowerName}.`, 'Move at a pace you can control for the target duration or repetitions.', 'Return to a balanced stance before repeating.'],
      formCues: ['Land and change direction softly.', 'Choose a slower version when you need more control.'],
    };
  }
  return {
    purpose,
    instructionSteps: [`Set up for ${lowerName} with a steady posture.`, 'Move through the range with control for the suggested target.', 'Return to the starting position before repeating.'],
    formCues: ['Keep your breathing steady.', 'Use a comfortable range and avoid rushing.'],
  };
}

const stretch = (
  id: string,
  name: string,
  category: string,
  durationSeconds = 30,
): WorkoutExerciseDefinition => {
  const guidance = getMovementGuidance(name, category, 'stretch');
  return {
    id,
    name,
    kind: 'stretch',
    category,
    equipment: 'None',
    difficulty: 'easy',
    targetMode: 'hold',
    defaultDurationSeconds: durationSeconds,
    defaultSets: 1,
    defaultRestSeconds: 0,
    source: 'builtin',
    exerciseCategory: inferExerciseCategory(name, category, 'stretch'),
    ...guidance,
    instructions: guidance.instructionSteps.join(' '),
  };
};

export const BUILTIN_WORKOUT_EXERCISES: WorkoutExerciseDefinition[] = [
  movement('push-up', 'Push-up', 'Chest / arms', 'None', 'reps', { difficulty: 'moderate', defaultReps: 10 }),
  movement('knee-push-up', 'Knee Push-up', 'Chest / arms', 'None', 'reps', { difficulty: 'easy', defaultReps: 10 }),
  movement('incline-push-up', 'Incline Push-up', 'Chest / arms', 'Chair / table', 'reps', { difficulty: 'easy', defaultReps: 10 }),
  movement('pike-push-up', 'Pike Push-up', 'Shoulders', 'None', 'reps', { difficulty: 'hard', defaultReps: 8 }),
  movement('bodyweight-squat', 'Bodyweight Squat', 'Legs', 'None', 'reps', { defaultReps: 12 }),
  movement('sumo-squat', 'Sumo Squat', 'Legs / glutes', 'None', 'reps', { defaultReps: 12 }),
  movement('reverse-lunge', 'Reverse Lunge', 'Legs', 'None', 'reps', { defaultReps: 10, sideMode: 'left-right' }),
  movement('forward-lunge', 'Forward Lunge', 'Legs', 'None', 'reps', { defaultReps: 10, sideMode: 'left-right' }),
  movement('bulgarian-split-squat', 'Bulgarian Split Squat', 'Legs', 'Chair', 'reps', { difficulty: 'hard', defaultReps: 8, sideMode: 'left-right' }),
  movement('glute-bridge', 'Glute Bridge', 'Glutes', 'Mat optional', 'reps', { defaultReps: 12 }),
  movement('single-leg-glute-bridge', 'Single-leg Glute Bridge', 'Glutes', 'Mat optional', 'reps', { difficulty: 'hard', defaultReps: 8, sideMode: 'left-right' }),
  movement('calf-raise', 'Calf Raise', 'Calves', 'None / wall', 'reps', { defaultReps: 15 }),
  movement('wall-sit', 'Wall Sit', 'Legs', 'Wall', 'hold', { defaultDurationSeconds: 30 }),
  movement('plank', 'Plank', 'Core', 'Mat optional', 'hold', { defaultDurationSeconds: 30 }),
  movement('side-plank', 'Side Plank', 'Core', 'Mat optional', 'hold', { difficulty: 'hard', defaultDurationSeconds: 20, sideMode: 'left-right' }),
  movement('dead-bug', 'Dead Bug', 'Core / stability', 'Mat', 'reps', { defaultReps: 10 }),
  movement('bird-dog', 'Bird Dog', 'Core / stability', 'Mat', 'reps', { difficulty: 'easy', defaultReps: 10, sideMode: 'left-right' }),
  movement('crunch', 'Crunch', 'Core', 'Mat', 'reps', { defaultReps: 12 }),
  movement('bicycle-crunch', 'Bicycle Crunch', 'Core', 'Mat', 'reps', { defaultReps: 12 }),
  movement('leg-raise', 'Leg Raise', 'Core', 'Mat', 'reps', { difficulty: 'hard', defaultReps: 10 }),
  movement('mountain-climber', 'Mountain Climber', 'Core / cardio', 'None', 'timed', { defaultDurationSeconds: 30 }),
  movement('jumping-jack', 'Jumping Jack', 'Cardio', 'None', 'timed', { difficulty: 'easy', defaultDurationSeconds: 30 }),
  movement('high-knees', 'High Knees', 'Cardio', 'None', 'timed', { defaultDurationSeconds: 30 }),
  movement('butt-kicks', 'Butt Kicks', 'Cardio', 'None', 'timed', { difficulty: 'easy', defaultDurationSeconds: 30 }),
  movement('burpee', 'Burpee', 'Full body', 'None', 'reps', { difficulty: 'hard', defaultReps: 8 }),
  movement('step-up', 'Step-up', 'Legs / cardio', 'Stable step / chair', 'reps', { defaultReps: 10 }),
  movement('chair-dip', 'Chair Dip', 'Triceps', 'Chair', 'reps', { defaultReps: 10 }),
  movement('resistance-band-row', 'Resistance-band Row', 'Back', 'Resistance band', 'reps', { defaultReps: 12 }),
  movement('dumbbell-water-bottle-curl', 'Dumbbell/Water-bottle Curl', 'Biceps', 'Dumbbell / bottle', 'reps', { defaultReps: 12 }),
  movement('backpack-romanian-deadlift', 'Backpack Romanian Deadlift', 'Posterior chain', 'Loaded backpack', 'reps', { defaultReps: 10 }),
];

export const BUILTIN_WORKOUT_STRETCHES: WorkoutExerciseDefinition[] = [
  stretch('neck-side-stretch', 'Neck Side Stretch', 'Neck', 20),
  stretch('upper-trapezius-stretch', 'Upper Trapezius Stretch', 'Neck / shoulders', 20),
  stretch('shoulder-cross-body-stretch', 'Shoulder Cross-body Stretch', 'Shoulders', 20),
  stretch('overhead-triceps-stretch', 'Overhead Triceps Stretch', 'Arms', 20),
  stretch('chest-doorway-stretch', 'Chest Doorway Stretch', 'Chest'),
  stretch('wrist-flexor-stretch', 'Wrist Flexor Stretch', 'Forearms / wrists', 20),
  stretch('wrist-extensor-stretch', 'Wrist Extensor Stretch', 'Forearms / wrists', 20),
  stretch('standing-side-bend', 'Standing Side Bend', 'Torso', 20),
  stretch('cat-cow', 'Cat-Cow', 'Spine'),
  stretch('childs-pose', "Child's Pose", 'Back'),
  stretch('cobra-gentle-upward-stretch', 'Cobra / Gentle Upward Stretch', 'Abdomen / back', 20),
  stretch('seated-spinal-twist', 'Seated Spinal Twist', 'Back', 20),
  stretch('standing-quad-stretch', 'Standing Quad Stretch', 'Quads', 20),
  stretch('hamstring-stretch', 'Hamstring Stretch', 'Hamstrings'),
  stretch('hip-flexor-stretch', 'Hip Flexor Stretch', 'Hips'),
  stretch('figure-four-glute-stretch', 'Figure-four Glute Stretch', 'Glutes'),
  stretch('butterfly-stretch', 'Butterfly Stretch', 'Inner thighs'),
  stretch('calf-wall-stretch', 'Calf Wall Stretch', 'Calves'),
  stretch('ankle-circles', 'Ankle Circles', 'Ankles', 20),
  stretch('knee-to-chest-stretch', 'Knee-to-chest Stretch', 'Lower back / hips', 20),
];

const all = [...BUILTIN_WORKOUT_EXERCISES, ...BUILTIN_WORKOUT_STRETCHES];
const item = (exerciseId: string, overrides: Partial<WorkoutRoutineItem> = {}): WorkoutRoutineItem => {
  const exercise = all.find(candidate => candidate.id === exerciseId);
  return {
    id: `item-${exerciseId}`,
    exerciseId,
    exerciseNameSnapshot: exercise?.name || exerciseId,
    targetMode: exercise?.targetMode,
    durationSeconds: exercise?.defaultDurationSeconds,
    reps: exercise?.defaultReps,
    sets: exercise?.defaultSets || 1,
    restSeconds: exercise?.defaultRestSeconds,
    ...overrides,
  };
};

const routine = (
  id: string,
  name: string,
  exerciseIds: string[],
  options: Partial<WorkoutRoutine> = {},
): WorkoutRoutine => {
  const configuredRoutine = {
    id,
    name,
    source: 'builtin' as const,
    items: exerciseIds.map(exerciseId => item(exerciseId)),
    rounds: 1,
    defaultRestSeconds: 30,
    ...options,
  };
  const duration = calculateWorkoutDuration(configuredRoutine, all);
  return {
    ...configuredRoutine,
    estimatedDurationMinutes: duration.hasUntimedWork ? undefined : duration.totalSeconds / 60,
  };
};

export const BUILTIN_WORKOUT_ROUTINES: WorkoutRoutine[] = [
  routine('quick-morning-stretch', 'Quick Morning Stretch', ['neck-side-stretch', 'shoulder-cross-body-stretch', 'standing-side-bend', 'hamstring-stretch', 'hip-flexor-stretch'], { defaultRestSeconds: 0 }),
  routine('desk-break-stretch', 'Desk Break Stretch', ['upper-trapezius-stretch', 'wrist-flexor-stretch', 'wrist-extensor-stretch', 'chest-doorway-stretch', 'standing-side-bend'], { defaultRestSeconds: 0 }),
  routine('beginner-full-body', 'Beginner Full Body', ['bodyweight-squat', 'incline-push-up', 'glute-bridge', 'bird-dog', 'jumping-jack']),
  routine('upper-body', 'Upper Body', ['incline-push-up', 'pike-push-up', 'chair-dip', 'resistance-band-row', 'dumbbell-water-bottle-curl']),
  routine('lower-body', 'Lower Body', ['bodyweight-squat', 'reverse-lunge', 'glute-bridge', 'calf-raise', 'wall-sit']),
  routine('core-session', 'Core Session', ['plank', 'dead-bug', 'bird-dog', 'bicycle-crunch', 'side-plank']),
  routine('full-body-stretch', 'Full Body Stretch', ['cat-cow', 'childs-pose', 'cobra-gentle-upward-stretch', 'standing-quad-stretch', 'figure-four-glute-stretch', 'calf-wall-stretch'], { defaultRestSeconds: 0 }),
  routine('short-cardio', 'Short Cardio', ['jumping-jack', 'high-knees', 'butt-kicks', 'mountain-climber', 'burpee']),
];

export const BUILTIN_WORKOUT_CATALOG = [
  ...BUILTIN_WORKOUT_EXERCISES,
  ...BUILTIN_WORKOUT_STRETCHES,
];

export function getBuiltinWorkoutExercise(id: string) {
  return BUILTIN_WORKOUT_CATALOG.find(exercise => exercise.id === id);
}

export function getBuiltinWorkoutRoutine(id: string) {
  return BUILTIN_WORKOUT_ROUTINES.find(routineDefinition => routineDefinition.id === id);
}

/**
 * Canonical unified exercise collection: Caizen built-ins + the read-only
 * openGym catalog + the profile's own custom exercises. Every place in the
 * app that needs "all exercises available to a workout" should build its
 * list from this helper instead of re-deriving the merge.
 */
export function combineWorkoutExerciseCatalog(
  customExercises: WorkoutExerciseDefinition[],
): WorkoutExerciseDefinition[] {
  return [...BUILTIN_WORKOUT_CATALOG, ...OPENGYM_WORKOUT_CATALOG, ...customExercises];
}
