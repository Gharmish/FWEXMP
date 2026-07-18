import { test, expect } from '@playwright/test';

/** Read-only: browse home → catalog → an experience detail page. */

test('home renders hero, nav, and a path into the catalog', async ({ page }) => {
  await page.goto('/en');
  await expect(page).toHaveTitle(/gharmish/i);
  await expect(page.locator('h1')).toBeVisible();
  await expect(page.locator('a[href*="/en/experiences"]').first()).toBeVisible();
});

test('catalog lists experiences and a detail page opens', async ({ page }) => {
  await page.goto('/en/experiences');
  await expect(page.locator('h1')).toBeVisible();

  // Detail links are /en/experiences/<slug>; filter out the catalog's own
  // query-string links (?category=… etc.).
  const detailLink = page.locator('a[href^="/en/experiences/"]:not([href*="?"])').first();
  await expect(detailLink).toBeVisible();

  const href = await detailLink.getAttribute('href');
  expect(href).toMatch(/\/en\/experiences\/[a-z0-9-]+/);

  await detailLink.click();
  await expect(page).toHaveURL(/\/en\/experiences\/[a-z0-9-]+/);
  await expect(page.locator('h1')).toBeVisible();
});
