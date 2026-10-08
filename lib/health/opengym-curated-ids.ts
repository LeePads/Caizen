import { openGymExerciseId } from './opengym-exercise-mapper';

/**
 * Curated subset of the full 1,324-exercise openGym dataset, presented as
 * the default openGym Exercise Library so the browse experience isn't
 * overwhelming. The full dataset (see opengym-catalog.ts /
 * OPENGYM_WORKOUT_CATALOG) remains intact and fully resolvable — routines,
 * history, and exercise lookups that reference a non-curated openGym
 * exercise keep working exactly as before; only what the library *browses*
 * by default is narrowed.
 *
 * Selection method: every id below was checked against the vendored
 * dataset (lib/health/data/opengym-exercises.json) for a non-empty
 * `mediaId`, and cross-checked against the upstream openGym repository's
 * own images/ directory to confirm a real image asset exists for that id
 * (openGym ships the media in its own repo; there is no separate "has
 * media" flag in the dataset itself — see opengym-exercise-mapper.ts and
 * the Phase 3 findings in the accompanying task report). All 98 ids here
 * passed that check. Within that pool, ids were hand-picked per body part
 * (roughly proportional to how many exercises that body part has in the
 * source data, with a floor for small groups like neck/forearms) to
 * prioritize: recognizable/fundamental movements, a spread across common
 * equipment (bodyweight, barbell, dumbbell, cable, machine, kettlebell),
 * compound lifts alongside a smaller set of useful isolation moves, and
 * avoiding picking many near-identical name variations of the same lift.
 *
 * This is a curation, not a popularity ranking — the source dataset has no
 * usage/popularity statistics to draw from.
 */
export const OPENGYM_CURATED_SOURCE_IDS: readonly string[] = [
  // waist (core)
  '0274', '0735', '0687', '0472', '0276', '0464', '0872', '0003', '0222', '0407', '0620', '3016',
  // upper legs
  '0032', '0085', '0054', '0413', '1760', '0336', '1459', '0585', '0599', '0739', '1460', '2368', '0514', '0043',
  // back
  '0652', '0253', '0499', '0027', '0489', '0198', '0861', '0293', '0406', '0606', '0579', '0095', '1350',
  // chest
  '0662', '0251', '0025', '0047', '0289', '0308', '0314', '0577', '0227', '0748', '0493', '0279',
  // upper arms (biceps + triceps)
  '0031', '0294', '0070', '0868', '0165', '0297', '0140', '0206', '0201', '0129', '0061', '0092', '0860', '0194', '0351', '0333',
  // shoulders
  '0091', '0334', '0405', '2137', '0380', '0310', '0219', '0178', '0120', '0546',
  // cardio
  '1160', '0630', '2612', '0685', '3223', '3360', '3361', '3666',
  // lower legs (calves)
  '1373', '1372', '0417', '1375', '0605', '0284',
  // lower arms (forearms)
  '0126', '0082', '0364', '0247', '1437',
  // neck
  '1403', '0716',
];

export const OPENGYM_CURATED_EXERCISE_IDS: ReadonlySet<string> = new Set(
  OPENGYM_CURATED_SOURCE_IDS.map(openGymExerciseId),
);

export function isCuratedOpenGymExerciseId(exerciseId: string): boolean {
  return OPENGYM_CURATED_EXERCISE_IDS.has(exerciseId);
}
