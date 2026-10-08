import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
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
  throw new Error('.next/BUILD_ID is missing. Run pnpm build first.');
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
  throw new Error('Activation smoke server did not expose a local TCP port.');
}
const port = portAddress.port;
await new Promise(resolveClose => portProbe.close(resolveClose));

const nextServer = spawn(process.execPath, [nextCli, 'start', '--hostname', '127.0.0.1', '--port', String(port)], {
  cwd: projectRoot,
  env: { ...process.env, NODE_ENV: 'production' },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});
let serverOutput = '';
nextServer.stdout.on('data', chunk => { serverOutput += chunk.toString(); });
nextServer.stderr.on('data', chunk => { serverOutput += chunk.toString(); });
const origin = `http://127.0.0.1:${port}`;
const deadline = Date.now() + 30_000;
while (Date.now() < deadline) {
  try {
    const response = await fetch(`${origin}/app/`);
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
const browser = await chromium.launch({ executablePath, headless: true });

const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const requireVisible = async locator => { await locator.waitFor({ state: 'visible', timeout: 20000 }); };
const enter = async () => {
  await page.getByRole('button', { name: 'See this with sample data', exact: true }).click();
  await page.getByRole('button', { name: 'Open Demo', exact: true }).click();
  await requireVisible(page.getByText('Demo workspace', { exact: true }));
};
const exit = async label => {
  await page.getByRole('button', { name: label, exact: true }).first().click();
  await page.getByRole('alertdialog').getByRole('button', { name: label, exact: true }).click();
  await page.waitForFunction(() => localStorage.getItem('life-manager-demo-mode') !== 'true');
};
try {
  await page.goto(origin + '/app/');
  await requireVisible(page.getByText('Stored on this device. No account required.', { exact: true }));
  await page.screenshot({ path: join(process.env.TEMP || '.', 'caizen-first-use-desktop.png') });
  await page.getByRole('button', { name: /Explore a ready-made Caizen/ }).click();
  await requireVisible(page.getByText('Demo workspace', { exact: true }));
  await exit('Back to welcome');
  await requireVisible(page.getByRole('button', { name: /Set up my Caizen/ }));
  console.log('PASS fresh welcome Demo return');
  await page.getByRole('button', { name: /Set up my Caizen/ }).click();
  await page.getByRole('textbox', { name: 'Workspace name' }).fill('My learning workspace');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('radio', { name: /Care for my health/ }).check();
  await page.getByRole('button', { name: 'Add another area', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Understand my money', exact: true }).check();
  await page.getByRole('button', { name: 'Preview my areas', exact: true }).click();
  await requireVisible(page.getByRole('heading', { name: 'Health: start here', exact: true }));
  await enter();
  await requireVisible(page.getByRole('heading', { name: 'Health: what to notice', exact: true }));
  await page.reload();
  await requireVisible(page.getByRole('heading', { name: 'Health: what to notice', exact: true }));
  await exit('Resume setup');
  await requireVisible(page.getByRole('heading', { name: 'Health: start here', exact: true }));
  await page.getByRole('button', { name: 'Next area', exact: true }).click();
  await requireVisible(page.getByRole('heading', { name: 'Money: start here', exact: true }));
  console.log('PASS targeted Demo and reload preserve setup cursor');
  await page.getByRole('button', { name: 'Collapse section guide', exact: true }).click();
  await requireVisible(page.getByRole('button', { name: 'Continue setup', exact: true }));
  await page.reload();
  await requireVisible(page.getByRole('button', { name: 'Continue setup', exact: true }));
  await page.getByRole('button', { name: 'Continue setup', exact: true }).click();
  await page.getByRole('button', { name: 'Finish setup', exact: true }).click();
  await requireVisible(page.getByRole('button', { name: 'About this area', exact: true }));
  console.log('PASS durable pause, resume, completion and contextual help');
  await page.getByRole('button', { name: 'Open Settings', exact: true }).click();
  await page.getByRole('navigation', { name: 'Settings categories' }).getByRole('button', { name: /Help & About/ }).click();
  await page.getByRole('button', { name: 'Replay introduction', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Replay', exact: true }).click();
  await requireVisible(page.getByRole('heading', { name: 'Learn Caizen at your pace.', exact: true }));
  await page.getByRole('button', { name: /Explore a ready-made Caizen/ }).click();
  await requireVisible(page.getByText('Demo workspace', { exact: true }));
  await exit('Resume introduction');
  await requireVisible(page.getByRole('heading', { name: 'Learn Caizen at your pace.', exact: true }));
  await page.getByRole('button', { name: 'Explore on my own', exact: true }).click();
  console.log('PASS replay introduction Demo return');
  await page.getByRole('button', { name: 'Open Settings', exact: true }).click();
  await page.getByRole('navigation', { name: 'Settings categories' }).getByRole('button', { name: /Advanced/ }).click();
  await page.getByRole('button', { name: 'Enter Demo', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Open Demo', exact: true }).click();
  await requireVisible(page.getByText('Demo workspace', { exact: true }));
  await page.getByRole('button', { name: 'All areas', exact: true }).click();
  const journey = page.getByRole('navigation', { name: 'All Caizen areas' });
  if (await journey.getByRole('button').count() !== 10) throw new Error('Guide must expose all ten destinations');
  await journey.getByRole('button', { name: 'Music', exact: true }).click();
  await requireVisible(page.getByRole('heading', { name: 'Music: what to notice', exact: true }));
  // Canonical Demo v5 contains saved provider links, not the retired local song.
  await page.getByRole('searchbox', { name: 'Search music', exact: true }).fill('David Kushner - Daylight');
  await requireVisible(page.getByRole('button', { name: /^(Play|Open) David Kushner - Daylight/ }).first());
  console.log('PASS ten guide destinations and canonical Music collection');
  await exit('Return to my workspace');
  await requireVisible(page.getByText('My learning workspace', { exact: true }).first());
  await page.getByRole('button', { name: /^Search Caizen/ }).click();
  await page.getByRole('combobox', { name: 'Search Caizen commands and records' }).fill('About this area');
  await page.getByRole('option', { name: /About this area/ }).click();
  await requireVisible(page.getByRole('button', { name: 'About this area', exact: true }));
  if (!(await page.locator('body').innerText()).includes('My learning workspace')) throw new Error('Workspace name did not return');
  console.log('PASS existing workspace Demo return');
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', isMobile: true, hasTouch: true });
  const mobilePage = await mobile.newPage();
  await mobilePage.goto(origin + '/app/');
  await requireVisible(mobilePage.getByRole('button', { name: /Set up my Caizen/ }));
  await mobilePage.screenshot({ path: join(process.env.TEMP || '.', 'caizen-first-use-mobile.png') });
  await mobilePage.getByRole('button', { name: /Set up my Caizen/ }).click();
  await mobilePage.getByRole('button', { name: 'Use defaults', exact: true }).click();
  await requireVisible(mobilePage.getByRole('button', { name: 'Open Dashboard', exact: true }));
  const overflow = await mobilePage.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  if (overflow) throw new Error('Mobile onboarding overflows horizontally');
  await mobilePage.getByRole('button', { name: 'Open Dashboard', exact: true }).click();
  await requireVisible(mobilePage.getByRole('button', { name: 'About this area', exact: true }));
  console.log('PASS mobile defaults and no-interest completion');
  await mobile.close();
  if (errors.length) throw new Error(errors.join('\n'));
} catch (error) {
  console.error((await page.locator('body').innerText()).slice(-8000));
  throw error;
} finally { await browser.close(); nextServer.kill(); }
