import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) => readFileSync(resolve(process.cwd(), relativePath), 'utf8');

describe('Music player options menu contract', () => {
  it('keeps item actions without duplicating playback or queue reordering controls', () => {
    const player = read('components/music/MusicFullPlayer.tsx');
    const start = player.indexOf('<div className="cz-sheet-actions">');
    const end = player.indexOf('</section>', start);
    const menu = player.slice(start, end);

    expect(menu).toContain('<strong>Remove from queue</strong>');
    expect(menu).toContain('<strong>Edit metadata</strong>');
    expect(menu).toContain('<strong>Play next</strong>');
    expect(menu).toContain('<strong>Move to end</strong>');
    expect(menu).not.toContain('<strong>Play now</strong>');
    expect(menu).not.toContain('<strong>Move up</strong>');
    expect(menu).not.toContain('<strong>Move down</strong>');
    expect(menu).not.toContain('Previous track');
    expect(menu).not.toContain('Pause');
    expect(menu).not.toContain('Shuffle');
    expect(menu).not.toContain('Repeat');
  });

  it('keeps the existing portal, focus return, and collision-safe menu sizing contracts', () => {
    const player = read('components/music/MusicFullPlayer.tsx');
    const musicStyles = read('styles/music-player.css');
    const sheetStyles = read('styles/caizen-sheet.css');

    expect(player).toContain('createPortal((');
    expect(player).toContain('document.body');
    expect(player).toContain('menuTriggerRef.current = event.currentTarget');
    expect(player).toContain('focus({ preventScroll: true })');
    expect(player).toContain('menuRef.current?.contains(target)');
    expect(player).toContain('data-overlay-surface="music-menu"');
    expect(sheetStyles).toContain('z-index: 11000');
    expect(musicStyles).toContain('.cz-player-menu-layer');
    expect(musicStyles).toContain('position: fixed');
    expect(musicStyles).toContain('max-height: min(42rem, calc(100dvh - 1.5rem))');
    expect(musicStyles).toContain('min-height: 3rem');
    expect(musicStyles).toContain('.cz-player-menu .cz-sheet-action');
  });
});
