import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(__dirname, '..');
const samplesDir = path.resolve(root, 'public', 'samples');
const fileA = path.join(samplesDir, 'john-kovacich-brothers-right.jpg');
const fileB = path.join(samplesDir, 'john-kovacich-brothers-left.jpg');

test('analyze two sample images shows results', async ({ page }) => {
  test.skip(!fs.existsSync(fileA) || !fs.existsSync(fileB), 'Sample images not present');

  await page.goto('/');

  const first = page.getByLabel('Select first photo');
  const second = page.getByLabel('Select second photo');

  await first.setInputFiles(fileA);
  await second.setInputFiles(fileB);

  await page.getByRole('button', { name: /analyze/i }).click();
  // Worker progress should surface in the UI
  await expect(page.getByText(/Analyzing/i)).toBeVisible({ timeout: 120_000 });
  // Optionally see specific stages; tolerate speed by not requiring every one
  await page.waitForFunction(
    () => /Analyzing.*(load|preprocess|detectA|detectB|score)/i.test(document.body.textContent || ''),
    { timeout: 120_000 }
  );
  // Expect overall similarity text to appear (indicates RESULT processed)
  await expect(page.getByText(/overall similarity:/i)).toBeVisible({ timeout: 120_000 });
  // And at least one region line
  await expect(page.getByText(/eyes:/i)).toBeVisible();
});