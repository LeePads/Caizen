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
const screenshotDir = join(root, 'artifacts', 'screenshots', 'phase17a');
const resultPath = join(root, 'artifacts', 'android-phase17a-ui-results.json');
const executablePath = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].find(existsSync);
if (!existsSync(join(out, 'index.html'))) {
  throw new Error('out/index.html is missing. Run the Android web build first.');
}
if (!executablePath) throw new Error('No local Chromium browser was found.');

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};
const server = createServer((request, response) => {
  const pathname = decodeURIComponent(
    new URL(request.url ?? '/', 'http://localhost').pathname,
  );
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const candidate = resolve(out, normalize(relative));
  let file = candidate.startsWith(`${out}${sep}`) ? candidate : '';
  let status = 200;
  if (file && existsSync(file) && statSync(file).isDirectory()) {
    file = join(file, 'index.html');
  }
  if (!file || !existsSync(file) || !statSync(file).isFile()) {
    file = join(out, '404.html');
    status = 404;
  }
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': contentTypes[extname(file)] ?? 'application/octet-stream',
  });
  createReadStream(file).pipe(response);
});
await new Promise((resolveListen, rejectListen) => {
  server.once('error', rejectListen);
  server.listen(0, '127.0.0.1', resolveListen);
});
const address = server.address();
if (!address || typeof address === 'string') throw new Error('No test port.');
const origin = `http://127.0.0.1:${address.port}`;
mkdirSync(screenshotDir, { recursive: true });

const browser = await chromium.launch({ executablePath, headless: true });
const viewports = [
  { width: 360, height: 640 },
  { width: 360, height: 800 },
  { width: 393, height: 852 },
  { width: 412, height: 915 },
  { width: 915, height: 412 },
];
const failures = [];
const pageErrors = [];
const viewportResults = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

const installAndroid = async (page) => {
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    const mark = () =>
      document.documentElement?.setAttribute('data-capacitor', 'true');
    if (document.documentElement) mark();
    else {
      new MutationObserver((_, observer) => {
        if (!document.documentElement) return;
        mark();
        observer.disconnect();
      }).observe(document, { childList: true });
    }
    try {
      localStorage.setItem('life-manager-setup-completed', 'true');
      localStorage.setItem('life-manager-tour-completed', 'true');
      localStorage.setItem('ui-animation-preference', 'reduced');
    } catch {
      // Re-runs at the application origin.
    }
  });
};

const settle = async (page, section = 'dashboard') => {
  await page.waitForFunction(
    (sectionId) =>
      document.querySelector('[data-caizen-section]')?.getAttribute(
        'data-caizen-section',
      ) === sectionId &&
      !document.querySelector('[data-caizen-section-loading="true"]'),
    section,
    { timeout: 20_000 },
  );
  await page.waitForTimeout(80);
};
const navigate = async (page, section, feature) => {
  await page.evaluate(
    ({ sectionId, featureId }) => {
      window.dispatchEvent(
        new CustomEvent('caizen:navigate', {
          detail: { section: sectionId, feature: featureId },
        }),
      );
    },
    { sectionId: section, featureId: feature },
  );
  await settle(page, section);
};

try {
  for (const viewport of viewports) {
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
    const metrics = await page.evaluate(() => {
        const header = document.querySelector('.caizen-header')?.getBoundingClientRect();
        const content = document.querySelector('.caizen-content')?.getBoundingClientRect();
        const dock = document.querySelector('.caizen-mobile-dock')?.getBoundingClientRect();
        const dockElement = document.querySelector('.caizen-mobile-dock');
      const labels = [
        ...document.querySelectorAll(
          '.caizen-mobile-tab > span, .caizen-mobile-more > span',
        ),
      ];
      return {
        headerHeight: Math.round(header?.height ?? 0),
        dockHeight: Math.round(dock?.height ?? 0),
        dockWidth: Math.round(dock?.width ?? 0),
        dockWithinViewport:
          !dock ||
          (dock.top >= -1 &&
            dock.left >= -1 &&
            dock.right <= window.innerWidth + 1 &&
            dock.bottom <= window.innerHeight + 1),
        dockRect: dock ? {
          top: Math.round(dock.top),
          right: Math.round(dock.right),
          bottom: Math.round(dock.bottom),
          width: Math.round(dock.width),
        } : null,
        dockPosition: dockElement instanceof HTMLElement ? getComputedStyle(dockElement).position : '',
        dockTop: dockElement instanceof HTMLElement ? getComputedStyle(dockElement).top : '',
        dockBottom: dockElement instanceof HTMLElement ? getComputedStyle(dockElement).bottom : '',
        headerClear: !header || !content || header.bottom <= content.top + 1,
        horizontalOverflow:
          document.documentElement.scrollWidth > window.innerWidth + 1,
        clippedNavLabels: labels
          .filter(
            (label) =>
              label.scrollWidth > label.clientWidth + 1 ||
              label.scrollHeight > label.clientHeight + 1,
          )
          .map((label) => ({
            text: label.textContent?.trim(),
            scrollWidth: label.scrollWidth,
            clientWidth: label.clientWidth,
            scrollHeight: label.scrollHeight,
            clientHeight: label.clientHeight,
            display: getComputedStyle(label).display,
            lineHeight: getComputedStyle(label).lineHeight,
          })),
      };
    });
    viewportResults.push({ viewport, ...metrics });
    check(metrics.headerHeight <= 72, `${viewport.width}x${viewport.height}: header is too tall`);
    const usesLandscapeRail = viewport.width >= 720 && viewport.width > viewport.height;
    check(
      usesLandscapeRail
        ? metrics.dockWidth <= 96 && metrics.dockWithinViewport
        : metrics.dockHeight <= 84,
      usesLandscapeRail
        ? `${viewport.width}x${viewport.height}: landscape rail is outside its viewport budget`
        : `${viewport.width}x${viewport.height}: dock is too tall`,
    );
    check(metrics.headerClear, `${viewport.width}x${viewport.height}: header overlaps content`);
    check(!metrics.horizontalOverflow, `${viewport.width}x${viewport.height}: horizontal overflow`);
    check(metrics.clippedNavLabels.length === 0, `${viewport.width}x${viewport.height}: clipped nav labels`);

    await page.evaluate(() => {
      document.documentElement.style.fontSize = '20px';
    });
    const scaledOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    check(!scaledOverflow, `${viewport.width}x${viewport.height}: font scaling causes overflow`);
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

  const themeResults = {};
  for (const themeCase of [
    { name: 'light', preference: 'light', system: 'light' },
    { name: 'dark', preference: 'dark', system: 'dark' },
    { name: 'system-light', preference: 'system', system: 'light' },
    { name: 'system-dark', preference: 'system', system: 'dark' },
  ]) {
    await page.emulateMedia({ colorScheme: themeCase.system });
    await page.evaluate((preference) => {
      localStorage.setItem('theme-preference', preference);
    }, themeCase.preference);
    await page.reload({ waitUntil: 'networkidle' });
    await settle(page);
    themeResults[themeCase.name] = await page.evaluate(() => {
      const active = document.querySelector('.caizen-mobile-tab-active');
      const inactive = document.querySelector(
        '.caizen-mobile-tab:not(.caizen-mobile-tab-active)',
      );
      const activeLabel = active?.querySelector('span');
      const activeIcon = active?.querySelector('svg');
      const activeStyle =
        active instanceof HTMLElement ? getComputedStyle(active) : null;
      const inactiveStyle =
        inactive instanceof HTMLElement ? getComputedStyle(inactive) : null;
      const indicator =
        active instanceof HTMLElement
          ? getComputedStyle(active, '::before')
          : null;
      return {
        resolvedTheme: document.documentElement.dataset.resolvedTheme,
        activeColor: activeStyle?.color,
        inactiveColor: inactiveStyle?.color,
        indicatorColor: indicator?.backgroundColor,
        activeLabelVisible:
          activeLabel instanceof HTMLElement &&
          getComputedStyle(activeLabel).visibility !== 'hidden' &&
          getComputedStyle(activeLabel).color !== 'rgba(0, 0, 0, 0)',
        activeIconVisible:
          activeIcon instanceof SVGElement &&
          getComputedStyle(activeIcon).visibility !== 'hidden',
      };
    });
    const theme = themeResults[themeCase.name];
    check(theme.resolvedTheme === themeCase.system, `${themeCase.name}: system theme did not resolve`);
    check(theme.activeLabelVisible, `${themeCase.name}: selected nav label is hidden`);
    check(theme.activeIconVisible, `${themeCase.name}: selected nav icon is hidden`);
    check(theme.activeColor !== theme.inactiveColor, `${themeCase.name}: nav states are indistinguishable`);
    check(theme.indicatorColor !== 'rgba(0, 0, 0, 0)', `${themeCase.name}: indicator is transparent`);
    if (themeCase.name === 'light' || themeCase.name === 'dark') {
      await page.screenshot({
        path: join(screenshotDir, `bottom-navigation-${themeCase.name}.png`),
        fullPage: false,
      });
    }
  }

  await page.evaluate(() => localStorage.setItem('theme-preference', 'dark'));
  await page.reload({ waitUntil: 'networkidle' });
  await settle(page);
  await page.screenshot({
    path: join(screenshotDir, 'dashboard-header.png'),
    fullPage: false,
  });

  await navigate(page, 'lifehub', 'routine');
  await page.getByRole('button', { name: 'Add Routine', exact: true }).click();
  const routineDialog = page.locator('.caizen-modal-panel');
  await routineDialog.waitFor({ state: 'visible' });
  const formGeometry = await routineDialog.evaluate((form) => {
    const rect = form.getBoundingClientRect();
    const actions = form.querySelector('.mobile-action-row')?.getBoundingClientRect();
    const content = form.querySelector('.mobile-modal-body');
    return {
      withinViewport: rect.top >= 0 && rect.bottom <= window.innerHeight + 1,
      rect: {
        top: Math.round(rect.top),
        bottom: Math.round(rect.bottom),
        height: Math.round(rect.height),
        viewportHeight: window.innerHeight,
      },
      scrollable:
        content instanceof HTMLElement && content.scrollHeight >= content.clientHeight,
      actionsInside:
        Boolean(actions) && actions.bottom <= window.innerHeight + 1,
      dialogSemantics:
        form.getAttribute('role') === 'dialog' &&
        form.getAttribute('aria-modal') === 'true' &&
        Boolean(form.getAttribute('aria-labelledby')),
    };
  });
  check(formGeometry.withinViewport, 'Add Routine dialog leaves the viewport');
  check(formGeometry.actionsInside, 'Add Routine actions leave the viewport');
  check(formGeometry.dialogSemantics, 'Add Routine dialog lacks modal semantics');
  await page.screenshot({
    path: join(screenshotDir, 'add-routine-form.png'),
    fullPage: false,
  });
  const schedule = routineDialog.locator('select').first();
  await schedule.selectOption('weekly');
  check(
    (await schedule.inputValue()) === 'weekly',
    'Schedule select does not retain the selected value',
  );
  await page.getByRole('button', { name: 'Close', exact: true }).click();

  await navigate(page, 'dashboard');
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page
    .locator('.caizen-mobile-sheet')
    .getByRole('button', { name: 'Settings', exact: true })
    .click();
  await page.locator('[data-settings-page="home"]').waitFor({ state: 'visible' });
  const settingsHome = await page.evaluate(() => {
    const shell = document.querySelector('[data-settings-page="home"]');
    return {
      rows: shell?.querySelectorAll('.android-list-row').length ?? 0,
      depth: document.querySelectorAll('.android-settings-shell').length,
      rawSelects: [
        ...(shell?.querySelectorAll('select') ?? []),
      ].filter((select) => select.getClientRects().length > 0).length,
    };
  });
  check(settingsHome.rows === 14, 'Settings Home does not match the current concise row contract');
  check(settingsHome.depth === 1, 'Settings navigation is nested more than one shell');
  await page.screenshot({
    path: join(screenshotDir, 'settings-home.png'),
    fullPage: false,
  });

  const settingsCategories = [
    ['Profile and accounts', 'profile'],
    ['Appearance', 'appearance'],
    ['Accessibility', 'accessibility'],
    ['Privacy and security', 'privacy'],
    ['Data and storage', 'data'],
    ['Backups and restore', 'backups'],
    ['Cloud', 'cloud'],
    ['Android features', 'android'],
    ['About Caizen', 'about'],
    ['Advanced', 'advanced'],
  ];
  for (const [label, id] of settingsCategories) {
    await page
      .locator('[data-settings-page="home"] .android-list-row')
      .filter({ hasText: new RegExp(`^${label}`) })
      .click();
    await page.locator(`[data-settings-page="${id}"]`).waitFor({ state: 'visible' });
    check(
      (await page.locator('.android-settings-shell').count()) === 1,
      `${label}: Settings depth exceeds Home -> Subpage`,
    );
    if (id === 'appearance' || id === 'data' || id === 'cloud') {
      await page.screenshot({
        path: join(screenshotDir, `settings-${id}.png`),
        fullPage: false,
      });
    }
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.locator('[data-settings-page="home"]').waitFor({ state: 'visible' });
  }
  await page.getByRole('button', { name: 'Close settings' }).click();

  await navigate(page, 'music');
  const quickAction = page
    .locator('.android-music-actions')
    .getByRole('button', { name: '+ Add Music', exact: true });
  const quickActionGeometry = await quickAction.evaluate((button) => {
    const rect = button.getBoundingClientRect();
    return {
      insideViewport:
        rect.left >= 0 &&
        rect.top >= 0 &&
        rect.right <= window.innerWidth &&
        rect.bottom <= window.innerHeight,
      rect: {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
      },
    };
  });
  check(quickActionGeometry.insideViewport, 'Quick action button leaves the viewport');
  await quickAction.click();
  await page.getByPlaceholder('Song Title').fill('Phase 1.7A Test Track');
  await page.getByPlaceholder('Artist / Channel').fill('Caizen');
  await page
    .getByPlaceholder('Paste a YouTube or Spotify link')
    .fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await page.getByRole('button', { name: 'Save and Play' }).click();
  const miniPlayer = page.locator('[data-android-mini-player="true"]');
  await miniPlayer.waitFor({ state: 'attached' });
  await page.waitForFunction(
    () => document.documentElement.dataset.musicPlayerActive === 'true',
  );
  const playerGeometry = await page.locator('[data-android-mini-player="true"]').evaluate((player) => {
    const playerRect = player.getBoundingClientRect();
    const dockRect = document.querySelector('.caizen-mobile-dock')?.getBoundingClientRect();
    return {
      noDockOverlap: !dockRect || playerRect.bottom <= dockRect.top,
      height: Math.round(playerRect.height),
      titleClipped: (() => {
        const title = player.querySelector('strong');
        return title instanceof HTMLElement && title.scrollWidth > title.clientWidth;
      })(),
    };
  });
  check(playerGeometry.noDockOverlap, 'Mini-player overlaps bottom navigation');
  check(playerGeometry.height <= 72, 'Mini-player is not compact');
  await page.screenshot({
    path: join(screenshotDir, 'compact-mini-player.png'),
    fullPage: false,
  });

  await context.close();

  const result = {
    measuredAt: new Date().toISOString(),
    viewports: viewportResults,
    themes: themeResults,
    settings: settingsHome,
    form: formGeometry,
    quickAction: quickActionGeometry,
    miniPlayer: playerGeometry,
    screenshots: [
      'dashboard-header.png',
      'bottom-navigation-light.png',
      'bottom-navigation-dark.png',
      'add-routine-form.png',
      'compact-mini-player.png',
      'settings-home.png',
      'settings-appearance.png',
      'settings-data.png',
      'settings-cloud.png',
    ],
    pageErrors,
    failures,
  };
  writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
  check(pageErrors.length === 0, `Browser errors: ${pageErrors.join(' | ')}`);
  if (failures.length > 0) {
    throw new Error(`Phase 1.7A smoke failed:\n- ${failures.join('\n- ')}`);
  }
} finally {
  await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
