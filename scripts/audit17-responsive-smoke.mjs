import { completeNativeEntry, installAndroid, launchBrowser, navigate, startStaticServer } from './lib/android-harness.mjs';

const viewports = [
  { width: 320, height: 568 },
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 412, height: 915 },
  { width: 768, height: 900 },
  { width: 1024, height: 900 },
  { width: 1280, height: 900 },
  { width: 1440, height: 900 },
  { width: 915, height: 412 },
];
const sections = ['music', 'games', 'entertainment', 'personalhub', 'health', 'inventory'];
const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

const { server, origin } = await startStaticServer();
const browser = await launchBrowser();
const context = await browser.newContext({ colorScheme: 'dark', reducedMotion: 'reduce' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await installAndroid(page, { androidPresentation: true });

try {
  await page.setViewportSize(viewports[0]);
  await page.goto(origin, { waitUntil: 'networkidle' });
  await completeNativeEntry(page);

  const compactNavigation = await page.evaluate(() =>
    [...document.querySelectorAll('.caizen-mobile-tabs-scroll > button')].map(button => ({
      text: button.textContent?.replace(/\s+/g, ' ').trim(),
      ariaLabel: button.getAttribute('aria-label'),
      current: button.getAttribute('aria-current'),
    })),
  );
  check(compactNavigation.length > 0, 'Android compact navigation did not render');
  check(compactNavigation.every(button => button.ariaLabel), 'Android compact navigation is missing full accessible names');
  check(compactNavigation.some(button => button.current === 'page'), 'Android compact navigation is missing the active current state');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('button[aria-label="Open more tools"]').click();
  await page.locator('.cz-more-close').waitFor({ state: 'visible' });
  const moreCloseMetrics = await page.locator('.cz-more-close').evaluate(element => {
    const rect = element.getBoundingClientRect();
    return {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      ariaLabel: element.getAttribute('aria-label'),
    };
  });
  check(moreCloseMetrics.width >= 48 && moreCloseMetrics.height >= 48, 'Android More close target is below 48x48px');
  check(moreCloseMetrics.ariaLabel === 'Close More', 'Android More close control has the wrong accessible name');
  await page.locator('.cz-more-close').click();

  for (const viewport of viewports) {
    await page.setViewportSize(viewport);

    for (const section of sections) {
      console.log(`audit_section=${section} viewport=${viewport.width}x${viewport.height}`);
      await navigate(page, section, section === 'health' ? 'supplements' : undefined);
      if (section === 'entertainment') {
        await page.getByRole('navigation', { name: 'Entertainment workspaces' }).getByRole('button', { name: 'Media', exact: true }).click();
      }
      const metrics = await page.evaluate((sectionName) => {
        const root = document.querySelector('[data-caizen-section]');
        const strips = [...(root?.querySelectorAll('[data-responsive-control-strip="true"]') ?? [])]
          .filter(element => {
            const style = getComputedStyle(element);
            return style.display !== 'none' && style.visibility !== 'hidden';
          })
          .map(element => {
            const controls = [...element.querySelectorAll(':scope > button')];
            const first = controls[0];
            const last = controls.at(-1);
            const stripRect = element.getBoundingClientRect();
            const firstRect = first?.getBoundingClientRect();
            const hintId = element.getAttribute('aria-describedby');
            const hint = hintId ? document.getElementById(hintId) : null;
            const visualHint = element.parentElement?.querySelector('.responsive-control-strip-hint');
            return {
              label: element.getAttribute('aria-label'),
              overflow: element.scrollWidth > element.clientWidth + 1,
              hasHint: Boolean(hint?.textContent?.includes('Scroll horizontally')),
              hasVisualHint: Boolean(visualHint),
              firstVisible: Boolean(firstRect && firstRect.left >= stripRect.left - 1 && firstRect.right <= stripRect.right + 1),
              lastText: last?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 40),
              stripLeft: Math.round(stripRect.left),
              stripRight: Math.round(stripRect.right),
            };
          });
        const filters = [...(root?.querySelectorAll('button') ?? [])]
          .filter(button => button.textContent?.trim() === 'Filters')
          .map(button => {
            const rect = button.getBoundingClientRect();
            return { left: Math.round(rect.left), right: Math.round(rect.right), visible: rect.left >= 0 && rect.right <= window.innerWidth };
          });
        const inventoryAdd = sectionName === 'inventory'
          ? [...(root?.querySelectorAll('button') ?? [])].find(button => ['+ Item', 'Add item'].includes(button.textContent?.replace(/\s+/g, ' ').trim()))
          : null;
        return {
          pageOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
          strips,
          filters,
          inventoryAddTarget: inventoryAdd ? (() => {
            const rect = inventoryAdd.getBoundingClientRect();
            return { width: rect.width, height: rect.height };
          })() : null,
          supplementsSelected: sectionName === 'health'
            ? Boolean(root?.querySelector('[data-android-screen="health-supplements"]')) ||
              [...(root?.querySelectorAll('button') ?? [])].some(button =>
                button.textContent?.trim() === 'Supplements' &&
                button.getAttribute('aria-selected') === 'true'
              )
            : false,
        };
      }, section);

      check(!metrics.pageOverflow, `${section} ${viewport.width}px introduces page-level horizontal overflow`);
      if (viewport.width <= 390) {
        for (const strip of metrics.strips) {
          if (strip.overflow) {
            check(strip.hasHint, `${section} ${viewport.width}px ${strip.label} lacks an accessible overflow hint`);
            check(strip.hasVisualHint, `${section} ${viewport.width}px ${strip.label} lacks a visible overflow affordance`);
          }
          check(strip.firstVisible, `${section} ${viewport.width}px ${strip.label} clips its first control`);
        }
      }
      if (section === 'music' && viewport.width <= 390) {
        check(metrics.filters.length === 1 && metrics.filters[0].visible, `Music Filters is not fully visible at ${viewport.width}px`);
      }
      if (section === 'inventory') {
        check(Boolean(metrics.inventoryAddTarget && metrics.inventoryAddTarget.width >= 44 && metrics.inventoryAddTarget.height >= 44), `Inventory Add item target is below 44px at ${viewport.width}px`);
      }
      if (section === 'health') {
        check(metrics.supplementsSelected, `Health did not open the Supplements view at ${viewport.width}px`);

        await navigate(page, 'health', 'workout');
        const workoutMetrics = await page.evaluate(() => {
          const root = document.querySelector('[data-caizen-section]');
          const tabs = [...(root?.querySelector('nav[aria-label="Workout views"]')?.querySelectorAll('button') ?? [])]
            .filter(button => getComputedStyle(button).display !== 'none');
          const healthTabs = [...(root?.querySelectorAll('[role="tab"]') ?? [])]
            .filter(button => getComputedStyle(button).display !== 'none');
          const library = [...(root?.querySelectorAll('nav[aria-label="Workout views"] button') ?? [])]
            .find(button => button.textContent?.trim() === 'Exercises');
          return {
            pageOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
            workoutTabsHaveTargets: tabs.every(button => {
              const rect = button.getBoundingClientRect();
              return rect.width >= 44 && rect.height >= 44;
            }),
            healthTabsHaveTargets: healthTabs.every(button => {
              const rect = button.getBoundingClientRect();
              return rect.width >= 44 && rect.height >= 44;
            }),
            libraryTarget: library ? (() => {
              const rect = library.getBoundingClientRect();
              return { width: rect.width, height: rect.height };
            })() : null,
            starterChoice: [...(root?.querySelectorAll('button') ?? [])].some(button => button.textContent?.trim() === 'Choose a starter workout'),
          };
        });
        check(!workoutMetrics.pageOverflow, `Workout ${viewport.width}px introduces page-level horizontal overflow`);
        check(workoutMetrics.workoutTabsHaveTargets, `Workout view controls are below 44px at ${viewport.width}px`);
        check(workoutMetrics.healthTabsHaveTargets, `Health tabs are below 44px at ${viewport.width}px`);
        check(Boolean(workoutMetrics.libraryTarget && workoutMetrics.libraryTarget.height >= 44), `Workout Exercises target is below 44px at ${viewport.width}px`);
        check(workoutMetrics.starterChoice, `Workout no-schedule starter choice is missing at ${viewport.width}px`);

        await navigate(page, 'health', 'supplements');
      }

      if (viewport.width <= 390) {
        const focusResult = await page.evaluate(() => {
          const strip = [...document.querySelectorAll('[data-responsive-control-strip="true"]')]
            .find(element => element.scrollWidth > element.clientWidth + 1);
          const last = strip?.querySelector(':scope > button:last-of-type');
          if (!(last instanceof HTMLElement) || !(strip instanceof HTMLElement)) return { skipped: true };
          last.focus();
          const stripRect = strip.getBoundingClientRect();
          const rect = last.getBoundingClientRect();
          return {
            label: strip.getAttribute('aria-label'),
            focused: document.activeElement === last,
            visible: rect.left >= stripRect.left - 1 && rect.right <= stripRect.right + 1,
          };
        });
        check(Boolean(focusResult?.skipped || (focusResult?.focused && focusResult.visible)), `${section} ${viewport.width}px focus does not scroll the active control into view`);
      }
    }
  }
} catch (error) {
  console.error(`Responsive audit failure context: ${(await page.locator('body').innerText()).slice(-3000)}`);
  console.error(`Runtime errors: ${JSON.stringify(errors)}`);
  throw error;
} finally {
  await browser.close();
  server.close();
}

const result = {
  viewports: viewports.map(viewport => `${viewport.width}x${viewport.height}`),
  sections,
  pageErrors: errors,
  failures,
  passed: failures.length === 0 && errors.length === 0,
};
console.log(JSON.stringify(result, null, 2));
if (!result.passed) process.exitCode = 1;
