import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { launchBrowser, navigate } from './lib/android-harness.mjs';

// A fresh browser context owns all test data; never connect to a user's profile.
const browser = await launchBrowser();
const context = await browser.newContext({ reducedMotion: 'reduce', colorScheme: 'dark' });
const page = await context.newPage();
page.setDefaultTimeout(10000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error') errors.push(message.text());
});
const mediaCount = () => page.evaluate(() => new Promise((resolve, reject) => {
  const request = indexedDB.open('caizen-life-manager');
  request.onerror = () => reject(request.error);
  request.onsuccess = () => {
    const db = request.result;
    const count = db.transaction('media').objectStore('media').count();
    count.onsuccess = () => { resolve(count.result); db.close(); };
    count.onerror = () => { reject(count.error); db.close(); };
  };
}));

try {
  await page.goto(process.env.CAIZEN_TEST_ORIGIN || 'http://localhost:3000/app/');
  await page.getByRole('button', { name: 'Explore on my own', exact: true }).click();
  await navigate(page, 'personalhub');
  await page.getByRole('button', { name: 'Categories', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox').fill('Hardening category');
  await dialog.getByRole('button', { name: 'Add category', exact: true }).click();
  await dialog.getByRole('button', { name: 'Hide Hardening Category category', exact: true }).waitFor();
  await page.keyboard.press('Escape');

  await context.setOffline(true);
  await page.getByRole('button', { name: 'Add item', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'New vault item' });
  await dialog.getByLabel('Title', { exact: true }).fill('旅行 مستندات 🧭 ' + 'LongTitle'.repeat(20));
  await dialog.getByLabel('External link', { exact: true }).fill('javascript:alert(1)');
  await dialog.getByRole('button', { name: 'Add item', exact: true }).click();
  await dialog.getByText('Enter a valid HTTPS URL, or leave this field empty.').waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'vault-external-link');
  await dialog.getByLabel('External link', { exact: true }).fill('https://example.com');
  await dialog.locator('form').evaluate(form => {
    for (let i = 0; i < 10; i++) form.requestSubmit();
  });
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await page.locator('[data-vault-thumbnail="list-icon"]').count(), 1);
  await context.setOffline(false);
  await page.setViewportSize({ width: 320, height: 800 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: join(tmpdir(), 'vault-hardening-mobile.png'), fullPage: true });

  await page.getByRole('button', { name: /Career, / }).click();
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Certificate', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Add Certificate' });
  await dialog.getByRole('button', { name: 'Add certificate', exact: true }).click();
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'career-credential-title');
  await dialog.getByLabel('Certificate title', { exact: true }).fill('Interrupted certificate');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Keep editing', exact: true }).click();
  assert.equal(await dialog.getByLabel('Certificate title', { exact: true }).inputValue(), 'Interrupted certificate');

  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 2;
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.evaluate(() => {
    window.__testMediaWrites = 0;
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'media') window.__testMediaWrites += 1;
      return put.apply(this, args);
    };
    const original = window.createImageBitmap.bind(window);
    window.createImageBitmap = async (...args) => {
      await new Promise(resolve => setTimeout(resolve, 600));
      return original(...args);
    };
  });
  await dialog.locator('input[type="file"]').setInputFiles({ name: 'proof.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  assert.equal(await dialog.getByRole('button', { name: 'Saving proof…', exact: true }).isDisabled(), true);
  // Simulate interruption by another application navigation/profile flow.
  await navigate(page, 'dashboard');
  await page.waitForFunction(() => window.__testMediaWrites === 1);
  assert.equal(await page.evaluate(() => window.__testMediaWrites), 1, 'interrupted operation must actually finish writing its attachment');
  for (let i = 0; i < 10 && await mediaCount() > 0; i++) await page.waitForTimeout(200);
  assert.equal(await mediaCount(), 0, 'late attachment must not remain orphaned');
  // Going offline deliberately fails an incidental resource request.
  assert.deepEqual(errors.filter(error => error !== 'Failed to load resource: net::ERR_INTERNET_DISCONNECTED'), [], 'browser errors, including render-time taxonomy updates');
  console.log('PASS: category editing, offline validation, ten submissions, multilingual text, draft protection, and interrupted attachment cleanup');
} finally {
  await context.close();
  await browser.close();
}
