const ort = require('onnxruntime-node');
const fs = require('node:fs');

const modelPath = process.argv[2];
if (!modelPath || !fs.existsSync(modelPath)) {
  console.error('Usage: node scripts/inspect-onnx.js <path-to-model.onnx>');
  process.exit(1);
}

function tensorNCHW(size) {
  const [N, C, H, W] = [1, 3, size, size];
  const data = new Float32Array(N * C * H * W);
  for (let i = 0; i < data.length; i++) data[i] = Math.random();
  return new ort.Tensor('float32', data, [N, C, H, W]);
}

function tensorNHWC(size) {
  const [N, H, W, C] = [1, size, size, 3];
  const data = new Float32Array(N * C * H * W);
  for (let i = 0; i < data.length; i++) data[i] = Math.random();
  return new ort.Tensor('float32', data, [N, H, W, C]);
}

(async () => {
  const session = await ort.InferenceSession.create(modelPath);
  console.log('onnxruntime-node version:', ort.version || '(unknown)');
  console.log('Model path:', modelPath);

  const inNames = session.inputNames || [];
  const outNames = session.outputNames || [];
  const inMeta = session.inputMetadata || {};
  const outMeta = session.outputMetadata || {};

  console.log('');
  console.log('Inputs:');
  inNames.forEach((name, idx) => {
    const meta = inMeta[name] || (Array.isArray(inMeta) ? inMeta[idx] : undefined) || {};
    const dims = (meta.dimensions || meta.dims || []).join('x') || '(unknown)';
    const type = meta.type || meta.dataType || '(unknown)';
    console.log('-', name, 'shape:', dims, 'type:', type);
  });

  console.log('');
  console.log('Outputs:');
  outNames.forEach((name, idx) => {
    const meta = outMeta[name] || (Array.isArray(outMeta) ? outMeta[idx] : undefined) || {};
    const dims = (meta.dimensions || meta.dims || []).join('x') || '(unknown)';
    const type = meta.type || meta.dataType || '(unknown)';
    console.log('-', name, 'shape:', dims, 'type:', type);
  });

  // Try a quick inference with common shapes/layouts to infer compatibility
  if (inNames.length > 0) {
    const inputName = inNames[0];
    const candidates = [
      { size: 256, layout: 'NCHW', fn: tensorNCHW },
      { size: 256, layout: 'NHWC', fn: tensorNHWC },
      { size: 512, layout: 'NCHW', fn: tensorNCHW },
      { size: 512, layout: 'NHWC', fn: tensorNHWC },
    ];
    for (const cand of candidates) {
      try {
        const x = cand.fn(cand.size);
        const out = await session.run({ [inputName]: x });
        console.log('');
        console.log('Trial inference OK with', cand.layout, cand.size + 'x' + cand.size);
        Object.entries(out).forEach(([name, tensor]) => {
          const dims = Array.isArray(tensor.dims) ? tensor.dims.join('x') : '(unknown)';
          console.log('-', name, 'dims:', dims, 'type:', tensor.type || 'tensor');
        });
        break;
      } catch (e) {
        // Try next candidate
      }
    }
  }
})();