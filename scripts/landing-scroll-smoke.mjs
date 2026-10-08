/**
 * Regression smoke for the public landing page's target-based scroll motion.
 * Run after `pnpm build`, before the Android export replaces Next's build state.
 */
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { chromium } from 'playwright-core';

const projectRoot = resolve(import.meta.dirname, '..');
const nextCli = join(projectRoot, 'node_modules', 'next', 'dist', 'bin', 'next');
const browserCandidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];
const executablePath = browserCandidates.find(existsSync);

if (!existsSync(join(projectRoot, '.next', 'BUILD_ID'))) {
  throw new Error('.next/BUILD_ID is missing. Run `pnpm build` first.');
}
if (!executablePath) {
  throw new Error('No supported local Chromium browser was found.');
}

const portProbe = createServer();
await new Promise((resolveListen, rejectListen) => {
  portProbe.once('error', rejectListen);
  portProbe.listen(0, '127.0.0.1', resolveListen);
});
const portAddress = portProbe.address();
if (!portAddress || typeof portAddress === 'string') {
  throw new Error('Landing scroll smoke server did not expose a local TCP port.');
}
const port = portAddress.port;
await new Promise(resolveClose => portProbe.close(resolveClose));

const nextServer = spawn(
  process.execPath,
  [nextCli, 'start', '--hostname', '127.0.0.1', '--port', String(port)],
  {
    cwd: projectRoot,
    env: { ...process.env, NODE_ENV: 'production' },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  },
);
let serverOutput = '';
nextServer.stdout.on('data', chunk => { serverOutput += chunk.toString(); });
nextServer.stderr.on('data', chunk => { serverOutput += chunk.toString(); });
const origin = `http://127.0.0.1:${port}`;
const deadline = Date.now() + 30_000;
while (Date.now() < deadline) {
  try {
    const response = await fetch(origin);
    if (response.ok) break;
  } catch {
    // Next is still starting.
  }
  await new Promise(resolveDelay => setTimeout(resolveDelay, 250));
}
if (Date.now() >= deadline) {
  nextServer.kill();
  throw new Error(`Next production server did not start.\n${serverOutput}`);
}

const viewports = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

const browser = await chromium.launch({ executablePath, headless: true });
const failures = [];

try {
  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    const runtimeErrors = [];
    page.on('pageerror', error => runtimeErrors.push(error.message));
    page.on('console', message => {
      if (message.type() === 'error' && !message.text().includes('Failed to load resource')) {
        runtimeErrors.push(message.text());
      }
    });

    try {
      for (const navigation of [origin, 'about:blank', origin]) {
        await page.goto(navigation, { waitUntil: 'networkidle', timeout: 30_000 });
        if (navigation === origin) {
          const landing = page.locator('#landing-content');
          if (!(await landing.isVisible().catch(() => false))) {
            await page.getByRole('button', { name: 'Continue locally', exact: true }).click();
          }
          await landing.waitFor({ state: 'visible', timeout: 12_000 });
          await page.locator('#showcase').scrollIntoViewIfNeeded();
          await page.getByRole('button', { name: 'Sign in to Cloud Backup', exact: true }).first().click();
          await page.getByRole('dialog', { name: 'Cloud Backup' }).waitFor({ state: 'visible', timeout: 5_000 });
          await page.getByRole('dialog', { name: 'Cloud Backup', exact: true }).getByRole('button', { name: 'Close Cloud Backup', exact: true }).click();
          await page.getByRole('dialog', { name: 'Cloud Backup' }).waitFor({ state: 'hidden', timeout: 5_000 });
          await page.waitForTimeout(150);
        }
      }

      if (runtimeErrors.length) {
        failures.push(`${viewport.name}: ${runtimeErrors.join(' | ')}`);
      }
    } catch (error) {
      failures.push(`${viewport.name}: ${error.message}`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
  nextServer.kill();
}

if (failures.length) {
  console.error(`Landing scroll smoke failed:\n${failures.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('Landing scroll smoke passed for desktop and mobile, including navigation away/back.');
}
