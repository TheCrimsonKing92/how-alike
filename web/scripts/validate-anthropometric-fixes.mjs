#!/usr/bin/env node

/**
 * Validate anthropometric fixes with real test images
 *
 * This script analyzes the real test images and reports the raw measurement
 * values for all 12 anthropometric fixes to help with threshold recalibration.
 */

import { createCanvas, loadImage } from 'canvas';
import * as tf from '@tensorflow/tfjs-node';
import '@tensorflow/tfjs-backend-cpu';
import * as faceLandmarksDetection from '@tensorflow-models/face-landmarks-detection';
import { extractFeatureMeasurements } from '../src/lib/feature-axes.js';
import { fromKeypoints } from '../src/lib/geometry.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Image paths
const IMAGES = {
  'prof-sample': join(__dirname, '../src/__tests__/fixtures/real-faces/prof-sample.png'),
  'kovacich-right': join(__dirname, '../src/__tests__/fixtures/real-faces/john-kovacich-brothers-right.jpg'),
  'kovacich-left': join(__dirname, '../src/__tests__/fixtures/real-faces/john-kovacich-brothers-left.jpg'),
};

// Measurements we fixed
const FIXED_MEASUREMENTS = {
  'HIGH priority fixes (2025-10-26)': {
    'Eye size': (m) => m.eyes.size,
    'Lip fullness': (m) => m.mouth.lipFullness,
    'Nose tip projection': (m) => m.nose.tipProjection,
    'Chin projection': (m) => m.jaw.chinProjection,
  },
  'MEDIUM priority fixes (2025-10-27)': {
    'Brow position': (m) => m.brows.position,
    'Cupid\'s bow definition': (m) => m.mouth.cupidsBowDefinition,
    'Philtrum length': (m) => m.mouth.philtrumLength,
    'Jaw symmetry': (m) => m.jaw.symmetry,
    'Cheek prominence': (m) => m.cheeks.prominence,
    'Nasolabial depth': (m) => m.cheeks.nasolabialDepth,
    'Forehead height': (m) => m.forehead.height,
    'Forehead contour': (m) => m.forehead.contour,
  },
};

async function analyzeFace(imagePath, name) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Analyzing: ${name}`);
  console.log('='.repeat(80));

  // Load image
  const image = await loadImage(imagePath);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);

  // Initialize FaceMesh
  const model = faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh;
  const detectorConfig = {
    runtime: 'tfjs',
    refineLandmarks: true,
  };
  const detector = await faceLandmarksDetection.createDetector(model, detectorConfig);

  // Detect landmarks
  const faces = await detector.estimateFaces(canvas, {
    flipHorizontal: false,
    staticImageMode: true,
  });

  if (faces.length === 0) {
    console.log('❌ No face detected');
    return null;
  }

  const face = faces[0];
  const landmarks = fromKeypoints(face.keypoints);

  // Extract measurements
  const measurements = extractFeatureMeasurements(landmarks, null);

  // Report all fixed measurements
  for (const [category, measurements_map] of Object.entries(FIXED_MEASUREMENTS)) {
    console.log(`\n${category}:`);
    for (const [label, getter] of Object.entries(measurements_map)) {
      const value = getter(measurements);
      console.log(`  ${label.padEnd(30)} ${value.toFixed(6)}`);
    }
  }

  await detector.dispose();
  return measurements;
}

async function main() {
  console.log('\n🔬 Anthropometric Fix Validation');
  console.log('Testing with real face images to validate new normalizations\n');

  await tf.ready();
  console.log(`TensorFlow.js backend: ${tf.getBackend()}\n`);

  const results = {};

  // Analyze each image
  for (const [name, path] of Object.entries(IMAGES)) {
    try {
      results[name] = await analyzeFace(path, name);
    } catch (error) {
      console.error(`\n❌ Error analyzing ${name}:`, error.message);
    }
  }

  // Summary statistics
  console.log('\n\n' + '='.repeat(80));
  console.log('SUMMARY: Value Ranges Across All Images');
  console.log('='.repeat(80));

  for (const [category, measurements_map] of Object.entries(FIXED_MEASUREMENTS)) {
    console.log(`\n${category}:`);
    for (const [label, getter] of Object.entries(measurements_map)) {
      const values = Object.entries(results)
        .filter(([_, m]) => m !== null)
        .map(([_, m]) => getter(m));

      if (values.length > 0) {
        const min = Math.min(...values);
        const max = Math.max(...values);
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        console.log(`  ${label.padEnd(30)} min=${min.toFixed(4)} max=${max.toFixed(4)} avg=${avg.toFixed(4)}`);
      }
    }
  }

  console.log('\n✅ Validation complete\n');
  console.log('Next steps:');
  console.log('1. Review the value ranges above');
  console.log('2. Identify appropriate threshold boundaries for each measurement');
  console.log('3. Update axis-classifiers.ts with new thresholds');
  console.log('4. Update axis-classifiers.test.ts with new test expectations');
  console.log('5. Run npm test to verify all tests pass\n');
}

main().catch(console.error);
