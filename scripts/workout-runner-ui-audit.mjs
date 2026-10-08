import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const root = resolve(import.meta.dirname, '..');
const nextCli = join(root, 'node_modules', 'next', 'dist', 'bin', 'next');
const browserPath = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].find(existsSync);

if (!existsSync(join(root, '.next', 'BUILD_ID'))) throw new Error('Run pnpm build first.');
if (!browserPath) throw new Error('No local Chromium browser found.');

const probe = createServer();
await new Promise((done, fail) => { probe.once('error', fail); probe.listen(0, '127.0.0.1', done); });
const address = probe.address();
if (!address || typeof address === 'string') throw new Error('Could not reserve an audit port.');
await new Promise(done => probe.close(done));

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
const screenshots = mkdtempSync(join(tmpdir(), 'caizen-workout-audit-'));
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const viewports = [
  [320, 568], [390, 844], [430, 932], [768, 1024],
  [1024, 768], [1440, 900], [1920, 1080], [844, 390],
];

let browser;
try {
  const deadline = Date.now() + 40_000;
  let ready = false;
  while (Date.now() < deadline) {
    try { if ((await fetch(`${origin}/app/`)).ok) { ready = true; break; } } catch {}
    await new Promise(done => setTimeout(done, 250));
  }
  if (!ready) throw new Error(`Next did not start.\n${serverOutput}`);

  browser = await chromium.launch({ executablePath: browserPath, headless: true });
  for (const [width, height] of viewports) {
    // Every viewport gets its own browser profile. The built-in starter routine
    // supplies real, deterministic product content without touching user data.
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' });
    await context.addInitScript(() => {
      localStorage.setItem('life-manager-setup-completed', 'true');
      localStorage.setItem('life-manager-tour-completed', 'true');
      localStorage.setItem('caizen-workout-sound-enabled-v1', 'false');
    });
    const page = await context.newPage();
    page.on('pageerror', error => failures.push(`${width}px runtime: ${error.message}`));
    try {
      await page.goto(`${origin}/app/`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      const localEntry = page.getByRole('button', { name: /Continue (locally|without an account)/i });
      if (await localEntry.isVisible().catch(() => false)) await localEntry.click();
      await page.waitForSelector('[data-caizen-section]', { timeout: 20_000 });
      await page.evaluate(() => window.dispatchEvent(new CustomEvent('caizen:navigate', { detail: { section: 'health', feature: 'workout' } })));
      const starter = width === 390 || width === 1440
        ? page.getByRole('button', { name: 'Start Beginner Full Body' })
        : page.getByRole('button', { name: /^Start .+/ }).first();
      await starter.waitFor({ timeout: 20_000 });
      await starter.click();
      await page.locator('.workout-session-overlay').waitFor();
      await page.getByRole('button', { name: 'Start set' }).waitFor();

      const readyMetrics = await page.evaluate(() => {
        const overlay = document.querySelector('.workout-session-overlay');
        const stage = overlay?.querySelector('.workout-media-stage');
        const interaction = overlay?.querySelector('.workout-interaction');
        const action = overlay?.querySelector('.workout-primary-action');
        const rect = action?.getBoundingClientRect();
        return {
          overflow: Boolean(overlay && overlay.scrollWidth > overlay.clientWidth + 1),
          stage: stage?.getBoundingClientRect().width ?? 0,
          interaction: interaction?.getBoundingClientRect().width ?? 0,
          actionVisible: Boolean(rect && rect.width >= 44 && rect.height >= 44 && rect.left >= 0 && rect.right <= innerWidth),
          columns: getComputedStyle(overlay.querySelector('.workout-cockpit')).gridTemplateColumns.split(' ').length,
        };
      });
      check(!readyMetrics.overflow, `${width}px: horizontal overflow`);
      check(readyMetrics.actionVisible, `${width}px: primary action clipped or too small`);
      check(width >= 900 && height >= 600 ? readyMetrics.columns === 2 : readyMetrics.columns === 1, `${width}px: unexpected column count`);
      check(readyMetrics.stage <= 0 || readyMetrics.stage < width, `${width}px: media stage fills viewport`);
      await page.screenshot({ path: join(screenshots, `ready-${width}x${height}.png`) });

      if (width === 1440) {
        await page.getByRole('button', { name: 'Start set' }).click();
        await page.screenshot({ path: join(screenshots, 'work-1440x900.png') });
      }

      if (width === 390) {
        const settings = page.getByRole('button', { name: 'Workout settings' });
        await settings.click();
        await page.getByRole('menuitem', { name: 'Animation: Full' }).click();
        check(await page.locator('.workout-media-stage--compact').count() === 1, 'Compact preference did not resize media');
        await settings.click();
        await page.getByRole('menuitem', { name: 'Animation: Compact' }).click();
        check(await page.locator('.workout-media-stage').count() === 0, 'Off preference left a media stage');
        await page.keyboard.press('Tab');
        check(await page.evaluate(() => Boolean(document.querySelector('.workout-session-overlay')?.contains(document.activeElement))), 'Tab escaped workout overlay');
        await page.getByRole('button', { name: 'Start set' }).click();
        await page.screenshot({ path: join(screenshots, 'work-off-390x844.png') });
        await page.getByRole('button', { name: 'Pause workout' }).click();
        check(await page.getByText('Paused', { exact: true }).count() === 1, 'Paused phase missing');
        await page.getByRole('button', { name: 'Resume' }).click();
        const reps = page.getByRole('spinbutton', { name: 'Reps' });
        if (await reps.count()) {
          await reps.fill('0');
          check(await reps.inputValue() === '0', 'Recorded zero cannot be entered');
          await reps.fill('10');
        }
        await page.getByRole('button', { name: 'End workout' }).click();
        check(await page.getByRole('button', { name: 'Continue workout' }).count() === 1, 'End dialog missing safe action');
        await page.screenshot({ path: join(screenshots, 'end-dialog-390x844.png') });
        await page.keyboard.press('Escape');
        check(await page.locator('.workout-session-overlay').count() === 1, 'Escape dismissed workout');
        await page.getByRole('button', { name: 'Back to Workout Today' }).click();
        check(await page.getByRole('button', { name: 'Keep & leave' }).count() === 1, 'Checkpoint dialog missing');
        await page.screenshot({ path: join(screenshots, 'leave-dialog-390x844.png') });
        await page.getByRole('button', { name: 'Keep & leave' }).click();
        await page.locator('.workout-session-overlay').waitFor({ state: 'detached' });
        await page.getByRole('button', { name: 'Resume', exact: true }).click();
        await page.locator('.workout-session-overlay').waitFor();
        check(await page.getByText('Paused', { exact: true }).count() === 0, 'Resume did not restore active phase');
        let sawRest = false;
        for (let step = 0; step < 30 && await page.locator('.workout-summary').count() === 0; step += 1) {
          if (await page.getByRole('button', { name: 'Skip Rest' }).count()) {
            if (!sawRest) {
              sawRest = true;
              await page.screenshot({ path: join(screenshots, 'rest-390x844.png') });
              const nextName = await page.locator('.workout-exercise-heading h3').textContent();
              const restCopy = await page.locator('.workout-phase-display').textContent();
              check(Boolean(nextName && restCopy?.includes(nextName)), 'Rest preview differs from upcoming exercise');
              await page.getByRole('button', { name: 'Pause workout' }).click();
              check(await page.getByText('Rest timer paused').count() === 1, 'Paused Rest context missing');
              await page.getByRole('button', { name: 'Resume' }).click();
            }
            await page.getByRole('button', { name: 'Skip Rest' }).click();
          } else {
            await page.locator('.workout-action button').click();
          }
        }
        check(sawRest, 'Rest phase was not reached');
        check(await page.locator('.workout-summary').count() === 1, 'Completion summary was not reached');
        if (await page.locator('.workout-summary').count()) {
          await page.screenshot({ path: join(screenshots, 'summary-390x844.png') });
          await page.getByRole('button', { name: 'Review history' }).click();
          await page.locator('.workout-session-overlay').waitFor({ state: 'detached' });
        }
      }
    } catch (error) {
      failures.push(`${width}px audit: ${error.message}`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser?.close();
  server.kill();
}

if (failures.length) throw new Error(`${failures.join('\n')}\nScreenshots: ${screenshots}`);
console.log(`Workout runner audit passed. Screenshots: ${screenshots}`);
