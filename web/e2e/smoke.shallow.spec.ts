import { test, expect } from "@playwright/test";

test("detector shallow health returns ok", async ({ page }) => {
  await page.goto("/health/detector?shallow=1");
  await expect(page.getByText("ok")).toBeVisible({ timeout: 15_000 });
});
