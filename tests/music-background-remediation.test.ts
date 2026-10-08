import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { getMusicArtwork } from '@/lib/music-player';
import type { MusicItem } from '@/lib/types';

const read = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

const musicItem = (overrides: Partial<MusicItem> = {}): MusicItem => ({
  id: 'music-background-test',
  title: 'Background test',
  provider: 'youtube',
  url: 'https://www.youtube.com/watch?v=abc123def45',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
});

describe('Music artwork background remediation contracts', () => {
  it('prefers stored artwork and keeps the YouTube thumbnail fallback', () => {
    expect(getMusicArtwork(musicItem({ image: 'https://cdn.example/art.jpg' }))).toBe(
      'https://cdn.example/art.jpg',
    );
    expect(getMusicArtwork(musicItem())).toBe(
      'https://img.youtube.com/vi/abc123def45/hqdefault.jpg',
    );
    expect(getMusicArtwork(musicItem({ url: 'https://example.com/audio.mp3' }))).toBe('');
  });

  it('keeps the existing artwork state path and allows the app renderer', () => {
    const page = read('app/app/page.tsx');
    const player = read('lib/music-player.tsx');
    const css = read('app/globals.css');

    expect(page).toContain('const activeArtwork = getMusicArtwork(activeItem)');
    expect(page).toContain("html.dataset.musicArtBackground = 'true'");
    expect(page).toContain("delete html.dataset.musicArtBackground");
    expect(page).toContain("html.style.setProperty('--music-bg-art', 'none')");
    expect(player).toContain('return item?.image || getYouTubeThumbnail(item?.url) ||');
    expect(css).toContain('html:has(.caizen-root) body::before {');
    expect(css).not.toContain(
      "html:has(.caizen-root) body::before,\nhtml:has(.caizen-root) body::after",
    );
    expect(css).toContain('var(--music-bg-art)');
  });
});
