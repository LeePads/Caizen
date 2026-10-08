import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  MAX_SLEEP_SCORE,
  MAX_TIMES_AWAKENED,
  normalizeOptionalSleepScore,
  normalizeOptionalTimesAwakened,
} from '@/lib/health/sleep';
import { DEFAULT_MONEY_INPUT_MAX_LENGTH } from '@/components/ui/money-input';

const read = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8');

describe('small corrective remediation contracts', () => {
  it('keeps MoneyInput bounded without truncating valid numeric formats', () => {
    const moneyInput = read('components/ui/money-input.tsx');

    expect(DEFAULT_MONEY_INPUT_MAX_LENGTH).toBe(24);
    expect(moneyInput).toContain('event.currentTarget.value.length > effectiveMaxLength');
    expect(moneyInput).toContain('onChange?.(event)');
    expect(moneyInput).toContain('maxLength={effectiveMaxLength}');
    expect(moneyInput).not.toContain('border-r');
    expect(moneyInput).not.toContain('focus:ring');
    const globalStyles = read('app/globals.css');
    const moneyFocusStart = globalStyles.indexOf('html:has(.caizen-root) .money-input-shell:has');
    const moneyFocusEnd = globalStyles.indexOf(
      'html:has(.caizen-root) .money-input-shell .money-input-field',
      moneyFocusStart,
    );
    const moneyFocusBlock = globalStyles.slice(moneyFocusStart, moneyFocusEnd);

    expect(globalStyles).toContain('.money-input-shell:has(.money-input-field:focus-visible)');
    expect(moneyFocusBlock).not.toContain('outline: 2px solid');
  });

  it('keeps Sleep metrics within their explicit entry bounds', () => {
    const sleepModal = read('components/modals/SleepModal.tsx');

    expect(MAX_SLEEP_SCORE).toBe(100);
    expect(MAX_TIMES_AWAKENED).toBe(99);
    expect(normalizeOptionalSleepScore(100)).toBe(100);
    expect(normalizeOptionalSleepScore(101)).toBeUndefined();
    expect(normalizeOptionalSleepScore(-1)).toBeUndefined();
    expect(normalizeOptionalTimesAwakened(0)).toBe(0);
    expect(normalizeOptionalTimesAwakened(-1)).toBeUndefined();
    expect(sleepModal).not.toContain('maxLength={3}');
    expect(sleepModal).not.toContain('maxLength={2}');
    expect(sleepModal).toContain('guardHealthNumberChange');
    expect(sleepModal).toContain('parsedTimesAwakened > MAX_TIMES_AWAKENED');
  });

  it('keeps the compact workout schedule and horizontal-only Health drag contract', () => {
    const workout = read('components/modals/WorkoutPlanModal.tsx');
    const health = read('components/sections/HealthSection.tsx').replace(/\r\n/g, '\n');

    expect(workout).toContain('Schedule in Life Hub');
    expect(workout).toContain('grid h-10 min-w-0');
    expect(workout).not.toContain('aspect-square min-w-0 place-items-center rounded-xl');
    expect(health.match(/modifiers=\{\[restrictToHorizontalAxis, restrictHealthTabToRow\]\}/g)).toHaveLength(2);
    expect(health).toContain('transform ? { ...transform, y: 0 } : transform');
    expect(health).toMatch(/grid h-\[[^\]]+\] max-w-full min-w-0 overflow-hidden/);
    expect(health).toContain('overflow-y-hidden');
    expect(health).not.toContain('touch-pan-x');
    expect(health).toContain('createPortal(\n          <DragOverlay');
  });

  it('keeps Music menu scrolling inside and exposes bounded queue actions', () => {
    const player = read('components/music/MusicFullPlayer.tsx');
    const menuStart = player.indexOf('<div className="cz-sheet-actions">');
    const menuEnd = player.indexOf('</section>', menuStart);
    const menu = player.slice(menuStart, menuEnd);

    expect(player).toContain('menuRef.current?.contains(target)');
    expect(player).toContain('data-overlay-surface="music-menu"');
    expect(menu).not.toContain('<strong>Play now</strong>');
    expect(menu).toContain('<strong>Play next</strong>');
    expect(menu).toContain('<strong>Move to end</strong>');
    expect(menu).not.toContain('<strong>Move up</strong>');
    expect(menu).not.toContain('<strong>Move down</strong>');
    expect(menu).toContain('<strong>Remove from queue</strong>');
    expect(menu).toContain('<strong>Edit metadata</strong>');
  });

  it('mounts Journal add/edit through the viewport-level body portal', () => {
    const journal = read('components/modals/JournalModal.tsx');

    expect(journal).toContain("import { createPortal } from 'react-dom';");
    expect(journal).toContain('return createPortal((');
    expect(journal).toContain('), document.body);');
    expect(journal).toContain('useOverlayLifecycle');
    expect(journal).toContain('fixed inset-0');
    expect(journal).toContain('max-h-[94dvh]');
  });

  it('keeps the Sleep time wheel exact-minute and natively scrollable', () => {
    const sleepPicker = read('components/ui/sleep-time-picker.tsx');
    const wheel = read('components/native/android-design.tsx');
    const styles = read('app/globals.css');

    expect(sleepPicker).toContain('minuteStep={1}');
    expect(wheel).toContain('const WHEEL_ITEM_HEIGHT = 44;');
    expect(wheel).toContain('onScroll={handleScroll}');
    expect(wheel).toContain('element.scrollTo');
    expect(styles).toContain('overflow-y: scroll;');
    expect(styles).toContain('overscroll-behavior: contain;');
    expect(styles).toContain('touch-action: pan-y !important;');
  });
});
