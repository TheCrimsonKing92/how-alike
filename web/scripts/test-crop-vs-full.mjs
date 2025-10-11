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
const fullImage = await RawImage.fromURL(testUrl);
console.log('Full image size:', fullImage.width, 'x', fullImage.height);

// Simulate a crop (center 300x300)
const cropSize = 300;
const startX = Math.floor((fullImage.width - cropSize) / 2);
const startY = Math.floor((fullImage.height - cropSize) / 2);

console.log('\n=== Test 1: Full image ===');
const inputs1 = await processor(fullImage);
const outputs1 = await model(inputs1);
const processed1 = processor.feature_extractor.post_process_semantic_segmentation(
  outputs1,
  [[fullImage.height, fullImage.width]]
);
const seg1 = processed1[0].segmentation;
const unique1 = new Set(seg1.data);
console.log('Classes detected:', unique1.size, 'values:', Array.from(unique1).sort((a,b) => a-b));

console.log('\n=== Test 2: Cropped image (300x300) ===');
// Extract crop region manually
const cropData = new Uint8ClampedArray(cropSize * cropSize * fullImage.channels);
let dstIdx = 0;
for (let y = 0; y < cropSize; y++) {
  for (let x = 0; x < cropSize; x++) {
    const srcIdx = ((startY + y) * fullImage.width + (startX + x)) * fullImage.channels;
    for (let c = 0; c < fullImage.channels; c++) {
      cropData[dstIdx++] = fullImage.data[srcIdx + c];
    }
  }
}
const croppedImage = new RawImage(cropData, cropSize, cropSize, fullImage.channels);
console.log('Cropped size:', croppedImage.width, 'x', croppedImage.height);

const inputs2 = await processor(croppedImage);
const outputs2 = await model(inputs2);
const processed2 = processor.feature_extractor.post_process_semantic_segmentation(
  outputs2,
  [[croppedImage.height, croppedImage.width]]
);
const seg2 = processed2[0].segmentation;
const unique2 = new Set(seg2.data);
console.log('Classes detected:', unique2.size, 'values:', Array.from(unique2).sort((a,b) => a-b));

// Check class distribution for crop
const hist = new Map();
for (let val of seg2.data) {
  hist.set(val, (hist.get(val) || 0) + 1);
}
const top = Array.from(hist.entries()).sort((a,b) => b[1] - a[1]).slice(0, 10);
console.log('Top classes in crop:', top.map(([k,v]) => `${k}:${v}`).join(', '));
