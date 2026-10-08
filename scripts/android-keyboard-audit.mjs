/**
 * Keyboard layout audit.
 *
 * Playwright cannot raise a real Android IME, but the layout contract is
 * expressed entirely through `visualViewport`, so the keyboard can be
 * simulated faithfully: shrink `visualViewport.height` and fire `resize`,
 * exactly as the WebView does. That exercises the same code path the device
 * uses (useVisualViewport -> --cz-vh -> layout), which is what makes this
 * testable without hardware.
 *
 *   node scripts/android-keyboard-audit.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  completeNativeEntry,
  installAndroid,
  launchBrowser,
  navigate,
  repoRoot,
  settle,
  startStaticServer,
} from './lib/android-harness.mjs';

const shotDir = join(repoRoot, 'artifacts', 'screenshots', 'keyboard');
mkdirSync(shotDir, { recursive: true });

const KEYBOARD_PX = 280;

/** Overrides visualViewport so the page sees a keyboard-sized viewport. */
const simulateKeyboard = (height) => {
  const viewport = window.visualViewport;
  if (!viewport) return;
  const target = window.innerHeight - height;
  if (!window.__czPatched) {
    window.__czHeight = viewport.height;
    Object.defineProperty(viewport, 'height', {
      configurable: true,
      get: () => window.__czHeight,
    });
    window.__czPatched = true;
  }
  window.__czHeight = height > 0 ? target : window.innerHeight;
  viewport.dispatchEvent(new Event('resize'));
  document.documentElement.toggleAttribute('data-keyboard-open', height > 0);
};

const measure = () => {
  const root = getComputedStyle(document.documentElement);
  // Life Hub routines use the shared ModalShell. Keep this audit aligned with
  // that canonical lifecycle instead of depending on the retired fullscreen
  // Android form classes.
  const panel = document.querySelector('.caizen-modal-panel[role="dialog"]');
  const content = panel?.querySelector('.mobile-modal-body');
  const actions = panel?.querySelector('.mobile-action-row');
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;

  const panelRect = panel?.getBoundingClientRect();
  const actionsRect = actions?.getBoundingClientRect();

  return {
    czVh: root.getPropertyValue('--cz-vh').trim(),
    czKeyboardH: root.getPropertyValue('--cz-keyboard-h').trim(),
    keyboardOpenAttr: document.documentElement.hasAttribute('data-keyboard-open'),
    viewportHeight: Math.round(viewportHeight),
    panelHeight: panelRect ? Math.round(panelRect.height) : null,
    panelTop: panelRect ? Math.round(panelRect.top) : null,
    panelBottom: panelRect ? Math.round(panelRect.bottom) : null,
    actionsTop: actionsRect ? Math.round(actionsRect.top) : null,
    actionsBottom: actionsRect ? Math.round(actionsRect.bottom) : null,
    actionsPresent: Boolean(actionsRect),
    contentScrolls: content ? content.scrollHeight > content.clientHeight : null,
    contentPaddingBottom: content ? getComputedStyle(content).paddingBottom : null,
  };
};

const { server, origin } = await startStaticServer();
const browser = await launchBrowser();
const results = [];
const failures = [];

try {
  for (const viewport of [
    { width: 360, height: 640 },
    { width: 393, height: 852 },
  ]) {
    const context = await browser.newContext({ viewport, colorScheme: 'dark', reducedMotion: 'reduce' });
    const page = await context.newPage();
    await installAndroid(page);
    await page.goto(origin, { waitUntil: 'networkidle', timeout: 30_000 });
    await completeNativeEntry(page);
    await settle(page);

    // Open a real full-screen form: Life Hub -> Routines -> Add Routine.
    await navigate(page, 'lifehub', 'routine');
    const add = page.locator('button:text-is("Add Routine")').first();
    if (!(await add.count())) {
      failures.push(`${viewport.width}: could not find "Add Routine"`);
      await context.close();
      continue;
    }
    await add.click();
    await page.locator('.caizen-modal-panel[role="dialog"]').waitFor({ state: 'visible', timeout: 10_000 });
    await page.waitForTimeout(200);

    const closed = await page.evaluate(measure);
    await page.screenshot({ path: join(shotDir, `form-closed-${viewport.width}.png`) });

    // Focus a field, then raise the "keyboard".
    const field = page.locator('.caizen-modal-panel[role="dialog"] .mobile-modal-body input, .caizen-modal-panel[role="dialog"] .mobile-modal-body textarea').first();
    if (await field.count()) await field.click();
    await page.evaluate(simulateKeyboard, KEYBOARD_PX);
    await page.waitForTimeout(300);

    const open = await page.evaluate(measure);
    await page.screenshot({ path: join(shotDir, `form-keyboard-${viewport.width}.png`) });

    await page.evaluate(simulateKeyboard, 0);
    await page.waitForTimeout(300);
    const restored = await page.evaluate(measure);

    results.push({ viewport: `${viewport.width}x${viewport.height}`, closed, open, restored });

    // The shared modal is intentionally not a fullscreen form. Its max-height
    // follows the visible-height CSS variable and its body owns scrolling.
    const visibleHeight = Number.parseFloat(open.czVh);
    if (open.panelHeight === null || !Number.isFinite(visibleHeight) || open.panelHeight > visibleHeight + 2) {
      failures.push(`${viewport.width}: shared modal exceeds the --cz-vh visible-height cap`);
    }
    if (!open.actionsPresent) failures.push(`${viewport.width}: shared modal action row is missing`);
    if (open.panelHeight === null || closed.panelHeight === null || open.panelHeight >= closed.panelHeight) {
      failures.push(`${viewport.width}: modal did not shrink when the keyboard opened`);
    }
    if (open.contentScrolls !== true) failures.push(`${viewport.width}: modal body did not expose a scrollable form surface`);
    // Closing the keyboard must restore the modal layout, not leave stale dimensions.
    if (Math.abs((restored.panelHeight ?? 0) - (closed.panelHeight ?? 0)) > 2) {
      failures.push(
        `${viewport.width}: layout not restored (${closed.panelHeight} -> ${restored.panelHeight})`,
      );
    }
    if (restored.keyboardOpenAttr) failures.push(`${viewport.width}: data-keyboard-open stuck on`);

    await context.close();
  }
} finally {
  await browser.close();
  server.close();
}

writeFileSync(
  join(repoRoot, 'artifacts', 'android-keyboard-audit.json'),
  `${JSON.stringify({ measuredAt: new Date().toISOString(), keyboardPx: KEYBOARD_PX, failures, results }, null, 2)}\n`,
);
console.log(JSON.stringify(results, null, 2));
if (failures.length) {
  console.error(`\nKeyboard audit FAILED (${failures.length}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log('\nKeyboard audit passed.');
