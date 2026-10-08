import {
  createReadStream,
  existsSync,
  mkdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { chromium } from 'playwright-core';
import { completeNativeEntry } from './lib/android-harness.mjs';

const projectRoot = resolve(import.meta.dirname, '..');
const exportRoot = join(projectRoot, 'out');
const outputPath = resolve(
  projectRoot,
  process.argv.find((argument) => argument.startsWith('--output='))?.slice(9) ??
    'artifacts/android-uiux-metrics-phase17.json',
);
const executablePath = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].find(existsSync);

if (!existsSync(join(exportRoot, 'index.html'))) {
  throw new Error('out/index.html is missing. Run the Android static build first.');
}
if (!executablePath) throw new Error('No local Chromium browser was found.');

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};
const server = createServer((request, response) => {
  const pathname = decodeURIComponent(
    new URL(request.url ?? '/', 'http://localhost').pathname,
  );
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const candidate = resolve(exportRoot, normalize(relative));
  let filePath = candidate.startsWith(`${exportRoot}${sep}`) ? candidate : '';
  let status = 200;
  if (filePath && existsSync(filePath) && statSync(filePath).isDirectory()) {
    filePath = join(filePath, 'index.html');
  }
  if (!filePath || !existsSync(filePath) || !statSync(filePath).isFile()) {
    filePath = join(exportRoot, '404.html');
    status = 404;
  }
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': contentTypes[extname(filePath)] ?? 'application/octet-stream',
  });
  createReadStream(filePath).pipe(response);
});

await new Promise((resolveListen, rejectListen) => {
  server.once('error', rejectListen);
  server.listen(0, '127.0.0.1', resolveListen);
});
const address = server.address();
if (!address || typeof address === 'string') throw new Error('No audit server port.');
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({
  colorScheme: 'dark',
  reducedMotion: 'reduce',
  viewport: { width: 393, height: 852 },
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
await page.addInitScript(() => {
  const markAndroid = () => {
    document.documentElement?.setAttribute('data-capacitor', 'true');
  };
  if (document.documentElement) {
    markAndroid();
  } else {
    new MutationObserver((_, observer) => {
      if (!document.documentElement) return;
      markAndroid();
      observer.disconnect();
    }).observe(document, { childList: true });
  }
  try {
    localStorage.setItem('life-manager-setup-completed', 'true');
    localStorage.setItem('life-manager-tour-completed', 'true');
    localStorage.setItem('theme-preference', 'dark');
  } catch {
    // Runs again at the app origin.
  }
});

const settle = async (section) => {
  await page.waitForFunction(
    (sectionId) =>
      document.querySelector('[data-caizen-section]')?.getAttribute(
        'data-caizen-section',
      ) === sectionId &&
      !document.querySelector('[data-caizen-section-loading="true"]'),
    section,
    { timeout: 20_000 },
  );
  await page.waitForTimeout(100);
};
const navigate = async (section, feature) => {
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
  await settle(section);
};
const measure = () =>
  page.evaluate(() => {
    const stage = document.querySelector('.caizen-stage');
    const content = document.querySelector('.caizen-content');
    const header = document.querySelector('.caizen-header');
    const dock = document.querySelector('.caizen-mobile-dock');
    const visible = (element) => {
      if (!(element instanceof HTMLElement)) return false;
      const style = getComputedStyle(element);
      return (
        element.getClientRects().length > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden'
      );
    };
    const targets = [
      ...(stage?.querySelectorAll('button, a, input, textarea, select') ?? []),
    ].filter(visible);
    const truncated = [
      ...(stage?.querySelectorAll(
        'h1, h2, h3, p, span, button, label',
      ) ?? []),
    ].filter(
      (element) =>
        visible(element) &&
        element.textContent?.trim() &&
        (element.scrollWidth > element.clientWidth + 2 ||
          element.scrollHeight > element.clientHeight + 2) &&
        ['hidden', 'clip'].includes(getComputedStyle(element).overflow),
    );
    const stageText = stage?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
    return {
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      headerHeight: Math.round(header?.getBoundingClientRect().height ?? 0),
      dockHeight: Math.round(dock?.getBoundingClientRect().height ?? 0),
      contentHeight: Math.round(content?.getBoundingClientRect().height ?? 0),
      scrollHeight: content instanceof HTMLElement ? content.scrollHeight : 0,
      domElements: stage?.querySelectorAll('*').length ?? 0,
      headings: stage?.querySelectorAll('h1, h2, h3').length ?? 0,
      paragraphs: stage?.querySelectorAll('p').length ?? 0,
      visibleControls: targets.length,
      nativeSelects: stage?.querySelectorAll('select').length ?? 0,
      textCharacters: stageText.length,
      smallTouchTargets: targets
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return rect.width < 44 || rect.height < 44;
        })
        .slice(0, 20)
        .map((element) => ({
          text:
            element.getAttribute('aria-label') ??
            element.textContent?.trim().slice(0, 50) ??
            element.tagName,
          size: `${Math.round(element.getBoundingClientRect().width)}x${Math.round(
            element.getBoundingClientRect().height,
          )}`,
        })),
      truncatedText: truncated.slice(0, 20).map((element) =>
        element.textContent?.trim().replace(/\s+/g, ' ').slice(0, 80),
      ),
      horizontalOverflow:
        document.documentElement.scrollWidth > window.innerWidth + 1,
    };
  });

const sections = [
  'dashboard',
  'balance',
  'inventory',
  'wishlist',
  'skincare',
  'health',
  'journal',
  'lifehub',
  'workhub',
  'personalhub',
  'music',
  'entertainment',
  'games',
];
const features = [
  ['saved-food', 'health', 'saved'],
  ['food-trends', 'health', 'trends'],
  ['routines', 'lifehub', 'routine'],
  ['calendar', 'lifehub', 'dates'],
];

const result = {
  measuredAt: new Date().toISOString(),
  sections: {},
  features: {},
  overlays: {},
  errors,
};
try {
  await page.goto(origin, { waitUntil: 'networkidle', timeout: 30_000 });
  await completeNativeEntry(page);
  await settle('dashboard');
  for (const section of sections) {
    await navigate(section);
    result.sections[section] = await measure();
  }
  for (const [name, section, feature] of features) {
    await navigate(section, feature);
    result.features[name] = await measure();
  }
  await navigate('dashboard');
  await page.getByRole('button', { name: 'More', exact: true }).click();
  await page.locator('.cz-more').waitFor({ state: 'visible' });
  result.overlays.more = await page.evaluate(() => {
    const sheet = document.querySelector('.caizen-mobile-sheet');
    return {
      height: Math.round(sheet?.getBoundingClientRect().height ?? 0),
      controls: sheet?.querySelectorAll('button, input, select').length ?? 0,
      textCharacters: sheet?.textContent?.replace(/\s+/g, ' ').trim().length ?? 0,
    };
  });
  const settingsButton = page.getByRole('button', {
    name: 'Settings',
    exact: true,
  });
  if (await settingsButton.isVisible().catch(() => false)) {
    await settingsButton.click();
    await page.locator('.android-settings-shell[data-settings-page="home"]').waitFor({
      state: 'visible',
    });
    result.overlays.settings = await page.evaluate(() => {
      const dialog = document.querySelector('.android-settings-shell');
      return {
        height: Math.round(dialog?.getBoundingClientRect().height ?? 0),
        controls: dialog?.querySelectorAll('button, input, textarea, select').length ?? 0,
        headings: dialog?.querySelectorAll('h1, h2, h3, summary').length ?? 0,
        textCharacters:
          dialog?.textContent?.replace(/\s+/g, ' ').trim().length ?? 0,
      };
    });
  } else {
    result.overlays.settings = {
      unavailableFromMore: true,
      visibleLabels: await page
        .locator('.caizen-mobile-sheet button')
        .allTextContents(),
    };
  }
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
} finally {
  await context.close();
  await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}

if (errors.length > 0) process.exitCode = 1;
