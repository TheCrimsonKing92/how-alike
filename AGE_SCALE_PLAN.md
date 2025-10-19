# Age and Scale Awareness Implementation Plan

## Status: Planning → Quick Win → Full Implementation

## Problem Statement

Current morphological congruence system produces false positives when comparing faces of different ages (e.g., adult vs child) because:

1. **Coarse categorical bins**: "average" nose width captures both 0.38 and 0.45, resulting in 100% agreement despite 18% actual difference
2. **No age awareness**: Children and adults can have similar *proportions* (both "balanced" jaw) but vastly different *absolute characteristics*
3. **Scale agnostic**: System doesn't account for non-linear (allometric) growth patterns
4. **Missing maturity markers**: No detection of developmental stage (round child face vs angular adult face)

**Observed issue**: Adult vs unrelated child scored 80.5% congruence with many 100% feature matches, while segmentation-based similarity correctly identified them as quite different.

## Architectural Goals

1. **Preserve categorical narratives**: Keep human-readable descriptions ("both have average nose width")
2. **Add continuous precision**: Use raw measurements to prevent false 100% scores
3. **Detect age/maturity gaps**: Identify cross-age comparisons and adjust accordingly
4. **Provide transparency**: Show age warnings and maturity estimates in UI
5. **Backward compatible**: Existing same-age comparisons should improve, not regress

## Core Concepts

### Facial Maturity Index (FMI)
A 0-1 scale indicating developmental stage:
- **0.0-0.3**: Child (large forehead, recessed chin, round jaw, proportionally large eyes)
- **0.3-0.6**: Adolescent (transitional proportions)
- **0.6-1.0**: Adult (developed nose projection, square jaw, smaller eye-to-face ratio)

### Allometric Growth
Non-uniform scaling with age:
- **Positive allometry** (grows faster than face): nose (1.15×), jaw (1.20×), chin projection (1.25×)
- **Negative allometry** (grows slower): eyes (0.85×), forehead (0.90×)
- **Isometric** (scales proportionally): mouth width (1.0×)

### Hybrid Similarity Scoring
Combines categorical agreement with continuous measurement distance:
```
axisScore = categorical_agreement * 0.4 + continuous_similarity * 0.6
```
Where:
- `categorical_agreement`: 1.0 if same category, 0.0 if different
- `continuous_similarity`: 1.0 - min(percentDiff / 100, 1.0)

Example: "average (0.38) vs average (0.45)" → 0.4 + (1.0 - 0.18) * 0.6 = 0.89 (89% instead of 100%)

## Implementation Phases

---

## Phase 1: Hybrid Scoring (Quick Win) ⚡
**Goal**: Immediately improve discrimination by using continuous measurements
**Timeline**: 1-2 hours
**Files**: `feature-comparisons.ts`, tests

### Changes

#### 1.1 Add Continuous Similarity Function
```typescript
// In feature-comparisons.ts

/**
 * Compute continuous similarity based on raw measurement difference
 * Returns 1.0 for identical, 0.0 for 100%+ different
 */
function computeContinuousSimilarity(comparison: AxisComparison): number {
  // If no percentDiff available, fall back to categorical only
  if (comparison.percentDiff === undefined) {
    return comparison.agreement ? 1.0 : 0.0;
  }

  // Linear decay: 0% diff = 1.0, 100% diff = 0.0
  const similarity = 1.0 - Math.min(comparison.percentDiff / 100, 1.0);

  return similarity;
}

/**
 * Hybrid scoring: blend categorical and continuous
 */
function computeAxisScore(comparison: AxisComparison): number {
  const categorical = comparison.agreement ? 1.0 : 0.0;
  const continuous = computeContinuousSimilarity(comparison);

  // Weighted blend: 40% categorical, 60% continuous
  // This means "same category" gives you base 0.4, but must be close in actual value to reach 1.0
  return categorical * 0.4 + continuous * 0.6;
}
```

#### 1.2 Update Feature Agreement Scoring
```typescript
// Replace existing scoreFeatureAgreement() logic

export function scoreFeatureAgreement(comparison: FeatureComparison): number {
  if (comparison.axes.length === 0) return 0;

  // Use hybrid scoring for each axis
  const axisScores = comparison.axes.map(axis => computeAxisScore(axis));

  // Average across axes
  const sum = axisScores.reduce((a, b) => a + b, 0);
  return sum / axisScores.length;
}
```

#### 1.3 Update Overall Congruence
```typescript
// Update computeCongruenceScore() to use new scoring

export function computeCongruenceScore(comparisons: FeatureComparison[]): number {
  if (comparisons.length === 0) return 0;

  // Each comparison already has overallAgreement from scoreFeatureAgreement()
  const sum = comparisons.reduce((acc, c) => acc + c.overallAgreement, 0);
  return sum / comparisons.length;
}
```

### Testing
- Update existing tests to expect hybrid scores (not pure categorical)
- Add new test cases for "same category, different measurements"
- Validate on adult-child pair (should reduce from 80.5% to ~60%)

### Expected Impact
- Adult vs child: 80.5% → 55-65% (more realistic)
- Same-age similar faces: 85% → 80-85% (slight decrease, more accurate)
- Same-age identical twins: 95% → 92-98% (robust)

---

## Phase 2: Age Detection & Basic Penalty 🧒👨
**Goal**: Detect maturity differences and apply similarity penalty
**Timeline**: 1 day
**Files**: `feature-axes.ts`, `feature-comparisons.ts`, `types.ts`

### Changes

#### 2.1 Add Maturity Metrics Interface
```typescript
// In feature-axes.ts or new maturity.ts

export interface MaturityMetrics {
  foreheadToFaceRatio: number;  // Children: 0.40-0.50, Adults: 0.30-0.38
  eyeToFaceRatio: number;       // Children: higher (0.15+), Adults: lower (0.10-0.13)
  chinProjection: number;       // Children: <0.08, Adults: 0.12+
  jawSquareness: number;        // Children: >140° (round), Adults: 120-130° (angular)
  noseBridgeDepth: number;      // Children: flat, Adults: projected
  facialThirdsBalance: number;  // Children: top-heavy, Adults: balanced
}

export interface FacialMaturityEstimate {
  score: number;           // 0-1 scale (0=child, 1=adult)
  confidence: number;      // 0-1 how confident we are
  indicators: string[];    // ["Large forehead", "Recessed chin"]
}
```

#### 2.2 Implement Maturity Estimator
```typescript
/**
 * Estimate facial maturity from measurements
 * Uses multiple indicators for robustness
 */
export function estimateFacialMaturity(
  measurements: FeatureMeasurements
): FacialMaturityEstimate {
  const indicators: { value: number; weight: number; name: string }[] = [];

  // Forehead ratio (reliable indicator)
  const foreheadRatio = measurements.forehead.height /
                        measurements.faceShape.faceHeight;
  if (foreheadRatio < 0.38) {
    indicators.push({ value: 1.0, weight: 2.0, name: "Small forehead (adult)" });
  } else if (foreheadRatio > 0.45) {
    indicators.push({ value: 0.0, weight: 2.0, name: "Large forehead (child)" });
  } else {
    indicators.push({ value: 0.5, weight: 1.5, name: "Medium forehead" });
  }

  // Jaw angularity
  const jawAngle = measurements.jaw.mandibularAngle;
  if (jawAngle < 125) {
    indicators.push({ value: 1.0, weight: 1.5, name: "Square jaw (adult)" });
  } else if (jawAngle > 135) {
    indicators.push({ value: 0.0, weight: 1.5, name: "Round jaw (child)" });
  }

  // Chin projection
  const chinProj = measurements.jaw.chinProjection;
  if (chinProj > 0.12) {
    indicators.push({ value: 1.0, weight: 1.8, name: "Prominent chin (adult)" });
  } else if (chinProj < 0.08) {
    indicators.push({ value: 0.0, weight: 1.8, name: "Recessed chin (child)" });
  }

  // Nose projection
  const noseProj = measurements.nose.tipProjection;
  if (noseProj > 0.15) {
    indicators.push({ value: 1.0, weight: 1.3, name: "Projected nose (adult)" });
  } else if (noseProj < 0.10) {
    indicators.push({ value: 0.0, weight: 1.3, name: "Flat nose bridge (child)" });
  }

  // Facial thirds (children are top-heavy)
  const thirds = measurements.faceShape.facialThirds;
  const upperDominance = thirds.upper / thirds.middle;
  if (upperDominance < 0.95) {
    indicators.push({ value: 1.0, weight: 1.2, name: "Balanced thirds (adult)" });
  } else if (upperDominance > 1.15) {
    indicators.push({ value: 0.0, weight: 1.2, name: "Top-heavy thirds (child)" });
  }

  // Weighted average
  const totalWeight = indicators.reduce((sum, ind) => sum + ind.weight, 0);
  const weightedSum = indicators.reduce((sum, ind) => sum + ind.value * ind.weight, 0);
  const score = weightedSum / totalWeight;

  // Confidence based on number of indicators
  const confidence = Math.min(indicators.length / 5, 1.0);

  return {
    score,
    confidence,
    indicators: indicators.map(ind => ind.name)
  };
}
```

#### 2.3 Add Age Penalty to Congruence Scoring
```typescript
// Update computeCongruenceScore() signature and logic

export interface CongruenceResult {
  score: number;
  maturityA?: FacialMaturityEstimate;
  maturityB?: FacialMaturityEstimate;
  ageWarning?: string;
  agePenalty?: number;
}

export function computeCongruenceScore(
  comparisons: FeatureComparison[],
  measurementsA: FeatureMeasurements,
  measurementsB: FeatureMeasurements
): CongruenceResult {
  // Base score from hybrid feature comparisons
  const baseScore = comparisons.reduce((acc, c) => acc + c.overallAgreement, 0) / comparisons.length;

  // Estimate maturity for both faces
  const maturityA = estimateFacialMaturity(measurementsA);
  const maturityB = estimateFacialMaturity(measurementsB);

  const maturityGap = Math.abs(maturityA.score - maturityB.score);

  // Apply penalty for cross-age comparison
  let agePenalty = 0;
  let ageWarning: string | undefined;

  if (maturityGap > 0.3 && Math.min(maturityA.confidence, maturityB.confidence) > 0.5) {
    // Significant age difference detected with confidence
    // Penalty scales from 15% (gap=0.3) to 30% (gap=0.6+)
    agePenalty = Math.min((maturityGap - 0.3) * 0.5, 0.30);

    const stageA = maturityA.score < 0.3 ? "Child" : maturityA.score < 0.6 ? "Adolescent" : "Adult";
    const stageB = maturityB.score < 0.3 ? "Child" : maturityB.score < 0.6 ? "Adolescent" : "Adult";

    ageWarning = `Cross-age comparison detected: ${stageA} vs ${stageB}. Similarity may be less meaningful.`;
  }

  const adjustedScore = baseScore * (1 - agePenalty);

  return {
    score: adjustedScore,
    maturityA,
    maturityB,
    ageWarning,
    agePenalty
  };
}
```

#### 2.4 Update Worker Integration
```typescript
// In analyze.worker.ts

const congruenceResult = computeCongruenceScore(comparisons, measurementsA, measurementsB);

post({
  type: 'RESULT',
  // ... existing fields
  congruenceScore: congruenceResult.score,
  featureNarrative: narrative,
  ageWarning: congruenceResult.ageWarning,
  maturityA: congruenceResult.maturityA,
  maturityB: congruenceResult.maturityB,
});
```

#### 2.5 Update UI
```typescript
// In FeatureDetailPanel.tsx

{ageWarning && (
  <div className="mb-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm">
    <div className="flex items-center gap-2">
      <span className="text-yellow-600">⚠️</span>
      <span className="text-yellow-800">{ageWarning}</span>
    </div>
    {maturityA && maturityB && (
      <div className="mt-1 text-xs text-yellow-700">
        Image A: {formatMaturityStage(maturityA.score)} |
        Image B: {formatMaturityStage(maturityB.score)}
      </div>
    )}
  </div>
)}
```

### Testing
- Add maturity estimation tests with known child/adult landmarks
- Test penalty calculation at various maturity gaps
- E2E test with adult-child pair expecting warning
- Validate adult-adult and child-child comparisons unaffected

### Expected Impact
- Adult vs child: 55-65% (from Phase 1) → 40-50% (with 20-25% penalty)
- Adult vs adult: No penalty, scores unchanged
- UI shows clear warning for cross-age comparisons

---

## Phase 3: Age-Sensitive Feature Weighting 📊
**Goal**: Downweight features that change dramatically with age
**Timeline**: 2 days
**Files**: `feature-comparisons.ts`, `axis-classifiers.ts`

### Changes

#### 3.1 Define Age Sensitivity Weights
```typescript
// In feature-comparisons.ts

/**
 * Age sensitivity: how much each feature changes from child to adult
 * 0.0 = stable across ages, 1.0 = dramatically different
 */
const AGE_SENSITIVITY: Record<string, number> = {
  eyes: 0.25,      // Eye shape relatively stable (size ratio changes but shape persists)
  brows: 0.45,     // Brow position and thickness change moderately
  nose: 0.85,      // Nose projection and width develop significantly
  mouth: 0.55,     // Lip fullness and philtrum change moderately
  cheeks: 0.75,    // Malar fat pads shift dramatically (baby cheeks → adult contours)
  jaw: 0.90,       // Jaw angle and chin projection change most (round → square)
  forehead: 0.65,  // Forehead proportions shift (top-heavy → balanced)
  faceShape: 0.95  // Overall proportions change completely (round → oval/oblong)
};

/**
 * Per-axis sensitivity (for fine-grained control)
 */
const AXIS_SENSITIVITY: Record<string, number> = {
  // Eyes - mostly stable
  'canthal tilt': 0.20,
  'eye size': 0.35,
  'interocular distance': 0.15,

  // Nose - high sensitivity
  'nose width': 0.80,
  'bridge contour': 0.90,
  'tip projection': 0.95,

  // Jaw - very high sensitivity
  'jaw width': 0.85,
  'mandibular angle': 0.95,
  'chin projection': 1.00,
  'chin width': 0.80,

  // ... etc for all axes
};
```

#### 3.2 Apply Age-Sensitive Weighting
```typescript
/**
 * Adjust feature weight based on maturity gap
 */
function computeAgeAdjustedWeight(
  feature: string,
  axis: string,
  maturityGap: number
): number {
  if (maturityGap < 0.25) return 1.0; // Similar ages, no adjustment

  // Get sensitivity (prefer axis-specific, fall back to feature-level)
  const sensitivity = AXIS_SENSITIVITY[axis] ?? AGE_SENSITIVITY[feature] ?? 0.5;

  // For large maturity gaps, downweight sensitive features
  // Gap=0.5, sensitivity=0.9 → weight=0.55 (45% reduction)
  const reduction = sensitivity * maturityGap;
  return Math.max(1.0 - reduction, 0.1); // Minimum 10% weight retained
}

/**
 * Updated feature comparison with age awareness
 */
export function compareFeatures(
  measurementsA: FeatureMeasurements,
  measurementsB: FeatureMeasurements,
  maturityGap?: number
): FeatureComparison[] {
  const results: FeatureComparison[] = [];

  for (const feature of FEATURES) {
    const axes = compareAxesForFeature(feature, measurementsA, measurementsB);

    // Apply age-adjusted weights
    let weightedSum = 0;
    let totalWeight = 0;

    for (const axis of axes) {
      const axisScore = computeAxisScore(axis);
      const weight = maturityGap
        ? computeAgeAdjustedWeight(feature, axis.axis, maturityGap)
        : 1.0;

      weightedSum += axisScore * weight;
      totalWeight += weight;
    }

    const overallAgreement = totalWeight > 0 ? weightedSum / totalWeight : 0;

    results.push({
      feature,
      axes,
      overallAgreement
    });
  }

  return results;
}
```

### Testing
- Test adult-child comparison: jaw/nose should have reduced impact
- Test adult-adult comparison: all features should retain full weight
- Validate weighting doesn't cause negative scores
- Check that highly sensitive features can still match (if truly similar)

### Expected Impact
- Adult vs child jaw: 100% → 20% effective contribution (90% sensitivity × large gap)
- Adult vs child eyes: 90% → 75% effective contribution (25% sensitivity)
- More nuanced similarity: "Similar eye shape despite age difference, but jaw differs as expected"

---

## Phase 4: Allometric Scaling Correction 📏
**Goal**: Account for non-uniform growth patterns
**Timeline**: 3 days
**Files**: `feature-axes.ts`, `feature-comparisons.ts`

### Changes

#### 4.1 Define Allometric Exponents
```typescript
// In feature-axes.ts or new allometry.ts

/**
 * Allometric exponents: feature grows as (head_size)^exponent
 * 1.0 = isometric (scales proportionally)
 * >1.0 = positive allometry (grows faster)
 * <1.0 = negative allometry (grows slower)
 */
const ALLOMETRIC_EXPONENTS: Record<string, number> = {
  // Measurements that grow faster than head
  'nose width': 1.15,
  'nose length': 1.20,
  'tip projection': 1.25,
  'jaw width': 1.20,
  'chin projection': 1.30,
  'mandibular angle': 1.10, // Becomes more acute (grows in angular change)

  // Measurements that grow slower
  'eye size': 0.82,
  'eye aperture': 0.85,
  'forehead height': 0.90,

  // Roughly proportional
  'mouth width': 1.05,
  'interocular distance': 1.00,
  'cheekbone height': 1.00
};
```

#### 4.2 Estimate Relative Head Size
```typescript
/**
 * Estimate relative head size from IPD and face dimensions
 * Returns normalized scale (1.0 = average adult)
 */
export function estimateHeadScale(
  measurements: FeatureMeasurements,
  landmarks: Point[]
): number {
  // Use multiple indicators
  const ipd = measurements.eyes.interocularDistance; // Already normalized, but we need absolute

  // Get face width and height in pixels
  const faceWidth = /* compute from landmarks */;
  const faceHeight = /* compute from landmarks */;

  // Typical adult: IPD≈63mm, face width≈140mm, height≈180mm
  // Typical child (8yo): IPD≈53mm, face width≈115mm, height≈150mm
  // Use face height as most reliable

  // Normalize to adult scale (1.0 = adult)
  // This is approximate - actual scale estimation would require calibration
  const heightScale = faceHeight / 180; // Assuming 180px ≈ adult face height in our system

  return heightScale;
}
```

#### 4.3 Apply Allometric Correction
```typescript
/**
 * Correct measurement for allometric scaling
 * Scales measurement B to what it would be if subject B had subject A's head size
 */
function applyAllometricCorrection(
  measurementA: number,
  measurementB: number,
  scaleA: number,
  scaleB: number,
  axis: string
): { correctedB: number; percentDiff: number } {
  const exponent = ALLOMETRIC_EXPONENTS[axis] ?? 1.0;

  if (Math.abs(exponent - 1.0) < 0.05 || Math.abs(scaleA - scaleB) < 0.1) {
    // Nearly isometric or similar scales, skip correction
    return {
      correctedB: measurementB,
      percentDiff: Math.abs(measurementA - measurementB) / measurementA * 100
    };
  }

  // Scale B's measurement to A's size
  const scaleFactor = Math.pow(scaleA / scaleB, exponent);
  const correctedB = measurementB * scaleFactor;

  const percentDiff = Math.abs(measurementA - correctedB) / measurementA * 100;

  return { correctedB, percentDiff };
}
```

#### 4.4 Integrate into Comparison
```typescript
// Update compareAxesForFeature() to use allometric correction

export function compareAxesForFeature(
  feature: string,
  measurementsA: FeatureMeasurements,
  measurementsB: FeatureMeasurements,
  scaleA?: number,
  scaleB?: number
): AxisComparison[] {
  const results: AxisComparison[] = [];

  for (const axis of FEATURE_AXES[feature]) {
    const rawA = getRawMeasurement(measurementsA, feature, axis);
    const rawB = getRawMeasurement(measurementsB, feature, axis);

    // Apply allometric correction if scales provided and meaningful
    let percentDiff: number;
    if (scaleA && scaleB && Math.abs(scaleA - scaleB) > 0.15) {
      const corrected = applyAllometricCorrection(rawA, rawB, scaleA, scaleB, axis);
      percentDiff = corrected.percentDiff;
    } else {
      percentDiff = Math.abs(rawA - rawB) / rawA * 100;
    }

    const categoryA = classifyAxis(axis, rawA);
    const categoryB = classifyAxis(axis, rawB);

    results.push({
      axis,
      valueA: categoryA,
      valueB: categoryB,
      agreement: categoryA === categoryB,
      percentDiff,
      direction: rawA > rawB ? 'higher' : 'lower'
    });
  }

  return results;
}
```

### Testing
- Test with synthetic adult-child landmarks (known scale difference)
- Validate nose/jaw corrections are applied (positive allometry)
- Validate eye corrections are applied (negative allometry)
- Ensure adult-adult comparisons remain stable

### Expected Impact
- Adult nose (45mm) vs child nose (30mm): Raw 50% different → Corrected 15% different (accounting for head size)
- Adult eyes vs child eyes: Better discrimination (child eyes proportionally larger)
- More accurate: "Similar nose shape for their respective ages"

---

## Phase 5: Scale-Invariant Features 🔢
**Goal**: Add measurements that are naturally scale-independent
**Timeline**: 2 days
**Files**: `feature-axes.ts`, `axis-classifiers.ts`

### Changes

#### 5.1 Define Scale-Invariant Measurements
```typescript
// In feature-axes.ts

export interface ScaleInvariantMeasurements {
  // Shape ratios (dimensionless)
  eyeAspectRatio: number;          // Eye height / eye width
  noseAspectRatio: number;         // Nose length / nose width
  faceAspectRatio: number;         // Face height / face width

  // Relative positions (normalized by face dimensions)
  eyeToMouthDistance: number;      // Normalized by face height
  browToEyeDistance: number;       // Normalized by face height

  // Feature-to-feature ratios
  mouthToNoseRatio: number;        // Mouth width / nose width
  jawToForeheadRatio: number;      // Jaw width / forehead width
  eyeToIPDRatio: number;           // Eye width / IPD

  // Angular measurements (scale-invariant by nature)
  canthalTiltAngle: number;        // Already in degrees
  mandibularAngle: number;         // Already in degrees
  nasofrontalAngle: number;        // Bridge angle relative to forehead
}

/**
 * Extract scale-invariant features
 * These should be prioritized in cross-scale comparisons
 */
export function extractScaleInvariantFeatures(
  landmarks: Point[],
  leftEye: Point,
  rightEye: Point
): ScaleInvariantMeasurements {
  // ... implementation

  return {
    eyeAspectRatio: eyeHeight / eyeWidth,
    noseAspectRatio: noseLength / noseWidth,
    faceAspectRatio: faceHeight / faceWidth,
    // ... etc
  };
}
```

#### 5.2 Prioritize Scale-Invariant Features
```typescript
/**
 * Determine if an axis is scale-invariant
 */
function isScaleInvariant(axis: string): boolean {
  const invariantAxes = [
    'canthal tilt',          // Angular
    'mandibular angle',      // Angular
    'eye aspect ratio',      // Ratio
    'nose aspect ratio',     // Ratio
    'face aspect ratio',     // Ratio
    'mouth-to-nose ratio',   // Ratio
    'jaw-to-forehead ratio', // Ratio
    'facial thirds balance'  // Ratio
  ];

  return invariantAxes.includes(axis);
}

/**
 * Boost weight for scale-invariant features in cross-scale comparisons
 */
function computeScaleAdjustedWeight(
  axis: string,
  scaleGap: number
): number {
  if (scaleGap < 0.15) return 1.0; // Similar scales

  if (isScaleInvariant(axis)) {
    // Boost invariant features by 50% when scales differ
    return 1.5;
  } else {
    // Slightly reduce absolute measurements (even with allometric correction, still uncertain)
    return 0.85;
  }
}
```

### Testing
- Compare adult vs child: ratios should dominate scoring
- Validate eye aspect ratio is more stable than eye size
- Test that angle measurements work correctly
- Check adult-adult comparisons aren't negatively affected

### Expected Impact
- Cross-scale comparisons rely more on shape ratios than absolute sizes
- "Similar eye shape (aspect ratio matches) but different sizes (as expected for age difference)"
- More robust: scale-invariant features get 1.5× weight, reducing impact of uncertain allometric corrections

---

## Phase 6: UI Enhancements & Transparency 🎨
**Goal**: Show age/scale information to user
**Timeline**: 2 days
**Files**: `FeatureDetailPanel.tsx`, `page.tsx`, `types.ts`

### Changes

#### 6.1 Add Maturity Display
```typescript
// In FeatureDetailPanel.tsx

function MaturityBadge({ maturity }: { maturity: FacialMaturityEstimate }) {
  const stage = maturity.score < 0.3 ? 'Child' :
                maturity.score < 0.6 ? 'Adolescent' : 'Adult';

  const color = maturity.score < 0.3 ? 'bg-blue-100 text-blue-700' :
                maturity.score < 0.6 ? 'bg-purple-100 text-purple-700' :
                'bg-gray-100 text-gray-700';

  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${color}`}>
      {stage}
    </span>
  );
}

// In main component
{maturityA && maturityB && (
  <div className="mb-3 flex items-center gap-3 text-sm">
    <div className="flex items-center gap-1.5">
      <span className="opacity-70">Image A:</span>
      <MaturityBadge maturity={maturityA} />
    </div>
    <div className="flex items-center gap-1.5">
      <span className="opacity-70">Image B:</span>
      <MaturityBadge maturity={maturityB} />
    </div>
  </div>
)}
```

#### 6.2 Add Age Warning Banner
```typescript
{ageWarning && (
  <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
    <div className="flex items-start gap-2">
      <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
      <div className="flex-1">
        <div className="font-medium text-amber-900 text-sm">Cross-Age Comparison</div>
        <div className="text-amber-800 text-xs mt-0.5">{ageWarning}</div>
        {agePenalty && (
          <div className="text-amber-700 text-xs mt-1">
            Similarity score adjusted by {(agePenalty * 100).toFixed(0)}% to account for age differences.
          </div>
        )}
      </div>
    </div>
  </div>
)}
```

#### 6.3 Add Explanatory Tooltips
```typescript
// Add info icon next to congruence score

<div className="flex items-center gap-2">
  <div className="text-sm opacity-70">Overall Congruence</div>
  <button
    type="button"
    className="text-gray-400 hover:text-gray-600"
    title="Morphological congruence measures similarity in facial proportions and structure. Score is adjusted for age differences when detected."
  >
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
    </svg>
  </button>
</div>
```

#### 6.4 Add Debugging Panel (Dev Mode)
```typescript
// In dev mode, show detailed maturity breakdown

{process.env.NODE_ENV !== 'production' && maturityA && maturityB && (
  <details className="mb-3 p-2 bg-gray-50 border rounded text-xs">
    <summary className="cursor-pointer font-medium">Maturity Analysis Debug</summary>
    <div className="mt-2 space-y-2">
      <div>
        <div className="font-medium">Image A: {(maturityA.score * 100).toFixed(1)}% mature</div>
        <ul className="ml-4 list-disc">
          {maturityA.indicators.map((ind, i) => (
            <li key={i}>{ind}</li>
          ))}
        </ul>
      </div>
      <div>
        <div className="font-medium">Image B: {(maturityB.score * 100).toFixed(1)}% mature</div>
        <ul className="ml-4 list-disc">
          {maturityB.indicators.map((ind, i) => (
            <li key={i}>{ind}</li>
          ))}
        </ul>
      </div>
    </div>
  </details>
)}
```

### Testing
- Visual QA: verify badges and warnings display correctly
- Test tooltip accessibility (keyboard navigation)
- Validate dev panel expands and shows indicators
- Check responsive layout on mobile

---

## Phase 7: Calibration & Validation 🎯
**Goal**: Validate system against ground truth data
**Timeline**: 1 week
**Files**: New test data, calibration scripts

### Data Collection

#### 7.1 Assemble Test Dataset
- **Same-person pairs** (ground truth: 100% similar)
  - Same individual, different photos (lighting, angle variations)
  - 20+ pairs covering diverse demographics

- **Family pairs** (ground truth: moderately similar)
  - Parent-child pairs (cross-age)
  - Siblings (same age)
  - 30+ pairs

- **Unrelated pairs** (ground truth: not similar)
  - Same age group
  - Different age groups
  - 30+ pairs

#### 7.2 Human Annotation
- 3-5 human raters score each pair on 0-10 scale
- Separate questions:
  - "Overall facial similarity?"
  - "Would you guess these people are related?"
  - "Do specific features stand out as similar/different?"

#### 7.3 Correlation Analysis
```python
# calibration/validate_system.py

import numpy as np
from scipy.stats import pearsonr, spearmanr

def validate_against_human_ratings(system_scores, human_scores):
    """
    Compare system congruence scores with human similarity ratings
    """
    # Pearson correlation (linear relationship)
    pearson_r, pearson_p = pearsonr(system_scores, human_scores)

    # Spearman correlation (monotonic relationship)
    spearman_r, spearman_p = spearmanr(system_scores, human_scores)

    print(f"Pearson r: {pearson_r:.3f} (p={pearson_p:.4f})")
    print(f"Spearman ρ: {spearman_r:.3f} (p={spearman_p:.4f})")

    # Mean absolute error
    mae = np.mean(np.abs(system_scores - human_scores))
    print(f"MAE: {mae:.3f}")

    return {
        'pearson_r': pearson_r,
        'spearman_r': spearman_r,
        'mae': mae
    }
```

#### 7.4 Threshold Tuning
```python
def optimize_categorical_thresholds(dataset):
    """
    Adjust axis classifier thresholds to maximize agreement with human perception
    """
    # Grid search over threshold values
    # Objective: minimize (system_score - human_rating)^2

    # Example: nose width thresholds
    best_thresholds = optimize_thresholds(
        feature='nose width',
        current_thresholds=[0.35, 0.50],
        search_range=[0.30, 0.55],
        dataset=dataset
    )

    return best_thresholds
```

#### 7.5 Weight Optimization
```python
def optimize_hybrid_weights(dataset):
    """
    Optimize categorical vs continuous blend ratio
    Current: 0.4 categorical, 0.6 continuous
    """
    best_categorical_weight = optimize_weight(
        param='categorical_weight',
        current_value=0.4,
        search_range=[0.2, 0.6],
        dataset=dataset
    )

    return best_categorical_weight
```

### Success Criteria
- **Pearson r > 0.70**: Strong correlation with human ratings
- **Spearman ρ > 0.75**: Monotonic relationship (rank order correct)
- **MAE < 0.15**: System scores within 15% of human ratings (on 0-1 scale)
- **No regression**: Same-age pairs should not score worse than before
- **Age discrimination**: Adult-child pairs should score 20-30% lower than before

---

## Integration Timeline

### Week 1: Foundation
- ✅ Day 1: Phase 1 (Hybrid Scoring) - QUICK WIN
- Day 2-3: Phase 2 (Age Detection)
- Day 4-5: Testing and refinement

### Week 2: Refinement
- Day 1-2: Phase 3 (Age-Sensitive Weights)
- Day 3-5: Phase 4 (Allometric Scaling)

### Week 3: Enhancement
- Day 1-2: Phase 5 (Scale-Invariant Features)
- Day 3-4: Phase 6 (UI)
- Day 5: Integration testing

### Week 4: Validation
- Day 1-3: Phase 7 (Data collection and calibration)
- Day 4-5: Final tuning and documentation

---

## Testing Strategy

### Unit Tests
- Each maturity indicator function
- Allometric correction calculations
- Weight adjustment functions
- Scale-invariant feature extraction

### Integration Tests
- Full pipeline: landmarks → maturity → adjusted scoring → narrative
- Edge cases: extreme age differences, similar ages, ambiguous maturity
- Backward compatibility: existing adult-adult comparisons

### Visual QA
- Adult vs adult (should be unaffected)
- Adult vs child (should show warning and reduced score)
- Adult vs adolescent (moderate adjustment)
- Child vs child (no penalty)
- Twins vs unrelated same-age (should still discriminate)

### Performance
- Additional computation time < 50ms per comparison
- Maturity estimation < 10ms
- No perceptible lag in UI

---

## Rollout Plan

### Stage 1: Hybrid Scoring (Immediate)
- Deploy Phase 1 to all users
- Monitor for regressions
- Gather feedback on score changes

### Stage 2: Age Detection (1 week)
- Deploy Phase 2 with warning banner
- A/B test: with/without age penalty
- Collect user feedback on warnings

### Stage 3: Full System (2-3 weeks)
- Deploy Phases 3-5 together
- Enable calibration mode for data collection
- Gradual rollout with feature flag

### Stage 4: Refinement (Ongoing)
- Continuous calibration with user data
- Threshold tuning based on feedback
- Documentation updates

---

## Open Questions & Future Work

### Research Questions
1. **Optimal blend ratio**: Is 40/60 categorical/continuous best, or should it vary by feature?
2. **Maturity estimation accuracy**: Can we improve beyond forehead/jaw indicators?
3. **Population variation**: Do thresholds need adjustment for different ethnicities?
4. **Temporal stability**: Do our estimates work across different photo conditions?

### Future Enhancements
1. **3D-aware maturity**: Use Z-depth for chin/nose projection estimation
2. **Learned weights**: ML model to predict human similarity ratings
3. **Confidence bounds**: "75-82% similar (95% CI)" instead of point estimate
4. **Explainability**: "Score would be 85% if both were same age"
5. **User calibration**: Let users tune sensitivity to match their perception

### Known Limitations
1. **Profile photos**: Maturity indicators assume frontal view
2. **Expression variation**: Smiling affects some measurements (jaw angle, lip fullness)
3. **Occlusions**: Bangs/hats affect forehead estimation
4. **Photo quality**: Low-resolution images may give unreliable measurements
5. **Population bias**: Thresholds based on limited demographic data

---

## References & Prior Art

### Anthropometric Literature
- Farkas LG (1994). *Anthropometry of the Head and Face*. Raven Press.
- Ferrario VF et al (1999). "Distance from symmetry: A three-dimensional evaluation of facial asymmetry." *Journal of Oral and Maxillofacial Surgery*.

### Growth & Allometry
- Huxley JS (1932). *Problems of Relative Growth*. Methuen.
- Kolar JC, Salter EM (1997). *Craniofacial Anthropometry*. Charles C Thomas.

### Age Estimation
- Ramanathan N, Chellappa R (2006). "Modeling Age Progression in Young Faces." *CVPR*.
- Geng X et al (2013). "Automatic Age Estimation Based on Facial Aging Patterns." *TPAMI*.

### Facial Similarity
- Yin L et al (2008). "A High-Resolution 3D Dynamic Facial Expression Database." *FG*.
- Taigman Y et al (2014). "DeepFace: Closing the Gap to Human-Level Performance." *CVPR*.

---

## Maintenance & Documentation

### Code Comments
- Each maturity indicator should explain anatomical reasoning
- Allometric exponents should cite sources
- Weight values should document tuning rationale

### User Documentation
- Explain age warnings in help text
- Provide examples of when system works best
- Document limitations clearly

### Developer Documentation
- Calibration procedure
- How to add new maturity indicators
- Threshold tuning guidelines

---

## Success Metrics (Post-Deployment)

### Quantitative
- Adult-child congruence drops from 80% to 45-55% ✅
- Adult-adult congruence remains stable (±3%) ✅
- Correlation with human ratings: r > 0.70 ✅
- Performance overhead: < 50ms ✅

### Qualitative
- User feedback: "Warnings are helpful and accurate"
- No complaints about false age detection
- Increased trust in system ("makes sense now")

### Edge Cases
- Adolescent faces: System should handle gracefully
- Baby faces: Low maturity score, large penalty for adult comparison
- Elderly faces: Should not trigger age penalty vs middle-aged adults
- Babyface adults: May trigger false positive (acceptable, better than false negative)

---

**Document Version**: 1.0
**Last Updated**: 2025-10-11
**Status**: Planning Complete → Implementation Ready
