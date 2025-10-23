// ASCII-only config for parsing adapter scaffolding

function truthy(v: string | undefined | null) {
  if (!v) return false;
  const s = String(v).trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

// Default model id and input size (can be overridden by env if needed)
export const PARSING_MODEL_ID: string = (
  (typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_PARSING_MODEL : undefined) ||
  'face-parsing-resnet34'
) as string;

export const PARSING_INPUT_SIZE: number = Number(
  (typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_PARSING_INPUT : undefined) || 512
);

// Public URL to the ONNX model (served from Next public dir)
export function parsingModelUrl() {
  return `/models/parsing/${PARSING_MODEL_ID}/model.onnx`;
}

function intFromEnv(key: string, fallback: number): number {
  const v = typeof process !== 'undefined' ? (process.env as Record<string, string | undefined>)[key] : undefined;
  const n = v != null ? Number(v) : NaN;
  return Number.isFinite(n) ? (n as number) : fallback;
}

function parseClassList(key: string, defaults: number[]): number[] {
  const raw = typeof process !== 'undefined' ? (process.env as Record<string, string | undefined>)[key] : undefined;
  if (!raw) return defaults;
  const parsed = raw
    .split(',')
    .map((token) => Number(token.trim()))
    .filter((n) => Number.isFinite(n) && n >= 0);
  return parsed.length ? Array.from(new Set(parsed)) : defaults;
}

// Class ID mapping for CelebAMask-HQ (19 classes):
// 0: background, 1: skin, 2: nose, 3: eyeglasses, 4: l_eye, 5: r_eye,
// 6: l_brow, 7: r_brow, 8: l_ear, 9: r_ear, 10: mouth, 11: u_lip, 12: l_lip,
// 13: hair, 14: hat, 15: earring, 16: necklace, 17: neck, 18: cloth
export function parsingClassConfig() {
  const browLeft = intFromEnv('NEXT_PUBLIC_PARSING_ID_BROW_L', 6);
  const browRight = intFromEnv('NEXT_PUBLIC_PARSING_ID_BROW_R', 7);
  const browAliases = parseClassList('NEXT_PUBLIC_PARSING_BROW_ALIASES', [3]); // eyeglasses can include brow region
  const nosePrimary = intFromEnv('NEXT_PUBLIC_PARSING_ID_NOSE', 2);
  const noseAliases = parseClassList('NEXT_PUBLIC_PARSING_NOSE_ALIASES', [3]); // eyeglasses can include nose bridge
  return {
    browLeft,
    browRight,
    browSet: Array.from(new Set([browLeft, browRight, ...browAliases].filter((n) => n >= 0))),
    nosePrimary,
    noseSet: Array.from(new Set([nosePrimary, ...noseAliases].filter((n) => n >= 0))),
  } as const;
}

export const PARSING_NECK_GUARD = truthy(
  typeof process !== 'undefined' ? (process.env as Record<string, string | undefined>)['NEXT_PUBLIC_PARSING_NECK_GUARD'] : undefined
);

export const PARSING_TRACE_LOGS = truthy(
  typeof process !== 'undefined' ? (process.env as Record<string, string | undefined>)['NEXT_PUBLIC_PARSING_TRACE'] : undefined
);
