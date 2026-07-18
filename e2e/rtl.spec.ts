import { test, expect } from '@playwright/test';

/** Read-only: the Arabic locale must render right-to-left (BRIEF §4). */

test('arabic home renders with dir=rtl and lang=ar', async ({ page }) => {
  await page.goto('/ar');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
  await expect(page.locator('h1')).toBeVisible();
});

test('arabic catalog renders', async ({ page }) => {
  await page.goto('/ar/experiences');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.locator('h1')).toBeVisible();
});
