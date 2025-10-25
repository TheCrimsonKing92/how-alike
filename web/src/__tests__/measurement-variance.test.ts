/**
 * Measure actual variance in feature measurements from MediaPipe
 *
 * This test simulates running the same image multiple times and
 * measures how much the derived feature measurements vary.
 */

import { describe, it, expect } from 'vitest';
import { createCanonicalLandmarks } from './fixtures/canonical-face';
import { extractFeatureMeasurements } from '@/lib/feature-axes';
import { classifyFeatures } from '@/lib/axis-classifiers';
import { LEFT_EYE_CENTER_INDICES, RIGHT_EYE_CENTER_INDICES } from '@/lib/regions';
import { AXIS_NOISE_TOLERANCE, type ToleranceConfig } from '@/lib/feature-comparisons';
import type { Point } from '@/lib/points';

type AxisValueMap = Record<string, number>;

const BASE_LANDMARKS = createCanonicalLandmarks();
const BASE_AXIS_VALUES = computeAxisValues(BASE_LANDMARKS);
const AXES = Object.keys(AXIS_NOISE_TOLERANCE);
// Only eye axes have measured tolerances so far; others remain TODO.
const CALIBRATED_AXES = new Set<string>(['canthal tilt', 'eye size', 'interocular distance']);

describe('Measurement variance analysis', () => {
  it('0.5% jitter stays within one-third of the tolerance per axis', () => {
    const seeds = [1, 5, 11, 17, 23, 29];
    const noiseAmplitude = 0.005; // 0.5% coordinate shift in normalized space
    if (process.env.VARIANCE_LOG === '1') {
      console.log('Baseline canthal tilt (deg):', BASE_AXIS_VALUES['canthal tilt']);
    }
    const axisStats: Record<string, { type: 'absolute' | 'relative'; limit: number; metric: number }> = Object.fromEntries(
      AXES.map((axis) => {
        const config = resolveToleranceConfig(AXIS_NOISE_TOLERANCE[axis]);
        return [axis, { ...config, metric: 0 }];
      })
    );

    for (const seed of seeds) {
      const jittered = jitterLandmarks(BASE_LANDMARKS, noiseAmplitude, seed);
      const axisValues = computeAxisValues(jittered);

      for (const axis of AXES) {
        const baseline = BASE_AXIS_VALUES[axis];
        const variant = axisValues[axis];
        if (baseline === undefined || variant === undefined) {
          throw new Error(`Axis "${axis}" missing from measurements`);
        }
        const stats = axisStats[axis];
        const diff =
          stats.type === 'absolute'
            ? Math.abs(variant - baseline)
            : normalizedDifference(baseline, variant);
        if (diff > stats.metric) {
          stats.metric = diff;
        }
      }
    }

    if (process.env.VARIANCE_LOG === '1') {
      const table = AXES.map(axis => ({
        axis,
        observed: axisStats[axis].metric,
        tolerance: axisStats[axis].limit,
        ratio: axisStats[axis].metric / axisStats[axis].limit,
        mode: axisStats[axis].type,
      }));
      console.table(table);
    }

    for (const axis of AXES) {
      const { limit, metric } = axisStats[axis];
      if (!CALIBRATED_AXES.has(axis)) {
        continue;
      }
      expect(metric).toBeLessThanOrEqual(limit / 3 + 1e-6);
    }
  });
});

function resolveToleranceConfig(config: ToleranceConfig): { type: 'absolute' | 'relative'; limit: number } {
  if (typeof config === 'object' && 'absolute' in config) {
    return { type: 'absolute', limit: config.absolute };
  }
  return { type: 'relative', limit: config };
}

function computeAxisValues(landmarks: Point[]): AxisValueMap {
  const leftEye = averagePoint(LEFT_EYE_CENTER_INDICES, landmarks);
  const rightEye = averagePoint(RIGHT_EYE_CENTER_INDICES, landmarks);
  const measurements = extractFeatureMeasurements(landmarks, leftEye, rightEye);
  const classifications = classifyFeatures(measurements);

  const axisMap: AxisValueMap = {};
  for (const feature of Object.values(classifications)) {
    for (const axis of feature) {
      axisMap[axis.axis] = axis.rawMeasurement;
    }
  }
  return axisMap;
}

function averagePoint(indices: number[], landmarks: Point[]): Point {
  let x = 0;
  let y = 0;
  let z = 0;
  const count = indices.length || 1;
  for (const index of indices) {
    const pt = landmarks[index] ?? { x: 0, y: 0, z: 0 };
    x += pt.x;
    y += pt.y;
    z += pt.z ?? 0;
  }
  return { x: x / count, y: y / count, z: z / count };
}

function jitterLandmarks(base: Point[], amplitude: number, seed: number): Point[] {
  return base.map((pt, idx) => ({
    x: pt.x + amplitude * deterministicNoise(idx, 0, seed),
    y: pt.y + amplitude * deterministicNoise(idx, 1, seed),
    z: (pt.z ?? 0) + amplitude * deterministicNoise(idx, 2, seed),
  }));
}

function deterministicNoise(index: number, axis: number, seed: number): number {
  const raw = Math.sin(index * 12.9898 + axis * 78.233 + seed * 0.5) * 43758.5453;
  return ((raw - Math.floor(raw)) - 0.5) * 2; // range ~[-1, 1]
}

function normalizedDifference(a: number, b: number): number {
  const avgMagnitude = (Math.abs(a) + Math.abs(b)) / 2 || 1;
  return Math.abs(a - b) / avgMagnitude;
}
