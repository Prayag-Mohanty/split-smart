import { expect, type Page } from '@playwright/test';
import path from 'node:path';

export const sample = (name: string) => path.join(import.meta.dirname, '..', 'samples', name);

/** Create a group from the first-run screen, with you as the first member. */
export async function createGroup(page: Page, name: string, me: string, others: string[]) {
  await page.goto('./');
  await page.getByRole('button', { name: 'Create a group' }).click();
  await page.getByPlaceholder('e.g. Night Canteen Gang').fill(name);
  await page.getByPlaceholder('e.g. Riya').fill(me);
  await page.locator('#member-draft').fill(others.join(', '));
  await page.locator('#member-draft').press('Enter');
  await page.getByRole('button', { name: 'Create group', exact: true }).click();
  await expect(page).toHaveURL(/#\/g\//);
}

/** Upload a sample receipt on the scan screen and wait for the review step. */
export async function scan(page: Page, file: string) {
  await page.locator('.fab-bar').getByRole('link', { name: 'Scan receipt' }).click();
  await page.setInputFiles('input[type=file]', sample(file));
  await page.getByRole('button', { name: 'Read receipt' }).click();
  await expect(page.locator('.review-layout')).toBeVisible({ timeout: 90_000 });
}

export const itemNames = (page: Page) => page.locator('.item-name').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
