import { test } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "..");
const fixturesDir = path.resolve(root, "src", "__tests__", "fixtures", "real-faces");
const profSample = path.join(fixturesDir, "prof-sample.png");
const kovacichRight = path.join(fixturesDir, "john-kovacich-brothers-right.jpg");
const kovacichLeft = path.join(fixturesDir, "john-kovacich-brothers-left.jpg");

// Skip if images don't exist
test.skip(!fs.existsSync(profSample), "Real face fixtures not present");

/**
 * Anthropometric Fix Validation - Simple Console Capture
 *
 * This test captures console output containing measurement values.
 */

async function captureWorkerResult(page: any) {
  // Set up promise to capture worker result
  const resultPromise = page.evaluateHandle(() => {
    return new Promise((resolve) => {
      const handler = (event: MessageEvent) => {
        if (event.data && event.data.type === 'message' && event.data.data?.type === 'RESULT') {
          resolve(event.data.data);
        }
      };
      navigator.serviceWorker?.addEventListener('message', handler);
      // @ts-expect-error - accessing worker for test purposes
      if (window._howalikeWorker) {
        // @ts-expect-error
        window._howalikeWorker.addEventListener('message', handler);
      }
    });
  });

  return resultPromise;
}

async function setupWorkerIntercept(page: any) {
  // Intercept worker messages BEFORE loading the page
  await page.addInitScript(() => {
    (window as any)._storedMeasurements = null;

    // Intercept worker construction
    const OriginalWorker = window.Worker;
    window.Worker = class extends OriginalWorker {
      constructor(...args: any[]) {
        super(...args);
        this.addEventListener('message', (event: MessageEvent) => {
          if (event.data?.type === 'RESULT') {
            if (event.data.measurementsA && event.data.measurementsB) {
              (window as any)._storedMeasurements = {
                A: event.data.measurementsA,
                B: event.data.measurementsB
              };
            }
          }
        });
      }
    };
  });
}

async function extractAndPrintMeasurements(page: any, testName: string, labelA: string, labelB: string) {
  // Wait for analysis to complete
  await page.waitForSelector('text=Results', { timeout: 120000 });
  await page.waitForTimeout(1000);

  // Extract measurements
  const measurements = await page.evaluate(() => {
    return (window as any)._storedMeasurements;
  });

  if (!measurements) {
    console.log(`\n⚠️  No measurements captured for ${testName}`);
    return;
  }

  console.log("\n" + "=".repeat(80));
  console.log(testName);
  console.log("=".repeat(80));

  const printMeasurements = (label: string, m: any) => {
    console.log(`\n=== ${label} ===`);
    console.log(`\nHIGH priority fixes (2025-10-26):`);
    console.log(`  Eye size:              ${m.eyes?.size?.toFixed(6) || 'N/A'}`);
    console.log(`  Lip fullness:          ${m.mouth?.lipFullness?.toFixed(6) || 'N/A'}`);
    console.log(`  Nose tip projection:   ${m.nose?.tipProjection?.toFixed(6) || 'N/A'}`);
    console.log(`  Chin projection:       ${m.jaw?.chinProjection?.toFixed(6) || 'N/A'}`);

    console.log(`\nMEDIUM priority fixes (2025-10-27):`);
    console.log(`  Brow position:         ${m.brows?.position?.toFixed(6) || 'N/A'}`);
    console.log(`  Cupid's bow definition: ${m.mouth?.cupidsBowDefinition?.toFixed(6) || 'N/A'}`);
    console.log(`  Philtrum length:       ${m.mouth?.philtrumLength?.toFixed(6) || 'N/A'}`);
    console.log(`  Jaw symmetry:          ${m.jaw?.symmetry?.toFixed(6) || 'N/A'}`);
    console.log(`  Cheek prominence:      ${m.cheeks?.prominence?.toFixed(6) || 'N/A'}`);
    console.log(`  Nasolabial depth:      ${m.cheeks?.nasolabialDepth?.toFixed(6) || 'N/A'}`);
    console.log(`  Forehead height:       ${m.forehead?.height?.toFixed(6) || 'N/A'}`);
    console.log(`  Forehead contour:      ${m.forehead?.contour?.toFixed(6) || 'N/A'}`);
  };

  printMeasurements(labelA, measurements.A);
  printMeasurements(labelB, measurements.B);
}

test("TEST 1: prof-sample vs itself (identical - stability test)", async ({ page }) => {
  await setupWorkerIntercept(page);
  await page.goto("/");

  const first = page.getByLabel("Select first photo");
  const second = page.getByLabel("Select second photo");

  await first.setInputFiles(profSample);
  await second.setInputFiles(profSample);

  await page.getByRole("button", { name: /analyze/i }).click();

  await extractAndPrintMeasurements(
    page,
    "TEST 1: prof-sample vs itself (identical subject)",
    "Image A (prof-sample)",
    "Image B (prof-sample - same)"
  );

  console.log("\n💡 Note: Values should be nearly identical (testing measurement stability)\n");
});

test("TEST 2: prof-sample vs kovacich-right (dissimilar subjects)", async ({ page }) => {
  await setupWorkerIntercept(page);
  await page.goto("/");

  const first = page.getByLabel("Select first photo");
  const second = page.getByLabel("Select second photo");

  await first.setInputFiles(profSample);
  await second.setInputFiles(kovacichRight);

  await page.getByRole("button", { name: /analyze/i }).click();

  await extractAndPrintMeasurements(
    page,
    "TEST 2: prof-sample vs john-kovacich-brothers-right (dissimilar)",
    "Image A (prof-sample)",
    "Image B (kovacich-right)"
  );

  console.log("\n💡 Note: Values should show clear differences (dissimilar subjects)\n");
});

test("TEST 3: kovacich-right vs kovacich-left (similar subjects - brothers)", async ({ page }) => {
  await setupWorkerIntercept(page);
  await page.goto("/");

  const first = page.getByLabel("Select first photo");
  const second = page.getByLabel("Select second photo");

  await first.setInputFiles(kovacichRight);
  await second.setInputFiles(kovacichLeft);

  await page.getByRole("button", { name: /analyze/i }).click();

  await extractAndPrintMeasurements(
    page,
    "TEST 3: john-kovacich-brothers (right vs left)",
    "Image A (kovacich-right)",
    "Image B (kovacich-left)"
  );

  console.log("\n💡 Note: Brothers - should be similar but not identical\n");
});
