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
const context = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  reducedMotion: 'reduce',
});
// AppProvider creates an empty local profile during hydration. Seed the
// explicit pending marker so this smoke test exercises the first-run welcome
// flow instead of depending on the provider's internal bootstrap timing.
await context.addInitScript(() => {
  if (window.localStorage.getItem('life-manager-setup-completed') !== 'true') {
    window.localStorage.setItem('caizen-onboarding-pending-v1', 'true');
  }
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error' && !message.text().includes('Failed to load resource')) {
    errors.push(message.text());
  }
});

const check = (condition, message) => {
  if (!condition) throw new Error(message);
};

const assertCenteredWebsiteOverlay = async (page, {
  label,
  rootSelector,
  panelSelector,
  rootFromPanel = false,
  alignmentSelector,
}) => {
  const rootLocator = page.locator(rootSelector).first();
  await rootLocator.waitFor({ state: 'visible', timeout: 5_000 });
  const root = rootFromPanel ? rootLocator.locator('..') : rootLocator;
  const metrics = await root.evaluate((element, selectors) => {
    const alignment = selectors.alignmentSelector
      ? element.querySelector(selectors.alignmentSelector)
      : element;
    const panel = element.querySelector(selectors.panelSelector);
    const backdrop = element.querySelector('.absolute.inset-0');
    const rootRect = element.getBoundingClientRect();
    const panelRect = panel?.getBoundingClientRect();
    const backdropRect = backdrop?.getBoundingClientRect();
    const rootStyle = getComputedStyle(element);
    const alignmentStyle = getComputedStyle(alignment || element);
    return {
      directBodyChild: element.parentElement === document.body,
      position: rootStyle.position,
      overflowY: rootStyle.overflowY,
      paddingTop: parseFloat(rootStyle.paddingTop) || 0,
      paddingBottom: parseFloat(rootStyle.paddingBottom) || 0,
      scrollHeight: element.scrollHeight,
      display: alignmentStyle.display,
      alignItems: alignmentStyle.alignItems,
      justifyContent: alignmentStyle.justifyContent,
      rootRect: {
        left: rootRect.left,
        top: rootRect.top,
        right: rootRect.right,
        bottom: rootRect.bottom,
      },
      panelRect: panelRect
        ? {
            left: panelRect.left,
            top: panelRect.top,
            right: panelRect.right,
            bottom: panelRect.bottom,
            width: panelRect.width,
            height: panelRect.height,
          }
        : null,
      backdropRect: backdropRect
        ? {
            left: backdropRect.left,
            top: backdropRect.top,
            right: backdropRect.right,
            bottom: backdropRect.bottom,
          }
        : null,
    };
  }, { alignmentSelector, panelSelector });
  // Fixed overlays cover the layout viewport, excluding a reserved scrollbar gutter.
  const viewport = await page.evaluate(() => ({ width: document.documentElement.getBoundingClientRect().width, height: window.innerHeight }));
  const panel = metrics.panelRect;
  check(metrics.directBodyChild, `${label} root was not portaled directly to document.body.`);
  check(metrics.position === 'fixed', `${label} root is not fixed to the viewport.`);
  check(metrics.display === 'flex', `${label} root is not a flex overlay.`);
  check(metrics.alignItems === 'center', `${label} root is not vertically centered.`);
  check(metrics.justifyContent === 'center', `${label} root is not horizontally centered.`);
  check(
    metrics.rootRect.left <= 0.5 &&
      metrics.rootRect.top <= 0.5 &&
      metrics.rootRect.right >= viewport.width - 0.5 &&
      metrics.rootRect.bottom >= viewport.height - 0.5,
    `${label} root does not cover the viewport: ${JSON.stringify({ metrics, viewport })}`,
  );
  check(Boolean(panel), `${label} panel is missing.`);
  check(Math.abs((panel.left + panel.right) / 2 - viewport.width / 2) <= 4, `${label} panel is not horizontally centered.`);
  const availableHeight = viewport.height - metrics.paddingTop - metrics.paddingBottom;
  if (panel.height <= availableHeight + 1) {
    check(Math.abs((panel.top + panel.bottom) / 2 - viewport.height / 2) <= 4, `${label} panel is not vertically centered.`);
  } else {
    check(['auto', 'scroll'].includes(metrics.overflowY), `${label} tall panel has no overlay scroller.`);
    check(panel.top >= 0 && panel.top <= metrics.paddingTop + 1, `${label} tall panel header is unreachable.`);
    check(metrics.scrollHeight >= panel.bottom, `${label} tall panel footer is outside its scroll range.`);
  }
  check(
    Boolean(metrics.backdropRect) &&
      metrics.backdropRect.left <= 0.5 &&
      metrics.backdropRect.top <= 0.5 &&
      metrics.backdropRect.right >= viewport.width - 0.5 &&
      metrics.backdropRect.bottom >= viewport.height - 0.5,
    `${label} backdrop does not cover the viewport.`,
  );
  check(await page.locator('.caizen-sheet-root').count() === 0, `${label} opened an Android bottom-sheet root on the website.`);
};

const assertWebsiteModalFlows = async targetPage => {
  await targetPage.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const dashboardScrollBefore = await targetPage.evaluate(() => window.scrollY);
  await targetPage.evaluate(() => {
    (document.querySelector('[data-dashboard-customize-trigger="true"]'))?.click();
  });
  await assertCenteredWebsiteOverlay(targetPage, {
    label: 'Dashboard Customize',
    rootSelector: '.caizen-form-modal-root',
    panelSelector: '.caizen-form-modal',
  });
  const dashboardDialog = targetPage.getByRole('dialog', { name: /Choose your Dashboard view/ });
  await dashboardDialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await targetPage.locator('.caizen-form-modal-root').waitFor({ state: 'hidden', timeout: 5_000 });
  const dashboardScrollAfter = await targetPage.evaluate(() => window.scrollY);
  check(Math.abs(dashboardScrollAfter - dashboardScrollBefore) <= 2, `Dashboard Customize did not restore the page scroll position (before=${dashboardScrollBefore}, after=${dashboardScrollAfter}).`);

  await targetPage.evaluate(() => {
    window.dispatchEvent(new CustomEvent('caizen:navigate', {
      detail: { section: 'health', feature: 'weight' },
    }));
  });
  await targetPage.getByRole('heading', { name: 'Weight', exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
  await targetPage.getByRole('button', { name: 'Add weight', exact: true }).last().click();
  await assertCenteredWebsiteOverlay(targetPage, {
    label: 'Weight Add',
    rootSelector: 'form[aria-labelledby="weight-modal-title"]',
    panelSelector: 'form[aria-labelledby="weight-modal-title"]',
    rootFromPanel: true,
  });
  const weightForm = targetPage.locator('form[aria-labelledby="weight-modal-title"]');
  await weightForm.getByPlaceholder('Enter weight').fill('72');
  await weightForm.getByRole('button', { name: 'Add weight', exact: true }).click();
  await weightForm.waitFor({ state: 'hidden', timeout: 5_000 });
  const editWeight = targetPage.locator('[data-caizen-section="health"]').getByRole('button', { name: 'Edit', exact: true }).first();
  await editWeight.waitFor({ state: 'visible', timeout: 5_000 });
  await editWeight.click();
  await assertCenteredWebsiteOverlay(targetPage, {
    label: 'Weight Edit',
    rootSelector: 'form[aria-labelledby="weight-modal-title"]',
    panelSelector: 'form[aria-labelledby="weight-modal-title"]',
    rootFromPanel: true,
  });
  check(await targetPage.getByRole('heading', { name: 'Edit weight', exact: true }).isVisible(), 'Weight Edit did not render the edit form.');
  await targetPage.locator('form[aria-labelledby="weight-modal-title"]').getByRole('button', { name: 'Cancel', exact: true }).click();
  await targetPage.locator('form[aria-labelledby="weight-modal-title"]').waitFor({ state: 'hidden', timeout: 5_000 });

  await targetPage.evaluate(() => {
    window.dispatchEvent(new CustomEvent('caizen:navigate', {
      detail: { section: 'health', feature: 'food' },
    }));
  });
  await targetPage.getByRole('button', { name: /Use saved meal/ }).waitFor({ state: 'visible', timeout: 10_000 });
  await targetPage.getByRole('button', { name: /Use saved meal/ }).click();
  await assertCenteredWebsiteOverlay(targetPage, {
    label: 'Saved Meal picker',
    rootSelector: '.meal-template-picker-root',
    panelSelector: '.meal-template-picker-panel',
    alignmentSelector: '.meal-template-picker-positioner',
  });
  await targetPage.getByRole('button', { name: 'Close saved meal picker', exact: true }).click();
  await targetPage.locator('.meal-template-picker-root').waitFor({ state: 'hidden', timeout: 5_000 });

  await targetPage.evaluate(() => {
    window.dispatchEvent(new CustomEvent('caizen:navigate', {
      detail: { section: 'health', feature: 'saved' },
    }));
  });
  await targetPage.getByRole('group', { name: 'Food Library mode' }).getByRole('button', { name: 'Meals', exact: true }).click();
  await targetPage.getByRole('button', { name: 'Add meal', exact: true }).click();
  await assertCenteredWebsiteOverlay(targetPage, {
    label: 'Meal Template Add',
    rootSelector: '.meal-template-modal-root',
    panelSelector: '.meal-template-modal-panel',
  });
  await targetPage.getByRole('button', { name: 'Close meal template builder', exact: true }).click();
  await targetPage.locator('.meal-template-modal-root').waitFor({ state: 'hidden', timeout: 5_000 });

  const templateActions = targetPage.getByRole('button', { name: 'More meal actions', exact: true }).first();
  await templateActions.waitFor({ state: 'visible', timeout: 5_000 });
  await templateActions.click();
  await targetPage.getByRole('menuitem', { name: 'Edit', exact: true }).click();
  await assertCenteredWebsiteOverlay(targetPage, {
    label: 'Meal Template Edit',
    rootSelector: '.meal-template-modal-root',
    panelSelector: '.meal-template-modal-panel',
  });
  check(await targetPage.getByRole('heading', { name: 'Edit meal template', exact: true }).isVisible(), 'Meal Template Edit did not render the edit form.');
  await targetPage.getByRole('button', { name: 'Close meal template builder', exact: true }).click();
  await targetPage.locator('.meal-template-modal-root').waitFor({ state: 'hidden', timeout: 5_000 });
};

try {
  for (const width of [412, 390, 360, 320]) {
    const responsiveContext = await browser.newContext({
      viewport: { width, height: 844 },
      reducedMotion: 'reduce',
    });
    await responsiveContext.addInitScript(() => {
      window.localStorage.setItem('caizen-onboarding-pending-v1', 'true');
    });
    const responsivePage = await responsiveContext.newPage();
    try {
      await responsivePage.goto(`${origin}/app/`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await responsivePage.getByRole('heading', { name: 'A place for the things you want to keep track of.' }).waitFor({ state: 'visible', timeout: 20_000 });
      const responsiveMetrics = await responsivePage.getByRole('dialog', { name: 'A place for the things you want to keep track of.' }).evaluate(dialog => {
        const dialogRect = dialog?.getBoundingClientRect();
        const interactiveOverflow = dialog && dialogRect
          ? [...dialog.querySelectorAll('button')].some(button => {
              const rect = button.getBoundingClientRect();
              return rect.left < dialogRect.left - 1 || rect.right > dialogRect.right + 1;
            })
          : true;
        return {
          documentOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
          interactiveOverflow,
        };
      });
      check(!responsiveMetrics.documentOverflow, `Welcome created horizontal document overflow at ${width}px.`);
      check(!responsiveMetrics.interactiveOverflow, `Welcome controls overflowed its dialog at ${width}px.`);
      check(await responsivePage.getByRole('button', { name: /Set up my Caizen/ }).isVisible(), `Set up my Caizen was not visible at ${width}px.`);
      check(await responsivePage.getByRole('button', { name: /Explore a ready-made Caizen/ }).isVisible(), `Explore a ready-made Caizen was not visible at ${width}px.`);
    } finally {
      await responsiveContext.close();
    }
  }

  const demoContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: 'reduce',
  });
  await demoContext.addInitScript(() => {
    window.localStorage.setItem('caizen-onboarding-pending-v1', 'true');
  });
  const demoPage = await demoContext.newPage();
  try {
    await demoPage.goto(`${origin}/app/`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await demoPage.getByRole('heading', { name: 'A place for the things you want to keep track of.' }).waitFor({ state: 'visible', timeout: 20_000 });
    await demoPage.getByRole('button', { name: /Explore a ready-made Caizen/ }).click();
    await demoPage.getByText('Demo workspace', { exact: true }).waitFor({ state: 'visible', timeout: 30_000 });
    await demoPage.setViewportSize({ width: 1280, height: 640 });
    await assertWebsiteModalFlows(demoPage);
    await demoPage.getByRole('button', { name: 'Back to welcome', exact: true }).click();
    const exitDemoDialog = demoPage.getByRole('alertdialog', { name: 'Back to welcome?' });
    await exitDemoDialog.getByRole('button', { name: 'Back to welcome', exact: true }).click();
    await demoPage.waitForFunction(() => window.localStorage.getItem('life-manager-demo-mode') !== 'true', undefined, { timeout: 30_000 });
    await demoPage.getByText('Demo workspace', { exact: true }).waitFor({ state: 'hidden', timeout: 30_000 });
  } finally {
    await demoContext.close();
  }

  await page.goto(`${origin}/app/`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  try {
    await page.getByRole('heading', { name: 'A place for the things you want to keep track of.' }).waitFor({
      state: 'visible',
      timeout: 20_000,
    });
    const websitePlatform = await page.evaluate(() => {
      const capacitor = window.Capacitor;
      return {
        platform: typeof capacitor?.getPlatform === 'function' ? capacitor.getPlatform() : null,
        native: typeof capacitor?.isNativePlatform === 'function' ? capacitor.isNativePlatform() : null,
        marker: document.documentElement.dataset.capacitor || null,
      };
    });
    check(websitePlatform.platform === 'web', `Website smoke ran on platform ${websitePlatform.platform ?? 'unknown'}.`);
    check(websitePlatform.native === false, 'Website smoke reported a native Capacitor runtime.');
    check(websitePlatform.marker !== 'true', 'Website smoke received the native data-capacitor marker.');
  } catch (error) {
    const bodyText = await page.locator('body').innerText().catch(() => '');
    throw new Error(
      `${error.message}\nbody=${bodyText.slice(0, 800)}\nruntimeErrors=${errors.join(' | ')}`,
    );
  }

  const existingDataPath = page.getByRole('button', { name: /I already have Caizen data/i });
  await existingDataPath.click();
  const existingDataActions = page.locator('#caizen-restore-choices');
  await existingDataActions.getByRole('button', { name: /Complete .caizen backup/ }).waitFor({ state: 'visible', timeout: 5_000 });
  await existingDataActions.getByRole('button', { name: /^JSON/ }).waitFor({ state: 'visible', timeout: 5_000 });
  await existingDataActions.getByRole('button', { name: /Cloud Backup/ }).waitFor({ state: 'visible', timeout: 5_000 });
  check(
    !(await page.getByText('Choose your first starting point', { exact: false }).isVisible().catch(() => false)),
    'The Welcome screen still exposes a blocking focus-selection step.',
  );
  await existingDataPath.click();

  await page.getByRole('button', { name: 'Explore on my own', exact: true }).click();
  await page.getByRole('dialog', { name: 'A place for the things you want to keep track of.' }).waitFor({ state: 'hidden' });
  await page
    .locator('[data-caizen-section="dashboard"]')
    .waitFor({ state: 'visible', timeout: 20_000 });
  check(
    !(await page.getByRole('heading', { name: 'A place for the things you want to keep track of.' }).isVisible().catch(() => false)),
    'Welcome screen remained visible after local setup.',
  );

  // Workout release hardening: verify the guided entry has one explicit
  // no-schedule choice, and that Exercise Detail restores focus to the card
  // that opened it on both pointer close and Escape.
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('caizen:navigate', {
      detail: { section: 'health', feature: 'workout' },
    }));
  });
  await page.waitForFunction(() => document.querySelector('[data-caizen-section]')?.getAttribute('data-caizen-section') === 'health', undefined, { timeout: 10_000 });
  const workoutViews = page.locator('nav[aria-label="Workout views"]');
  await workoutViews.getByRole('button', { name: 'Today', exact: true }).waitFor({ state: 'visible', timeout: 10_000 });
  check(!(await page.getByRole('button', { name: 'Start a routine', exact: true }).isVisible().catch(() => false)), 'Workout Today still exposes the generic Start a routine action.');
  check(await page.getByRole('button', { name: 'Choose a starter workout', exact: true }).isVisible(), 'Workout Today does not expose an explicit starter choice when unscheduled.');

  await workoutViews.getByRole('button', { name: 'Exercises', exact: true }).click();
  await page.getByRole('group', { name: 'Exercise collection' }).getByRole('button', { name: 'All', exact: true }).click();
  const firstExerciseCard = page.getByRole('button', { name: /^View details for / }).first();
  await firstExerciseCard.waitFor({ state: 'visible', timeout: 10_000 });
  const firstExerciseLabel = await firstExerciseCard.getAttribute('aria-label');
  await firstExerciseCard.click();
  const firstExerciseDialog = page.getByRole('dialog').filter({ hasText: 'Review the exercise' });
  await firstExerciseDialog.waitFor({ state: 'visible', timeout: 5_000 });
  await firstExerciseDialog.getByRole('button', { name: /^Close .* details$/ }).click();
  await page.waitForFunction(label => document.activeElement?.getAttribute('aria-label') === label, firstExerciseLabel, { timeout: 5_000 });
  await firstExerciseCard.click();
  await firstExerciseDialog.waitFor({ state: 'visible', timeout: 5_000 });
  await page.keyboard.press('Escape');
  await page.waitForFunction(label => document.activeElement?.getAttribute('aria-label') === label, firstExerciseLabel, { timeout: 5_000 });
  await firstExerciseCard.click();
  await firstExerciseDialog.waitFor({ state: 'visible', timeout: 5_000 });
  await firstExerciseDialog.getByRole('button', { name: 'Add to routine', exact: true }).click();
  await page.getByText('New custom routine', { exact: true }).waitFor({ state: 'visible', timeout: 5_000 });
  await page.getByRole('dialog', { name: 'New custom routine' }).getByRole('button', { name: 'Close New custom routine', exact: true }).click();
  await page.getByRole('dialog', { name: 'New custom routine' }).waitFor({ state: 'hidden' });

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('caizen:navigate', {
      detail: { section: 'inventory' },
    }));
  });
  await page.waitForFunction(() => document.querySelector('[data-caizen-section]')?.getAttribute('data-caizen-section') === 'inventory', undefined, { timeout: 10_000 });
  const inventoryAdd = page.getByRole('button', { name: 'Add item', exact: true }).first();
  await inventoryAdd.waitFor({ state: 'visible', timeout: 5_000 });
  const inventoryAddBox = await inventoryAdd.boundingBox();
  check(Boolean(inventoryAddBox && inventoryAddBox.width >= 44 && inventoryAddBox.height >= 44), 'Inventory hero Add item action is below the 44px target.');
  check(!(await page.getByRole('button', { name: 'Add Asset', exact: true }).isVisible().catch(() => false)), 'Inventory still exposes the old Add Asset label.');
  check(!(await page.getByText('Total Assets', { exact: true }).isVisible().catch(() => false)), 'Inventory still exposes the ambiguous Total Assets metric.');
  for (const inventoryWidth of [1440, 1280, 1024, 768, 412, 390, 360, 320]) {
    await page.setViewportSize({ width: inventoryWidth, height: inventoryWidth < 768 ? 844 : 900 });
    const inventoryResponsiveMetrics = await page.evaluate(() => {
      const root = document.querySelector('[data-caizen-section="inventory"]');
      const add = [...(root?.querySelectorAll('button') ?? [])].find(button => button.textContent?.replace(/\s+/g, ' ').trim() === 'Add item');
      const rect = add?.getBoundingClientRect();
      return {
        pageOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        addVisible: Boolean(add && rect && rect.width > 0 && rect.height > 0),
        addTarget: rect ? { width: rect.width, height: rect.height } : null,
      };
    });
    check(!inventoryResponsiveMetrics.pageOverflow, `Inventory ${inventoryWidth}px introduces page-level horizontal overflow.`);
    check(inventoryResponsiveMetrics.addVisible, `Inventory Add item is not visible at ${inventoryWidth}px.`);
    check(Boolean(inventoryResponsiveMetrics.addTarget && inventoryResponsiveMetrics.addTarget.width >= 44 && inventoryResponsiveMetrics.addTarget.height >= 44), `Inventory Add item target is below 44px at ${inventoryWidth}px.`);
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('caizen:navigate', {
      detail: { section: 'health', feature: 'workout' },
    }));
  });
  await page.waitForFunction(() => document.querySelector('[data-caizen-section]')?.getAttribute('data-caizen-section') === 'health', undefined, { timeout: 10_000 });
  await workoutViews.getByRole('button', { name: 'Routines', exact: true }).waitFor({ state: 'visible', timeout: 5_000 });

  await workoutViews.getByRole('button', { name: 'Routines', exact: true }).click();
  await page.getByRole('tab', { name: /Starter routines/ }).click();
  const firstStarterCard = page.locator('article:visible').filter({ has: page.getByRole('button', { name: /^Schedule / }) }).first();
  const firstStarterName = (await firstStarterCard.locator('h3').innerText()).trim();
  await firstStarterCard.getByRole('button', { name: /^Schedule / }).click();
  await page.getByRole('dialog', { name: `Schedule ${firstStarterName}` }).getByRole('button', { name: 'Schedule workout', exact: true }).click();
  await page.locator('.caizen-toast[role="status"]').filter({ hasText: firstStarterName }).waitFor({ state: 'visible', timeout: 5_000 });
  await workoutViews.getByRole('button', { name: 'Today', exact: true }).click();
  await page.getByRole('button', { name: `Start ${firstStarterName}`, exact: true }).first().waitFor({ state: 'visible', timeout: 5_000 });
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('caizen:navigate', {
      detail: { section: 'lifehub' },
    }));
  });
  await page.waitForFunction(() => document.querySelector('[data-caizen-section]')?.getAttribute('data-caizen-section') === 'lifehub', undefined, { timeout: 10_000 });

  await page.keyboard.press('Control+k');
  const commandInput = page.getByPlaceholder('Search Caizen, records, and actions...');
  await commandInput.waitFor({ state: 'visible', timeout: 5_000 });
  await commandInput.fill('Add');
  const commandOptions = page.getByRole('option');
  await commandOptions.first().waitFor({ state: 'visible', timeout: 5_000 });
  check(await commandOptions.count() > 1, 'Command palette did not expose multiple Add results for keyboard navigation.');
  const initialActiveOption = await commandInput.getAttribute('aria-activedescendant');
  await commandInput.press('ArrowDown');
  await page.waitForFunction(
    expected => {
      const active = document.querySelector('input[placeholder="Search Caizen, records, and actions..."]')?.getAttribute('aria-activedescendant');
      return Boolean(active) && active !== expected;
    },
    initialActiveOption,
    { timeout: 5_000 },
  );
  const nextActiveOption = await commandInput.getAttribute('aria-activedescendant');
  check(Boolean(initialActiveOption) && Boolean(nextActiveOption) && nextActiveOption !== initialActiveOption, 'ArrowDown did not move the selected command result.');
  await page.waitForFunction(
    expected => document.querySelector('input[placeholder="Search Caizen, records, and actions..."]')?.getAttribute('aria-activedescendant') === expected,
    nextActiveOption,
    { timeout: 5_000 },
  );
  await commandInput.press('ArrowUp');
  await page.waitForFunction(
    expected => document.querySelector('input[placeholder="Search Caizen, records, and actions..."]')?.getAttribute('aria-activedescendant') === expected,
    initialActiveOption,
    { timeout: 5_000 },
  );
  await commandInput.fill('Add Task');
  const addTaskCommand = page.getByRole('option', { name: /Add Task/ }).first();
  await addTaskCommand.waitFor({ state: 'visible', timeout: 5_000 });
  await addTaskCommand.click();
  const taskTitle = page.getByPlaceholder('What needs to be done?');
  try {
    await taskTitle.waitFor({ state: 'visible', timeout: 5_000 });
  } catch (error) {
    throw new Error(`${error.message}\nbody=${(await page.locator('body').innerText()).slice(0, 1400)}`);
  }
  await taskTitle.fill('Activation task');
  await page
    .getByRole('dialog', { name: 'Quick capture' })
    .getByRole('button', { name: 'Add Task', exact: true })
    .click();
  await page.keyboard.press('Control+k');
  await commandInput.waitFor({ state: 'visible', timeout: 5_000 });
  await commandInput.fill('Activation task');
  const recordResults = page.getByRole('group', { name: 'Records results' });
  const activationRecord = recordResults.getByRole('option', { name: /Activation task/ });
  await activationRecord.waitFor({
    state: 'visible',
    timeout: 5_000,
  });
  check(
    await activationRecord.isVisible(),
    'Command palette did not expose the matching local record.',
  );

  // Verify the exact record deep link, then exercise the core Life Hub forms.
  await activationRecord.click();
  await page.getByRole('dialog', { name: 'Update task' }).waitFor({
    state: 'visible',
    timeout: 5_000,
  });
  await page.getByRole('dialog', { name: 'Update task' }).getByRole('button', { name: 'Close' }).click();

  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('caizen:navigate', {
      detail: { section: 'lifehub' },
    }));
  });
  await page.waitForSelector('[data-caizen-section="lifehub"]', { state: 'visible', timeout: 10_000 });
  await page.getByRole('tab', { name: 'Routines', exact: true }).click();
  await page.getByRole('button', { name: 'Add Routine', exact: true }).click();
  await page.getByRole('listitem').first().click();
  const routineTitle = page.getByPlaceholder('Example: Sunday budget review');
  await routineTitle.waitFor({ state: 'visible', timeout: 5_000 });
  await routineTitle.fill('Activation routine');
  await page.getByRole('dialog', { name: 'Create routine' }).getByRole('button', { name: 'Create routine', exact: true }).click();
  await page.getByText('Activation routine', { exact: true }).waitFor({ state: 'visible', timeout: 5_000 });

  await page.getByRole('tab', { name: 'Calendar', exact: true }).click();
  // Select today first so the Day Planner supplies the valid date to the
  // shared date modal; this follows the current calendar workflow rather than
  // reaching for the retired native date-input contract.
  await page.locator('button[role="gridcell"][data-today="true"]').click();
  await page.getByRole('button', { name: 'Add Event', exact: true }).last().click();
  const eventTitle = page.getByPlaceholder('What is happening?');
  await eventTitle.waitFor({ state: 'visible', timeout: 5_000 });
  await eventTitle.fill('Activation appointment');
  const dateDialog = page.getByRole('dialog', { name: 'Add to your calendar' });
  const dateTrigger = dateDialog.getByRole('button', { name: /^Date:/ });
  await dateTrigger.click();
  const datePopover = page.locator('[data-slot="popover-content"]:visible').last();
  await datePopover.waitFor({ state: 'visible', timeout: 5_000 });
  check(
    await datePopover.getByRole('button', { name: 'Done', exact: true }).isVisible(),
    'The Life Hub modal date control did not open its calendar popover by pointer activation.',
  );
  await datePopover.getByRole('button', { name: 'Cancel', exact: true }).click();
  await dateTrigger.focus();
  await dateTrigger.press('Enter');
  await datePopover.waitFor({ state: 'visible', timeout: 5_000 });
  check(
    await datePopover.getByRole('button', { name: 'Done', exact: true }).isVisible(),
    'The Life Hub modal date control did not open its calendar popover by keyboard activation.',
  );
  await datePopover.getByRole('button', { name: 'Cancel', exact: true }).click();
  // The modal initializes its date to today. Leave the canonical value
  // untouched so this flow continues to exercise event persistence and
  // exact-record retrieval.
  await dateDialog.getByRole('button', { name: 'Add Event', exact: true }).click();
  await page.waitForTimeout(300);

  await page.keyboard.press('Control+k');
  await commandInput.fill('Activation routine');
  const routineRecord = page.getByRole('group', { name: 'Records results' }).getByRole('option', { name: /Activation routine/ });
  await routineRecord.waitFor({ state: 'visible', timeout: 5_000 });
  await routineRecord.click();
  await page.getByRole('dialog', { name: 'Update routine' }).waitFor({ state: 'visible', timeout: 5_000 });
  await page.getByRole('dialog', { name: 'Update routine' }).getByRole('button', { name: 'Close' }).click();

  await page.keyboard.press('Control+k');
  await commandInput.fill('Activation appointment');
  const dateRecord = page.getByRole('group', { name: 'Records results' }).getByRole('option', { name: /Activation appointment/ });
  await dateRecord.waitFor({ state: 'visible', timeout: 5_000 });
  await dateRecord.click();
  await page.getByRole('dialog', { name: 'Update calendar item' }).waitFor({ state: 'visible', timeout: 5_000 });
  await page.getByRole('dialog', { name: 'Update calendar item' }).getByRole('button', { name: 'Close' }).click();

  const originalProfileName = (await page.locator('.caizen-profile-name span').first().innerText()).trim();
  const profileMenu = page.getByRole('button', { name: 'Open profile menu' });
  await profileMenu.click();
  await page.getByRole('menuitem', { name: 'Create profile', exact: true }).click();
  const profileDialog = page.getByRole('dialog', { name: 'Create profile' });
  const profileNameInput = profileDialog.getByPlaceholder('Personal, Work, Travel…');
  await profileNameInput.waitFor({ state: 'visible', timeout: 5_000 });
  await profileNameInput.fill('Isolation profile');
  await profileDialog.getByRole('button', { name: 'Create profile', exact: true }).click({ force: true });
  await profileDialog.waitFor({ state: 'hidden', timeout: 5_000 });
  await page.waitForFunction(() => document.querySelector('.caizen-profile-name span')?.textContent?.trim() === 'Isolation profile');
  const profileSaveDeadline = Date.now() + 10_000;
  for (;;) {
    // waitForFunction treats an async predicate's Promise as truthy in this
    // Playwright version. Await the database result explicitly before reload.
    const saved = await page.evaluate(() => new Promise(resolveReady => {
      const request = indexedDB.open('caizen-life-manager');
      request.onerror = () => resolveReady(false);
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['profiles', 'settings'], 'readonly');
        const profiles = transaction.objectStore('profiles').getAll();
        const selection = transaction.objectStore('settings').get('currentProfileId');
        transaction.oncomplete = () => { db.close(); resolveReady(profiles.result.some(profile => profile.name === 'Isolation profile' && profile.id === selection.result?.value)); };
        transaction.onerror = () => { db.close(); resolveReady(false); };
      };
    }));
    if (saved) break;
    check(Date.now() < profileSaveDeadline, 'Created profile and selection did not persist.');
    await page.waitForTimeout(100);
  }
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('.caizen-profile-name span')?.textContent?.trim() === 'Isolation profile');

  await page.keyboard.press('Control+k');
  await commandInput.fill('Activation task');
  check(
    !(await page.getByRole('group', { name: 'Records results' }).getByRole('option', { name: /Activation task/ }).isVisible().catch(() => false)),
    'A newly created profile exposed records from the previous profile.',
  );
  await page.keyboard.press('Escape');
  await commandInput.waitFor({ state: 'hidden' });

  await profileMenu.click();
  const originalProfile = page.getByRole('menuitem', { name: new RegExp(originalProfileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) });
  await originalProfile.click();
  await page.getByText(originalProfileName, { exact: true }).first().waitFor({ state: 'visible', timeout: 5_000 });
  await page.keyboard.press('Control+k');
  await commandInput.fill('Activation task');
  await page.getByRole('group', { name: 'Records results' }).getByRole('option', { name: /Activation task/ }).waitFor({ state: 'visible', timeout: 5_000 });
  await page.keyboard.press('Escape');
  await commandInput.waitFor({ state: 'hidden' });

  // Delete the non-active profile through the same guarded UI users see in
  // production. This verifies the confirmation path and that deletion does
  // not disturb the profile that is still active.
  await profileMenu.click();
  const deleteIsolationProfile = page.getByRole('button', { name: 'Delete Isolation profile' });
  await deleteIsolationProfile.waitFor({ state: 'visible', timeout: 5_000 });
  await deleteIsolationProfile.click({ force: true });
  const deleteProfileDialog = page.getByRole('alertdialog', { name: 'Delete profile?' });
  await deleteProfileDialog.waitFor({ state: 'visible', timeout: 5_000 });
  await deleteProfileDialog.getByRole('button', { name: 'Delete Profile', exact: true }).click();
  await deleteProfileDialog.waitFor({ state: 'hidden', timeout: 5_000 });
  await profileMenu.click();
  check(
    !(await page.getByRole('button', { name: 'Delete Isolation profile' }).isVisible().catch(() => false)),
    'Deleted profile remained in the profile menu.',
  );
  await page.keyboard.press('Escape');
  await commandInput.waitFor({ state: 'hidden' });

  await page.evaluate(() => window.dispatchEvent(new CustomEvent('caizen:navigate', { detail: { section: 'lifehub' } })));
  await page.waitForSelector('[data-caizen-section="lifehub"]', { state: 'visible' });
  await page.getByRole('tab', { name: 'Routines', exact: true }).click();
  const activationRoutineCard = page.locator('.caizen-routine-card').filter({ has: page.getByRole('heading', { name: 'Activation routine', exact: true }) });
  await activationRoutineCard.getByRole('button', { name: 'Skip', exact: true }).click();
  check(
    await activationRoutineCard.locator('[aria-label*="Skipped" i]').count() > 0,
    'Skipping a routine did not record a skipped occurrence.',
  );

  // LH-06: both the existing accessible toast action and the persisted card
  // action must recover the occurrence without turning it into a completion.
  const undoSkip = page.getByRole('button', { name: 'Undo skip', exact: true });
  await undoSkip.waitFor({ state: 'visible', timeout: 5_000 });
  await undoSkip.click();
  check(
    await page.getByRole('button', { name: /Complete Activation routine for/ }).isVisible(),
    'Undo skip did not restore the routine to a completable state.',
  );

  await activationRoutineCard.getByRole('button', { name: 'Skip', exact: true }).click();
  const recover = page.getByRole('button', { name: /Recover Activation routine for/ });
  await recover.waitFor({ state: 'visible', timeout: 5_000 });
  await recover.click();
  check(
    await page.getByRole('button', { name: /Complete Activation routine for/ }).isVisible(),
    'Direct Recover did not restore the routine to a completable state.',
  );

  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Life Hub', exact: true }).click();
  await page.getByRole('tab', { name: 'Routines', exact: true }).click();
  check(
    await page.getByRole('button', { name: /Complete Activation routine for/ }).isVisible(),
    'Recovered routine state did not persist after reload.',
  );

  await page.getByRole('tab', { name: 'Tasks', exact: true }).click();
  await page.getByRole('button', { name: 'Complete Activation task', exact: true }).click();
  await page.getByRole('button', { name: 'Complete Activation task', exact: true }).waitFor({ state: 'hidden' });

  // Re-run the shared date control in a fresh touch context. This guards the
  // mobile Drawer branch separately from the desktop Popover branch above.
  const touchContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: 'reduce',
  });
  await touchContext.addInitScript(() => {
    window.localStorage.setItem('caizen-onboarding-pending-v1', 'true');
  });
  const touchPage = await touchContext.newPage();
  const touchErrors = [];
  touchPage.on('pageerror', error => touchErrors.push(error.message));
  touchPage.on('console', message => {
    if (message.type() === 'error' && !message.text().includes('Failed to load resource')) {
      touchErrors.push(message.text());
    }
  });
  try {
    await touchPage.goto(`${origin}/app/`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await touchPage.getByRole('heading', { name: 'A place for the things you want to keep track of.' }).waitFor({ state: 'visible', timeout: 20_000 });
    await touchPage.getByRole('button', { name: 'Explore on my own', exact: true }).click();
    await touchPage.getByRole('dialog', { name: 'A place for the things you want to keep track of.' }).waitFor({ state: 'hidden' });
    await touchPage.waitForSelector('[data-caizen-section="dashboard"]', { state: 'visible' });
    await touchPage.evaluate(() => window.dispatchEvent(new CustomEvent('caizen:navigate', { detail: { section: 'lifehub' } })));
    await touchPage.waitForSelector('[data-caizen-section="lifehub"]', { state: 'visible' });
    await touchPage.getByRole('tab', { name: 'Calendar', exact: true }).first().click();
    await touchPage.locator('button[role="gridcell"][data-today="true"]').click();
    await touchPage.getByRole('button', { name: 'Add Event', exact: true }).last().click();
    const touchDateDialog = touchPage.getByRole('dialog', { name: 'Add to your calendar' });
    await touchDateDialog.waitFor({ state: 'visible', timeout: 5_000 });
    const touchDateTrigger = touchPage.locator('button[aria-label^="Date:"]').first();
    const touchDateBox = await touchDateTrigger.boundingBox();
    check(Boolean(touchDateBox), 'The mobile modal date control has no touch target.');
    await touchPage.touchscreen.tap(
      touchDateBox.x + touchDateBox.width / 2,
      touchDateBox.y + touchDateBox.height / 2,
    );
    const dateDrawer = touchPage.locator('[data-slot="drawer-content"]:visible').last();
    await dateDrawer.waitFor({ state: 'visible', timeout: 5_000 });
    check(
      await dateDrawer.getByRole('button', { name: 'Done', exact: true }).isVisible(),
      'The mobile modal date control did not open its date drawer by touch activation.',
    );
    await dateDrawer.getByRole('button', { name: 'Cancel', exact: true }).click();
    await touchDateTrigger.focus();
    await touchDateTrigger.press('Enter');
    await dateDrawer.waitFor({ state: 'visible', timeout: 5_000 });
    check(
      await dateDrawer.getByRole('button', { name: 'Done', exact: true }).isVisible(),
      'The mobile modal date control did not open its date drawer by keyboard activation.',
    );
    await dateDrawer.getByRole('button', { name: 'Cancel', exact: true }).click();
  } finally {
    await touchContext.close().catch(() => undefined);
  }
  check(touchErrors.length === 0, `Mobile browser reported runtime errors: ${touchErrors.join(' | ')}`);

  for (const width of [1440, 1280, 1024, 768]) {
    const desktopContext = await browser.newContext({
      viewport: { width, height: 900 },
      reducedMotion: 'reduce',
    });
    await desktopContext.addInitScript(() => {
      window.localStorage.setItem('life-manager-setup-completed', 'true');
      window.localStorage.setItem('caizen-onboarding-pending-v1', 'true');
      window.localStorage.setItem('life-manager-tour-completed', 'true');
    });
    const desktopPage = await desktopContext.newPage();
    const desktopErrors = [];
    desktopPage.on('pageerror', error => desktopErrors.push(error.message));
    try {
      await desktopPage.goto(`${origin}/app/`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await desktopPage.getByRole('dialog', { name: /^(A place for the things you want to keep track of\.|Learn Caizen at your pace\.)$/ }).getByRole('button', { name: 'Explore on my own', exact: true }).click();
      await desktopPage.getByRole('dialog', { name: /^(A place for the things you want to keep track of\.|Learn Caizen at your pace\.)$/ }).waitFor({ state: 'hidden' });
      await desktopPage.waitForSelector('[data-caizen-section="dashboard"]', { state: 'visible', timeout: 20_000 });
      const navMetrics = await desktopPage.evaluate(() => {
        const scroll = document.querySelector('.caizen-desktop-nav-scroll');
        const nav = document.querySelector('.caizen-desktop-nav-list');
        const active = nav?.querySelector('[aria-current="page"]');
        const scrollRect = scroll?.getBoundingClientRect();
        const activeRect = active?.getBoundingClientRect();
        const hasOverflow = Boolean(scroll && scroll.scrollWidth > scroll.clientWidth + 1);
        return {
          hasOverflow,
          hasHint: Boolean(nav?.getAttribute('aria-describedby')),
          canScrollRight: document.querySelector('.caizen-desktop-nav-scroll-shell[data-can-scroll-right="true"]') !== null,
          activeVisible: Boolean(
            scrollRect && activeRect &&
            activeRect.left >= scrollRect.left - 1 &&
            activeRect.right <= scrollRect.right + 1,
          ),
          pageOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        };
      });
      check(!navMetrics.pageOverflow, `Desktop ${width}px introduces page-level horizontal overflow`);
      check(navMetrics.activeVisible, `Desktop ${width}px does not keep the active destination visible`);
      if (navMetrics.hasOverflow) {
        check(navMetrics.hasHint, `Desktop ${width}px navigation lacks an accessible overflow hint`);
        check(navMetrics.canScrollRight, `Desktop ${width}px navigation lacks a right overflow affordance`);
      }

      await desktopPage.locator('[data-nav-tab-id="personalhub"]').click();
      await desktopPage.waitForTimeout(120);
      const lateDestinationMetrics = await desktopPage.evaluate(() => {
        const scroll = document.querySelector('.caizen-desktop-nav-scroll');
        const active = document.querySelector('.caizen-desktop-nav-list [aria-current="page"]');
        const scrollRect = scroll?.getBoundingClientRect();
        const activeRect = active?.getBoundingClientRect();
        return {
          activeLabel: active?.getAttribute('aria-label'),
          activeVisible: Boolean(
            scrollRect && activeRect &&
            activeRect.left >= scrollRect.left - 1 &&
            activeRect.right <= scrollRect.right + 1,
          ),
        };
      });
      check(lateDestinationMetrics.activeLabel === 'Personal Vault', `Desktop ${width}px late destination has the wrong accessible name`);
      check(lateDestinationMetrics.activeVisible, `Desktop ${width}px did not scroll the active late destination into view`);
      check(desktopErrors.length === 0, `Desktop ${width}px runtime errors: ${desktopErrors.join('; ')}`);
    } finally {
      await desktopContext.close();
    }
  }

  console.log('touch_date_picker=true');

  check(errors.length === 0, `Browser reported runtime errors: ${errors.join(' | ')}`);
  console.log('welcome_visible=true');
  console.log('responsive_widths=412,390,360,320');
  console.log('existing_data_path=true');
  console.log('demo_exit_restored=true');
  console.log('focus_selection=deferred');
  console.log('focus_route=dashboard');
  console.log('tour_prompt=non_blocking');
  console.log('command_palette_records=true');
  console.log('lifehub_task_routine_date=true');
  console.log('lh06_skip_recovery=true');
  console.log('deep_link_actions=true');
  console.log('profile_isolation=true');
  console.log('profile_deletion=true');
  console.log('browser_runtime_errors=0');
} catch (error) {
  console.error(`Activation failure context: ${(await page.locator('body').innerText()).slice(-5000)}`);
  console.error(await page.evaluate(() => new Promise(resolveState => {
    const open = indexedDB.open('caizen-life-manager');
    open.onsuccess = () => {
      const db = open.result;
      const transaction = db.transaction(['profiles', 'settings'], 'readonly');
      const profiles = transaction.objectStore('profiles').getAll();
      const current = transaction.objectStore('settings').get('currentProfileId');
      transaction.oncomplete = () => { db.close(); resolveState({ profiles: profiles.result.map(({ id, name }) => ({ id, name })), current: current.result, header: document.querySelector('.caizen-profile-name')?.outerHTML }); };
    };
    open.onerror = () => resolveState('Could not inspect test database');
  })));
  throw error;
} finally {
  await context.close().catch(() => undefined);
  await browser.close().catch(() => undefined);
  nextServer.kill();
}
