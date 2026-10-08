/**
 * Module screenshot sweep with density metrics.
 *
 * Captures every major module at phone widths in both themes and records the
 * numbers that a plain "no horizontal overflow" check cannot see: scroll
 * length, DOM weight, decorative-effect count, and small touch targets.
 *
 *   node scripts/android-module-shots.mjs [--width=393] [--theme=dark]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  installAndroid,
  launchBrowser,
  navigate,
  repoRoot,
  settle,
  startStaticServer,
} from './lib/android-harness.mjs';

const arg = (name, fallback) => {
  const found = process.argv.find((value) => value.startsWith(`--${name}=`));
  return found ? found.split('=')[1] : fallback;
};

const width = Number(arg('width', 393));
const height = width === 393 ? 852 : width === 320 ? 568 : 800;
const themes = arg('theme') ? [arg('theme')] : ['dark', 'light'];

const shotDir = join(repoRoot, 'artifacts', 'screenshots', 'modules');
mkdirSync(shotDir, { recursive: true });

const SECTIONS = [
  ['dashboard', undefined],
  ['balance', undefined],
  ['inventory', undefined],
  ['wishlist', undefined],
  ['health', undefined],
  ['journal', undefined],
  ['lifehub', undefined],
  ['lifehub', 'routine'],
  ['workhub', undefined],
  ['personalhub', undefined],
  ['music', undefined],
  ['games', undefined],
  ['entertainment', undefined],
  ['skincare', undefined],
];

const density = () => {
  const stage = document.querySelector('.caizen-stage');
  const content = document.querySelector('.caizen-content');
  const dock = document.querySelector('.caizen-mobile-dock');

  const all = stage ? stage.querySelectorAll('*') : [];
  let decorative = 0;
  let smallTargets = 0;
  let invisibleText = 0;

  for (const node of all) {
    const style = getComputedStyle(node);
    /*
      Counts HEAVY decoration only. The brief allows "subtle borders" and
      "minimal shadows", so a neutral `shadow-sm` is not a defect - counting it
      made the metric unactionable. A shadow is heavy when its blur radius
      exceeds 8px or it is tinted rather than neutral black.
    */
    const heavyShadow =
      style.boxShadow &&
      style.boxShadow !== 'none' &&
      ([...style.boxShadow.matchAll(/(\d+(?:\.\d+)?)px/g)].some(
        (match, index) => index % 4 === 2 && Number(match[1]) > 8,
      ) ||
        /rgba?\((?!0,\s*0,\s*0)[^)]*\)\s+[-\d]/.test(style.boxShadow));

    if (
      style.backgroundImage.includes('gradient') ||
      (style.filter && style.filter.includes('blur')) ||
      (style.backdropFilter && style.backdropFilter !== 'none') ||
      heavyShadow
    ) {
      decorative += 1;
    }
    if (node.matches('button, a[href], [role="button"], input, select')) {
      const rect = node.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && (rect.height < 40 || rect.width < 24)) smallTargets += 1;
    }
    if (node.children.length === 0 && node.textContent && node.textContent.trim()) {
      if (style.color === style.backgroundColor && style.backgroundColor !== 'rgba(0, 0, 0, 0)') {
        invisibleText += 1;
      }
    }
  }

  return {
    domElements: stage ? stage.querySelectorAll('*').length : 0,
    scrollHeight: content ? content.scrollHeight : 0,
    viewportHeight: window.innerHeight,
    screensOfScroll: content ? Number((content.scrollHeight / window.innerHeight).toFixed(1)) : 0,
    horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    decorativeEffects: decorative,
    smallTouchTargets: smallTargets,
    invisibleText,
    dockHeight: dock ? Math.round(dock.getBoundingClientRect().height) : 0,
  };
};

const { server, origin } = await startStaticServer();
const browser = await launchBrowser();
const results = [];
const pageErrors = [];

try {
  for (const theme of themes) {
    const context = await browser.newContext({
      viewport: { width, height },
      colorScheme: theme,
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    await installAndroid(page, { theme, onPageError: (message) => pageErrors.push(`${theme}: ${message}`) });
    await page.goto(origin, { waitUntil: 'networkidle', timeout: 30_000 });
    await settle(page);

    for (const [section, feature] of SECTIONS) {
      const name = feature ? `${section}-${feature}` : section;
      try {
        await navigate(page, section, feature);
        await page.waitForTimeout(200);
        const metrics = await page.evaluate(density);
        results.push({ name, theme, width, ...metrics });
        await page.screenshot({ path: join(shotDir, `${name}-${theme}-${width}.png`) });
      } catch (error) {
        results.push({ name, theme, width, error: error.message.split('\n')[0] });
      }
    }
    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}

writeFileSync(
  join(repoRoot, 'artifacts', `android-module-density-${width}.json`),
  `${JSON.stringify({ measuredAt: new Date().toISOString(), width, pageErrors, results }, null, 2)}\n`,
);

const table = results
  .filter((row) => !row.error)
  .map((row) =>
    [
      row.name.padEnd(20),
      row.theme.padEnd(6),
      `dom=${String(row.domElements).padStart(4)}`,
      `scroll=${String(row.screensOfScroll).padStart(5)}x`,
      `fx=${String(row.decorativeEffects).padStart(3)}`,
      `small=${String(row.smallTouchTargets).padStart(3)}`,
      row.horizontalOverflow ? 'OVERFLOW' : '',
      row.invisibleText ? `INVISIBLE=${row.invisibleText}` : '',
    ].join('  '),
  );
console.log(table.join('\n'));
if (pageErrors.length) {
  console.error('\nPage errors:');
  for (const error of pageErrors) console.error(`  - ${error}`);
}
const errored = results.filter((row) => row.error);
if (errored.length) {
  console.error('\nUnreachable:');
  for (const row of errored) console.error(`  - ${row.name} (${row.theme}): ${row.error}`);
}
