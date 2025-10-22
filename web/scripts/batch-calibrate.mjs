#!/usr/bin/env node

/**
 * Batch Age Calibration Script
 *
 * Processes a folder of images through the browser pipeline using Playwright
 * to collect calibration data with proper face detection and cropping.
 *
 * Usage:
 *   node scripts/batch-calibrate.mjs --input <folder> --output <csv-file>
 *
 * Image filename format: Should start with age_  (e.g., 25_john.jpg, 10_child.jpg)
 * Or provide a mapping file: --mapping ages.json
 */

import fs from 'fs/promises';
import path from 'path';
import { chromium } from 'playwright';

const args = process.argv.slice(2);

function parseArgs() {
  const params = {
    input: null,
    output: 'calibration-data.csv',
    mapping: null,
    port: 3000,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--input') {
      params.input = path.resolve(args[++i] ?? '');
    } else if (arg === '--output') {
      params.output = path.resolve(args[++i] ?? '');
    } else if (arg === '--mapping') {
      params.mapping = path.resolve(args[++i] ?? '');
    } else if (arg === '--port') {
      params.port = parseInt(args[++i] ?? '3000');
    }
  }

  if (!params.input) {
    throw new Error('Please provide --input folder');
  }

  return params;
}

async function getImageFiles(dir) {
  const files = await fs.readdir(dir);
  return files.filter(f => /\.(jpg|jpeg|png)$/i.test(f));
}

function extractAgeFromFilename(filename) {
  // Try format: age_*.jpg (e.g., 25_person.jpg)
  const match = filename.match(/^(\d+)_/);
  if (match) {
    return parseInt(match[1]);
  }

  // Try UTKFace format: age_gender_race_timestamp.jpg
  const utkMatch = filename.match(/^(\d+)_\d+_\d+_/);
  if (utkMatch) {
    return parseInt(utkMatch[1]);
  }

  return null;
}

async function loadAgeMapping(mappingFile) {
  if (!mappingFile) return {};
  try {
    const content = await fs.readFile(mappingFile, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.warn('Failed to load mapping file:', error.message);
    return {};
  }
}

async function processImagesWithBrowser(imageDir, imageFiles, ageMapping, port) {
  console.log(`\nLaunching browser...`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  const results = [];
  let processed = 0;
  let failed = 0;

  // Navigate to calibration page ONCE and wait for worker
  console.log(`Loading calibration page...`);
  await page.goto(`http://localhost:${port}/calibrate`, { waitUntil: 'networkidle' });

  // Listen to console messages for debugging
  page.on('console', msg => console.log('  [PAGE]', msg.text()));
  page.on('pageerror', error => console.log('  [ERROR]', error.message));

  // Wait for worker to be ready (this only happens once)
  console.log(`Waiting for worker to initialize...`);
  await page.waitForFunction(() => {
    const buttons = Array.from(document.querySelectorAll('button'));
    return buttons.some(btn => btn.textContent.includes('Process Image'));
  }, { timeout: 30000 });
  console.log(`Worker ready!\n`);

  for (const filename of imageFiles) {
    const age = ageMapping[filename] ?? extractAgeFromFilename(filename);

    if (age === null) {
      console.log(`⚠️  Skipping ${filename} (no age found)`);
      failed++;
      continue;
    }

    try {
      const imagePath = path.join(imageDir, filename);

      // Upload image
      const fileInput = await page.locator('input[type="file"]');
      await fileInput.setInputFiles(imagePath);

      // Set age
      const ageInput = await page.locator('input[type="number"]');
      await ageInput.fill(age.toString());

      // Click process button
      const processButton = page.locator('button', { hasText: 'Process Image' });

      // Count current rows before clicking
      const rowCountBefore = await page.locator('table tbody tr').count();

      await processButton.click();

      // Wait for new table row to appear (indicates processing complete)
      // Face parsing takes ~17s per image, so with 2 images we need 60-90s
      await page.waitForFunction((expectedCount) => {
        const rows = document.querySelectorAll('table tbody tr');
        return rows.length > expectedCount;
      }, rowCountBefore, { timeout: 90000 });

      const lastRow = await page.locator('table tbody tr').last();
      const cells = await lastRow.locator('td').allTextContents();

      if (cells.length >= 5) {
        const result = {
          filename,
          actualAge: age,
          rawPrediction: parseFloat(cells[2]),
          calibratedPrediction: parseFloat(cells[3]),
          error: parseFloat(cells[4]),
          gender: cells[5] || 'unknown'
        };

        results.push(result);
        processed++;
        console.log(`✓ ${filename}: age ${age} → raw ${result.rawPrediction.toFixed(1)}, calibrated ${result.calibratedPrediction.toFixed(1)}`);
      } else {
        throw new Error('Could not extract result from table');
      }

    } catch (error) {
      console.error(`✗ ${filename}: ${error.message}`);
      failed++;
    }
  }

  await browser.close();

  console.log(`\n✓ Processed ${processed}/${imageFiles.length} images (${failed} failed)`);
  return results;
}

function writeCSV(results, outputFile) {
  const headers = ['filename', 'actual_age', 'raw_prediction', 'calibrated_prediction', 'error', 'gender'];
  const rows = results.map(r => [
    r.filename,
    r.actualAge,
    r.rawPrediction,
    r.calibratedPrediction,
    r.error,
    r.gender
  ]);

  const csv = [
    headers.join(','),
    ...rows.map(r => r.join(','))
  ].join('\n');

  fs.writeFile(outputFile, csv, 'utf-8');
  console.log(`\n✓ Saved calibration data to: ${outputFile}`);
}

async function main() {
  const params = parseArgs();

  console.log('Batch Age Calibration');
  console.log('====================');
  console.log(`Input folder: ${params.input}`);
  console.log(`Output file:  ${params.output}`);
  if (params.mapping) console.log(`Mapping file: ${params.mapping}`);

  // Load images
  const imageFiles = await getImageFiles(params.input);
  console.log(`\nFound ${imageFiles.length} images`);

  if (imageFiles.length === 0) {
    throw new Error('No images found in input folder');
  }

  // Load age mapping
  const ageMapping = await loadAgeMapping(params.mapping);

  // Check that we can determine ages
  let missingAges = 0;
  for (const filename of imageFiles) {
    const age = ageMapping[filename] ?? extractAgeFromFilename(filename);
    if (age === null) missingAges++;
  }

  if (missingAges > 0) {
    console.warn(`⚠️  Warning: ${missingAges} images have no age information`);
  }

  // Process images through browser
  const results = await processImagesWithBrowser(params.input, imageFiles, ageMapping, params.port);

  // Write CSV
  if (results.length > 0) {
    await writeCSV(results, params.output);

    // Print statistics
    const mae = results.reduce((sum, r) => sum + Math.abs(r.error), 0) / results.length;
    console.log(`\nMean Absolute Error (calibrated): ${mae.toFixed(2)} years`);
  } else {
    console.error('No results to save');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
