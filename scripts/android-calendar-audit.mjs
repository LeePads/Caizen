/**
 * Calendar layout audit.
 *
 * Measures what the generic overflow check cannot see. `.mobile-calendar-scroll`
 * is an overflow-x:auto scroller and `.caizen-stage` is overflow-x:clip, so a
 * clipped 7th column never shows up as document-level horizontal overflow -
 * which is why the phase18 harness reported `failures: []` while Saturday was
 * missing on a real device.
 *
 *   node scripts/android-calendar-audit.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  completeNativeEntry,
  installAndroid,
  launchBrowser,
  navigate,
  repoRoot,
  settle,
  startStaticServer,
} from './lib/android-harness.mjs';

const shotDir = join(repoRoot, 'artifacts', 'screenshots', 'calendar');
mkdirSync(shotDir, { recursive: true });

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 360, height: 640 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
];

/**
 * Only LifeHub and Health accept a `feature` through the navigate event; the
 * other calendars live behind an in-section tab, so they have to be clicked.
 */
const TARGETS = [
  { section: 'lifehub', feature: 'dates', name: 'lifehub-calendar' },
  { section: 'journal', name: 'journal-calendar', open: 'Calendar' },
  { section: 'workhub', name: 'workhub-calendar', open: 'Schedule' },
];

const measure = () => {
  // Prefer the shared grid; fall back to the legacy markup so this script
  // reports the true "before" state as well as the fixed one.
  const grid =
    document.querySelector('.cz-month-grid') ??
    document.querySelector('.android-calendar-month-grid') ??
    document.querySelector('.mobile-calendar-grid .grid-cols-7:last-child') ??
    document.querySelector('.mobile-calendar-grid');
  if (!grid) return { present: false };

  const weekdays =
    document.querySelector('.cz-month-weekdays') ??
    document.querySelector('.android-calendar-weekdays') ??
    document.querySelector('.mobile-calendar-grid .grid-cols-7:first-child');

  const scroller = grid.closest('.mobile-calendar-scroll, .cz-month');
  const gridRect = grid.getBoundingClientRect();
  const cells = [...grid.querySelectorAll('[role="gridcell"]')].filter(
    (node) => node.getBoundingClientRect().width > 0,
  );
  const cellRects = cells.map((node) => node.getBoundingClientRect());
  const overlappingRows = cellRects.some((rect, index) => {
    const below = cellRects[index + 7];
    return Boolean(below && below.top < rect.bottom - 0.5);
  });

  // Columns = distinct x positions among the first row of cells.
  const firstRowTop = cellRects.length ? Math.round(cellRects[0].top) : 0;
  const firstRow = cellRects.filter((rect) => Math.round(rect.top) === firstRowTop);

  const weekdayRects = weekdays
    ? [...weekdays.children].map((node) => node.getBoundingClientRect())
    : [];
  const visibleWeekdays = weekdayRects.filter(
    (rect) => rect.left >= -1 && rect.right <= window.innerWidth + 1 && rect.width > 0,
  ).length;

  const dock = document.querySelector('.caizen-mobile-dock, .cz-shell-nav');
  const dockRect = dock ? dock.getBoundingClientRect() : null;

  const cellsBelowDock = dockRect
    ? cellRects.filter((rect) => rect.bottom > dockRect.top + 1).length
    : 0;

  const aspect = firstRow.length
    ? firstRow.reduce((sum, rect) => sum + rect.width / Math.max(rect.height, 1), 0) / firstRow.length
    : 0;

  return {
    present: true,
    columns: firstRow.length,
    weekdayCount: weekdayRects.length,
    visibleWeekdays,
    cellCount: cells.length,
    cellWidth: firstRow.length ? Number(firstRow[0].width.toFixed(1)) : 0,
    cellHeight: firstRow.length ? Number(firstRow[0].height.toFixed(1)) : 0,
    tabbableCells: cells.filter(node => node.tabIndex === 0).length,
    semanticRows: grid.querySelectorAll(':scope > [role="row"]').length,
    columnHeaders: grid.querySelectorAll('[role="columnheader"]').length,
    overlappingRows,
    // The clipping the document-level overflow check cannot see.
    gridWidth: Math.round(gridRect.width),
    scrollerClientWidth: scroller ? Math.round(scroller.clientWidth) : null,
    scrollerScrollWidth: scroller ? Math.round(scroller.scrollWidth) : null,
    clippedHorizontally: scroller ? scroller.scrollWidth > scroller.clientWidth + 1 : false,
    rightmostCellVisible: firstRow.length
      ? firstRow[firstRow.length - 1].right <= window.innerWidth + 1
      : false,
    cellAspectRatio: Number(aspect.toFixed(2)),
    // Dead space: the gap between the weekday row and the first cell row.
    weekdayToGridGap: weekdayRects.length && cellRects.length
      ? Math.round(cellRects[0].top - weekdayRects[0].bottom)
      : null,
    monthHeight: Math.round(
      cellRects.length ? cellRects[cellRects.length - 1].bottom - gridRect.top : gridRect.height,
    ),
    viewportHeight: window.innerHeight,
    cellsBelowDock,
    compactGuidanceVisible: Boolean(
      document.querySelector('.cz-month-overview-guidance') &&
      getComputedStyle(document.querySelector('.cz-month-overview-guidance')).display !== 'none'
    ),
  };
};

const { server, origin } = await startStaticServer();
const browser = await launchBrowser();
const results = [];
const failures = [];

try {
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({ viewport, colorScheme: 'dark', reducedMotion: 'reduce' });
    const page = await context.newPage();
    await installAndroid(page);
    await page.goto(origin, { waitUntil: 'networkidle', timeout: 30_000 });
    await completeNativeEntry(page);
    await settle(page);

    // A fresh profile has no Work Hub project by design, so its Schedule tab
    // is not rendered until the user creates one. Seed that prerequisite
    // through the same UI path a user follows; production code stays honest
    // about the empty workspace state.
    await navigate(page, 'workhub');
    const createProject = page.locator('button[aria-label="Create project"]:visible').first();
    if (await createProject.count()) {
      await createProject.click();
      const projectDialog = page.getByRole('dialog', { name: 'Create project' });
      await projectDialog.locator('input[placeholder="Project name"]').fill('Android calendar audit project');
      await projectDialog.getByRole('button', { name: 'Save', exact: true }).click();
      await page.waitForTimeout(250);
    }

    for (const target of TARGETS) {
      try {
        await navigate(page, target.section, target.feature);
        if (target.open) {
          // These entry points are tabs in some sections and buttons in
          // others, so match on either role.
          const tab = page
            .locator(`button:text-is("${target.open}"), [role="tab"]:text-is("${target.open}")`)
            .first();
          if (await tab.count()) {
            await tab.click();
            await page.waitForTimeout(250);
          }
        }
        if (target.name === 'workhub-calendar') {
          // Work Hub opens Schedule in its useful agenda view. Switch to the
          // explicit Month view before measuring the calendar grid.
          const month = page.locator('button:text-is("Month"):visible').first();
          if (await month.count()) {
            await month.click();
            await page.waitForTimeout(250);
          }
        }
        // Scroll the grid into view before measuring: a calendar below the fold
        // would otherwise report every cell as "behind the bottom navigation".
        await page.evaluate(() => {
          const grid =
            document.querySelector('.cz-month-grid') ??
            document.querySelector('.android-calendar-month-grid') ??
            document.querySelector('.mobile-calendar-grid');
          grid?.scrollIntoView({ block: 'center' });
        });
        await page.waitForTimeout(250);
        const metrics = await page.evaluate(measure);
        const label = `${target.name}@${viewport.width}x${viewport.height}`;
        results.push({ label, ...metrics });

        if (!metrics.present) {
          failures.push(`${label}: no calendar grid found`);
          continue;
        }
        if (metrics.columns !== 7) failures.push(`${label}: ${metrics.columns} columns, expected 7`);
        if (metrics.tabbableCells !== 1) failures.push(`${label}: ${metrics.tabbableCells} tabbable dates, expected 1`);
        if (metrics.semanticRows < 6 || metrics.columnHeaders !== 7) {
          failures.push(`${label}: incomplete grid/row/header semantics`);
        }
        if (metrics.overlappingRows) failures.push(`${label}: date hit regions overlap`);
        if (metrics.weekdayCount && metrics.visibleWeekdays !== 7) {
          failures.push(`${label}: only ${metrics.visibleWeekdays}/7 weekday headers visible`);
        }
        if (metrics.clippedHorizontally) {
          failures.push(
            `${label}: grid clipped (${metrics.scrollerScrollWidth}px in ${metrics.scrollerClientWidth}px)`,
          );
        }
        if (!metrics.rightmostCellVisible) failures.push(`${label}: rightmost column off-screen`);
        if (metrics.cellAspectRatio > 2.2 || metrics.cellAspectRatio < 0.6) {
          failures.push(`${label}: cells not near-square (aspect ${metrics.cellAspectRatio})`);
        }
        if (metrics.weekdayToGridGap !== null && metrics.weekdayToGridGap > 24) {
          failures.push(`${label}: ${metrics.weekdayToGridGap}px of dead space under the weekday row`);
        }
        if (metrics.cellsBelowDock > 0) {
          failures.push(`${label}: ${metrics.cellsBelowDock} date cell(s) behind the bottom navigation`);
        }
        if (target.name === 'lifehub-calendar' && viewport.width >= 390 && metrics.cellWidth < 48) {
          failures.push(`${label}: ${metrics.cellWidth}px date cells, expected at least 48px`);
        }
        if (target.name === 'lifehub-calendar' && viewport.width <= 360 && !metrics.compactGuidanceVisible) {
          failures.push(`${label}: compact overview guidance is not visible`);
        }

        if (viewport.width === 390 || viewport.width === 320) {
          await page.screenshot({ path: join(shotDir, `${label}.png`), fullPage: false });
        }
      } catch (error) {
        failures.push(`${target.name}@${viewport.width}: ${error.message.split('\n')[0]}`);
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}

writeFileSync(
  join(repoRoot, 'artifacts', 'android-calendar-audit.json'),
  `${JSON.stringify({ measuredAt: new Date().toISOString(), failures, results }, null, 2)}\n`,
);

console.log(JSON.stringify(results, null, 2));
if (failures.length) {
  console.error(`\nCalendar audit FAILED (${failures.length}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('\nCalendar audit passed.');
