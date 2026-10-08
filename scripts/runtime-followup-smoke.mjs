import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { completeNativeEntry, installAndroid, launchBrowser, navigate, repoRoot, settle, startStaticServer } from './lib/android-harness.mjs';

const label = process.argv.find(argument => argument.startsWith('--label='))?.slice(8) || 'measurement';
const outputArgument = process.argv.find(argument => argument.startsWith('--output='))?.slice(9);
const outputPath = outputArgument ? resolve(repoRoot, outputArgument) : null;

const localDateKey = (offset = 0) => {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const history = Array.from({ length: 60 }, (_, index) => ({
  date: localDateKey(-(index + 1)),
  periodKey: localDateKey(-(index + 1)),
  status: 'done',
  completedAt: `${localDateKey(-(index + 1))}T08:00:00.000Z`,
}));
const routines = Array.from({ length: 40 }, (_, index) => ({
  id: index === 0 ? 'benchmark-routine' : `routine-${index}`,
  title: index === 0 ? 'Benchmark routine' : `Routine ${index}`,
  frequency: 'daily',
  active: true,
  targetCount: 1,
  completionCount: history.length,
  completionHistory: history,
  createdAt: `${localDateKey(-180)}T08:00:00.000Z`,
}));
const foodEntries = [
  ['breakfast', 'breakfast', 'explicit'],
  ['lunch', '  Lunch  ', undefined],
  ['dinner', 'DINNER', 'explicit'],
  ['snack', 'snack', undefined],
].map(([id, mealType, mealTypeSource], index) => ({
  id: `benchmark-${id}`,
  name: `Benchmark ${id[0].toUpperCase()}${id.slice(1)}`,
  mealType,
  ...(mealTypeSource ? { mealTypeSource } : {}),
  date: `${localDateKey()}T04:00:00.000Z`,
  serving: '100g',
  amount: 100,
  unit: 'g',
  calories: 300 + index,
  protein: 20,
  carbs: 30,
  fat: 10,
  sodium: 200,
  fiber: 5,
  createdAt: `${localDateKey()}T04:00:00.000Z`,
}));
const profile = {
  id: 'runtime-followup-profile',
  name: 'Runtime fixture',
  baseCurrency: 'PHP',
  currency: 'PHP',
  wallets: [],
  transactions: [],
  inventoryItems: [],
  wishlistItems: [],
  upcomingMoneyItems: [],
  journalEntries: Array.from({ length: 200 }, (_, index) => ({
    id: `journal-${index}`,
    date: `${localDateKey(-index)}T06:00:00.000Z`,
    title: `Journal ${index}`,
    content: { mattered: `Reflection ${index}` },
    createdAt: `${localDateKey(-index)}T06:00:00.000Z`,
  })),
  games: [],
  gameGuides: [],
  productivityItems: Array.from({ length: 300 }, (_, index) => ({
    id: `task-${index}`,
    type: 'task',
    title: `Task ${index}`,
    status: 'pending',
    priority: 'normal',
    deadline: `${localDateKey(index % 30)}T09:00:00.000Z`,
    createdAt: `${localDateKey(-30)}T09:00:00.000Z`,
  })),
  mediaItems: [],
  musicItems: [],
  workItems: Array.from({ length: 200 }, (_, index) => ({
    id: `work-${index}`,
    type: 'task',
    title: `Work ${index}`,
    status: 'active',
    dueDate: `${localDateKey(index % 30)}T09:00:00.000Z`,
    createdAt: `${localDateKey(-30)}T09:00:00.000Z`,
  })),
  personalVaultItems: [],
  careerSkills: [],
  careerCourses: [],
  careerCredentials: [],
  personalVaultTaxonomy: [],
  trashItems: [],
  skincareProducts: [],
  skincareUsageEvents: [],
  dailyChecklistItems: routines,
  importantDates: Array.from({ length: 300 }, (_, index) => ({
    id: `date-${index}`,
    title: `Date ${index}`,
    type: 'personal',
    date: `${localDateKey(index % 60)}T09:00:00.000Z`,
    repeat: 'none',
    status: 'upcoming',
    createdAt: `${localDateKey(-30)}T09:00:00.000Z`,
  })),
  supplements: [],
  budgets: [],
  financialCategories: [],
  milestoneUnlocks: [],
  achievementUnlocks: [],
  feedbackPreferences: { showToasts: true, showRewardDetails: true },
  health: { foodEntries, activityEntries: [], foodTemplates: [], noXTrackers: [] },
  createdAt: `${localDateKey(-365)}T08:00:00.000Z`,
};
const fixture = { profiles: [profile], currentProfileId: profile.id };

const readFoodRecord = async (page, id) => page.evaluate(async (entryId) => {
  const request = indexedDB.open('caizen-life-manager');
  const database = await new Promise((resolveOpen, rejectOpen) => {
    request.onsuccess = () => resolveOpen(request.result);
    request.onerror = () => rejectOpen(request.error);
  });
  const transaction = database.transaction('records', 'readonly');
  const rows = await new Promise((resolveRows, rejectRows) => {
    const read = transaction.objectStore('records').getAll();
    read.onsuccess = () => resolveRows(read.result);
    read.onerror = () => rejectRows(read.error);
  });
  database.close();
  return rows.find(row => row?.collection === 'health.foodEntries' && row?.recordId === entryId)?.data ?? null;
}, id);

const inspectMeal = async (page, id) => {
  const name = `Benchmark ${id[0].toUpperCase()}${id.slice(1)}`;
  await page.getByRole('button', { name: new RegExp(`^Edit ${name} in the`, 'i') }).click();
  await page.waitForSelector('#food-meal-type-android');
  const opened = await page.evaluate(() => ({
    webText: document.querySelector('#food-meal-type')?.textContent?.trim() ?? null,
    androidText: document.querySelector('#food-meal-type-android strong')?.textContent?.trim() ?? null,
    androidLabel: document.querySelector('#food-meal-type-android')?.getAttribute('aria-label') ?? null,
    name: document.querySelector('#food-name')?.value ?? null,
  }));
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.waitForTimeout(750);
  const stayedOpen = await page.locator('#food-meal-type-android').isVisible().catch(() => false);
  if (stayedOpen) {
    const alerts = await page.getByRole('alert').allTextContents();
    await page.getByRole('button', { name: 'Cancel' }).click();
    const discard = page.getByRole('button', { name: /^Discard$/i });
    if (await discard.isVisible().catch(() => false)) await discard.click();
    return { stored: foodEntries.find(entry => entry.id === `benchmark-${id}`)?.mealType, opened, stayedOpen, alerts };
  }
  const persisted = await readFoodRecord(page, `benchmark-${id}`);
  await page.getByRole('button', { name: new RegExp(`^Edit ${name} in the`, 'i') }).click();
  await page.waitForSelector('#food-meal-type-android');
  const reopened = await page.evaluate(() => ({
    webText: document.querySelector('#food-meal-type')?.textContent?.trim() ?? null,
    androidText: document.querySelector('#food-meal-type-android strong')?.textContent?.trim() ?? null,
  }));
  await page.getByRole('button', { name: 'Cancel' }).click();
  const discard = page.getByRole('button', { name: /^Discard$/i });
  if (await discard.isVisible().catch(() => false)) await discard.click();
  await page.waitForSelector('#food-meal-type-android', { state: 'detached' });
  return { stored: foodEntries.find(entry => entry.id === `benchmark-${id}`)?.mealType, opened, persisted: persisted?.mealType, reopened };
};

const { server, origin } = await startStaticServer();
const browser = await launchBrowser();
const context = await browser.newContext({ viewport: { width: 393, height: 852 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const errors = [];
try {
  await installAndroid(page, { onPageError: message => errors.push(message) });
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.addInitScript((state) => {
    window.__CAIZEN_PERF_TRACE__ = true;
    localStorage.setItem('asset-planning-app-data', JSON.stringify(state));
  }, fixture);
  await page.goto(origin, { waitUntil: 'networkidle', timeout: 30_000 });
  try {
    await completeNativeEntry(page, 60_000);
  } catch (error) {
    const diagnostic = await page.evaluate(() => ({
      url: location.href,
      text: document.body?.innerText?.slice(0, 2_000) ?? '',
      section: document.querySelector('[data-caizen-section]')?.getAttribute('data-caizen-section') ?? null,
    }));
    throw new Error(`Native entry did not complete: ${JSON.stringify({ diagnostic, errors })}`, { cause: error });
  }
  await settle(page, 'dashboard');

  const dashboardStart = performance.now();
  await navigate(page, 'lifehub');
  const lifeHubMs = performance.now() - dashboardStart;
  await page.evaluate(() => performance.clearMeasures());
  const routineMs = await page.evaluate(async () => {
    const button = Array.from(document.querySelectorAll('button')).find(element =>
      element.getAttribute('aria-label') === 'Complete Benchmark routine for today',
    );
    if (!(button instanceof HTMLButtonElement)) throw new Error('Benchmark routine action was not found.');
    const startedAt = performance.now();
    button.click();
    await new Promise(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(resolveFrame)));
    return performance.now() - startedAt;
  });
  const routineTraces = await page.evaluate(() => Object.fromEntries(
    performance.getEntriesByType('measure')
      .filter(entry => entry.name.startsWith('caizen:trace:'))
      .map(entry => [entry.name.slice('caizen:trace:'.length), Math.round(entry.duration * 100) / 100]),
  ));

  const dashboardReturnStart = performance.now();
  await navigate(page, 'dashboard');
  const dashboardReturnMs = performance.now() - dashboardReturnStart;
  await navigate(page, 'inventory');
  await page.getByRole('button', { name: 'List view' }).click();
  const inventoryListDensityControls = await page.getByRole('button', { name: /^(Detailed|Compact)$/ }).count();
  await page.getByRole('button', { name: 'Grid view' }).click();
  const inventoryGridDensityControls = await page.getByRole('button', { name: /^(Detailed|Compact)$/ }).count();
  await navigate(page, 'health', 'food');
  await page.waitForSelector('[data-android-screen="health-food"]');
  const meals = {
    lunch: await inspectMeal(page, 'lunch'),
    dinner: await inspectMeal(page, 'dinner'),
  };
  const result = {
    label,
    fixture: { routines: routines.length, routineHistoryPerItem: history.length, tasks: 300, dates: 300, journalEntries: 200, workItems: 200 },
    timings: { lifeHubMs: Math.round(lifeHubMs * 100) / 100, routineCompleteMs: Math.round(routineMs * 100) / 100, dashboardReturnMs: Math.round(dashboardReturnMs * 100) / 100, routineTraces },
    inventory: { listDensityControls: inventoryListDensityControls, gridDensityControls: inventoryGridDensityControls },
    meals,
    errors,
  };
  if (outputPath) {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} finally {
  await context.close();
  await browser.close();
  await new Promise(resolveClose => server.close(resolveClose));
}
