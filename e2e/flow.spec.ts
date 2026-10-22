import { expect, test } from '@playwright/test';
import { createGroup, itemNames, scan } from './helpers';

// The judging scenario: scan → review → assign → split → settle, on a phone.
test('night canteen: scan, assign, split with proportional GST and settle', async ({ page }) => {
  await createGroup(page, 'Night Canteen Gang', 'Riya', ['Arjun', 'Meera', 'Kabir']);
  await scan(page, 'restaurant-clear.png');

  expect(await itemNames(page)).toEqual(['Large Pizza', 'Maggi', 'Maggi', 'Maggi', 'Cold Coffee']);
  await expect(page.getByText('match the printed total of ₹840.00')).toBeVisible();

  await page.getByRole('button', { name: /Next: assign/ }).click();
  const items = page.locator('.assign-item');
  await items.nth(0).getByRole('button', { name: 'Everyone' }).click();
  await items.nth(1).getByRole('button', { name: 'Arjun had Maggi' }).click();
  await items.nth(2).getByRole('button', { name: 'Kabir had Maggi' }).click();
  await items.nth(3).getByRole('button', { name: 'Riya had Maggi' }).click();
  await items.nth(4).getByRole('button', { name: 'Meera had Cold Coffee' }).click();
  await page.getByRole('button', { name: /See split/ }).click();

  // Meera had ₹100 of pizza + ₹220 coffee = ₹320, plus 5% GST in proportion = ₹336.
  const table = page.locator('table.breakdown');
  await expect(table.getByRole('row', { name: /Meera/ })).toContainText('₹336.00');
  await expect(table.getByRole('row', { name: /Arjun/ })).toContainText('₹168.00');
  await expect(page.getByText('Shares add up exactly to ₹840.00.')).toBeVisible();

  await page.getByRole('button', { name: /Save split/ }).click();
  await expect(page).toHaveURL(/balances$/);
  await expect(page.locator('.transfer')).toHaveCount(3);
  await expect(page.locator('.group-strip')).toContainText('You get back ₹672.00');

  // Everything survives a refresh.
  await page.reload();
  await expect(page.locator('.transfer')).toHaveCount(3);

  // Settle up: the group ends fully settled.
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: 'Mark settled' }).first().click();
  await expect(page.getByRole('heading', { name: 'All settled' })).toBeVisible();
});

test('₹100 split three ways reconciles to the paisa', async ({ page }) => {
  await createGroup(page, 'Room 214', 'Riya', ['Arjun', 'Meera']);
  await page.locator('.fab-bar').getByRole('link', { name: 'Add expense' }).click();
  await page.getByPlaceholder(/Wi-Fi/).fill('Snacks');
  await page.locator('#amount').fill('100');
  await expect(page.locator('.split-share')).toHaveText(['₹33.34', '₹33.33', '₹33.33']);
});
