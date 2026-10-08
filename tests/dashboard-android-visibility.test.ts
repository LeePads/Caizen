import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Regression guard for a confirmed physical-device bug: a CSS rule in
 * globals.css set `display: none` on every <p> inside the first child of
 * any .section-surface on the Dashboard, plus the last <p> in any button
 * inside a top-level .grid on the Dashboard. That silently hid Life Pulse,
 * Priority Stack, Command Center, Financial Snapshot, and Weekly Review's
 * real content and subtitles - the text was present in the DOM
 * (textContent), but had display:none (confirmed via computed style and
 * screenshots), so nothing was visible on the actual device. There is no
 * legitimate reason to hide arbitrary paragraphs this broadly, so this test
 * asserts the exact selector pattern cannot reappear.
 */
describe('Dashboard Android CSS does not blanket-hide panel text', () => {
  const css = readFileSync(resolve(__dirname, '..', 'app', 'globals.css'), 'utf8');

  it('does not hide every <p> inside a dashboard section-surface header', () => {
    expect(css).not.toContain(
      "[data-caizen-section='dashboard'] .section-surface > div:first-child p",
    );
  });

  it('does not hide the last <p> in every dashboard grid button', () => {
    expect(css).not.toContain(
      "[data-caizen-section='dashboard'] > .grid > button p:last-of-type",
    );
  });
});
