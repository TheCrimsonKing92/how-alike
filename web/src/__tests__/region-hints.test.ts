import { describe, it, expect, beforeEach } from 'vitest';
import { regionHints, setAdapter } from '@/models/detector';

function makePoints(n: number) {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) pts.push({ x: (i % 32) + 0.1, y: Math.floor(i / 32) + 0.2 });
  return pts;
}

describe('regionHints adapter selection', () => {
  const points = makePoints(500); // enough indices for FaceMesh-based outlines

  beforeEach(() => {
    // Reset adapter override between tests
    setAdapter('facemesh');
  });

  it('falls back to landmark-derived hints for facemesh', async () => {
    setAdapter('facemesh');
    const hints = await regionHints(null, points);
    expect(Array.isArray(hints)).toBe(true);
    expect(hints.length).toBeGreaterThan(0);
    // Expect at least one brows and one nose entry
    expect(hints.some((h) => h.region === 'brows')).toBe(true);
    expect(hints.some((h) => h.region === 'nose')).toBe(true);
  });

  it('uses parsing adapter path (stub) and still returns brows/nose', async () => {
    setAdapter('parsing');
    const hints = await regionHints(null, points);
    expect(hints.some((h) => h.region === 'brows')).toBe(true);
    expect(hints.some((h) => h.region === 'nose')).toBe(true);
  });

  it('switching adapters does not change basic hint availability', async () => {
    setAdapter('parsing');
    const a = await regionHints(null, points);
    setAdapter('facemesh');
    const b = await regionHints(null, points);
    expect(a.length).toBeGreaterThan(0);
    expect(b.length).toBeGreaterThan(0);
  });
});