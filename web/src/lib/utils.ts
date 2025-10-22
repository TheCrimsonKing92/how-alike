import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Clamp a value to a range [min, max]
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

/**
 * Compute the center point of a set of landmarks by averaging their positions
 */
export function computeLandmarkCenter(
  landmarks: { x: number; y: number }[],
  indices: number[]
): { x: number; y: number } {
  let sumX = 0, sumY = 0;
  for (const i of indices) {
    sumX += landmarks[i].x;
    sumY += landmarks[i].y;
  }
  const count = indices.length;
  return { x: sumX / count, y: sumY / count };
}

/**
 * Compute Euclidean distance between two points
 */
export function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
