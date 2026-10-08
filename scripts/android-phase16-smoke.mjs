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

const projectRoot = resolve(import.meta.dirname, '..');
const exportRoot = join(projectRoot, 'out');
const allowFailure = process.argv.includes('--allow-fail');
const label =
  process.argv.find((argument) => argument.startsWith('--label='))?.slice(8) ??
  'phase16';
const outputArgument =
  process.argv.find((argument) => argument.startsWith('--output='))?.slice(9);
const outputPath = outputArgument
  ? resolve(projectRoot, outputArgument)
  : null;
const browserCandidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];
const executablePath = browserCandidates.find(existsSync);

if (!existsSync(join(exportRoot, 'index.html'))) {
  throw new Error('out/index.html is missing. Run the Android web build first.');
}
if (!executablePath) {
  throw new Error('No supported local Chromium browser was found.');
}

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};
const server = createServer((request, response) => {
  const pathname = decodeURIComponent(
    new URL(request.url ?? '/', 'http://localhost').pathname,
  );
  const relativePath =
    pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const candidate = resolve(exportRoot, normalize(relativePath));
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
if (!address || typeof address === 'string') {
  throw new Error('Smoke server did not expose a local TCP port.');
}
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ executablePath, headless: true });

const failures = [];
const pageErrors = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};
const context = await browser.newContext({
  colorScheme: 'light',
  reducedMotion: 'reduce',
  viewport: { width: 393, height: 852 },
});
await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
const page = await context.newPage();
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('console', (message) => {
  if (
    message.type() === 'error' &&
    !message.text().includes('Failed to load resource')
  ) {
    pageErrors.push(message.text());
  }
});
await page.addInitScript(() => {
  window.__caizenInputMetrics = {
    commits: 0,
    changedFibers: 0,
    idbWrites: 0,
    storageWrites: 0,
  };
  let rendererId = 0;
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    checkDCE() {},
    getFiberRoots() {
      return new Set();
    },
    inject() {
      rendererId += 1;
      return rendererId;
    },
    onCommitFiberRoot(_rendererId, root) {
      window.__caizenInputMetrics.commits += 1;
      const pending = [root?.current];
      while (pending.length > 0) {
        const fiber = pending.pop();
        if (!fiber) continue;
        if (
          fiber.alternate &&
          (
            fiber.memoizedProps !== fiber.alternate.memoizedProps ||
            fiber.memoizedState !== fiber.alternate.memoizedState
          )
        ) {
          window.__caizenInputMetrics.changedFibers += 1;
        }
        if (fiber.child) pending.push(fiber.child);
        if (fiber.sibling) pending.push(fiber.sibling);
      }
    },
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    renderers: new Map(),
    supportsFiber: true,
  };
  const installWriteCounters = () => {
    if (!window.IDBObjectStore || window.__caizenIdbWrapped) return;
    window.__caizenIdbWrapped = true;
    for (const method of ['add', 'put', 'delete', 'clear']) {
      const original = IDBObjectStore.prototype[method];
      if (typeof original !== 'function') continue;
      IDBObjectStore.prototype[method] = function (...args) {
        window.__caizenInputMetrics.idbWrites += 1;
        return original.apply(this, args);
      };
    }
  };
  installWriteCounters();
  const originalStorageWrite = Storage.prototype.setItem;
  Storage.prototype.setItem = function (...args) {
    window.__caizenInputMetrics.storageWrites += 1;
    return originalStorageWrite.apply(this, args);
  };
  const markAndroid = () => {
    document.documentElement?.setAttribute('data-capacitor', 'true');
  };
  if (document.documentElement) markAndroid();
  else {
    new MutationObserver((_, observer) => {
      if (!document.documentElement) return;
      markAndroid();
      observer.disconnect();
    }).observe(document, { childList: true });
  }
  try {
    localStorage.setItem('life-manager-setup-completed', 'true');
    localStorage.setItem('life-manager-tour-completed', 'true');
  } catch {
    // The script runs once more after navigation to the app origin.
  }
});

const settleSection = async (section) => {
  await page.waitForFunction(
    (sectionId) =>
      document.querySelector('[data-caizen-section]')?.getAttribute(
        'data-caizen-section',
      ) === sectionId,
    section,
    { timeout: 20_000 },
  );
  await page.waitForFunction(
    () => !document.querySelector('[data-caizen-section-loading="true"]'),
    null,
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
  await settleSection(section);
};

let result;
try {
  await page.goto(origin, { waitUntil: 'networkidle', timeout: 30_000 });
  await settleSection('dashboard');

  const featureDefinitions = [
    ['saved-food', 'health', 'saved'],
    ['food-trends', 'health', 'trends'],
    ['routines', 'lifehub', 'routine'],
    ['calendar', 'lifehub', 'dates'],
  ];
  const features = {};
  for (const [name, section, feature] of featureDefinitions) {
    await navigate(section, feature);
    const state = await page.evaluate((featureName) => {
      const root = document.querySelector(`[data-caizen-feature="${featureName}"]`);
      if (!(root instanceof HTMLElement)) return { accessible: false };
      const content = document.querySelector('.caizen-content');
      if (content instanceof HTMLElement) content.scrollTop = content.scrollHeight;
      return {
        accessible: true,
        visible: root.getClientRects().length > 0,
        controls: root.querySelectorAll('button, input, select, textarea').length,
        noHorizontalOverflow:
          document.documentElement.scrollWidth <= window.innerWidth + 1,
        reachedBottom:
          !(content instanceof HTMLElement) ||
          content.scrollHeight - content.clientHeight - content.scrollTop <= 2,
      };
    }, name);
    features[name] = state;
    check(state.accessible && state.visible, `${name}: feature is not accessible`);
    check(
      state.noHorizontalOverflow !== false,
      `${name}: feature causes horizontal overflow`,
    );
    check(state.reachedBottom !== false, `${name}: final content is unreachable`);
  }

  await navigate('inventory');
  const search = page.locator('input[placeholder="Search inventory..."]').first();
  check(await search.isVisible().catch(() => false), 'inventory search is missing');
  const inputMetrics = await (async () => {
    if (!(await search.isVisible().catch(() => false))) return null;
    await page.evaluate(() => {
      window.__caizenInputMetrics.commits = 0;
      window.__caizenInputMetrics.changedFibers = 0;
      window.__caizenInputMetrics.idbWrites = 0;
      window.__caizenInputMetrics.storageWrites = 0;
    });
    await search.focus();
    const startedAt = performance.now();
    await search.fill('caizen-mobile-input-latency');
    for (let index = 0; index < 12; index += 1) {
      await search.press('Backspace');
    }
    await search.press('Home');
    await search.press('ArrowRight');
    await search.press('ArrowRight');
    await search.press('x');
    await page.evaluate(() => navigator.clipboard.writeText('paste'));
    await search.press('Control+V');
    await search.press('Control+A');
    await search.press('Backspace');
    const durationMs = performance.now() - startedAt;
    await page.waitForTimeout(500);
    return page.evaluate((duration) => ({
      durationMs: Math.round(duration * 100) / 100,
      finalValue: document.querySelector(
        'input[placeholder="Search inventory..."]',
      )?.value,
      ...window.__caizenInputMetrics,
    }), durationMs);
  })();
  check(inputMetrics?.finalValue === '', 'input could not be completely cleared');
  check(
    (inputMetrics?.idbWrites ?? 1) === 0,
    'search typing triggered IndexedDB writes',
  );

  const themeResults = {};
  for (const theme of ['light', 'dark']) {
    await page.evaluate((themeName) => {
      localStorage.setItem('theme-preference', themeName);
    }, theme);
    await page.reload({ waitUntil: 'networkidle' });
    await settleSection('dashboard');
    const themeState = await page.evaluate(() => {
      const colorCanvas = document.createElement('canvas');
      colorCanvas.width = 1;
      colorCanvas.height = 1;
      const colorContext = colorCanvas.getContext('2d', {
        colorSpace: 'srgb',
        willReadFrequently: true,
      });
      const parse = (color) => {
        if (!colorContext) {
          return { r: 0, g: 0, b: 0, a: 0 };
        }
        colorContext.clearRect(0, 0, 1, 1);
        colorContext.fillStyle = color;
        colorContext.fillRect(0, 0, 1, 1);
        const [r, g, b, alpha] = colorContext.getImageData(0, 0, 1, 1).data;
        return { r, g, b, a: alpha / 255 };
      };
      const luminance = ({ r, g, b }) => {
        const channels = [r, g, b].map((value) => {
          const channel = value / 255;
          return channel <= 0.03928
            ? channel / 12.92
            : ((channel + 0.055) / 1.055) ** 2.4;
        });
        return (
          channels[0] * 0.2126 +
          channels[1] * 0.7152 +
          channels[2] * 0.0722
        );
      };
      const surface = parse(
        getComputedStyle(document.documentElement).getPropertyValue('--background'),
      );
      const critical = [
        ...document.querySelectorAll(
          'h1, h2, .caizen-mobile-dock button, [data-theme-critical]',
        ),
      ]
        .filter((element) => {
          const style = getComputedStyle(element);
          return element.getClientRects().length > 0 && style.visibility !== 'hidden';
        })
        .map((element) => {
          const style = getComputedStyle(element);
          const rawForeground = style.color;
          const foreground = parse(rawForeground);
          let background = surface;
          let rawBackground = getComputedStyle(
            document.documentElement,
          ).getPropertyValue('--background');
          let parent = element;
          while (parent instanceof HTMLElement) {
            const parentBackground = getComputedStyle(parent).backgroundColor;
            const candidate = parse(parentBackground);
            if (candidate.a > 0.85) {
              background = candidate;
              rawBackground = parentBackground;
              break;
            }
            parent = parent.parentElement;
          }
          const high = Math.max(luminance(foreground), luminance(background));
          const low = Math.min(luminance(foreground), luminance(background));
          return {
            text: element.textContent?.trim().slice(0, 80),
            rawForeground,
            rawBackground,
            contrast: Math.round(((high + 0.05) / (low + 0.05)) * 100) / 100,
            foregroundAlpha: foreground.a,
            opacity: Number(style.opacity),
            clipped:
              element.scrollWidth > element.clientWidth + 2 &&
              style.overflow === 'hidden',
          };
        });
      return {
        resolvedTheme: document.documentElement.classList.contains('dark')
          ? 'dark'
          : 'light',
        critical,
      };
    });
    themeResults[theme] = themeState;
    check(themeState.resolvedTheme === theme, `${theme}: theme did not resolve`);
    for (const item of themeState.critical) {
      check(
        item.foregroundAlpha > 0 && item.opacity > 0,
        `${theme}: transparent text "${item.text}"`,
      );
      check(item.contrast >= 2.5, `${theme}: low contrast "${item.text}"`);
      check(!item.clipped, `${theme}: clipped text "${item.text}"`);
    }
  }

  const systemThemeResults = {};
  await page.evaluate(() => {
    localStorage.setItem('theme-preference', 'system');
  });
  for (const colorScheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme });
    await page.reload({ waitUntil: 'networkidle' });
    await settleSection('dashboard');
    const resolvedTheme = await page.evaluate(
      () => document.documentElement.dataset.resolvedTheme,
    );
    systemThemeResults[colorScheme] = resolvedTheme;
    check(
      resolvedTheme === colorScheme,
      `system ${colorScheme}: theme did not resolve`,
    );
  }

  result = {
    label,
    measuredAt: new Date().toISOString(),
    features,
    input: inputMetrics,
    themes: Object.fromEntries(
      Object.entries(themeResults).map(([theme, value]) => [
        theme,
        {
          resolvedTheme: value.resolvedTheme,
          minimumContrast: Math.min(
            ...value.critical.map((item) => item.contrast),
          ),
          lowestContrast: [...value.critical].sort(
            (left, right) => left.contrast - right.contrast,
          )[0],
          criticalTextCount: value.critical.length,
        },
      ]),
    ),
    systemThemes: systemThemeResults,
    failures,
    pageErrors,
  };
  if (outputPath) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  }
  console.log(JSON.stringify(result, null, 2));
} finally {
  await context.close();
  await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}

if ((failures.length > 0 || pageErrors.length > 0) && !allowFailure) {
  process.exitCode = 1;
}
