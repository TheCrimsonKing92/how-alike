import { test, expect } from '@playwright/test';

test('detector deep health returns ok', async ({ page }) => {
  await page.goto('/health/detector');
  await expect(page.getByText('ok')).toBeVisible({ timeout: 120_000 });
});

