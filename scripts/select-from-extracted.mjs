#!/usr/bin/env node

/**
 * Select diverse UTKFace images from extracted directories
 */

import fs from 'fs/promises';
import path from 'path';

const sourceDir = 'C:\\Users\\miles\\Downloads\\UTKFace Uncropped';
const outputDir = path.resolve('calibration-images-extended');

// Target distribution (total ~80 images, emphasizing 20-40 age gap)
const TARGET_DISTRIBUTION = {
  '0-9': 10,
  '10-19': 12,
  '20-29': 20,
  '30-39': 18,
  '40-49': 8,
  '50-59': 6,
  '60-69': 4,
  '70+': 2,
};

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

function getAgeGroup(age) {
  if (age < 10) return '0-9';
  if (age < 20) return '10-19';
  if (age < 30) return '20-29';
  if (age < 40) return '30-39';
  if (age < 50) return '40-49';
  if (age < 60) return '50-59';
  if (age < 70) return '60-69';
  return '70+';
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
        if (parsed) {
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
  console.log('Scanning extracted UTKFace images...\n');

  const allImages = await scanDirectory(sourceDir);
  console.log(`Found ${allImages.length} total images`);

  // Group by age range
  const grouped = {};
  for (const key of Object.keys(TARGET_DISTRIBUTION)) {
    grouped[key] = [];
  }

  for (const img of allImages) {
    const group = getAgeGroup(img.age);
    grouped[group].push(img);
  }

  // Show distribution
  console.log('\nAvailable images per age group:');
  for (const [group, images] of Object.entries(grouped)) {
    console.log(`  ${group.padEnd(8)}: ${images.length.toString().padStart(5)} images`);
  }

  // Select diverse samples from each group
  const selected = [];
  for (const [group, target] of Object.entries(TARGET_DISTRIBUTION)) {
    const available = grouped[group];
    if (available.length === 0) {
      console.log(`\nWarning: No images available for ${group}`);
      continue;
    }

    // Sort by age for even distribution
    available.sort((a, b) => a.age - b.age);

    const count = Math.min(target, available.length);
    const step = Math.floor(available.length / count);

    for (let i = 0; i < count; i++) {
      const idx = Math.min(i * step, available.length - 1);
      selected.push(available[idx]);
    }
  }

  console.log(`\n\nSelected ${selected.length} images for calibration`);

  // Show selection by age group
  const selectedByGroup = {};
  for (const key of Object.keys(TARGET_DISTRIBUTION)) {
    selectedByGroup[key] = [];
  }
  for (const img of selected) {
    const group = getAgeGroup(img.age);
    selectedByGroup[group].push(img);
  }

  console.log('\nSelection breakdown:');
  for (const [group, images] of Object.entries(selectedByGroup)) {
    if (images.length > 0) {
      const ages = images.map(i => i.age).sort((a, b) => a - b);
      console.log(`  ${group.padEnd(8)}: ${images.length} images (ages: ${ages.join(', ')})`);
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
    'calibration-manifest-extended.json',
    JSON.stringify(manifest, null, 2)
  );

  console.log('✓ Manifest saved to calibration-manifest-extended.json');
}

main().catch(console.error);
