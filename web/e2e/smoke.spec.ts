import { test, expect } from '@playwright/test';

test('detector health returns ok', async ({ page }) => {
  await page.goto('/health/detector');
  await expect(page.getByText('ok')).toBeVisible({ timeout: 90_000 });
});

