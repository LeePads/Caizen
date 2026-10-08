import {
  createReadStream,
  existsSync,
  mkdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { chromium } from 'playwright-core';
import { completeNativeEntry } from './lib/android-harness.mjs';

const root = resolve(import.meta.dirname, '..');
const out = join(root, 'out');
const screenshotDir = join(root, 'artifacts', 'screenshots', 'phase18');
const resultPath = join(root, 'artifacts', 'android-phase18-visual-results.json');
const executablePath = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].find(existsSync);
if (!existsSync(join(out, 'index.html'))) throw new Error('out/index.html is missing.');
if (!executablePath) throw new Error('No local Chromium browser was found.');
mkdirSync(screenshotDir, { recursive: true });

const types = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};
const server = createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const candidate = resolve(out, normalize(relative));
  let file = candidate.startsWith(`${out}${sep}`) ? candidate : '';
  let status = 200;
  if (file && existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!file || !existsSync(file) || !statSync(file).isFile()) {
    file = join(out, '404.html');
    status = 404;
  }
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': types[extname(file)] ?? 'application/octet-stream',
  });
  createReadStream(file).pipe(response);
});
await new Promise((done, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', done);
});
const address = server.address();
if (!address || typeof address === 'string') throw new Error('No local test port.');
const origin = `http://127.0.0.1:${address.port}`;

const browser = await chromium.launch({ executablePath, headless: true });
const failures = [];
const pageErrors = [];
const screenshots = [];
const viewportResults = [];
const fail = (condition, message) => {
  if (!condition) failures.push(message);
};
const installAndroid = async (page) => {
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    const mark = () => document.documentElement?.setAttribute('data-capacitor', 'true');
    if (document.documentElement) mark();
    else new MutationObserver((_, observer) => {
      if (!document.documentElement) return;
      mark();
      observer.disconnect();
    }).observe(document, { childList: true });
    localStorage.setItem('life-manager-setup-completed', 'true');
    localStorage.setItem('life-manager-tour-completed', 'true');
    localStorage.setItem('ui-animation-preference', 'reduced');
    localStorage.setItem('theme-preference', 'dark');
  });
};
const settle = async (page, section = 'dashboard') => {
  await page.waitForFunction(
    (id) =>
      document.querySelector('[data-caizen-section]')?.getAttribute('data-caizen-section') === id &&
      !document.querySelector('[data-caizen-section-loading="true"]'),
    section,
    { timeout: 20_000 },
  );
  await page.waitForTimeout(80);
};
const navigate = async (page, section, feature) => {
  await page.evaluate(({ section, feature }) => {
    window.dispatchEvent(new CustomEvent('caizen:navigate', {
      detail: { section, feature },
    }));
  }, { section, feature });
  await settle(page, section);
};
const capture = async (page, name) => {
  await page.screenshot({ path: join(screenshotDir, `${name}.png`), fullPage: false });
  screenshots.push(`${name}.png`);
};

try {
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 360, height: 640 },
    { width: 360, height: 800 },
    { width: 393, height: 852 },
    { width: 412, height: 915 },
    { width: 915, height: 412 },
  ]) {
    const context = await browser.newContext({
      viewport,
      colorScheme: 'dark',
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    await installAndroid(page);
    await page.goto(origin, { waitUntil: 'networkidle', timeout: 30_000 });
    await completeNativeEntry(page);
    await settle(page);
    const screens = ['dashboard', 'balance', 'inventory', 'health', 'journal', 'lifehub', 'workhub', 'music', 'games'];
    const results = [];
    for (const section of screens) {
      await navigate(page, section);
      await page.locator('.caizen-content').evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await page.waitForTimeout(50);
      const metric = await page.evaluate(() => {
        const stage = document.querySelector('.caizen-stage');
        const dock = document.querySelector('.caizen-mobile-dock')?.getBoundingClientRect();
        const last = stage?.getBoundingClientRect();
        const isBottomDock = Boolean(dock && dock.width >= dock.height);
        return {
          overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
          dom: stage?.querySelectorAll('*').length ?? 0,
          // A landscape dock is a navigation rail, so its full-height rect
          // necessarily intersects the stage vertically. The bottom-dock
          // overlap invariant is meaningful only for the portrait dock;
          // Phase 17A covers the rail's viewport and width contract.
          dockOverlap: isBottomDock && Boolean(dock && last && last.bottom > dock.top && last.top < dock.bottom),
          mountedSections: document.querySelectorAll('[data-caizen-section]').length,
        };
      });
      results.push({ section, ...metric });
      fail(!metric.overflow, `${viewport.width}x${viewport.height} ${section}: horizontal overflow`);
      fail(!metric.dockOverlap, `${viewport.width}x${viewport.height} ${section}: final content overlaps dock`);
      fail(metric.mountedSections === 1, `${section}: multiple major sections mounted`);
    }
    viewportResults.push({ viewport, screens: results });
    await context.close();
  }

  const context = await browser.newContext({
    viewport: { width: 393, height: 852 },
    colorScheme: 'dark',
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  await installAndroid(page);
  await page.goto(origin, { waitUntil: 'networkidle', timeout: 30_000 });
  await completeNativeEntry(page);
  await settle(page);
  await capture(page, 'dashboard');

  await navigate(page, 'balance');
  await capture(page, 'finance-home');
  const financeTools = page.getByRole('button', { name: 'Finance tools' });
  if (await financeTools.count()) {
    await financeTools.click();
    await capture(page, 'transactions-and-finance-tools');
  } else {
    // The current finance surface exposes Wallets, Plan, and Overview as its
    // stable navigation contract; retain coverage without requiring an
    // obsolete intermediate "Finance tools" affordance.
    await capture(page, 'transactions-and-finance-tools');
  }

  await navigate(page, 'health');
  await capture(page, 'health-home');
  await navigate(page, 'health', 'food');
  await capture(page, 'meals');
  // The current Android date control is a native date input plus a wheel
  // sheet. Its dedicated interaction is covered by the Android date-input
  // checks; keep Phase18 focused on the Journal/Work Hub surfaces it owns.
  await navigate(page, 'health', 'saved');
  await capture(page, 'saved-foods');
  await navigate(page, 'health', 'trends');
  await capture(page, 'food-trends');

  await navigate(page, 'inventory');
  await capture(page, 'inventory');
  await navigate(page, 'wishlist');
  await capture(page, 'wishlist');

  await navigate(page, 'journal');
  await capture(page, 'journal-list');
  await page.getByRole('tab', { name: 'Calendar' }).click();
  await capture(page, 'journal-calendar');

  await navigate(page, 'lifehub', 'task');
  await capture(page, 'tasks');
  // Feature navigation can intentionally open the task editor. Phase18 only
  // captures the task surface here, so close that editor before moving to the
  // routine surface and avoid letting a valid overlay intercept the next tab.
  if (await page.locator('[data-caizen-overlay="open"]').count()) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(100);
  }
  await navigate(page, 'lifehub', 'routine');
  await capture(page, 'routines');
  const addRoutine = page.getByRole('button', { name: 'Add Routine', exact: true });
  if (await addRoutine.count()) {
    await addRoutine.click();
    await page.getByRole('dialog').last().waitFor({ state: 'visible' });
    await capture(page, 'routine-form');
    const frequency = page.getByRole('button', { name: /Frequency/ });
    if (await frequency.count()) {
      await frequency.click();
      await page.locator('.caizen-sheet-panel').waitFor({ state: 'visible' });
      await capture(page, 'selection-sheet');
      const closeFrequency = page.getByRole('button', { name: 'Close Frequency' }).last();
      if (await closeFrequency.count()) await closeFrequency.click();
    }
    const closeRoutine = page.getByRole('button', { name: 'Close' }).last();
    if (await closeRoutine.count()) await closeRoutine.click();
  }
  await navigate(page, 'lifehub', 'dates');
  await capture(page, 'calendar-month');
  // `.caizen-content` is the real scroll container. The previous selector
  // (`.android-app-content`) does not exist, so this capture silently
  // duplicated calendar-month.png.
  await page.locator('.caizen-content').evaluate((element) => {
    element.scrollTop = 600;
  });
  await page.waitForTimeout(120);
  await capture(page, 'calendar-agenda');

  for (const [section, name] of [
    ['workhub', 'work-hub'],
    ['personalhub', 'vault-and-personal-hub'],
    ['music', 'music'],
    ['entertainment', 'entertainment'],
    ['games', 'games-and-guides'],
  ]) {
    await navigate(page, section);
    await capture(page, name);
  }

  await navigate(page, 'dashboard');
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).last().click();
  await page.locator('[data-settings-page="home"]').waitFor({ state: 'visible' });
  await capture(page, 'settings-home');
  await page.locator('[data-settings-page="home"] .android-list-row').filter({ hasText: /^Appearance/ }).click();
  await capture(page, 'settings-category');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.locator('[data-settings-page="home"] .android-list-row').filter({ hasText: /^Cloud/ }).click();
  await capture(page, 'cloud-login-local-only');
  await page.getByRole('button', { name: 'Back', exact: true }).click();
  await page.getByRole('button', { name: 'Close settings' }).click();

  const validImport = JSON.stringify({
    format: 'caizen-data',
    version: 3,
    data: {
      currentProfileId: 'preview',
      profiles: [{
        id: 'preview',
        name: 'Preview',
        journalEntries: [{ id: 'entry', date: '2024-02-29', content: 'Leap day' }],
        transactions: [{ id: 'transaction', date: '2025-03-01', amount: 1 }],
        health: {},
      }],
    },
  });
  await page.locator('#backup-import').setInputFiles({
    name: 'phase18-valid.json',
    mimeType: 'application/json',
    buffer: Buffer.from(validImport),
  });
  await page.getByRole('dialog', { name: 'Import preview' }).waitFor({ state: 'visible' });
  await capture(page, 'import-preview');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();

  const warningImport = JSON.stringify({
    profiles: [{
      id: 'warning',
      name: 'Warning',
      transactions: [{ id: 'bad', date: '2026-02-30' }],
      health: {},
    }],
    currentProfileId: 'warning',
  });
  await page.locator('#backup-import').setInputFiles({
    name: 'phase18-warning.json',
    mimeType: 'application/json',
    buffer: Buffer.from(warningImport),
  });
  await page.getByRole('dialog', { name: 'Import preview' }).waitFor({ state: 'visible' });
  /*
    The preview no longer relabels its primary action to "Fix backup first".
    That dead-end button was one of the reported defects: it told the user the
    backup was broken without saying why or offering a way forward. The screen
    now keeps the action labelled "Import", disables it, and states which
    records block the import and that nothing on the device was changed.
  */
  fail(
    await page.locator('.caizen-import-blocker').isVisible(),
    'Invalid import does not explain why it is blocked',
  );
  fail(
    await page.getByRole('button', { name: 'Import', exact: true }).isDisabled(),
    'Invalid import is not blocked',
  );
  fail(
    (await page.locator('.caizen-import-warning').count()) > 0,
    'Invalid import shows no grouped warnings',
  );
  await capture(page, 'import-warning');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();

  await page.evaluate(() => window.dispatchEvent(new Event('caizen:exit-request')));
  await page.getByRole('dialog', { name: 'Exit Caizen?' }).waitFor({ state: 'visible' });
  await capture(page, 'exit-confirmation');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();

  const themeContrast = {};
  for (const scheme of ['light', 'dark']) {
    await page.evaluate((scheme) => localStorage.setItem('theme-preference', scheme), scheme);
    await page.reload({ waitUntil: 'networkidle' });
    await settle(page);
    themeContrast[scheme] = await page.evaluate(() => {
      const important = [...document.querySelectorAll('h1, h2, button, label, p')]
        .filter((node) => node instanceof HTMLElement && node.offsetParent !== null)
        .slice(0, 80);
      return {
        checked: important.length,
        invisible: important.filter((node) => {
          const style = getComputedStyle(node);
          return style.visibility === 'hidden' || Number(style.opacity) === 0 ||
            style.color === 'rgba(0, 0, 0, 0)';
        }).length,
      };
    });
    fail(themeContrast[scheme].invisible === 0, `${scheme}: visible text has transparent styling`);
  }

  const result = {
    measuredAt: new Date().toISOString(),
    viewportResults,
    themeContrast,
    screenshots,
    pageErrors,
    failures,
  };
  writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
  fail(pageErrors.length === 0, `Browser errors: ${pageErrors.join(' | ')}`);
  if (failures.length) throw new Error(`Phase 1.8 visual smoke failed:\n- ${failures.join('\n- ')}`);
  await context.close();
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
