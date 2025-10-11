#!/usr/bin/env node
import { AutoModel, AutoProcessor, env, RawImage } from '@xenova/transformers';

env.allowLocalModels = false;

console.log('Loading model and processor...');
const [processor, model] = await Promise.all([
  AutoProcessor.from_pretrained('jonathandinu/face-parsing'),
  AutoModel.from_pretrained('jonathandinu/face-parsing')
]);

console.log('Loading test image...');
const testUrl = 'https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/portrait-of-woman.jpg';
const image = await RawImage.fromURL(testUrl);
console.log('Image size:', image.width, 'x', image.height);

console.log('\nRunning inference...');
const inputs = await processor(image);
const outputs = await model(inputs);

console.log('Logits shape:', outputs.logits.dims);

console.log('\nCalling post_process_semantic_segmentation...');
// Pass array of target sizes (one per batch item)
const processed = processor.feature_extractor.post_process_semantic_segmentation(outputs, [[image.height, image.width]]);

console.log('\nResult type:', processed?.constructor?.name);
console.log('Result shape/length:', processed.length ?? processed?.dims ?? 'unknown');

if (Array.isArray(processed) && processed.length > 0) {
  const first = processed[0];
  console.log('First item keys:', Object.keys(first));

  // Check segmentation tensor
  if (first?.segmentation) {
    console.log('\nSegmentation:');
    console.log('  Type:', first.segmentation.constructor.name);
    console.log('  Dims:', first.segmentation.dims);

    // Check for unique classes
    const unique = new Set(first.segmentation.data);
    console.log('  Unique classes:', unique.size, 'values:', Array.from(unique).sort((a,b) => a-b).slice(0, 20));

    // Check class distribution
    const hist = new Map();
    for (let val of first.segmentation.data) {
      hist.set(val, (hist.get(val) || 0) + 1);
    }
    const top = Array.from(hist.entries()).sort((a,b) => b[1] - a[1]).slice(0, 10);
    console.log('  Top classes:', top.map(([k,v]) => `${k}:${v}`).join(', '));
  }

  // Check labels list
  if (first?.labels) {
    console.log('\nLabels:', first.labels);
  }
}
