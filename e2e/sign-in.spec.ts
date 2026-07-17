import { test, expect } from '@playwright/test';

/**
 * Read-only: the sign-in form renders and its method toggle works.
 * Deliberately never submits — no OTP request reaches Supabase.
 */

test('sign-in page renders the phone form by default', async ({ page }) => {
  await page.goto('/en/sign-in');
  await expect(page.getByRole('heading', { name: /welcome to gharmish/i })).toBeVisible();
  await expect(page.getByLabel(/mobile number/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /send code/i })).toBeVisible();
});

test('method toggle switches to the email form', async ({ page }) => {
  await page.goto('/en/sign-in');
  await page.getByRole('button', { name: 'Email', exact: true }).click();
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
  await expect(page.getByLabel(/mobile number/i)).toBeHidden();
});
