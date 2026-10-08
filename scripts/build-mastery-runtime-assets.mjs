#!/usr/bin/env node
/**
 * Generates the runtime category-mastery artifacts from the source-of-truth
 * artwork. Deterministic: same inputs and same sharp version produce
 * byte-identical outputs, so the derivatives can be committed and re-verified.
 *
 *   source  assets/mastery-source/<category>/<category>_<rank>.png  (1254px, never modified)
 *   runtime public/achievements/mastery-runtime/<category>/<category>_<rank>.png  (448px)
 *
 * Why 448px, when the artifacts render at only 56-112px CSS pixels:
 *
 *   448 = 112 * 4, an exact integer multiple of the largest rendered size. That
 *   matters more than raw resolution. Chrome downscales images through a chain of
 *   halved mip levels, so a derivative whose ratio to the painted size lands on
 *   that chain is resampled once and cleanly, while an awkward ratio gets
 *   filtered twice — once by this script, once off a already-blurred mip level —
 *   and the compounded blur is visible on pixel-inspired hard edges.
 *
 *   At 448px the largest artifact is an exact 4x downscale at dpr1, exact 2x at
 *   dpr2, and 1:1 at dpr4 — never upscaled at any DPR up to 4.
 *
 *   Measured in Chrome on the real 112px hero element, swapping only the bytes
 *   behind one fixed <img> so position and box are identical. Sharpness is edge
 *   energy as a share of the 1254px original painted at the same size; maxD is
 *   the largest per-channel deviation from that original, out of 255:
 *
 *                 256px      384px      448px      512px      640px
 *     dpr1  maxD    114         86         65        112         94
 *           sharp  81.8%      91.7%     106.2%      80.9%      92.2%
 *     dpr2  maxD    112         89         77        108         82
 *           sharp  82.6%      92.5%     105.1%      80.7%      95.1%
 *     dpr3  maxD    108         67         56         48         45
 *           sharp  70.4%      98.2%     106.0%     108.9%     107.0%
 *
 *   256px and 512px both render visibly softer than the original at dpr1/dpr2 —
 *   confirmed by eye, not just by metric. 448px matches or beats the original at
 *   every DPR, and is smaller than 512px. Sizes at or below 96px CSS were already
 *   indistinguishable from the original at any of these resolutions.
 *
 * Run: node scripts/build-mastery-runtime-assets.mjs [--check]
 *   --check verifies the committed derivatives match what this script produces
 *           (for CI) instead of writing them.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE_DIR = join(ROOT, 'assets', 'mastery-source');
const RUNTIME_DIR = join(ROOT, 'public', 'achievements', 'mastery-runtime');

export const RUNTIME_SIZE = 448;

const CATEGORIES = [
  'productivity',
  'wellness',
  'finance',
  'collection',
  'reflection',
  'discipline',
];
const RANKS = ['apprentice', 'adept', 'expert', 'master', 'mythic'];

const sourcePath = (category, rank) =>
  join(SOURCE_DIR, category, `${category}_${rank}.png`);
const runtimePath = (category, rank) =>
  join(RUNTIME_DIR, category, `${category}_${rank}.png`);

/**
 * Fixed, lossless-for-our-purposes encode:
 *  - lanczos3 downscale, the same family of filter browsers use, so the runtime
 *    file is what the browser would have produced from the original anyway
 *  - `fit: contain` on a square target with a transparent background preserves
 *    aspect ratio and centering, and cannot crop (sources are already square)
 *  - no palette reduction, no sharpening, no colour conversion: gradients,
 *    highlights and the straight alpha channel survive untouched
 */
async function derive(category, rank) {
  return sharp(sourcePath(category, rank))
    .resize(RUNTIME_SIZE, RUNTIME_SIZE, {
      fit: 'contain',
      kernel: 'lanczos3',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({
      compressionLevel: 9,
      effort: 10,
      palette: false,
      adaptiveFiltering: true,
    })
    .toBuffer();
}

const sha = buffer => createHash('sha256').update(buffer).digest('hex').slice(0, 12);

async function main() {
  const check = process.argv.includes('--check');
  let sourceBytes = 0;
  let runtimeBytes = 0;
  const mismatched = [];

  for (const category of CATEGORIES) {
    if (!check) mkdirSync(join(RUNTIME_DIR, category), { recursive: true });
    for (const rank of RANKS) {
      const source = sourcePath(category, rank);
      if (!existsSync(source)) throw new Error(`missing source artwork: ${source}`);
      sourceBytes += readFileSync(source).length;

      const derived = await derive(category, rank);
      runtimeBytes += derived.length;
      const target = runtimePath(category, rank);

      if (check) {
        const existing = existsSync(target) ? readFileSync(target) : null;
        if (!existing || !existing.equals(derived)) {
          mismatched.push(`${category}/${category}_${rank}.png`);
        }
      } else {
        writeFileSync(target, derived);
      }
      process.stdout.write(
        `${check ? 'checked' : 'wrote'} ${category}_${rank}.png  ${String(Math.round(derived.length / 1024)).padStart(4)} KB  ${sha(derived)}\n`,
      );
    }
  }

  const mb = bytes => (bytes / 1048576).toFixed(2);
  console.log(
    `\n${CATEGORIES.length * RANKS.length} artifacts at ${RUNTIME_SIZE}x${RUNTIME_SIZE}` +
      `\nsource  ${mb(sourceBytes)} MB` +
      `\nruntime ${mb(runtimeBytes)} MB` +
      `\nreduction ${(100 - (runtimeBytes / sourceBytes) * 100).toFixed(1)}%`,
  );

  if (mismatched.length) {
    console.error(
      `\n${mismatched.length} runtime artifact(s) do not match the source artwork:\n  ` +
        mismatched.join('\n  ') +
        '\nRun: node scripts/build-mastery-runtime-assets.mjs',
    );
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
