import { expect, test } from '@playwright/test';
import { createGroup, itemNames, scan } from './helpers';

// Robustness cases from section 10 of the problem statement.
test.beforeEach(async ({ page }) => createGroup(page, 'Trip', 'Riya', ['Arjun']));

test('#2 faded thermal receipt: parsed, with low-confidence fields flagged', async ({ page }) => {
  await scan(page, 'canteen-faded.png');
  expect(await itemNames(page)).toHaveLength(5);
  await expect(page.getByText(/highlighted in yellow/)).toBeVisible();
  await page.getByRole('button', { name: /clear all \?/ }).click();
  await expect(page.locator('.low-conf')).toHaveCount(0);
});

test('#3 receipt rotated 90°: auto-oriented and parsed', async ({ page }) => {
  await scan(page, 'restaurant-rotated.png');
  expect(await itemNames(page)).toHaveLength(5);
  await expect(page.getByText('match the printed total of ₹840.00')).toBeVisible();
});

test('#4 non-receipt image: clear message and manual entry', async ({ page }) => {
  await scan(page, 'not-a-receipt.png');
  await expect(page.getByText('No items found on this image.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start over with manual entry' })).toBeVisible();
});

test('#5 no printed total: total calculated and confirmation asked', async ({ page }) => {
  await scan(page, 'grocery-no-total.png');
  await expect(page.getByText('No total was found on the receipt.')).toBeVisible();
  await expect(page.getByRole('button', { name: /Confirm ₹500.00 & assign/ })).toBeVisible();
});

test('#7 camera permission denied: helpful message, upload still available', async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denied', 'NotAllowedError'));
  });
  await page.reload();
  await page.locator('.fab-bar').getByRole('link', { name: 'Scan receipt' }).click();
  await page.getByRole('button', { name: 'Use camera' }).click();
  await expect(page.getByRole('dialog').getByText(/Camera permission was denied/)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Upload photo' })).toBeVisible();
});

test('#8 offline after the first visit: app and OCR still work', async ({ page, context }) => {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await scan(page, 'restaurant-clear.png'); // caches the OCR engine and model
  await context.setOffline(true);
  await page.goto('./');
  await expect(page.locator('.group-card')).toHaveCount(1);
  await page.locator('.group-card').click();
  await scan(page, 'grocery-no-total.png');
  expect(await itemNames(page)).toHaveLength(5);
});
