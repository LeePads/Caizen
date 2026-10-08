import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  MASTERY_ASSETS,
  MASTERY_CATEGORY_ORDER,
  MASTERY_RANK_ORDER,
  MASTERY_RUNTIME_SIZE,
  getMasteryAsset,
  getMasteryAssetAlt,
  toMasteryRank,
  type EarnedMasteryRank,
} from '@/lib/mastery/assets';

const PUBLIC_DIR = join(process.cwd(), 'public');
const SOURCE_DIR = join(process.cwd(), 'assets', 'mastery-source');
const RUNTIME_DIR = join(PUBLIC_DIR, 'achievements', 'mastery-runtime');
const EARNED_RANKS = MASTERY_RANK_ORDER.filter(
  rank => rank !== 'unstarted',
) as EarnedMasteryRank[];

function listFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return listFiles(path);
    return entry.isFile() ? [path] : [];
  });
}

function listDirectories(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    if (!entry.isDirectory()) return [];
    const path = join(root, entry.name);
    return [path, ...listDirectories(path)];
  });
}

function pngDimensions(path: string) {
  const header = readFileSync(path).subarray(16, 26);
  return {
    width: header.readUInt32BE(0),
    height: header.readUInt32BE(4),
    colorType: header[9],
  };
}

function masterySourcePath(category: string, rank: EarnedMasteryRank) {
  return join(SOURCE_DIR, category, `${category}_${rank}.png`);
}

function isMasteryArtwork(path: string) {
  return /^(productivity|wellness|finance|collection|reflection|discipline)_(apprentice|adept|expert|master|mythic)\.png$/.test(
    basename(path),
  );
}

describe('mastery asset registry', () => {
  it('covers all six categories and five earned ranks', () => {
    expect(MASTERY_CATEGORY_ORDER).toHaveLength(6);
    expect(EARNED_RANKS).toHaveLength(5);
    expect(Object.keys(MASTERY_ASSETS)).toHaveLength(6);
  });

  it('keeps all 30 original source assets outside public', () => {
    const sourceFiles = listFiles(SOURCE_DIR).filter(path => path.endsWith('.png'));
    expect(sourceFiles).toHaveLength(30);
    expect(
      sourceFiles.every(path => !path.startsWith(`${PUBLIC_DIR}\\`)),
    ).toBe(true);

    const expectedSourceFiles = MASTERY_CATEGORY_ORDER.flatMap(category =>
      EARNED_RANKS.map(rank => masterySourcePath(category, rank)),
    );
    expect(sourceFiles.sort()).toEqual(expectedSourceFiles.sort());
  });

  it('resolves all 30 runtime artifacts to files that exist on disk', () => {
    const missing: string[] = [];
    const runtimeFiles = listFiles(RUNTIME_DIR).filter(path => path.endsWith('.png'));
    expect(runtimeFiles).toHaveLength(30);
    for (const category of MASTERY_CATEGORY_ORDER) {
      for (const rank of EARNED_RANKS) {
        const path = getMasteryAsset(category, rank);
        if (!existsSync(join(PUBLIC_DIR, path))) missing.push(path);
      }
    }
    expect(missing).toEqual([]);
  });

  it('never resolves one category to another category artwork', () => {
    const seen = new Set<string>();
    for (const category of MASTERY_CATEGORY_ORDER) {
      for (const rank of EARNED_RANKS) {
        const path = getMasteryAsset(category, rank);
        expect(path).toContain(`/mastery-runtime/${category}/`);
        expect(path).toContain(`${category}_${rank}.png`);
        expect(seen.has(path)).toBe(false);
        seen.add(path);
      }
    }
    expect(seen.size).toBe(30);
  });

  it('serves only runtime paths and has no old HD application asset path', () => {
    const applicationAssetPaths = Object.values(MASTERY_ASSETS).flatMap(assets =>
      Object.values(assets),
    );
    expect(applicationAssetPaths).toHaveLength(30);
    expect(applicationAssetPaths.every(path => path.startsWith('/achievements/mastery-runtime/'))).toBe(
      true,
    );
    expect(applicationAssetPaths.some(path => /caizen-[a-z]+-hd/.test(path))).toBe(false);

    for (const category of MASTERY_CATEGORY_ORDER) {
      for (const rank of EARNED_RANKS) {
        expect(getMasteryAsset(category, rank)).not.toContain('-hd/');
      }
    }
  });

  it('prevents mastery source directories or 1254px sources from returning to public', () => {
    const publicSourceDirectories = listDirectories(PUBLIC_DIR).filter(path =>
      /[\\/]caizen-[a-z]+-hd$/.test(path),
    );
    expect(publicSourceDirectories).toEqual([]);

    const publicMasterySources = listFiles(PUBLIC_DIR).filter(path => {
      if (!isMasteryArtwork(path)) return false;
      const { width, height } = pngDimensions(path);
      return width === 1254 && height === 1254;
    });
    expect(publicMasterySources).toEqual([]);
  });

  it('does not reference source locations from application code', () => {
    const applicationFiles = ['app', 'components', 'hooks', 'lib'].flatMap(root =>
      listFiles(join(process.cwd(), root)).filter(path => /\.(css|ts|tsx)$/.test(path)),
    );
    const applicationSource = applicationFiles
      .map(path => readFileSync(path, 'utf8'))
      .join('\n');
    expect(applicationSource).not.toMatch(/caizen-[a-z]+-hd/);
    expect(applicationSource).not.toMatch(/assets[\\/]mastery-source/);
  });

  it('keeps every runtime derivative in sync with its source artwork', () => {
    // Guards against a source PNG changing without the derivatives being rebuilt.
    const result = spawnSync(
      process.execPath,
      [join(process.cwd(), 'scripts', 'build-mastery-runtime-assets.mjs'), '--check'],
      { encoding: 'utf8' },
    );
    expect(result.status).toBe(0);
    expect(result.stderr || '').not.toContain('do not match');
    expect((result.stdout.match(/^checked /gm) || []).length).toBe(30);
  }, 120_000);

  it('declares the runtime resolution the derivatives were built at', () => {
    expect(MASTERY_RUNTIME_SIZE).toBe(448);
    for (const category of MASTERY_CATEGORY_ORDER) {
      for (const rank of EARNED_RANKS) {
        const file = join(PUBLIC_DIR, getMasteryAsset(category, rank));
        // PNG IHDR: width and height are big-endian uint32 at bytes 16 and 20.
        const header = readFileSync(file).subarray(16, 24);
        expect(header.readUInt32BE(0)).toBe(MASTERY_RUNTIME_SIZE);
        expect(header.readUInt32BE(4)).toBe(MASTERY_RUNTIME_SIZE);
        expect(readFileSync(file)[25]).toBe(6);
      }
    }
  });

  it('reuses the apprentice artwork for unstarted', () => {
    for (const category of MASTERY_CATEGORY_ORDER) {
      expect(getMasteryAsset(category, 'unstarted')).toBe(
        getMasteryAsset(category, 'apprentice'),
      );
    }
  });

  it('maps achievement-system rank names onto registry ranks', () => {
    expect(toMasteryRank('Expert')).toBe('expert');
    expect(toMasteryRank('Unstarted')).toBe('unstarted');
    expect(toMasteryRank('Mythic')).toBe('mythic');
    // Retired material names are not ranks and must not resolve to one.
    expect(toMasteryRank('Bronze')).toBe('unstarted');
    expect(toMasteryRank('Iridescent')).toBe('unstarted');
  });

  it('describes rank in alt text without leaning on material names', () => {
    expect(getMasteryAssetAlt('wellness', 'expert')).toBe(
      'Wellness mastery — Expert',
    );
    expect(getMasteryAssetAlt('finance', 'unstarted')).toBe(
      'Finance mastery — not yet started',
    );
  });
});
