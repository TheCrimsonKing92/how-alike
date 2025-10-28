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
 * Anthropometric Fix Validation
 *
 * This test analyzes real face images and extracts raw measurement values
 * for all 12 anthropometric fixes to help with threshold recalibration.
 */

async function extractMeasurements(page: any) {
  // Wait for analysis to complete
  await page.waitForFunction(
    () => {
      const result = (window as any).lastAnalysisResult;
      return result && result.measurementsA && result.measurementsB;
    },
    { timeout: 120_000 }
  );

  // Extract measurements from the window object
  const measurements = await page.evaluate(() => {
    const result = (window as any).lastAnalysisResult;
    if (!result) return null;

    return {
      A: {
        eyes: { size: result.measurementsA.eyes.size },
        brows: {
          shape: result.measurementsA.brows.shape,
          leftShape: result.measurementsA.brows.leftShape,
          rightShape: result.measurementsA.brows.rightShape,
          position: result.measurementsA.brows.position,
        },
        nose: { tipProjection: result.measurementsA.nose.tipProjection },
        mouth: {
          lipFullness: result.measurementsA.mouth.lipFullness,
          cupidsBowDefinition: result.measurementsA.mouth.cupidsBowDefinition,
          philtrumLength: result.measurementsA.mouth.philtrumLength,
        },
        jaw: {
          chinProjection: result.measurementsA.jaw.chinProjection,
          symmetry: result.measurementsA.jaw.symmetry,
        },
        cheeks: {
          prominence: result.measurementsA.cheeks.prominence,
          nasolabialDepth: result.measurementsA.cheeks.nasolabialDepth,
        },
        forehead: {
          height: result.measurementsA.forehead.height,
          contour: result.measurementsA.forehead.contour,
        },
      },
      B: {
        eyes: { size: result.measurementsB.eyes.size },
        brows: {
          shape: result.measurementsB.brows.shape,
          leftShape: result.measurementsB.brows.leftShape,
          rightShape: result.measurementsB.brows.rightShape,
          position: result.measurementsB.brows.position,
        },
        nose: { tipProjection: result.measurementsB.nose.tipProjection },
        mouth: {
          lipFullness: result.measurementsB.mouth.lipFullness,
          cupidsBowDefinition: result.measurementsB.mouth.cupidsBowDefinition,
          philtrumLength: result.measurementsB.mouth.philtrumLength,
        },
        jaw: {
          chinProjection: result.measurementsB.jaw.chinProjection,
          symmetry: result.measurementsB.jaw.symmetry,
        },
        cheeks: {
          prominence: result.measurementsB.cheeks.prominence,
          nasolabialDepth: result.measurementsB.cheeks.nasolabialDepth,
        },
        forehead: {
          height: result.measurementsB.forehead.height,
          contour: result.measurementsB.forehead.contour,
        },
      },
    };
  });

  return measurements;
}

function printMeasurements(name: string, m: any) {
  console.log(`\n=== ${name} ===`);
  console.log(`\nHIGH priority fixes (2025-10-26):`);
  console.log(`  Eye size:              ${m.eyes.size.toFixed(6)}`);
  console.log(`  Lip fullness:          ${m.mouth.lipFullness.toFixed(6)}`);
  console.log(`  Nose tip projection:   ${m.nose.tipProjection.toFixed(6)}`);
  console.log(`  Chin projection:       ${m.jaw.chinProjection.toFixed(6)}`);

  console.log(`\nMEDIUM priority fixes (2025-10-27):`);
  console.log(`  Brow shape (max):      ${m.brows.shape.toFixed(6)}`);
  console.log(`  Left brow shape:       ${m.brows.leftShape.toFixed(6)}`);
  console.log(`  Right brow shape:      ${m.brows.rightShape.toFixed(6)}`);
  console.log(`  Brow position:         ${m.brows.position.toFixed(6)}`);
  console.log(`  Cupid's bow definition: ${m.mouth.cupidsBowDefinition.toFixed(6)}`);
  console.log(`  Philtrum length:       ${m.mouth.philtrumLength.toFixed(6)}`);
  console.log(`  Jaw symmetry:          ${m.jaw.symmetry.toFixed(6)}`);
  console.log(`  Cheek prominence:      ${m.cheeks.prominence.toFixed(6)}`);
  console.log(`  Nasolabial depth:      ${m.cheeks.nasolabialDepth.toFixed(6)}`);
  console.log(`  Forehead height:       ${m.forehead.height.toFixed(6)}`);
  console.log(`  Forehead contour:      ${m.forehead.contour.toFixed(6)}`);
}

test("prof-sample vs prof-sample (identical - stability test)", async ({ page }) => {
  console.log("\n" + "=".repeat(80));
  console.log("TEST 1: prof-sample vs itself (identical subject)");
  console.log("=".repeat(80));

  await page.goto("/");

  // Add evaluation to expose measurements to window
  await page.addInitScript(() => {
    (window as any).lastAnalysisResult = null;
  });

  await page.exposeFunction("storeAnalysisResult", (result: any) => {
    (window as any).lastAnalysisResult = result;
  });

  // Intercept worker messages to capture measurements
  await page.evaluate(() => {
    const originalPostMessage = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function(this: Worker, ...args: any[]) {
      const message = args[0];
      if (message && message.type === 'RESULT') {
        (window as any).storeAnalysisResult(message.payload);
      }
      return originalPostMessage.apply(this, args);
    };
  });

  const first = page.getByLabel("Select first photo");
  const second = page.getByLabel("Select second photo");

  await first.setInputFiles(profSample);
  await second.setInputFiles(profSample);

  await page.getByRole("button", { name: /analyze/i }).click();

  const measurements = await extractMeasurements(page);

  if (measurements) {
    printMeasurements("Image A (prof-sample)", measurements.A);
    printMeasurements("Image B (prof-sample - same)", measurements.B);

    console.log(`\n💡 Note: Values should be nearly identical (testing measurement stability)`);
  }
});

test("prof-sample vs kovacich-right (dissimilar subjects)", async ({ page }) => {
  console.log("\n" + "=".repeat(80));
  console.log("TEST 2: prof-sample vs john-kovacich-brothers-right (dissimilar)");
  console.log("=".repeat(80));

  await page.goto("/");

  await page.addInitScript(() => {
    (window as any).lastAnalysisResult = null;
  });

  await page.exposeFunction("storeAnalysisResult", (result: any) => {
    (window as any).lastAnalysisResult = result;
  });

  await page.evaluate(() => {
    const originalPostMessage = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function(this: Worker, ...args: any[]) {
      const message = args[0];
      if (message && message.type === 'RESULT') {
        (window as any).storeAnalysisResult(message.payload);
      }
      return originalPostMessage.apply(this, args);
    };
  });

  const first = page.getByLabel("Select first photo");
  const second = page.getByLabel("Select second photo");

  await first.setInputFiles(profSample);
  await second.setInputFiles(kovacichRight);

  await page.getByRole("button", { name: /analyze/i }).click();

  const measurements = await extractMeasurements(page);

  if (measurements) {
    printMeasurements("Image A (prof-sample)", measurements.A);
    printMeasurements("Image B (kovacich-right)", measurements.B);

    console.log(`\n💡 Note: Values should show clear differences (dissimilar subjects)`);
  }
});

test("kovacich-right vs kovacich-left (similar subjects - brothers)", async ({ page }) => {
  console.log("\n" + "=".repeat(80));
  console.log("TEST 3: john-kovacich-brothers (right vs left)");
  console.log("=".repeat(80));

  await page.goto("/");

  await page.addInitScript(() => {
    (window as any).lastAnalysisResult = null;
  });

  await page.exposeFunction("storeAnalysisResult", (result: any) => {
    (window as any).lastAnalysisResult = result;
  });

  await page.evaluate(() => {
    const originalPostMessage = Worker.prototype.postMessage;
    Worker.prototype.postMessage = function(this: Worker, ...args: any[]) {
      const message = args[0];
      if (message && message.type === 'RESULT') {
        (window as any).storeAnalysisResult(message.payload);
      }
      return originalPostMessage.apply(this, args);
    };
  });

  const first = page.getByLabel("Select first photo");
  const second = page.getByLabel("Select second photo");

  await first.setInputFiles(kovacichRight);
  await second.setInputFiles(kovacichLeft);

  await page.getByRole("button", { name: /analyze/i }).click();

  const measurements = await extractMeasurements(page);

  if (measurements) {
    printMeasurements("Image A (kovacich-right)", measurements.A);
    printMeasurements("Image B (kovacich-left)", measurements.B);

    console.log(`\n💡 Note: Brothers - should be similar but not identical`);
  }
});
