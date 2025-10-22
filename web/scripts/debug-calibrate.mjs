#!/usr/bin/env node

/**
 * Debug script to see what's happening in the calibrate page
 */

import { chromium } from "playwright";
import path from "path";

const imagePath = path.resolve("../calibration-images/10_1_0_20170109204617417.jpg");
const age = 10;

async function debug() {
  console.log("Launching browser in headed mode...");
  const browser = await chromium.launch({ headless: false, slowMo: 500 });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Listen to console messages
  page.on("console", (msg) => console.log("PAGE LOG:", msg.text()));
  page.on("pageerror", (error) => console.log("PAGE ERROR:", error.message));

  console.log("\nNavigating to calibrate page...");
  await page.goto("http://localhost:3000/calibrate", { waitUntil: "networkidle" });

  console.log("\nWaiting for page to be ready...");
  await page.waitForTimeout(2000);

  console.log("\nUploading image:", imagePath);
  const fileInput = await page.locator('input[type="file"]');
  await fileInput.setInputFiles(imagePath);

  console.log("\nSetting age:", age);
  const ageInput = await page.locator('input[type="number"]');
  await ageInput.fill(age.toString());

  console.log("\nClicking process button...");
  const processButton = page.locator("button", { hasText: "Process Image" });
  await processButton.click();

  console.log("\nWaiting for processing (60s timeout)...");
  try {
    await page.waitForSelector("table tbody tr", { timeout: 60000 });
    console.log("\n✓ Table row appeared!");

    const cells = await page.locator("table tbody tr").last().locator("td").allTextContents();
    console.log("\nResults:", cells);
  } catch (error) {
    console.log("\n✗ Timeout waiting for table row");
    console.log("Error:", error.message);

    // Take a screenshot
    await page.screenshot({ path: "debug-calibrate.png" });
    console.log("Screenshot saved to debug-calibrate.png");
  }

  console.log("\nPress Ctrl+C to close browser...");
  await page.waitForTimeout(30000);
  await browser.close();
}

debug().catch(console.error);
