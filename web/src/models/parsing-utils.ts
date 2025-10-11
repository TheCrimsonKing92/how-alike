export type OrtTensorLite = { dims: number[]; data: Float32Array };

// Pick a plausible segmentation output tensor among multiple ORT outputs.
// Prefers shapes of [1,K,H,W] or [1,H,W,K] (or [H,W,K]) with K>1 and H/W near S.
// Explicitly prefers output named "output" if available (main head vs auxiliary heads).
export function pickSegOutput(outputs: Record<string, unknown>, S: number): OrtTensorLite | null {
  // Helper to validate and extract tensor info
  const validateTensor = (v: unknown): { dims: number[]; data: Float32Array; K: number } | null => {
    const maybe = v as { dims?: unknown; data?: unknown };
    const dims = Array.isArray(maybe.dims) ? (maybe.dims as number[]) : [];
    const data = maybe.data instanceof Float32Array ? maybe.data : undefined;
    if (!data || dims.length < 3) return null;

    let H = 0, W = 0, K = 0;
    if (dims.length === 4) {
      const [d0, d1, d2, d3] = dims;
      if (d1 > 1 && d2 === S && d3 === S) { K = d1; H = d2; W = d3; }
      else if (d1 === S && d2 === S && d3 > 1) { K = d3; H = d1; W = d2; }
      else return null;
    } else if (dims.length === 3) {
      const [d0, d1, d2] = dims; // [H,W,K]
      if (d0 === S && d1 === S && d2 > 1) { H = d0; W = d1; K = d2; }
      else return null;
    } else return null;

    return { dims, data, K };
  };

  // First, try to use output named "output" (main head)
  if ('output' in outputs) {
    const validated = validateTensor(outputs['output']);
    if (validated) {
      return { dims: validated.dims, data: validated.data };
    }
  }

  // Fallback: pick output with highest K
  let best: OrtTensorLite | null = null;
  let bestK = -1;
  for (const v of Object.values(outputs)) {
    const validated = validateTensor(v);
    if (validated && validated.K > bestK) {
      bestK = validated.K;
      best = { dims: validated.dims, data: validated.data };
    }
  }
  return best;
}

export type Pt = { x: number; y: number };

// Compute a square, eye-centered crop with extra space above for brows.
export function computeFaceCrop(
  width: number,
  height: number,
  points: Pt[],
  eyeLeft?: Pt,
  eyeRight?: Pt,
  ipdScale = 2.2,
  eyeYOffset = 0.15
) {
  const xs = points.map(p => p.x);
  const ys = points.map(p => p.y);
  const minX = Math.max(0, Math.min(...xs));
  const maxX = Math.min(width, Math.max(...xs));
  const minY = Math.max(0, Math.min(...ys));
  const maxY = Math.min(height, Math.max(...ys));
  const bbW = Math.max(1, maxX - minX);
  const bbH = Math.max(1, maxY - minY);
  const eyeCx = eyeLeft && eyeRight ? (eyeLeft.x + eyeRight.x) / 2 : (minX + maxX) / 2;
  const eyeCy = eyeLeft && eyeRight ? (eyeLeft.y + eyeRight.y) / 2 : (minY + maxY) / 2;
  const ipd = eyeLeft && eyeRight ? Math.hypot(eyeRight.x - eyeLeft.x, eyeRight.y - eyeLeft.y) : Math.max(bbW, bbH) / 3;
  let side = Math.max(bbW, bbH, ipdScale * ipd);
  side = Math.min(side, Math.max(width, height));
  let cx = eyeCx;
  let cy = eyeCy - eyeYOffset * ipd;
  let sx = Math.round(cx - side / 2);
  let sy = Math.round(cy - side / 2);
  if (sx < 0) sx = 0;
  if (sy < 0) sy = 0;
  if (sx + side > width) sx = Math.max(0, Math.floor(width - side));
  if (sy + side > height) sy = Math.max(0, Math.floor(height - side));
  const sw = Math.min(Math.floor(side), width - sx);
  const sh = Math.min(Math.floor(side), height - sy);
  return { sx, sy, sw, sh };
}

