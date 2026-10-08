import { existsSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const root = resolve(import.meta.dirname, '..');
const nextCli = join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
const executablePath = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
].find(existsSync);

if (!existsSync(join(root, '.next', 'BUILD_ID'))) throw new Error('Run `pnpm build` before this audit.');
if (!executablePath) throw new Error('No supported local Chromium browser was found.');

const probe = createServer();
await new Promise((resolveListen, rejectListen) => {
  probe.once('error', rejectListen);
  probe.listen(0, '127.0.0.1', resolveListen);
});
const address = probe.address();
if (!address || typeof address === 'string') throw new Error('Could not reserve an audit port.');
await new Promise(resolveClose => probe.close(resolveClose));

const server = spawn(process.execPath, [nextCli, 'start', '--hostname', '127.0.0.1', '--port', String(address.port)], {
  cwd: root,
  env: { ...process.env, NODE_ENV: 'production' },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});
let serverOutput = '';
server.stdout.on('data', chunk => { serverOutput += chunk.toString(); });
server.stderr.on('data', chunk => { serverOutput += chunk.toString(); });
const origin = `http://127.0.0.1:${address.port}`;
const deadline = Date.now() + 30_000;
while (Date.now() < deadline) {
  try {
    if ((await fetch(`${origin}/app/`)).ok) break;
  } catch {}
  await new Promise(resolveDelay => setTimeout(resolveDelay, 250));
}
if (Date.now() >= deadline) throw new Error(`Next did not start.\n${serverOutput}`);

const browser = await chromium.launch({ executablePath, headless: true });
const failures = [];
const viewports = [1440, 1280, 1024, 768, 412, 390, 360, 320];
const screenshotDir = join(root, 'artifacts', 'local', 'v1-validation', 'lifehub-release');
mkdirSync(screenshotDir, { recursive: true });

const check = (condition, message) => {
  if (!condition) failures.push(message);
};

try {
  for (const width of viewports) {
    const context = await browser.newContext({
      viewport: { width, height: width <= 412 ? 844 : 900 },
      reducedMotion: 'reduce',
      colorScheme: 'dark',
    });
    await context.addInitScript(() => {
      localStorage.setItem('life-manager-setup-completed', 'true');
      localStorage.setItem('life-manager-tour-completed', 'true');
      localStorage.setItem('ui-animation-preference', 'reduced');
    });
    const page = await context.newPage();
    page.on('pageerror', error => failures.push(`${width}px runtime: ${error.message}`));
    await page.goto(`${origin}/app/`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    const onboarding = page.getByRole('dialog', { name: /^(A place for the things you want to keep track of\.|Learn Caizen at your pace\.)$/ });
    await onboarding.getByRole('button', { name: 'Explore on my own', exact: true }).click();
    await onboarding.waitFor({ state: 'hidden' });
    await page.waitForSelector('[data-caizen-section="dashboard"]', { timeout: 20_000 });
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('caizen:navigate', { detail: { section: 'lifehub', feature: 'dates' } })));
    await page.waitForSelector('[data-caizen-feature="calendar"]', { timeout: 10_000 });

    const metrics = await page.evaluate(() => {
      const grid = document.querySelector('[data-caizen-feature="calendar"] [role="grid"]');
      const cells = grid ? [...grid.querySelectorAll('[role="gridcell"]')] : [];
      const rect = grid?.getBoundingClientRect();
      return {
        grid: Boolean(grid),
        rows: grid?.querySelectorAll(':scope > [role="row"]').length ?? 0,
        headers: grid?.querySelectorAll('[role="columnheader"]').length ?? 0,
        tabbable: cells.filter(cell => cell.tabIndex === 0).length,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        gridOverflow: rect ? rect.left < -1 || rect.right > innerWidth + 1 : true,
      };
    });
    check(metrics.grid, `${width}px: month grid missing`);
    check(metrics.rows >= 6, `${width}px: semantic grid rows missing`);
    check(metrics.headers === 7, `${width}px: expected seven column headers`);
    check(metrics.tabbable === 1, `${width}px: expected one tabbable day, found ${metrics.tabbable}`);
    check(!metrics.overflow && !metrics.gridOverflow, `${width}px: horizontal overflow`);
    await page.screenshot({ path: join(screenshotDir, `lifehub-calendar-${width}.png`), fullPage: false });

    if (width === 1280) {
      const firstTabbable = page.locator('[role="gridcell"][tabindex="0"]');
      await firstTabbable.focus();
      const before = await firstTabbable.getAttribute('aria-label');
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(150);
      const after = await page.locator('[role="gridcell"]:focus').getAttribute('aria-label');
      check(Boolean(after) && after !== before, `ArrowRight did not move calendar focus (${before} -> ${after})`);
      await page.keyboard.press('Enter');
      check(await page.getByRole('dialog').isVisible().catch(() => false), 'Enter did not open Day Planner');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.activeElement?.getAttribute('role') === 'gridcell', undefined, { timeout: 2_000 }).catch(() => {});
      check(await page.locator('[role="gridcell"]:focus').count() === 1, 'Day Planner close did not restore date focus');

      const sources = page.getByRole('button', { name: /Calendar sources, \d of 5 active/ });
      check(await sources.count() === 1, 'Calendar sources trigger name is missing');
      await sources.click();
      await page.getByRole('button', { name: /History/ }).click();
      const resetSources = page.getByRole('button', { name: /Reset sources/ });
      check(await resetSources.isVisible(), 'Reset sources was not exposed after a change');
      await resetSources.click();
      await page.waitForTimeout(100);
      check(!(await resetSources.isVisible().catch(() => false)), 'Reset sources did not restore the defaults');
      const storedPreferences = await page.evaluate(() => {
        const key = Object.keys(localStorage).find(item => item.startsWith('lifehub-preferences:'));
        return key ? JSON.parse(localStorage.getItem(key) ?? '{}') : null;
      });
      check(storedPreferences?.calendarView === 'month', 'Reset sources changed the calendar mode');
      check(storedPreferences?.calendarFilters?.history === false, 'Reset sources did not persist the default History filter');
      await page.keyboard.press('Escape');

      await page.getByRole('tab', { name: 'Today', exact: true }).click();
      await page.getByRole('button', { name: 'Add', exact: true }).click();
      await page.getByRole('menuitem').first().waitFor({ state: 'visible' });
      const initialMenuItem = page.getByRole('menuitem').first();
      await initialMenuItem.focus();
      const initialText = await initialMenuItem.textContent();
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(150);
      const nextText = await page.locator('[role="menuitem"]:focus').textContent();
      check(Boolean(nextText) && nextText !== initialText, `Quick Add ArrowDown did not move focus (${initialText} -> ${nextText})`);
      await page.keyboard.press('Escape');

      await page.getByRole('tab', { name: 'Tasks', exact: true }).click();
      check(await page.getByRole('searchbox', { name: 'Task search' }).count() === 1, 'Task search name missing');
      check(await page.getByRole('combobox', { name: 'Sort tasks' }).count() === 1, 'Task sort name missing');
    }
    await context.close();
  }
} finally {
  await browser.close();
  server.kill();
}

if (failures.length) {
  console.error(`Life Hub release audit failed (${failures.length}):`);
  failures.forEach(failure => console.error(`  - ${failure}`));
  process.exit(1);
}
console.log('Life Hub release audit passed.');
