import assert from 'node:assert/strict';
import { existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

// Start pnpm dev first. All records live in a disposable browser context.
const origin = process.env.CAIZEN_SMOKE_ORIGIN || 'http://127.0.0.1:3107';
const executablePath = [
  process.env.CAIZEN_BROWSER_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find(path => path && existsSync(path));
const output = join(tmpdir(), 'caizen-balance-hardening');
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));

const records = () => page.evaluate(() => new Promise((resolve, reject) => {
  const request = indexedDB.open('caizen-life-manager');
  request.onerror = () => reject(request.error);
  request.onsuccess = () => {
    const database = request.result;
    const transaction = database.transaction('records');
    const read = transaction.objectStore('records').getAll();
    read.onsuccess = () => resolve(read.result);
    read.onerror = () => reject(read.error);
    transaction.oncomplete = () => database.close();
  };
}));
const waitForRecords = async predicate => {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const result = await records();
    if (predicate(result)) return result;
    await page.waitForTimeout(100);
  }
  throw new Error('Expected records were not persisted.');
};

try {
  await page.goto(`${origin}/app/`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.getByRole('button', { name: 'Explore on my own', exact: true }).click();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('caizen:navigate', { detail: { section: 'balance' } })));
  await page.getByRole('button', { name: 'Add wallet', exact: true }).last().click();
  let dialog = page.getByRole('dialog');
  const walletName = `Wallet العربية 中文 🧪 ${'LongName'.repeat(25)}`;
  await dialog.getByLabel('Wallet name', { exact: true }).fill(walletName);
  await dialog.getByLabel('Balance', { exact: true }).fill('1e308');
  await dialog.getByRole('button', { name: 'Add wallet', exact: true }).click();
  await dialog.getByRole('alert').filter({ hasText: 'Enter valid money amounts.' }).waitFor();
  assert.equal(await dialog.getByLabel('Wallet name', { exact: true }).inputValue(), walletName);
  await dialog.getByLabel('Balance', { exact: true }).fill('1000000000.25');
  await dialog.locator('form').evaluate(form => {
    for (let index = 0; index < 10; index++) form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  await dialog.waitFor({ state: 'hidden' });
  let stored = await waitForRecords(rows => rows.some(row => row.collection === 'wallets'));
  assert.equal(stored.filter(row => row.collection === 'wallets').length, 1, 'Rapid submissions created duplicate wallets.');

  await page.getByRole('tab', { name: 'Transactions', exact: true }).click();
  await page.getByRole('button', { name: 'Add transaction', exact: true }).last().click();
  dialog = page.getByRole('dialog');
  await dialog.getByPlaceholder('0.00', { exact: true }).fill('0.001');
  await dialog.getByRole('button', { name: 'Save transaction', exact: true }).click();
  await dialog.getByRole('alert').filter({ hasText: 'at least 0.01' }).waitFor();
  await dialog.getByPlaceholder('0.00', { exact: true }).fill('0.01');
  await dialog.getByRole('button', { name: 'Save transaction', exact: true }).evaluate(button => {
    for (let index = 0; index < 10; index++) button.click();
  });
  await dialog.waitFor({ state: 'hidden' });
  stored = await waitForRecords(rows => rows.some(row => row.collection === 'transactions'));
  assert.equal(stored.filter(row => row.collection === 'transactions').length, 1, 'Rapid submissions recorded duplicate transactions.');
  assert.equal(stored.find(row => row.collection === 'wallets').data.balance, 1000000000.24);

  await page.getByRole('button', { name: 'More transaction actions', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Import transactions', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.locator('input[type=file]').setInputFiles({ name: 'too-large.csv', mimeType: 'text/csv', buffer: Buffer.alloc(10 * 1024 * 1024 + 1) });
  await dialog.getByRole('alert').filter({ hasText: '10 MiB' }).waitFor();
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });

  for (const width of [1280, 320]) {
    await page.setViewportSize({ width, height: 900 });
    for (const view of ['Overview', 'Wallets', 'Transactions', 'Cash flow', 'Reports', 'Purchase plans']) {
      await page.getByRole('tab', { name: view, exact: true }).click();
      await page.waitForTimeout(180);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      assert.equal(overflow, false, `${view} overflowed at ${width}px.`);
      if (!process.argv.includes('--no-screenshots')) {
        await page.screenshot({ path: join(output, `${view.toLowerCase().replaceAll(' ', '-')}-${width}.png`), fullPage: true });
      }
    }
  }
  assert.deepEqual(errors, [], 'Browser runtime errors occurred.');
  console.log('PASS: invalid/unsafe amounts, retained input, repeated submissions, CSV size limit, Unicode names, and six Balance views at 1280px/320px.');
  console.log(`Screenshots: ${output}`);
} finally {
  await context.close();
  await browser.close();
}
