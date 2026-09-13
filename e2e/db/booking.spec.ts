import { test, expect } from '@playwright/test';

/**
 * Database-backed end-to-end (2026-09 engineering audit TEST-09). Runs
 * only in the CI job that provisions a throwaway Postgres, migrates it
 * and seeds the sample catalog (`E2E_DB=1`); the read-only smoke tests
 * next door keep covering sample-data mode. Exercises what those never
 * could: a DB-served catalog, a booking request written through the
 * server action, and a verified host profile assembled from seeded rows.
 * (The stub sign-in is deliberately unavailable here: `stubAuthAllowed()`
 * refuses production builds, and this job runs `pnpm build && pnpm start`
 * — found by the first local rehearsal of the job on 2026-09-13.)
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

  // The first open day on the calendar grid: cells are `gridcell` wrappers
  // around a `button`; closed days carry aria-disabled, not `disabled`.
  const day = page.getByRole('grid').getByRole('button', { disabled: false }).first();
  await expect(day).toBeVisible();
  await day.click();

  await page.getByLabel(/name/i).first().fill('Playwright Guest');
  await page.locator('input[name="email"]').fill('playwright-guest@example.com');
  // The phone field is a country picker + national number (default +966).
  await page.locator('input[type="tel"]').fill('512345678');
  await page.locator('input[name="terms"]').check();
  // Experiences with a minimum age (the seeded walk: 12) also require the
  // group-age attestation before the action accepts the request.
  const minAge = page.locator('input[name="minAge"]');
  if ((await minAge.count()) > 0) await minAge.check();
  const form = page.locator('form').filter({ has: page.locator('input[name="terms"]') });
  await form
    .getByRole('button', { name: /request|book/i })
    .first()
    .click();

  // Request-to-book lands on the confirmation page; instant booking on the
  // pay page. Either proves the action wrote the row.
  await expect(page).toHaveURL(/\/en\/book\/(confirmed\/)?[0-9a-f-]{36}/, { timeout: 30_000 });
});

test('a verified host profile is served from the seeded database', async ({ page }) => {
  await page.goto('/en/hosts/abdulaziz-alasmari');
  await expect(page.locator('h1')).toContainText('Abdulaziz Alasmari');
  // The profile lists the host's live experiences — rows joined from the
  // seeded hosts + experiences tables, not the sample catalog.
  await expect(page.locator(`a[href="/en/experiences/${SEEDED_SLUG}"]`).first()).toBeVisible();
});
