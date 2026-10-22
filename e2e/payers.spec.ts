import { expect, test } from '@playwright/test';
import { createGroup, scan } from './helpers';

// Several people paying parts of one bill.
test('manual expense paid by two people settles against both', async ({ page }) => {
  await createGroup(page, 'Dinner club', 'Riya', ['Arjun', 'Meera']);
  await page.locator('.fab-bar').getByRole('link', { name: 'Add expense' }).click();
  await page.getByPlaceholder(/Wi-Fi/).fill('Dinner');
  await page.locator('#amount').fill('900');
  await page.getByRole('button', { name: /Several people paid/ }).click();
  await page.getByLabel('Amount Riya paid').fill('500');
  await page.getByRole('button', { name: '+ rest' }).first().click(); // Arjun pays the remaining ₹400
  await expect(page.getByText('₹900.00 of ₹900.00 entered')).toBeVisible();
  await page.locator('form').getByRole('button', { name: 'Add expense' }).click();

  await expect(page.locator('.list-row').first()).toContainText('You and Arjun paid');
  await page.locator('.tab', { hasText: 'Balances' }).click();
  // Each owes ₹300: Riya paid ₹200 over her share, Arjun ₹100 over, Meera owes ₹300.
  await expect(page.locator('.transfer')).toHaveCount(2);
  await expect(page.locator('.group-strip')).toContainText('You get back ₹200.00');
});

test('scanned receipt: payers must add up, then the bill splits between them', async ({ page }) => {
  await createGroup(page, 'Canteen', 'Riya', ['Arjun', 'Meera', 'Kabir']);
  await scan(page, 'restaurant-clear.png');
  await page.getByRole('button', { name: /Next: assign/ }).click();
  await page.getByRole('button', { name: 'Share the rest with everyone' }).click();
  await page.getByRole('button', { name: /Several people paid/ }).click();
  await page.getByLabel('Amount Riya paid').fill('500');
  await expect(page.getByText(/short by ₹340.00/)).toBeVisible();
  await expect(page.getByRole('button', { name: /See split/ })).toBeDisabled();
  await page.getByLabel('Amount Arjun paid').fill('340');
  await page.getByRole('button', { name: /See split/ }).click();

  await expect(page.locator('.summary-hero')).toContainText('Riya ₹500.00 + Arjun ₹340.00');
  // ₹840 shared four ways = ₹210 each: Meera and Kabir each owe ₹210, split across the two payers.
  await expect(page.locator('.consequence')).toContainText('→ You');
  await page.getByRole('button', { name: /Save split/ }).click();
  await expect(page.locator('.group-strip')).toContainText('You get back ₹290.00');
});
