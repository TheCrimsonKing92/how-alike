#!/usr/bin/env node
/**
 * Test Transformers.js Face Parsing
 *
 * Quick test to verify Xenova/face-parsing model works in Node.js environment
 */

import { pipeline, env } from '@xenova/transformers';

console.log('=== Transformers.js Face Parsing Test ===\n');

// Allow remote models from HuggingFace
env.allowLocalModels = false;

try {
  console.log('Loading face-parsing model...');
  const segmenter = await pipeline('image-segmentation', 'Xenova/face-parsing');
  console.log('✓ Model loaded successfully\n');

  // Test with a sample image URL
  const testUrl = 'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/portrait-of-woman.jpg';
  console.log('Running inference on test image...');
  console.log('URL:', testUrl);

  const startTime = Date.now();
  const output = await segmenter(testUrl);
  const inferenceTime = Date.now() - startTime;

  console.log(`✓ Inference completed in ${inferenceTime}ms\n`);

  console.log('=== Segmentation Results ===');
  console.log('Total segments:', output.length);
  console.log('\nDetected regions:');

  for (const segment of output) {
    const { label, mask } = segment;
    console.log(`  - ${label}: ${mask.width}x${mask.height} mask`);
  }

  console.log('\n=== Test Complete ===');
  console.log('✓ Transformers.js face parsing is working!');

} catch (error) {
  console.error('❌ Error during test:');
  console.error(error);
  process.exit(1);
}
