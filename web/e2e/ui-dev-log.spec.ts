import { test, expect } from "@playwright/test";

test("dev log appears near adapter toggle", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("dev-log")).toBeVisible({ timeout: 15_000 });
});
