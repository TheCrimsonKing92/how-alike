import { describe, it, expect } from 'vitest';
import { generateNarrativeFromScores } from '../lib/narrative';
import type { RegionScore } from '../lib/segmentation-scoring';

describe('narrative', () => {
  describe('generateNarrativeFromScores', () => {
    it('generates descriptions for all regions', () => {
      const scores: RegionScore[] = [
        { region: 'eyes', score: 0.95 },
        { region: 'nose', score: 0.85 },
        { region: 'mouth', score: 0.70 },
        { region: 'brows', score: 0.50 },
      ];

      const narratives = generateNarrativeFromScores(scores);

      expect(narratives).toHaveLength(4);
      expect(narratives[0].region).toBe('eyes');
      expect(narratives[0].text).toBeTruthy();
      expect(narratives[1].region).toBe('nose');
      expect(narratives[2].region).toBe('mouth');
      expect(narratives[3].region).toBe('brows');
    });

    it('generates "very similar" description for high scores', () => {
      const scores: RegionScore[] = [
        { region: 'eyes', score: 0.95 },
      ];

      const narratives = generateNarrativeFromScores(scores);

      expect(narratives[0].text).toContain('nearly identical');
    });

    it('generates "similar" description for good scores', () => {
      const scores: RegionScore[] = [
        { region: 'nose', score: 0.80 },
      ];

      const narratives = generateNarrativeFromScores(scores);

      expect(narratives[0].text).toContain('similar');
      expect(narratives[0].text).not.toContain('nearly identical');
    });

    it('generates "different" description for low scores', () => {
      const scores: RegionScore[] = [
        { region: 'mouth', score: 0.35 },
      ];

      const narratives = generateNarrativeFromScores(scores);

      expect(narratives[0].text).toContain('differ');
    });

    it('generates "very different" description for very low scores', () => {
      const scores: RegionScore[] = [
        { region: 'jaw', score: 0.15 },
      ];

      const narratives = generateNarrativeFromScores(scores);

      expect(narratives[0].text).toContain('quite different');
    });

    it('handles all supported regions', () => {
      const regions = ['eyes', 'brows', 'nose', 'mouth', 'jaw', 'ears', 'skin', 'hair', 'neck', 'eyeglasses'];
      const scores: RegionScore[] = regions.map(region => ({ region, score: 0.85 }));

      const narratives = generateNarrativeFromScores(scores);

      expect(narratives).toHaveLength(regions.length);
      for (const narrative of narratives) {
        expect(narrative.text).toBeTruthy();
        expect(narrative.text.length).toBeGreaterThan(10);
      }
    });

    it('skips unknown regions', () => {
      const scores: RegionScore[] = [
        { region: 'eyes', score: 0.85 },
        { region: 'unknown_region', score: 0.85 },
        { region: 'nose', score: 0.85 },
      ];

      const narratives = generateNarrativeFromScores(scores);

      expect(narratives).toHaveLength(2);
      expect(narratives[0].region).toBe('eyes');
      expect(narratives[1].region).toBe('nose');
    });

    it('returns empty array for empty input', () => {
      const narratives = generateNarrativeFromScores([]);

      expect(narratives).toHaveLength(0);
    });

    it('handles edge case scores correctly', () => {
      const scores: RegionScore[] = [
        { region: 'eyes', score: 1.0 },  // perfect score
        { region: 'nose', score: 0.0 },  // worst score
        { region: 'mouth', score: 0.90 }, // boundary (very-similar)
        { region: 'brows', score: 0.75 }, // boundary (similar)
        { region: 'jaw', score: 0.60 },   // boundary (somewhat-similar)
      ];

      const narratives = generateNarrativeFromScores(scores);

      expect(narratives).toHaveLength(5);
      expect(narratives[0].text).toContain('nearly identical'); // 1.0
      expect(narratives[1].text).toContain('quite different');  // 0.0
      expect(narratives[2].text).toContain('nearly identical'); // 0.90
      expect(narratives[3].text).toContain('similar');          // 0.75
    });
  });
});
