#!/usr/bin/env node
/**
 * ONNX Model Diagnostic Script
 *
 * This script inspects and tests the face parsing ONNX model to identify
 * why it's producing uniform logits instead of proper segmentation results.
 */

import * as ort from 'onnxruntime-web';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MODEL_PATH = join(__dirname, '../public/models/parsing/face-parsing-resnet34/model.onnx');

console.log('=== ONNX Model Diagnostic ===\n');
console.log('onnxruntime-web version:', ort.version || 'unknown');
console.log('Model path:', MODEL_PATH);
console.log();

try {
  // Load model file
  const modelBuffer = readFileSync(MODEL_PATH);
  console.log('✓ Model file loaded');
  console.log('  File size:', (modelBuffer.length / (1024 * 1024)).toFixed(2), 'MB');
  console.log();

  // Create session with detailed options
  console.log('Creating ONNX Runtime session...');
  const session = await ort.InferenceSession.create(modelBuffer, {
    executionProviders: ['wasm'],
    graphOptimizationLevel: 'all',
    enableCpuMemArena: true,
    enableMemPattern: true,
  });
  console.log('✓ Session created successfully');
  console.log();

  // Inspect session metadata
  console.log('=== Session Metadata ===');
  console.log('Input names:', session.inputNames);
  console.log('Output names:', session.outputNames);

  if (session.inputMetadata) {
    console.log('\nInput metadata:');
    for (const [name, meta] of Object.entries(session.inputMetadata)) {
      console.log(`  ${name}:`, meta);
    }
  }

  if (session.outputMetadata) {
    console.log('\nOutput metadata:');
    for (const [name, meta] of Object.entries(session.outputMetadata)) {
      console.log(`  ${name}:`, meta);
    }
  }
  console.log();

  // Create test input tensor (512x512 image)
  console.log('=== Running Test Inference ===');
  const S = 512;

  // Test with BOTH preprocessing methods to compare
  const tests = [
    { name: 'NCHW RGB imagenet', layout: 'NCHW', order: 'RGB', norm: 'imagenet' },
    { name: 'NCHW BGR caffe', layout: 'NCHW', order: 'BGR', norm: 'caffe' },
  ];

  for (const test of tests) {
    console.log(`\n--- Testing: ${test.name} ---`);

    const mean = [0.485, 0.456, 0.406];
    const std = [0.229, 0.224, 0.225];

  // Create a simple test pattern (gradient)
  const inputData = new Float32Array(1 * 3 * S * S);
  for (let c = 0; c < 3; c++) {
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        // Create a gradient pattern normalized with ImageNet stats
        const value = (y / S); // 0 to 1 gradient
        const normalized = (value - mean[c]) / std[c];
        inputData[c * S * S + y * S + x] = normalized;
      }
    }
  }

  const inputTensor = new ort.Tensor('float32', inputData, [1, 3, S, S]);
  console.log('Input tensor created:', inputTensor.dims);

  // Calculate input range without spreading huge array
  let inputMin = inputData[0], inputMax = inputData[0];
  for (let i = 0; i < inputData.length; i++) {
    if (inputData[i] < inputMin) inputMin = inputData[i];
    if (inputData[i] > inputMax) inputMax = inputData[i];
  }
  console.log('Input data range:', inputMin.toFixed(2), 'to', inputMax.toFixed(2));
  console.log();

  // Run inference
  console.log('Running inference...');
  const startTime = Date.now();
  const feeds = { [session.inputNames[0]]: inputTensor };
  const results = await session.run(feeds);
  const inferenceTime = Date.now() - startTime;
  console.log('✓ Inference completed in', inferenceTime, 'ms');
  console.log();

  // Inspect ALL outputs
  console.log('=== Output Analysis ===');
  console.log('Model has', session.outputNames.length, 'outputs. Analyzing each:\n');

  for (const outputName of session.outputNames) {
    console.log(`--- Output: "${outputName}" ---`);
    const output = results[outputName];
    console.log('Dims:', output.dims);
    console.log('Size:', output.size, 'elements');
    console.log('Type:', output.type);

    // Quick check if this looks like a segmentation output
    const dims = output.dims;
    if (dims.length === 4 && dims[1] === 19 && dims[2] === S && dims[3] === S) {
      console.log('✓ This looks like the main segmentation output (NCHW with 19 classes)');
    }
    console.log();
  }

  // Use the first output for detailed analysis
  const outputName = session.outputNames[0];
  const output = results[outputName];
  console.log('=== Detailed Analysis of "' + outputName + '" ===');

  // Analyze output values (avoid spreading huge arrays)
  const outputData = output.data;
  let min = outputData[0], max = outputData[0], sum = 0;
  for (let i = 0; i < outputData.length; i++) {
    const val = outputData[i];
    if (val < min) min = val;
    if (val > max) max = val;
    sum += val;
  }
  const outputMean = sum / outputData.length;

  // Calculate std dev
  let variance = 0;
  for (let i = 0; i < outputData.length; i++) {
    variance += Math.pow(outputData[i] - outputMean, 2);
  }
  variance /= outputData.length;
  const stdDev = Math.sqrt(variance);

  const stats = { min, max, mean: outputMean, stdDev };

  console.log('Output statistics:');
  console.log('  Min:', stats.min.toFixed(4));
  console.log('  Max:', stats.max.toFixed(4));
  console.log('  Mean:', stats.mean.toFixed(4));
  console.log('  Std Dev:', stats.stdDev.toFixed(4));
  console.log();

  // Sample first pixel across all classes (for NCHW: [1, K, H, W])
  const [batch, K, H, W] = output.dims;
  console.log('First pixel logits across all', K, 'classes:');
  const firstPixelLogits = [];
  for (let c = 0; c < K; c++) {
    firstPixelLogits.push(outputData[c * H * W]);
  }
  console.log(firstPixelLogits.map((v, i) => `  Class ${i}: ${v.toFixed(3)}`).join('\n'));
  console.log();

  // Check if all values are suspiciously similar
  if (stats.stdDev < 0.5) {
    console.log('⚠️  WARNING: Output has very low variance (std dev < 0.5)');
    console.log('   This suggests the model may not be performing actual inference.');
    console.log('   Expected: Wide range of logit values (e.g., -10 to +15)');
    console.log('   Observed: Narrow range around', stats.mean.toFixed(2));
  } else {
    console.log('✓ Output has reasonable variance');
  }
  console.log();

  // Compute argmax segmentation map
  const labels = new Uint8Array(H * W);
  const classCounts = new Array(K).fill(0);

  for (let i = 0; i < H * W; i++) {
    let bestClass = 0;
    let bestVal = -Infinity;
    for (let c = 0; c < K; c++) {
      const val = outputData[c * H * W + i];
      if (val > bestVal) {
        bestVal = val;
        bestClass = c;
      }
    }
    labels[i] = bestClass;
    classCounts[bestClass]++;
  }

  console.log('Class distribution in segmentation:');
  const sortedClasses = classCounts
    .map((count, classId) => ({ classId, count, percent: (count / (H * W) * 100).toFixed(1) }))
    .filter(c => c.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  for (const { classId, count, percent } of sortedClasses) {
    console.log(`  Class ${classId}: ${count.toLocaleString()} pixels (${percent}%)`);
  }
  console.log();

  if (sortedClasses.length === 1 || sortedClasses[0].count > H * W * 0.95) {
    console.log('⚠️  WARNING: Single class dominates >95% of pixels');
    console.log('   This is abnormal for a test input and confirms inference issues.');
  }

  console.log('\n=== Diagnosis Complete ===');

} catch (error) {
  console.error('❌ Error during diagnosis:');
  console.error(error);
  process.exit(1);
}
