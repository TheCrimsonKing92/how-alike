import { describe, it, expect } from 'vitest';
import { parsingClassConfig } from '@/models/parsing-config';

describe('parsing-config', () => {
  describe('parsingClassConfig', () => {
    it('should use correct CelebAMask-HQ class IDs', () => {
      const config = parsingClassConfig();

      // CelebAMask-HQ standard mapping:
      // 0: background, 1: skin, 2: nose, 3: eyeglasses, 4: l_eye, 5: r_eye,
      // 6: l_brow, 7: r_brow, 8: l_ear, 9: r_ear, 10: mouth, 11: u_lip, 12: l_lip,
      // 13: hair, 14: hat, 15: earring, 16: necklace, 17: neck, 18: cloth

      // Eyebrows
      expect(config.browLeft).toBe(6); // Left eyebrow
      expect(config.browRight).toBe(7); // Right eyebrow

      // Nose
      expect(config.nosePrimary).toBe(2); // Nose

      // Sets should include primary + aliases
      expect(config.browSet).toContain(6);
      expect(config.browSet).toContain(7);
      expect(config.browSet).toContain(3); // Eyeglasses alias for brows

      expect(config.noseSet).toContain(2);
      expect(config.noseSet).toContain(3); // Eyeglasses alias for nose
    });

    it('should not use incorrect class IDs from old mapping', () => {
      const config = parsingClassConfig();

      // These were the WRONG class IDs before we fixed the mapping
      expect(config.browLeft).not.toBe(2); // Was wrongly mapped to nose
      expect(config.browRight).not.toBe(3); // Was wrongly mapped to eyeglasses
      expect(config.nosePrimary).not.toBe(10); // Was wrongly mapped to mouth
    });

    it('should have unique classes in sets', () => {
      const config = parsingClassConfig();

      // Sets should not have duplicates
      expect(new Set(config.browSet).size).toBe(config.browSet.length);
      expect(new Set(config.noseSet).size).toBe(config.noseSet.length);
    });

    it('should filter out negative class IDs', () => {
      const config = parsingClassConfig();

      // All class IDs should be non-negative
      expect(config.browSet.every(id => id >= 0)).toBe(true);
      expect(config.noseSet.every(id => id >= 0)).toBe(true);
    });
  });
});
