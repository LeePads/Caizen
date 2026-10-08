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
const label =
  process.argv.find((argument) => argument.startsWith('--label='))?.split('=')[1] ??
  'measurement';
const outputPathArgument =
  process.argv.find((argument) => argument.startsWith('--output='))?.slice(9);
const comparisonPathArgument =
  process.argv.find((argument) => argument.startsWith('--compare='))?.slice(10);
const outputPath = outputPathArgument
  ? resolve(projectRoot, outputPathArgument)
  : null;
const comparisonPath = comparisonPathArgument
  ? resolve(projectRoot, comparisonPathArgument)
  : null;
const browserCandidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];
const executablePath = browserCandidates.find(existsSync);
const sections = [
  'dashboard',
  'balance',
  'inventory',
  'skincare',
  'health',
  'lifehub',
  'workhub',
  'personalhub',
  'music',
  'entertainment',
];

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
  let filePath = candidate.startsWith(`${exportRoot}${sep}`)
    ? candidate
    : '';
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
  throw new Error('Performance server did not expose a local TCP port.');
}
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({
  reducedMotion: 'no-preference',
  viewport: { width: 393, height: 852 },
});
const page = await context.newPage();
const pageErrors = [];
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
  window.__CAIZEN_PERF_TRACE__ = true;
  window.__caizenPerformanceStartedAt = performance.now();
  window.__caizenLongTasks = [];
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__caizenLongTasks.push({
          duration: entry.duration,
          startTime: entry.startTime,
        });
      }
    }).observe({ type: 'longtask', buffered: true });
  } catch {
    // Long Task API is not available in every Chromium build.
  }
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
  } catch {
    // about:blank is opaque; this script runs again for the app origin.
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
  await page.evaluate(
    () =>
      new Promise((resolveFrame) => {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => setTimeout(resolveFrame, 40)),
        );
      }),
  );
};

const switchSection = async (section) => {
  const startedAt = performance.now();
  await page.evaluate((sectionId) => {
    window.dispatchEvent(
      new CustomEvent('caizen:navigate', {
        detail: { section: sectionId },
      }),
    );
  }, section);
  await settleSection(section);
  return performance.now() - startedAt;
};

const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};
const round = (value) => Math.round(value * 100) / 100;

let result;
try {
  const wallStartedAt = performance.now();
  await page.goto(origin, { waitUntil: 'networkidle', timeout: 30_000 });
  await completeNativeEntry(page);
  await settleSection('dashboard');
  const startupWallMs = performance.now() - wallStartedAt;

  const startup = await page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0];
    const scripts = performance
      .getEntriesByType('resource')
      .filter((entry) => entry.name.includes('/_next/') && entry.name.endsWith('.js'));
    return {
      dashboardReadyMs:
        performance.now() - (window.__caizenPerformanceStartedAt ?? 0),
      domContentLoadedMs: navigation?.domContentLoadedEventEnd ?? 0,
      loadEventMs: navigation?.loadEventEnd ?? 0,
      initialDomElements: document.querySelectorAll('*').length,
      dashboardDomElements:
        document.querySelector('.caizen-stage')?.querySelectorAll('*').length ?? 0,
      mountedMajorSections: document.querySelectorAll('.caizen-stage > *').length,
      closedDialogsMounted: [
        ...document.querySelectorAll(
          '[role="dialog"], [data-slot="dialog-content"], [data-slot="sheet-content"]',
        ),
      ].filter((element) => {
        const style = getComputedStyle(element);
        return style.display !== 'none' && style.visibility !== 'hidden';
      }).length,
      initialJavaScript: {
        requests: scripts.length,
        transferBytes: scripts.reduce((sum, entry) => sum + entry.transferSize, 0),
        encodedBytes: scripts.reduce((sum, entry) => sum + entry.encodedBodySize, 0),
        decodedBytes: scripts.reduce((sum, entry) => sum + entry.decodedBodySize, 0),
        largest: scripts
          .map((entry) => ({
            file: new URL(entry.name).pathname.split('/').at(-1),
            decodedBytes: entry.decodedBodySize,
          }))
          .sort((a, b) => b.decodedBytes - a.decodedBytes)
          .slice(0, 8),
      },
    };
  });
  const startupLongTasks = await page.evaluate(() => {
    const tasks = window.__caizenLongTasks ?? [];
    window.__caizenLongTasks = [];
    return {
      count: tasks.length,
      totalMs: tasks.reduce((sum, task) => sum + task.duration, 0),
      longestMs: Math.max(0, ...tasks.map((task) => task.duration)),
    };
  });

  const firstSwitchMs = {};
  const firstDashboardReturnMs = [];
  const warmSwitchMs = {};
  const warmDashboardReturnMs = [];
  const sectionDomElements = {};
  const lazyChunks = {};
  for (const section of sections.filter((item) => item !== 'dashboard')) {
    const resourcesBefore = await page.evaluate(() =>
      performance.getEntriesByType('resource').map((entry) => entry.name),
    );
    firstSwitchMs[section] = round(await switchSection(section));
    const sectionStats = await page.evaluate(() => ({
      dom:
        document.querySelector('.caizen-stage')?.querySelectorAll('*').length ?? 0,
      resources: performance.getEntriesByType('resource').map((entry) => entry.name),
    }));
    sectionDomElements[section] = sectionStats.dom;
    lazyChunks[section] = sectionStats.resources
      .filter(
        (resource) =>
          !resourcesBefore.includes(resource) &&
          resource.includes('/_next/') &&
          resource.endsWith('.js'),
      )
      .map((resource) => new URL(resource).pathname.split('/').at(-1));
    firstDashboardReturnMs.push(round(await switchSection('dashboard')));
  }
  const firstOpenLongTasks = await page.evaluate(() => {
    const tasks = window.__caizenLongTasks ?? [];
    window.__caizenLongTasks = [];
    return {
      count: tasks.length,
      totalMs: tasks.reduce((sum, task) => sum + task.duration, 0),
      longestMs: Math.max(0, ...tasks.map((task) => task.duration)),
    };
  });
  for (const section of sections.filter((item) => item !== 'dashboard')) {
    warmSwitchMs[section] = round(await switchSection(section));
    warmDashboardReturnMs.push(round(await switchSection('dashboard')));
  }
  const warmLongTasks = await page.evaluate(() => {
    const tasks = window.__caizenLongTasks ?? [];
    window.__caizenLongTasks = [];
    return {
      count: tasks.length,
      totalMs: tasks.reduce((sum, task) => sum + task.duration, 0),
      longestMs: Math.max(0, ...tasks.map((task) => task.duration)),
    };
  });

  const heapBefore = await page.evaluate(
    () => performance.memory?.usedJSHeapSize ?? null,
  );
  for (let cycle = 0; cycle < 3; cycle += 1) {
    for (const section of ['lifehub', 'inventory', 'music', 'dashboard']) {
      await switchSection(section);
    }
  }
  const heapAfter = await page.evaluate(
    () => performance.memory?.usedJSHeapSize ?? null,
  );
  const runtime = await page.evaluate(() => {
    const tasks = window.__caizenLongTasks ?? [];
    const traces = {};
    for (const entry of performance.getEntriesByType('measure')) {
      if (!entry.name.startsWith('caizen:trace:')) continue;
      const name = entry.name.slice('caizen:trace:'.length);
      const bucket = traces[name] ?? { count: 0, totalMs: 0, longestMs: 0 };
      bucket.count += 1;
      bucket.totalMs += entry.duration;
      bucket.longestMs = Math.max(bucket.longestMs, entry.duration);
      traces[name] = bucket;
    }
    for (const bucket of Object.values(traces)) {
      bucket.totalMs = Math.round(bucket.totalMs * 100) / 100;
      bucket.longestMs = Math.round(bucket.longestMs * 100) / 100;
    }
    return {
      repeatedNavigationLongTaskCount: tasks.length,
      repeatedNavigationLongTaskTotalMs: tasks.reduce(
        (sum, task) => sum + task.duration,
        0,
      ),
      repeatedNavigationLongestTaskMs: Math.max(
        0,
        ...tasks.map((task) => task.duration),
      ),
      finalDomElements: document.querySelectorAll('*').length,
      traceMeasures: traces,
    };
  });
  const heaviestSection = Object.entries({
    dashboard: startup.dashboardDomElements,
    ...sectionDomElements,
  }).sort((a, b) => b[1] - a[1])[0];

  result = {
    label,
    measuredAt: new Date().toISOString(),
    viewport: '393x852',
    startup: {
      ...startup,
      wallMs: round(startupWallMs),
      dashboardReadyMs: round(startup.dashboardReadyMs),
      domContentLoadedMs: round(startup.domContentLoadedMs),
      loadEventMs: round(startup.loadEventMs),
    },
    sections: {
      firstSwitchMs,
      warmSwitchMs,
      firstSwitchMedianMs: round(median(Object.values(firstSwitchMs))),
      firstDashboardReturnMs,
      firstDashboardReturnMedianMs: round(median(firstDashboardReturnMs)),
      warmSwitchMedianMs: round(median(Object.values(warmSwitchMs))),
      warmDashboardReturnMs,
      warmDashboardReturnMedianMs: round(median(warmDashboardReturnMs)),
      domElements: sectionDomElements,
      heaviest: { section: heaviestSection[0], domElements: heaviestSection[1] },
      lazyChunks,
    },
    runtime: {
      ...runtime,
      startupLongTasks: {
        ...startupLongTasks,
        totalMs: round(startupLongTasks.totalMs),
        longestMs: round(startupLongTasks.longestMs),
      },
      firstOpenLongTasks: {
        ...firstOpenLongTasks,
        totalMs: round(firstOpenLongTasks.totalMs),
        longestMs: round(firstOpenLongTasks.longestMs),
      },
      warmLongTasks: {
        ...warmLongTasks,
        totalMs: round(warmLongTasks.totalMs),
        longestMs: round(warmLongTasks.longestMs),
      },
      repeatedNavigationLongTaskTotalMs: round(
        runtime.repeatedNavigationLongTaskTotalMs,
      ),
      repeatedNavigationLongestTaskMs: round(
        runtime.repeatedNavigationLongestTaskMs,
      ),
      heapBefore,
      heapAfter,
      heapGrowthBytes:
        heapBefore === null || heapAfter === null ? null : heapAfter - heapBefore,
    },
    errors: pageErrors,
  };
} finally {
  await page.close().catch(() => undefined);
  await context.close().catch(() => undefined);
  await browser.close().catch(() => undefined);
  await new Promise((resolveClose) => server.close(resolveClose));
}

const regressions = [];
if (comparisonPath) {
  const baseline = JSON.parse(
    await import('node:fs/promises').then(({ readFile }) =>
      readFile(comparisonPath, 'utf8'),
    ),
  );
  const limit = (actual, allowed, message) => {
    if (actual > allowed) {
      regressions.push(`${message}: ${round(actual)} > ${round(allowed)}`);
    }
  };
  limit(
    result.startup.initialJavaScript.decodedBytes,
    baseline.startup.initialJavaScript.decodedBytes * 1.05,
    'Initial decoded JavaScript regressed by more than 5%',
  );
  limit(
    result.startup.dashboardDomElements,
    baseline.startup.dashboardDomElements * 1.1 + 10,
    'Dashboard DOM regressed by more than 10%',
  );
  limit(
    result.sections.warmSwitchMedianMs,
    baseline.sections.warmSwitchMedianMs * 1.5 + 50,
    'Warm section switching regressed materially',
  );
  limit(
    result.runtime.startupLongTasks.count,
    (baseline.runtime.startupLongTasks?.count ??
      baseline.runtime.longTaskCount ??
      0) + 1,
    'Startup long-task count regressed materially',
  );
  limit(
    result.runtime.warmLongTasks.count,
    (baseline.runtime.warmLongTasks?.count ?? 0) + 1,
    'Warm-navigation long-task count regressed materially',
  );
  if (
    result.runtime.heapGrowthBytes !== null &&
    baseline.runtime.heapGrowthBytes !== null
  ) {
    limit(
      result.runtime.heapGrowthBytes,
      Math.max(baseline.runtime.heapGrowthBytes * 1.5, 20 * 1024 * 1024),
      'Repeated-navigation heap growth regressed materially',
    );
  }
}
result.regressions = regressions;

if (outputPath) {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
}
console.log(JSON.stringify(result, null, 2));
if (pageErrors.length > 0 || regressions.length > 0) {
  process.exitCode = 1;
}
