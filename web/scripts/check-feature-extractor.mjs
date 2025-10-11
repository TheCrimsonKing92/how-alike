#!/usr/bin/env node
import { AutoProcessor, env } from '@xenova/transformers';

env.allowLocalModels = false;

console.log('Loading processor...');
const processor = await AutoProcessor.from_pretrained('jonathandinu/face-parsing');

console.log('\n=== Feature Extractor ===');
const fe = processor.feature_extractor;
console.log('Type:', fe?.constructor?.name);

if (fe) {
  const proto = Object.getPrototypeOf(fe);
  const methods = Object.getOwnPropertyNames(proto).filter(k => !k.startsWith('_'));
  console.log('\nMethods:', methods);

  const props = Object.keys(fe);
  console.log('\nProperties:', props.slice(0, 20)); // First 20

  const postMethods = [...methods, ...props].filter(k => k.includes('post'));
  console.log('\nPost-process methods:', postMethods.length ? postMethods : 'None found');

  // Check for resize/interpolate methods
  const resizeMethods = [...methods, ...props].filter(k => k.includes('resize') || k.includes('interpolate') || k.includes('upsample'));
  console.log('Resize/interpolate methods:', resizeMethods.length ? resizeMethods : 'None found');
}
