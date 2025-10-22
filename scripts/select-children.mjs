#!/usr/bin/env node

/**
 * Select diverse child images (ages 0-12) from UTKFace for calibration
 */

import fs from 'fs/promises';
import path from 'path';

const sourceDir = 'C:\\Users\\miles\\Downloads\\UTKFace Uncropped';
const outputDir = path.resolve('calibration-images-children');

function parseFilename(filename) {
  const match = filename.match(/^(\d+)_(\d)_(\d)_.*\.jpg$/);
  if (!match) return null;
  return {
    age: parseInt(match[1]),
    gender: parseInt(match[2]),
    race: parseInt(match[3]),
    filename
  };
}

async function scanDirectory(dir) {
  const images = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const subImages = await scanDirectory(path.join(dir, entry.name));
        images.push(...subImages);
      } else if (entry.name.endsWith('.jpg')) {
        const parsed = parseFilename(entry.name);
        if (parsed && parsed.age <= 12) {
          images.push({
            ...parsed,
            fullPath: path.join(dir, entry.name)
          });
        }
      }
    }
  } catch (error) {
    console.error(`Error scanning ${dir}:`, error.message);
  }
  return images;
}

async function main() {
  console.log('Scanning UTKFace for child images (ages 0-12)...\n');

  const allChildren = await scanDirectory(sourceDir);
  console.log(`Found ${allChildren.length} child images`);

  // Group by age
  const byAge = {};
  for (let age = 0; age <= 12; age++) {
    byAge[age] = allChildren.filter(img => img.age === age);
  }

  // Show distribution
  console.log('\nAvailable images per age:');
  for (let age = 0; age <= 12; age++) {
    console.log(`  Age ${age.toString().padStart(2)}: ${byAge[age].length.toString().padStart(4)} images`);
  }

  // Target: ~50 samples, evenly distributed
  const TARGET_TOTAL = 50;

  // Select samples
  const selected = [];
  const samplesPerAge = Math.ceil(TARGET_TOTAL / 13); // 13 ages (0-12)

  for (let age = 0; age <= 12; age++) {
    const available = byAge[age];
    if (available.length === 0) continue;

    const count = Math.min(samplesPerAge, available.length);
    const step = Math.floor(available.length / count);

    for (let i = 0; i < count; i++) {
      const idx = Math.min(i * step, available.length - 1);
      selected.push(available[idx]);
    }
  }

  console.log(`\n\nSelected ${selected.length} child images for calibration`);

  // Show selection by age
  const selectedByAge = {};
  for (let age = 0; age <= 12; age++) {
    selectedByAge[age] = selected.filter(img => img.age === age);
  }

  console.log('\nSelection breakdown:');
  for (let age = 0; age <= 12; age++) {
    const count = selectedByAge[age].length;
    if (count > 0) {
      console.log(`  Age ${age.toString().padStart(2)}: ${count} images`);
    }
  }

  // Copy images to output directory
  console.log(`\nCopying images to ${outputDir}...`);
  await fs.mkdir(outputDir, { recursive: true });

  let copied = 0;
  for (const img of selected) {
    const destPath = path.join(outputDir, img.filename);
    try {
      await fs.copyFile(img.fullPath, destPath);
      copied++;
    } catch (error) {
      console.error(`Error copying ${img.filename}:`, error.message);
    }
  }

  console.log(`✓ Copied ${copied} images`);

  // Save manifest
  const manifest = selected.map(img => ({
    filename: img.filename,
    age: img.age,
    gender: img.gender === 0 ? 'male' : 'female',
    race: img.race
  }));

  await fs.writeFile(
    'calibration-manifest-children.json',
    JSON.stringify(manifest, null, 2)
  );

  console.log('✓ Manifest saved to calibration-manifest-children.json');
}

main().catch(console.error);
