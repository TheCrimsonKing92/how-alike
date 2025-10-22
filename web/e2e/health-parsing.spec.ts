import { test, expect } from "@playwright/test";

test("parsing adapter health returns ok", async ({ page }) => {
  await page.goto("/health/detector?adapter=parsing");
  await expect(page.getByText("ok")).toBeVisible({ timeout: 120_000 });
});
