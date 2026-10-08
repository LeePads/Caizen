import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { chromium } from 'playwright-core';

/**
 * Shared headless harness for the Android smoke/audit scripts.
 *
 * It serves the static export in `out/` over loopback and drives a locally
 * installed Chromium (Edge or Chrome) with `data-capacitor="true"` injected
 * before any app script runs. No device, emulator, or ADB is involved.
 */

export const repoRoot = resolve(import.meta.dirname, '..', '..');
export const outDir = join(repoRoot, 'out');

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

export function findBrowser() {
  const executablePath = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/microsoft-edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].find(existsSync);
  if (!executablePath) throw new Error('No local Chromium browser was found.');
  return executablePath;
}

export async function startStaticServer(dir = outDir) {
  if (!existsSync(join(dir, 'index.html'))) {
    throw new Error(`${dir}/index.html is missing. Run "pnpm build:android:web" first.`);
  }
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const candidate = resolve(dir, normalize(relative));
    let file = candidate.startsWith(`${dir}${sep}`) ? candidate : '';
    let status = 200;
    if (file && existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!file || !existsSync(file) || !statSync(file).isFile()) {
      file = join(dir, '404.html');
      status = 404;
    }
    response.writeHead(status, {
      'cache-control': 'no-store',
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
    });
    createReadStream(file).pipe(response);
  });
  await new Promise((done, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', done);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No local test port.');
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

export function launchBrowser() {
  return chromium.launch({ executablePath: findBrowser(), headless: true });
}

/**
 * Marks the document as a Capacitor build and pre-seeds the onboarding flags so
 * the app boots straight to the dashboard.
 */
export async function installAndroid(page, { theme = 'dark', onPageError, androidPresentation = false } = {}) {
  if (onPageError) page.on('pageerror', (error) => onPageError(error.message));
  await page.addInitScript(({ preference, presentation }) => {
    if (presentation) {
      // Exercise platform-selected UI without pretending there is a native
      // bridge. Capacitor still detects web for plugin dispatch/isNativePlatform.
      const capacitor = window.Capacitor ?? {};
      Object.defineProperty(capacitor, 'getPlatform', {
        configurable: true,
        get: () => () => 'android',
        set: () => {},
      });
      window.Capacitor = capacitor;
    }
    const mark = () => document.documentElement?.setAttribute('data-capacitor', 'true');
    if (document.documentElement) mark();
    else {
      new MutationObserver((_, observer) => {
        if (!document.documentElement) return;
        mark();
        observer.disconnect();
      }).observe(document, { childList: true });
    }
    localStorage.setItem('life-manager-setup-completed', 'true');
    localStorage.setItem('life-manager-tour-completed', 'true');
    localStorage.setItem('ui-animation-preference', 'reduced');
    localStorage.setItem('theme-preference', preference);
  }, { preference: theme, presentation: androidPresentation });
}

/** Completes onboarding in the harness's fresh, setup-seeded test profile. */
export async function completeNativeEntry(page, timeout = 20_000) {
  // Dashboard markup can exist underneath onboarding before hydration settles.
  const onboarding = page.getByRole('dialog', {
    name: /^(A place for the things you want to keep track of\.|Learn Caizen at your pace\.)$/,
  });
  await onboarding.waitFor({ state: 'visible', timeout });
  await onboarding.getByRole('button', { name: 'Explore on my own', exact: true }).click();
  await onboarding.waitFor({ state: 'hidden', timeout });
  await page.waitForSelector('[data-caizen-section="dashboard"]', { state: 'visible', timeout });
}

export async function settle(page, section = 'dashboard', timeout = 20_000) {
  await page.waitForFunction(
    (id) =>
      document.querySelector('[data-caizen-section]')?.getAttribute('data-caizen-section') === id &&
      !document.querySelector('[data-caizen-section-loading="true"]'),
    section,
    { timeout },
  );
  await page.waitForTimeout(80);
}

export async function navigate(page, section, feature) {
  await page.evaluate(
    ({ section: id, feature: view }) => {
      window.dispatchEvent(new CustomEvent('caizen:navigate', { detail: { section: id, feature: view } }));
    },
    { section, feature },
  );
  await settle(page, section === 'games' ? 'entertainment' : section);
  if (section === 'games') {
    await page.getByRole('heading', { name: 'Games', exact: true }).waitFor({ state: 'visible' });
  }
}

export const ANDROID_VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 360, height: 640 },
  { width: 360, height: 800 },
  { width: 393, height: 852 },
  { width: 412, height: 915 },
  { width: 915, height: 412 },
];
