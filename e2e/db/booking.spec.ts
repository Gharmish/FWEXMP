import { test, expect } from '@playwright/test';

/**
 * Database-backed end-to-end (2026-09 engineering audit TEST-09). Runs
 * only in the CI job that provisions a throwaway Postgres, migrates it
 * and seeds the sample catalog (`E2E_DB=1`); the read-only smoke tests
 * next door keep covering sample-data mode. Exercises what those never
 * could: a DB-served catalog, a booking request written through the
 * server action, and the stub sign-in reaching a DB-backed dashboard.
 */
test.skip(!process.env.E2E_DB, 'needs the migrated + seeded database (CI job e2e-db)');

const SEEDED_SLUG = 'juniper-forest-dawn-walk-jabal-sawda';

test('the catalog is served from the seeded database', async ({ page }) => {
  await page.goto('/en/experiences');
  await expect(page.locator(`a[href="/en/experiences/${SEEDED_SLUG}"]`).first()).toBeVisible();
});

test('a guest can submit a booking request against the seeded calendar', async ({ page }) => {
  await page.goto(`/en/experiences/${SEEDED_SLUG}`);
  await expect(page.locator('h1')).toBeVisible();

  // The first open day on the calendar grid.
  const day = page.locator('[role="grid"] button[role="gridcell"]:not([disabled])').first();
  await expect(day).toBeVisible();
  await day.click();

  await page.getByLabel(/name/i).first().fill('Playwright Guest');
  await page.locator('input[name="email"]').fill('playwright-guest@example.com');
  // The phone field is a country picker + national number (default +966).
  await page.locator('input[type="tel"]').fill('512345678');
  await page.locator('input[name="terms"]').check();
  const form = page.locator('form').filter({ has: page.locator('input[name="terms"]') });
  await form
    .getByRole('button', { name: /request|book/i })
    .first()
    .click();

  // Request-to-book lands on the confirmation page; instant booking on the
  // pay page. Either proves the action wrote the row.
  await expect(page).toHaveURL(/\/en\/book\/(confirmed\/)?[0-9a-f-]{36}/, { timeout: 30_000 });
});

test('the stub sign-in reaches the database-backed admin dashboard', async ({ page }) => {
  await page.goto('/en/sign-in?next=/admin');
  await page.getByLabel(/mobile number/i).fill('541104000');
  await page.getByRole('button', { name: /send code/i }).click();
  await page.getByLabel(/code/i).fill('000000');
  await page
    .getByRole('button', { name: /verify|sign in|continue/i })
    .first()
    .click();
  await expect(page).toHaveURL(/\/en\/admin/, { timeout: 30_000 });
  await expect(page.locator('h1')).toBeVisible();
});
