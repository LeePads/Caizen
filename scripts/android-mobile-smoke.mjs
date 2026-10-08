import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { chromium } from 'playwright-core';
import { completeNativeEntry } from './lib/android-harness.mjs';

const projectRoot = resolve(import.meta.dirname, '..');
const exportRoot = join(projectRoot, 'out');
const browserCandidates = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
];
const executablePath = browserCandidates.find(existsSync);
const expectedCloudState =
  process.argv.find((argument) => argument.startsWith('--cloud='))?.split('=')[1] ??
  'auto';
let observedCloudState = expectedCloudState;

if (!existsSync(join(exportRoot, 'index.html'))) {
  throw new Error('out/index.html is missing. Run the Android web build first.');
}
if (!executablePath) {
  throw new Error('No supported local Chromium browser was found.');
}

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
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
  throw new Error('Static smoke server did not expose a local TCP port.');
}
const origin = `http://127.0.0.1:${address.port}`;

const browser = await chromium.launch({
  executablePath,
  headless: true,
});
const context = await browser.newContext({
  reducedMotion: 'reduce',
});
await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
  origin,
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (
    message.type() === 'error' &&
    !message.text().includes('Failed to load resource')
  ) {
    errors.push(message.text());
  }
});
await page.addInitScript(() => {
  const markAndroidShell = () => {
    document.documentElement?.setAttribute('data-capacitor', 'true');
  };
  if (document.documentElement) {
    markAndroidShell();
  } else {
    new MutationObserver((_, observer) => {
      if (!document.documentElement) return;
      markAndroidShell();
      observer.disconnect();
    }).observe(document, { childList: true });
  }
  try {
    localStorage.setItem('life-manager-setup-completed', 'true');
    localStorage.setItem('life-manager-tour-completed', 'true');
  } catch {
    // about:blank has an opaque origin; the script runs again for the app URL.
  }
});

const viewports = [
  { width: 360, height: 640 },
  { width: 360, height: 800 },
  { width: 393, height: 852 },
  { width: 412, height: 915 },
  { width: 915, height: 412 },
];
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
const failures = [];

const check = (condition, message) => {
  if (!condition) failures.push(message);
};

try {
  await page.setViewportSize(viewports[0]);
  await page.goto(origin, { waitUntil: 'networkidle', timeout: 30_000 });
  await completeNativeEntry(page);

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    /*
      Let the resize settle before measuring.

      setViewportSize resolves as soon as the viewport is applied, before the
      page's own resize handling has run, so the FIRST section measured after a
      change was read mid-resize: the shell briefly reported a height from the
      previous orientation and the check reported a dock overlap that does not
      exist once layout settles. Verified by measuring the same section with
      and without this wait - subsequent sections at the same viewport always
      passed, which is the signature of a transient rather than a defect.
    */
    await page.waitForTimeout(250);
    for (const section of sections) {
      await page.evaluate((sectionId) => {
        window.dispatchEvent(
          new CustomEvent('caizen:navigate', {
            detail: { section: sectionId },
          }),
        );
      }, section);
      await page.waitForFunction(
        (sectionId) =>
          document.querySelector('[data-caizen-section]')?.getAttribute(
            'data-caizen-section',
          ) === sectionId,
        section,
      );
      await page.waitForFunction(
        () => !document.querySelector('[data-caizen-section-loading="true"]'),
        null,
        { timeout: 20_000 },
      );

      const result = await page.evaluate(() => {
        const content = document.querySelector('.caizen-content');
        const stage = document.querySelector('.caizen-stage');
        const dock = document.querySelector('.caizen-mobile-dock');
        if (!(content instanceof HTMLElement) || !(stage instanceof HTMLElement)) {
          return null;
        }
        content.scrollTop = content.scrollHeight;
        const remaining =
          content.scrollHeight - content.clientHeight - content.scrollTop;
        const stageRect = stage.getBoundingClientRect();
        const dockRect =
          dock instanceof HTMLElement && getComputedStyle(dock).display !== 'none'
            ? dock.getBoundingClientRect()
            : null;
        return {
          overflowY: getComputedStyle(content).overflowY,
          reachedBottom: remaining <= 2,
          noPageHorizontalOverflow:
            document.documentElement.scrollWidth <= window.innerWidth + 1,
          stageFitsWidth:
            stage.scrollWidth <= content.clientWidth + 1,
          finalContentClear:
            !dockRect ||
            (dockRect.width > dockRect.height
              ? stageRect.bottom <= dockRect.top + 1
              : stageRect.left >= dockRect.right - 1),
          mountedSectionRoots: stage.children.length,
          titleFits:
            [...stage.querySelectorAll('h1, h2')].every((heading) => {
              const rect = heading.getBoundingClientRect();
              return rect.left >= -1 && rect.right <= window.innerWidth + 1;
            }),
        };
      });

      const label = `${section}@${viewport.width}x${viewport.height}`;
      check(Boolean(result), `${label}: content container missing`);
      if (!result) continue;
      check(
        ['auto', 'scroll'].includes(result.overflowY),
        `${label}: primary content is not scrollable`,
      );
      check(result.reachedBottom, `${label}: final content is unreachable`);
      check(
        result.noPageHorizontalOverflow,
        `${label}: page has horizontal overflow`,
      );
      check(result.stageFitsWidth, `${label}: section exceeds content width`);
      check(
        result.finalContentClear,
        `${label}: bottom navigation covers final content`,
      );
      check(
        result.mountedSectionRoots === 1,
        `${label}: inactive major section content remained mounted`,
      );
      check(result.titleFits, `${label}: a page title is clipped`);
    }
  }

  await page.setViewportSize(viewports[0]);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(40);
  }
  const skipTour = page.getByRole('button', { name: 'Skip', exact: true });
  if (await skipTour.isVisible().catch(() => false)) {
    await skipTour.click();
  }
  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent('caizen:navigate', {
        detail: { section: 'dashboard' },
      }),
    );
  });
  await page.waitForFunction(
    () => !document.querySelector('[data-caizen-section-loading="true"]'),
  );

  const androidDensity = await page.evaluate(() => {
    const heading = document.querySelector('.caizen-stage h1');
    const dockButtons = document.querySelectorAll(
      '.caizen-mobile-tabs-scroll > button, .caizen-mobile-more',
    );
    const ambientBeam = document.querySelector('.caizen-ambient-beam');
    return {
      headingSize:
        heading instanceof HTMLElement
          ? Number.parseFloat(getComputedStyle(heading).fontSize)
          : 0,
      dockDestinations: dockButtons.length,
      ambientAnimation:
        ambientBeam instanceof HTMLElement
          ? getComputedStyle(ambientBeam).animationName
          : 'none',
      dashboardDom:
        document.querySelector('.caizen-stage')?.querySelectorAll('*').length ?? 0,
      calmDetailOmitsOptionalInsights: !Boolean(
        document.querySelector(
          '.android-dashboard-details-toggle',
        ),
      ),
    };
  });
  check(
    androidDensity.headingSize > 0 && androidDensity.headingSize <= 24,
    'Android Dashboard title is still desktop-sized',
  );
  check(
    androidDensity.dockDestinations === 5,
    'Android bottom navigation is not limited to four primary destinations plus More',
  );
  check(
    ['none', ''].includes(androidDensity.ambientAnimation),
    'Decorative ambient animation remains active on Android',
  );
  check(
    androidDensity.calmDetailOmitsOptionalInsights,
    'Android Dashboard calm default unexpectedly exposes the optional insights toggle',
  );

  await page.evaluate(() => window.dispatchEvent(new CustomEvent('caizen:exit-request')));
  const exitDialog = page.getByRole('dialog', { name: 'Exit Caizen?' });
  check(await exitDialog.isVisible(), 'Dashboard exit confirmation did not open');
  await exitDialog.getByRole('button', { name: 'Cancel' }).click();
  check(!(await exitDialog.isVisible().catch(() => false)), 'Cancel did not close the exit dialog');

  await page.evaluate(() => window.dispatchEvent(new CustomEvent('caizen:exit-request')));
  await exitDialog.waitFor({ state: 'visible' });
  const nativeBackClosedExit = await page.evaluate(() => {
    const detail = { handled: false, kind: 'overlay' };
    window.dispatchEvent(
      new CustomEvent('caizen:native-back-request', { detail }),
    );
    return detail.handled;
  });
  check(nativeBackClosedExit, 'Android Back did not claim the open exit dialog');
  check(
    !(await exitDialog.isVisible().catch(() => false)),
    'Android Back did not close the exit dialog',
  );
  if (await exitDialog.isVisible().catch(() => false)) {
    await exitDialog.getByRole('button', { name: 'Cancel' }).click();
  }

  let calendarPopupCount = 0;
  page.on('popup', () => {
    calendarPopupCount += 1;
  });
  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent('caizen:navigate', {
        detail: { section: 'lifehub' },
      }),
    );
  });
  await page.waitForFunction(
    () => !document.querySelector('[data-caizen-section-loading="true"]'),
  );
  const calendarTab = page.getByRole('button', {
    name: 'Calendar',
    exact: true,
  }).first();
  if (await calendarTab.isVisible().catch(() => false)) {
    await calendarTab.click();
    await page.waitForTimeout(100);
    check(
      calendarPopupCount === 0,
      'Opening the Caizen Calendar launched an external system interface',
    );
    check(
      await page.locator('[data-caizen-section="lifehub"]').isVisible(),
      'Caizen Calendar navigation left the in-app Life Hub',
    );
  } else {
    failures.push('The in-app Caizen Calendar control was unavailable');
  }
  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent('caizen:navigate', {
        detail: { section: 'dashboard' },
      }),
    );
  });

  await page.getByRole('button', { name: 'More', exact: true }).click();
  const moreSheet = page.locator('.caizen-mobile-sheet');
  await moreSheet.waitFor();
  await page.waitForTimeout(220);
  const sheetPresentation = await moreSheet.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      anchoredToBottom: Math.abs(rect.bottom - window.innerHeight) <= 2,
      canScroll:
        ['auto', 'scroll'].includes(getComputedStyle(element).overflowY),
      fitsViewport: rect.top >= -1 && rect.bottom <= window.innerHeight + 1,
      top: rect.top,
      bottom: rect.bottom,
      viewportHeight: window.innerHeight,
    };
  });
  check(
    sheetPresentation.anchoredToBottom &&
      sheetPresentation.canScroll &&
      sheetPresentation.fitsViewport,
    `Android More selection is not a scrollable bottom sheet: ${JSON.stringify(sheetPresentation)}`,
  );
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page
    .locator('[data-settings-page="home"] .android-list-row')
    .filter({ hasText: /^Cloud/ })
    .click();
  await page
    .locator('[data-settings-page="cloud"] .android-list-row')
    .filter({ hasText: /Cloud/ })
    .click();
  const cloudBody = page.getByTestId('cloud-sync-scroll-body');
  await cloudBody.waitFor();
  const cloudScroll = await cloudBody.evaluate((element) => {
    const node = element;
    node.scrollTop = node.scrollHeight;
    return {
      overflowY: getComputedStyle(node).overflowY,
      reachedBottom:
        node.scrollHeight - node.clientHeight - node.scrollTop <= 2,
    };
  });
  check(
    ['auto', 'scroll'].includes(cloudScroll.overflowY) &&
      cloudScroll.reachedBottom,
    'Cloud dialog does not scroll to its final control',
  );

  const resolvedCloudState = expectedCloudState === 'auto'
    ? (await page.getByTestId('cloud-login-form').count()) > 0
      ? 'configured'
      : 'missing'
    : expectedCloudState;
  observedCloudState = resolvedCloudState;

  if (resolvedCloudState === 'configured') {
    const email = page.locator('#cloud-email');
    const password = page.locator('#cloud-password');
    check(await email.isVisible(), 'Configured Cloud email field is unavailable');
    check(await password.isVisible(), 'Configured Cloud password field is unavailable');
    await email.fill('person@example.com');
    await password.fill('abcdef');
    await password.press('Backspace');
    check(
      (await password.inputValue()) === 'abcde',
      'Backspace did not remove the previous password character',
    );
    await password.press('Control+A');
    await password.press('Backspace');
    check(
      (await password.inputValue()) === '',
      'Password field could not be completely cleared',
    );
    await email.press('Control+A');
    await email.press('Control+C');
    await password.press('Control+V');
    check(
      (await password.inputValue()) === 'person@example.com',
      'Copy and paste were blocked in Cloud fields',
    );
    await password.press('Control+K');
    check(
      await password.evaluate((element) => document.activeElement === element),
      'A global shortcut stole focus from the password field',
    );
  } else {
    check(
      await page.getByTestId('cloud-config-missing').isVisible(),
      'Missing Cloud configuration did not produce a controlled state',
    );
    check(
      (await page.getByTestId('cloud-login-form').count()) === 0,
      'An unusable Cloud login form was shown without configuration',
    );
  }

  await page.goto(`${origin}/missing-android-route`, {
    waitUntil: 'networkidle',
  });
  await page.waitForSelector('[data-caizen-section="dashboard"]', {
    timeout: 20_000,
  });
} finally {
  await context.close();
  await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}

console.log(`mobile_viewports=${viewports.length}`);
console.log(`major_sections=${sections.length}`);
console.log(`cloud_state=${observedCloudState}`);
console.log(`fatal_javascript_errors=${errors.length}`);
console.log(`mobile_failures=${failures.length}`);

if (errors.length || failures.length) {
  console.error(JSON.stringify({ errors, failures }, null, 2));
  process.exitCode = 1;
}
