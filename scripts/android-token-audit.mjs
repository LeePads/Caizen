/**
 * Token audit.
 *
 * Snapshots every computed Android/Caizen design token across both themes and
 * every supported viewport, then diffs against a committed baseline. The
 * globals.css token refactor moves hundreds of custom-property declarations
 * between files; this is what proves such a move is visually inert.
 *
 *   node scripts/android-token-audit.mjs --write    # (re)record the baseline
 *   node scripts/android-token-audit.mjs            # verify against it
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  ANDROID_VIEWPORTS,
  completeNativeEntry,
  installAndroid,
  launchBrowser,
  repoRoot,
  settle,
  startStaticServer,
} from './lib/android-harness.mjs';

const baselinePath = join(repoRoot, 'artifacts', 'android-token-baseline.json');
const write = process.argv.includes('--write');

const collectTokens = () => {
  const names = new Set();
  for (const sheet of Array.from(document.styleSheets)) {
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      continue; // cross-origin sheet; not ours
    }
    const walk = (list) => {
      for (const rule of Array.from(list ?? [])) {
        if (rule.style) {
          for (const property of Array.from(rule.style)) {
            if (/^--(android|cz|caizen|mobile)-/.test(property)) names.add(property);
          }
        }
        if (rule.cssRules) walk(rule.cssRules);
      }
    };
    walk(rules);
  }
  const computed = getComputedStyle(document.documentElement);
  const snapshot = {};
  for (const name of Array.from(names).sort()) {
    snapshot[name] = computed.getPropertyValue(name).trim();
  }
  return snapshot;
};

const { server, origin } = await startStaticServer();
const browser = await launchBrowser();
const result = {};

try {
  for (const theme of ['dark', 'light']) {
    for (const viewport of ANDROID_VIEWPORTS) {
      const key = `${theme}@${viewport.width}x${viewport.height}`;
      const context = await browser.newContext({
        viewport,
        colorScheme: theme,
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      await installAndroid(page, { theme });
      await page.goto(origin, { waitUntil: 'networkidle', timeout: 30_000 });
      await completeNativeEntry(page);
      await settle(page);
      result[key] = await page.evaluate(collectTokens);
      await context.close();
    }
  }
} finally {
  await browser.close();
  server.close();
}

const tokenCount = Object.keys(result[Object.keys(result)[0]] ?? {}).length;

if (write || !existsSync(baselinePath)) {
  mkdirSync(dirname(baselinePath), { recursive: true });
  writeFileSync(baselinePath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(
    `Recorded token baseline: ${tokenCount} tokens x ${Object.keys(result).length} configurations -> ${baselinePath}`,
  );
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
const diffs = [];
const configs = new Set([...Object.keys(baseline), ...Object.keys(result)]);
for (const config of [...configs].sort()) {
  const before = baseline[config] ?? {};
  const after = result[config] ?? {};
  for (const name of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
    if (before[name] !== after[name]) {
      diffs.push({ config, token: name, before: before[name] ?? '(absent)', after: after[name] ?? '(absent)' });
    }
  }
}

if (diffs.length) {
  console.error(`Token audit FAILED: ${diffs.length} computed token change(s).`);
  for (const diff of diffs.slice(0, 40)) {
    console.error(`  ${diff.config} ${diff.token}: "${diff.before}" -> "${diff.after}"`);
  }
  if (diffs.length > 40) console.error(`  ...and ${diffs.length - 40} more.`);
  console.error('\nIf these changes are intended, re-record with: node scripts/android-token-audit.mjs --write');
  process.exit(1);
}

console.log(
  `Token audit passed: ${tokenCount} tokens identical across ${Object.keys(result).length} configurations.`,
);
