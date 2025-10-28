# Test Gap Analysis - Why Tests Didn't Catch Measurement Regressions

**Date**: 2025-10-26

## Summary

The test suite (236 tests, all passing) failed to catch critical measurement bugs:
1. Interocular distance false "wide-set" classifications
2. Inverted brow shape classifications (arched ↔ straight)

These bugs were only discovered through manual visual inspection of real sample images.

## Root Causes

### 1. Tests Validated Implementation, Not Correctness

**Problem**: Tests verified that code ran consistently, but didn't verify that results matched reality.

**Example - Brow Shape Test**:
```typescript
// feature-axes.test.ts:412-424
it('should extract brow measurements', () => {
  const measurements = extractBrowMeasurements(landmarks, leftEye, rightEye);

  expect(measurements.shape).toBeGreaterThanOrEqual(0);
  expect(measurements.position).toBeGreaterThan(0);
  expect(measurements.length).toBeGreaterThan(0);
});
```

**What it tests**: Values are positive numbers
**What it DOESN'T test**: Whether shape=0.168 means "arched" or "straight"
**Result**: Inverted logic passes all tests

### 2. No Ground Truth / Oracle Data

**Problem**: All tests used synthetic data (canonical face) with no known-correct classifications.

**What was missing**:
- No test cases with manually verified labels: "this face IS arched, should classify as arched"
- No real images with ground truth annotations
- No cross-validation against anthropometric standards
- No visual regression testing

**Example of what we SHOULD have**:
```typescript
it('should classify visually arched brows as "arched"', () => {
  // Face with clearly arched brows (human-verified)
  const archedBrowFace = loadTestImage('arched-brows.jpg');
  const result = classifyBrows(measurements);

  expect(result.value).toBe('arched'); // Ground truth
});
```

### 3. Measurement Variance Tests Only Check Stability

**Purpose of variance tests**: Ensure small input changes don't cause wild output swings

**From measurement-variance.test.ts**:
```typescript
// Tests that adding ±0.01 jitter doesn't change classification
const jittered = addJitter(canonical, 0.01);
const delta = Math.abs(original.shape - jittered.shape);
expect(delta).toBeLessThan(BROW_SHAPE_TOLERANCE);
```

**What it tests**: Measurements are stable/robust
**What it DOESN'T test**: Whether base measurement is correct
**Result**: Consistently wrong measurements pass stability tests

### 4. Semantic Bugs vs. Implementation Bugs

**Implementation bugs** (tests catch these):
- Null pointer exceptions
- Math errors (divide by zero)
- Type mismatches
- Crashes

**Semantic bugs** (tests missed these):
- Using wrong landmarks (gonion vs bizygomatic)
- Using wrong grouping (wrong "mid" for brow arch)
- Inverted logic (Math.abs() loses sign information)
- Wrong normalization denominator

**Why semantic bugs slip through**:
- Code runs correctly
- Values are in valid ranges
- No exceptions thrown
- Just produces wrong MEANING

### 5. Tests Written After (Buggy) Implementation

**Development sequence**:
1. Write feature extraction code
2. Code produces values
3. Write tests that validate those values
4. Tests pass ✓

**Problem**: Tests validated the buggy behavior as "correct"

**TDD alternative**:
1. Write tests with known-correct expected values FIRST
2. Implementation must match expectations
3. Tests fail until implementation is correct

### 6. No Integration Tests with Real Data

**Unit tests** (what we have):
- Test isolated functions
- Use synthetic inputs
- Fast, deterministic

**Integration tests** (what we're missing):
- End-to-end: image → detection → classification → narrative
- Real images with known outcomes
- Visual verification of results

**Example missing test**:
```typescript
describe('Real Image Integration', () => {
  it('should correctly classify Subject A features', async () => {
    const result = await analyzeImage('subject-a.jpg');

    // Known ground truth from visual inspection
    expect(result.brows.shape).toBe('arched');
    expect(result.eyes.interocularDistance).toBe('balanced');
    // etc.
  });
});
```

## Specific Test Failures

### Issue 1: Interocular Distance

**Bug**: Using gonion (jaw) instead of bizygomatic (cheekbone) width

**Why tests didn't catch it**:

1. **No anthropometric validation**:
   ```typescript
   // Missing test:
   it('should use bizygomatic width for face width', () => {
     const fw = faceWidth(landmarks);
     const gonionW = distance(landmarks[234], landmarks[454]);
     const cheekW = distance(landmarks[116], landmarks[345]);

     // Face width should be >= gonion on tapered faces
     expect(fw).toBeGreaterThanOrEqual(gonionW);
   });
   ```

2. **No classification accuracy tests**:
   ```typescript
   // Missing test:
   it('should classify normal IPD as balanced', () => {
     // Canonical face has typical proportions
     const ratio = 0.413; // Known normal value
     expect(classifyInterocularDistance(ratio).value).toBe('balanced');
   });
   ```

3. **Existing tests just checked range**:
   ```typescript
   // feature-axes.test.ts - what we had:
   expect(eyes.interocularDistance).toBeGreaterThan(0);
   expect(eyes.interocularDistance).toBeLessThan(1);
   // This passes whether we use gonion OR bizygomatic!
   ```

### Issue 2: Brow Shape

**Bug**: Using wrong landmark grouping + Math.abs() loses sign

**Why tests didn't catch it**:

1. **No landmark topology validation**:
   ```typescript
   // Missing test:
   it('should use the highest brow point for arch measurement', () => {
     const allBrowPts = LEFT_EYEBROW_INDICES.map(i => landmarks[i]);
     const peakUsed = findPeakInMeasurement(); // actual implementation
     const peakActual = allBrowPts.reduce((highest, p) =>
       p.y < highest.y ? p : highest
     );

     expect(peakUsed).toEqual(peakActual);
   });
   ```

2. **No sign preservation test**:
   ```typescript
   // Missing test:
   it('should preserve positive arc height for arched brows', () => {
     // Arched brow: peak ABOVE baseline
     const arcHeight = baselineY - peakY;
     expect(arcHeight).toBeGreaterThan(0); // Should be positive

     // Using Math.abs() would make this always pass!
   });
   ```

3. **Brow shape diagnostic showed the issue**:
   - Mid centroid Y=0.8013 BELOW baseline Y=0.7878 (drooping)
   - Tests never checked this relationship
   - Tests only checked that shape ratio was a positive number

## What Good Tests Would Look Like

### 1. Ground Truth Test Suite

```typescript
describe('Classification Accuracy (Ground Truth)', () => {
  const testCases = [
    {
      name: 'Subject A - Professional photo',
      image: 'subject-a.jpg',
      groundTruth: {
        brows: { shape: 'arched' },
        eyes: { interocularDistance: 'balanced', canthalTilt: 'positive' },
        // ... more features
      }
    },
    {
      name: 'Subject B - Outdoor photo',
      image: 'subject-b.jpg',
      groundTruth: {
        brows: { shape: 'straight' },
        eyes: { interocularDistance: 'balanced' },
        // ...
      }
    },
  ];

  testCases.forEach(({ name, image, groundTruth }) => {
    it(`should correctly classify ${name}`, async () => {
      const result = await analyzeImage(image);

      Object.entries(groundTruth).forEach(([feature, expected]) => {
        Object.entries(expected).forEach(([axis, value]) => {
          expect(result[feature][axis]).toBe(value);
        });
      });
    });
  });
});
```

### 2. Anatomical Correctness Tests

```typescript
describe('Anatomical Correctness', () => {
  it('should use widest face measurement for normalization', () => {
    const fw = faceWidth(landmarks);

    // Check all candidate widths
    const gonion = distance(landmarks[234], landmarks[454]);
    const orbital = distance(landmarks[132], landmarks[361]);
    const cheek = distance(landmarks[116], landmarks[345]);

    // Face width should be >= all components
    expect(fw).toBeGreaterThanOrEqual(gonion);
    expect(fw).toBeGreaterThanOrEqual(orbital);
    expect(fw).toBeGreaterThanOrEqual(cheek);
  });

  it('should measure brow arch using highest point', () => {
    const measurements = extractBrowMeasurements(landmarks, leftEye, rightEye);

    // Manually find peak (highest = smallest Y)
    const browPoints = LEFT_EYEBROW_INDICES.map(i => landmarks[i]);
    const peak = browPoints.reduce((h, p) => p.y < h.y ? p : h);

    // Verify peak is above baseline (smaller Y)
    const baseline = (browPoints[0].y + browPoints[9].y) / 2;
    const expectedArcHeight = baseline - peak.y;

    // The measurement should reflect this arc height
    expect(Math.abs(measurements.shape - expectedArcHeight / browWidth))
      .toBeLessThan(0.05);
  });
});
```

### 3. Reference Value Tests

```typescript
describe('Reference Values (Anthropometric Standards)', () => {
  it('should produce IPD ratios in typical human range', () => {
    // Typical human IPD/face-width ratio: 0.35-0.45
    const ratio = measurements.eyes.interocularDistance;
    expect(ratio).toBeGreaterThan(0.30);
    expect(ratio).toBeLessThan(0.50);
  });

  it('should classify canonical face IPD as balanced', () => {
    // Canonical model represents average proportions
    const canonical = createCanonicalLandmarks();
    const measurements = extractEyeMeasurements(/*...*/);
    const classification = classifyInterocularDistance(measurements.interocularDistance);

    expect(classification.value).toBe('balanced');
  });
});
```

### 4. Visual Regression Tests

```typescript
describe('Visual Regression', () => {
  it('should produce consistent overlay visualizations', async () => {
    const result = await analyzeImage('subject-a.jpg');
    const visualization = renderOverlay(result);

    // Compare against known-good reference image
    const diff = await compareImages(
      visualization,
      'snapshots/subject-a-overlay.png'
    );

    expect(diff.percentDifferent).toBeLessThan(1.0);
  });
});
```

## Lessons Learned

### 1. Test the SPECIFICATION, not the IMPLEMENTATION

**Bad** (implementation-driven):
```typescript
it('should return a number', () => {
  expect(typeof result).toBe('number'); // Too weak
});
```

**Good** (specification-driven):
```typescript
it('should classify IPD ratio 0.35 as close-set', () => {
  expect(classifyIPD(0.35).value).toBe('close-set');
});
```

### 2. Always Include Ground Truth

**Requirements**:
- Manually verified test cases
- Known-correct reference values
- Real-world validation data
- Cross-reference with standards (anthropometric literature)

### 3. Test at Multiple Levels

**Pyramid**:
```
        /\
       /  \      E2E (few): Real images, full pipeline
      /____\
     /      \    Integration (some): Feature extraction → classification
    /________\
   /          \  Unit (many): Individual functions, edge cases
  /__________\
```

### 4. Semantic Validation

**Beyond "it runs"**:
- Does it produce MEANINGFUL results?
- Do results match VISUAL INSPECTION?
- Are values in REALISTIC RANGES?
- Do classifications make SEMANTIC SENSE?

### 5. Continuous Validation

**Process**:
1. When bug found in production → add test case
2. Regular manual spot-checks of real results
3. Visual regression testing
4. Periodic validation against new ground truth data

## Recommendations

### Immediate Actions

1. **Create ground truth test suite**:
   - Annotate 10-20 diverse faces with correct classifications
   - Add tests that verify classifications match annotations
   - Include both sample images (Subject A, B)

2. **Add semantic validation tests**:
   - Test anatomical correctness (widest point, highest point, etc.)
   - Test value ranges against anthropometric standards
   - Test that classifications match visual intuition

3. **Add visual regression tests**:
   - Generate overlay images for test cases
   - Compare against reference snapshots
   - Alert on visual changes

### Long-term Improvements

1. **TDD for new features**:
   - Write tests with expected values FIRST
   - Implement until tests pass
   - Never commit code without corresponding tests

2. **Expand test data**:
   - Diverse face shapes (oval, square, heart, round)
   - Diverse features (arched/straight brows, various IPD)
   - Edge cases (extreme angles, partial faces, accessories)

3. **Cross-validation**:
   - Compare results to other face analysis tools
   - Validate against published anthropometric datasets
   - Get human expert annotations for validation set

4. **Continuous integration**:
   - Run full suite (unit + integration + visual) on every PR
   - Block merges if ground truth tests fail
   - Regular manual audits of production results

## Conclusion

**The test suite passed because it tested the wrong thing**:
- ✓ Code runs without crashing
- ✓ Values are in valid ranges
- ✓ Measurements are stable/consistent
- ✗ Results match reality
- ✗ Classifications are correct
- ✗ Visual outputs make sense

**Moving forward**:
- Every bug found → new test case
- Always include ground truth validation
- Test specifications, not implementations
- Validate semantic correctness, not just technical correctness

This is a valuable lesson in test design: **passing tests don't mean correct code**.

---

## CRITICAL: Canonical Face Model - Testing vs Calibration

**Date**: 2025-10-26

### The Canonical Model Paradox

After implementing fixes based on canonical face validation, real images still showed incorrect classifications. Consultation with OpenAI (GPT-5) revealed a fundamental misunderstanding:

**The canonical face model serves TWO distinct purposes, and we conflated them:**

### Purpose 1: Testing Code Correctness ✓ VALID USE

The canonical face model IS appropriate for:

- **Stability testing**: Ensuring measurements are consistent across runs
- **Regression testing**: Detecting when code changes break existing behavior
- **Unit testing**: Verifying functions execute without crashes
- **Fixture data**: Providing deterministic input for automated tests
- **Landmark topology**: Understanding MediaPipe's landmark relationships

**Example valid test:**
```typescript
it('should produce consistent measurements', () => {
  const m1 = extractFeatures(canonical);
  const m2 = extractFeatures(canonical);
  expect(m1.eyes.interocularDistance).toBe(m2.eyes.interocularDistance);
});
```

### Purpose 2: Calibrating Thresholds ✗ INVALID USE

The canonical face model is NOT appropriate for:

- **Setting classification boundaries** (e.g., "0.41 = balanced, so >0.42 = wide-set")
- **Defining "normal" proportions** (model has atypical proportions)
- **Ground truth for human perception** (it's geometric, not anthropometric)
- **Threshold calibration** (must use real labeled faces)
- **Validation of correctness** (only tests consistency, not accuracy)

**Example invalid reasoning:**
```typescript
// WRONG: Assumes canonical model represents "balanced"
const canonicalRatio = 0.41;
const WIDE_SET_THRESHOLD = canonicalRatio + 0.01; // ✗ Bad assumption!

// RIGHT: Calibrate on labeled real faces
const labeledFaces = [
  { ratio: 0.48, label: 'balanced' },  // Real human 1
  { ratio: 0.52, label: 'balanced' },  // Real human 2
  { ratio: 0.65, label: 'wide-set' },  // Real human 3
  // ... derive thresholds from distribution
];
```

### Why the Canonical Model Has Atypical Proportions

From OpenAI consultation:
> "Do not calibrate thresholds to the canonical FaceMesh model—its proportions are not representative (e.g., atypical cheek/jaw widths)."

**Observed atypical features:**
- Gonion (jaw) wider than bizygomatic (cheekbones) - reversed from typical humans
- Brow arch subtle compared to real pronounced arches
- Proportions optimized for geometric consistency, not anthropometric averages

**The model's actual purpose** (from MediaPipe documentation):
- Provides consistent 3D mesh topology for all detected faces
- Enables consistent landmark indices across all faces
- Serves as canonical coordinate system for normalization
- NOT intended as "average human face" or "reference for normal proportions"

### What Went Wrong in Our Approach

**Phase 1-2 work:**
1. ✓ Used canonical face to test code stability → CORRECT
2. ✓ Verified measurements were consistent → CORRECT
3. ✗ Assumed canonical ratio (0.41) meant "balanced" → WRONG
4. ✗ Set thresholds relative to canonical measurements → WRONG
5. ✗ Expected real faces to match canonical thresholds → WRONG

**Result**: All code worked correctly, but thresholds were wrong because they were calibrated to an atypical reference model.

### The Correct Two-Phase Approach

**Phase 1: Test with Canonical Face**
- Use for automated regression tests
- Verify code doesn't crash
- Check measurement stability
- Validate internal consistency
- ✓ All our Phase 1-2 work was valid for THIS purpose

**Phase 2: Calibrate with Real Faces**
- Collect real images with human-labeled ground truth
- Measure features on diverse real faces
- Derive thresholds from distribution of real measurements
- Validate against human perception
- ✗ We SKIPPED this phase - assumed canonical model was ground truth

### Implications for Our Project

**What stays valid:**
- All diagnostic tests (ipd-diagnostic, brow-shape-diagnostic, etc.) → Still useful
- Measurement variance tests → Still valid for stability
- Code fixes (dynamic peak finding, max width) → Still correct
- 236 passing tests → Still verify code correctness

**What needs revision:**
- ALL classification thresholds in `axis-classifiers.ts`
- Must be recalibrated against real labeled faces
- Current thresholds (e.g., >0.42 for wide-set) are arbitrary
- New thresholds from OpenAI: ICD/eye-width <0.9, 0.9-1.1, >1.1

**Documentation updates needed:**
- Add warning to test documentation about canonical model purpose
- Document that thresholds are empirically calibrated, not theoretical
- Add process for threshold recalibration when adding new features

### Best Practices Going Forward

1. **Separate concerns in testing:**
   ```typescript
   // Good: Tests code stability
   describe('Feature Extraction - Stability', () => {
     const canonical = createCanonicalLandmarks();
     it('produces consistent results', () => { /* ... */ });
   });

   // Good: Tests classification accuracy
   describe('Feature Classification - Ground Truth', () => {
     const realFaces = loadLabeledTestSet();
     it('matches human assessment', () => { /* ... */ });
   });
   ```

2. **Document reference data sources:**
   - Canonical model → code testing only
   - Real labeled faces → threshold calibration
   - Literature values → sanity checks
   - User validation → final verification

3. **Make assumptions explicit:**
   ```typescript
   // Bad: Hidden assumption
   const THRESHOLD = 0.42;

   // Good: Explicit source
   const THRESHOLD = 0.42; // Empirically calibrated from 100 labeled faces
   ```

4. **Periodic recalibration:**
   - Re-calibrate thresholds when:
     - Adding support for new demographics
     - User feedback suggests misclassifications
     - Measurement methods change
     - New anthropometric research available

### Key Takeaway

**The canonical face model is a geometric tool, not an anthropometric reference.**

Use it to test **code correctness**, not to define **human normal**.

This distinction is critical: a model can be geometrically perfect but anthropometrically atypical.
