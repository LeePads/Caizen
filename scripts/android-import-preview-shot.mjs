/**
 * Drives the real import flow end to end and captures the preview screen in
 * both the healthy and blocked states, at the narrowest supported width.
 *
 *   node scripts/android-import-preview-shot.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  completeNativeEntry,
  installAndroid,
  launchBrowser,
  repoRoot,
  settle,
  startStaticServer,
} from './lib/android-harness.mjs';

const shotDir = join(repoRoot, 'artifacts', 'screenshots', 'import');
mkdirSync(shotDir, { recursive: true });

const profile = (overrides = {}) => ({
  id: 'p-shot',
  name: 'Screenshot',
  createdAt: '2024-01-01T08:00:00+08:00',
  wallets: [],
  transactions: [],
  inventoryItems: [],
  wishlistItems: [],
  journalEntries: [],
  games: [],
  gameGuides: [],
  productivityItems: [],
  mediaItems: [],
  musicItems: [],
  workItems: [],
  personalVaultItems: [],
  trashItems: [],
  skincareProducts: [],
  dailyChecklistItems: [],
  importantDates: [],
  supplements: [],
  balanceCheckIns: [],
  health: {
    weightEntries: [],
    nutritionEntries: [],
    foodEntries: [],
    foodTemplates: [],
    activityEntries: [],
    noXTrackers: [],
  },
  ...overrides,
});

const healthy = {
  format: 'caizen-data',
  version: 3,
  createdAt: '2026-07-30T12:00:00+08:00',
  data: {
    currentProfileId: 'p-shot',
    profiles: [
      profile({
        transactions: Array.from({ length: 120 }, (_, index) => ({
          id: `tx-${index}`,
          date: `2026-0${(index % 6) + 1}-${String((index % 27) + 1).padStart(2, '0')}`,
          amount: index * 3,
        })),
        journalEntries: Array.from({ length: 18 }, (_, index) => ({
          id: `j-${index}`,
          date: `2026-05-${String((index % 27) + 1).padStart(2, '0')}`,
        })),
        inventoryItems: Array.from({ length: 34 }, (_, index) => ({
          id: `inv-${index}`,
          purchaseDate: `2025-11-${String((index % 27) + 1).padStart(2, '0')}`,
        })),
      }),
    ],
  },
};

// Many broken rows across two modules: the case that previously produced
// hundreds of repeated warning lines.
const blocked = {
  format: 'caizen-data',
  version: 3,
  data: {
    currentProfileId: 'p-shot',
    profiles: [
      profile({
        transactions: [
          ...Array.from({ length: 900 }, (_, index) => ({ id: `bad-${index}`, date: {} })),
          ...Array.from({ length: 40 }, (_, index) => ({ id: `nodate-${index}` })),
        ],
        journalEntries: Array.from({ length: 60 }, (_, index) => ({
          id: `jbad-${index}`,
          date: '2026-02-30',
        })),
      }),
    ],
  },
};

const { server, origin } = await startStaticServer();
const browser = await launchBrowser();
const results = [];

const capture = async (page, payload, name, expand) => {
  await page.evaluate(async (json) => {
    const input = document.querySelector('input[type="file"][accept*="json"], input#json-import, input[type="file"]');
    if (!input) throw new Error('No file input found on the page.');
    const file = new File([json], 'caizen-data-2026-07-30.json', { type: 'application/json' });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, JSON.stringify(payload));

  await page.locator('.caizen-import-screen').waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(250);
  if (expand) {
    const toggle = page.locator('.caizen-import-warning-toggle').first();
    if (await toggle.count()) await toggle.click();
    await page.waitForTimeout(150);
  }
  await page.screenshot({ path: join(shotDir, `${name}.png`), fullPage: false });

  const metrics = await page.evaluate(() => {
    const screen = document.querySelector('.caizen-import-screen');
    const body = document.querySelector('.caizen-import-body');
    const confirm = document.querySelector('.caizen-import-confirm');
    const modes = [...document.querySelectorAll('.caizen-import-mode')].map((node) => ({
      label: node.querySelector('strong')?.textContent ?? '',
      description: node.querySelector('span')?.textContent ?? '',
      labelBottom: node.querySelector('strong')?.getBoundingClientRect().bottom ?? 0,
      descriptionTop: node.querySelector('span')?.getBoundingClientRect().top ?? 0,
    }));
    return {
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      screenWidth: screen?.getBoundingClientRect().width ?? 0,
      bodyScrolls: (body?.scrollHeight ?? 0) > (body?.clientHeight ?? 0),
      confirmLabel: confirm?.textContent?.trim() ?? '',
      confirmDisabled: confirm?.hasAttribute('disabled') ?? false,
      warningRows: document.querySelectorAll('.caizen-import-warning').length,
      blockerShown: Boolean(document.querySelector('.caizen-import-blocker')),
      // Label and description must occupy separate lines, never run together.
      modesStacked: modes.every((mode) => mode.descriptionTop >= mode.labelBottom - 1),
      modes: modes.map((mode) => ({ label: mode.label, description: mode.description })),
    };
  });
  results.push({ name, ...metrics });

  await page.locator('.caizen-import-cancel').click();
  await page.waitForTimeout(150);
};

try {
  const context = await browser.newContext({
    viewport: { width: 320, height: 568 },
    colorScheme: 'dark',
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  const pageErrors = [];
  await installAndroid(page, { onPageError: (message) => pageErrors.push(message) });
  await page.goto(origin, { waitUntil: 'networkidle', timeout: 30_000 });
  await completeNativeEntry(page);
  await settle(page);

  await capture(page, healthy, 'import-preview-healthy-320', false);
  await capture(page, blocked, 'import-preview-blocked-320', true);

  await page.setViewportSize({ width: 393, height: 852 });
  await capture(page, blocked, 'import-preview-blocked-393', true);

  results.push({ pageErrors });
  await context.close();
} finally {
  await browser.close();
  server.close();
}

writeFileSync(
  join(repoRoot, 'artifacts', 'import-preview-visual.json'),
  `${JSON.stringify({ capturedAt: new Date().toISOString(), results }, null, 2)}\n`,
);
console.log(JSON.stringify(results, null, 2));
