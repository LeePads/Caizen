#!/usr/bin/env node
/**
 * Vendors the openGym exercises dataset (text/metadata only) into
 * lib/health/data/opengym-exercises.json for the Workout exercise library.
 *
 * Source: https://github.com/hasaneyldrm/exercises-dataset (data/exercises.json)
 * License: the dataset text (names, categories, equipment, targets, muscle
 * groups, English instructions) is MIT-licensed per that repo's LICENSE/NOTICE.md.
 * The project's images/ and videos/ (Gym visual media) are under separate
 * licensing terms and are intentionally never read or copied by this script.
 *
 * This is a one-time/occasional vendoring step, not a runtime dependency:
 * Caizen never fetches from the upstream repo or an openGym server at runtime.
 *
 * Run: node scripts/import-opengym-exercises.mjs --source <path-to-exercises.json>
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_PATH = join(ROOT, 'lib', 'health', 'data', 'opengym-exercises.json');

const sourceArgIndex = process.argv.indexOf('--source');
if (sourceArgIndex === -1 || !process.argv[sourceArgIndex + 1]) {
  console.error('Usage: node scripts/import-opengym-exercises.mjs --source <path-to-exercises.json>');
  process.exit(1);
}
const sourcePath = process.argv[sourceArgIndex + 1];

const raw = JSON.parse(readFileSync(sourcePath, 'utf-8'));
if (!Array.isArray(raw)) throw new Error('Expected the source dataset to be a JSON array.');

// Only text/metadata fields are kept. Media fields (image, gif_url,
// attribution) are deliberately dropped: Caizen does not bundle openGym
// media. `media_id` is kept as `mediaId` — it is an opaque upstream
// identifier (e.g. "2gPfomN"), not a URL and not media, used only to look
// up a remote animation from ExerciseDB V1 at runtime (see
// lib/health/exercise-media-provider.ts).
const trimmed = raw.map(entry => ({
  id: entry.id,
  name: entry.name,
  bodyPart: entry.body_part,
  equipment: entry.equipment,
  instructions: entry.instructions?.en ?? '',
  instructionSteps: entry.instruction_steps?.en ?? [],
  muscleGroup: entry.muscle_group,
  secondaryMuscles: entry.secondary_muscles ?? [],
  target: entry.target,
  mediaId: entry.media_id,
}));

mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
writeFileSync(OUTPUT_PATH, `${JSON.stringify(trimmed, null, 2)}\n`, 'utf-8');
console.log(`Wrote ${trimmed.length} exercises to ${OUTPUT_PATH}`);
