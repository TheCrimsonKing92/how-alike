#!/usr/bin/env node

/**
 * Select diverse UTKFace images for calibration, emphasizing age range gaps
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

const archiveDir = 'C:\\Users\\miles\\Downloads\\UTKFace Uncropped';
const outputDir = path.resolve('calibration-images-extended');

// Target distribution (total ~80 images)
const TARGET_DISTRIBUTION = {
  '0-9': 10,
  '10-19': 12,
  '20-29': 20,  // Emphasize this gap
  '30-39': 18,  // Emphasize this gap
  '40-49': 8,
  '50-59': 6,
  '60-69': 4,
  '70+': 2,
};

function parseFilename(filename) {
  // Format: age_gender_race_timestamp.jpg
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

async function listArchiveContents(archivePath) {
  try {
    const { stdout } = await execAsync(`tar -tzf "${archivePath}"`);
    return stdout.split('\n')
      .filter(line => line.endsWith('.jpg'))
      .map(line => line.trim());
  } catch (error) {
    console.error(`Error listing ${archivePath}:`, error.message);
    return [];
  }
}

async function main() {
  console.log('Scanning UTKFace archives...\n');

  // Collect all available images from archives
  const allImages = [];
  for (let i = 1; i <= 3; i++) {
    const archivePath = path.join(archiveDir, `part${i}.tar.gz`);
    console.log(`Scanning part${i}.tar.gz...`);
    const files = await listArchiveContents(archivePath);

    for (const file of files) {
      const basename = path.basename(file);
      const parsed = parseFilename(basename);
      if (parsed) {
        allImages.push({
          ...parsed,
          archive: `part${i}.tar.gz`,
          fullPath: file
        });
      }
    }
  }

  console.log(`\nFound ${allImages.length} total images`);

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

    // Sample evenly across age range and genders
    const count = Math.min(target, available.length);

    // Sort by age for even distribution
    available.sort((a, b) => a.age - b.age);

    const step = Math.floor(available.length / count);
    for (let i = 0; i < count; i++) {
      const idx = i * step;
      selected.push(available[idx]);
    }
  }

  console.log(`\n\nSelected ${selected.length} images for calibration:`);

  // Show selection by age group
  const selectedByGroup = {};
  for (const key of Object.keys(TARGET_DISTRIBUTION)) {
    selectedByGroup[key] = [];
  }
  for (const img of selected) {
    const group = getAgeGroup(img.age);
    selectedByGroup[group].push(img);
  }

  for (const [group, images] of Object.entries(selectedByGroup)) {
    if (images.length > 0) {
      const ages = images.map(i => i.age).sort((a, b) => a - b);
      console.log(`  ${group.padEnd(8)}: ${images.length} images (ages ${ages.join(', ')})`);
    }
  }

  // Create extraction commands
  console.log('\n\nExtraction commands:');
  console.log(`mkdir -p "${outputDir}"`);

  const byArchive = {};
  for (const img of selected) {
    if (!byArchive[img.archive]) {
      byArchive[img.archive] = [];
    }
    byArchive[img.archive].push(img.fullPath);
  }

  for (const [archive, files] of Object.entries(byArchive)) {
    const archivePath = path.join(archiveDir, archive);
    console.log(`\ntar -xzf "${archivePath}" -C "${outputDir}" ${files.map(f => `"${f}"`).join(' ')}`);
  }

  // Save manifest
  const manifest = selected.map(img => ({
    filename: img.filename,
    age: img.age,
    gender: img.gender === 0 ? 'male' : 'female',
    archive: img.archive
  }));

  await fs.mkdir(path.dirname(outputDir), { recursive: true });
  await fs.writeFile(
    'calibration-manifest.json',
    JSON.stringify(manifest, null, 2)
  );

  console.log('\n✓ Manifest saved to calibration-manifest.json');
}

main().catch(console.error);
