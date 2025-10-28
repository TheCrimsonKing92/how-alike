# Test Fixture Generation Scripts

This directory contains scripts for generating test fixtures from MediaPipe's official canonical face model.

## Overview

Test fixtures are generated from **Google's canonical_face_model.obj** to ensure authoritative geometry with correct facial proportions and landmark topology. The fixture system provides a reproducible pipeline for creating test data.

## Files

### `mediapipe-canonical-468.json`
Source data containing all 468 vertices from MediaPipe's canonical face model.

- Format: Array of `{x, y, z}` objects
- Source: First 468 vertices from [canonical_face_model.obj](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/modules/face_geometry/data/canonical_face_model.obj)
- Used as input for fixture generation

### `convert-obj-to-json.js`
Converts OBJ vertex lines to JSON format.

**Usage**:
```bash
node convert-obj-to-json.js < canonical_face_model.obj 2>/dev/null > mediapipe-canonical-468.json
```

**Input**: OBJ file with vertex lines in "v x y z" format
**Output**: JSON array of coordinate objects

### `generate-canonical-landmarks.js`
Normalizes canonical vertices to [0,1]³ bounding box and generates TypeScript fixture.

**Usage**:
```bash
node generate-canonical-landmarks.js
```

**Input**: `mediapipe-canonical-468.json`
**Output**: `../src/__tests__/fixtures/canonical-face.ts`

The script:
1. Reads raw landmarks from JSON
2. Calculates bounding box (min/max for x, y, z)
3. Normalizes all coordinates to [0,1] range
4. Generates TypeScript file with proper types and documentation

## Regenerating Fixtures

If MediaPipe releases an updated canonical face model, regenerate fixtures using this pipeline:

```bash
cd web/scripts

# 1. Fetch fresh OBJ data from MediaPipe GitHub
# Download: https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/modules/face_geometry/data/canonical_face_model.obj

# 2. Convert to JSON (first 468 vertices only)
node convert-obj-to-json.js < canonical_face_model.obj 2>/dev/null > mediapipe-canonical-468.json

# 3. Normalize and generate TypeScript fixture
node generate-canonical-landmarks.js
# Output: ✓ Generated ../src/__tests__/fixtures/canonical-face.ts
#         468 landmarks normalized to [0, 1]³

# 4. Verify all tests still pass
cd ..
npm test
```

## Important Notes

- **NEVER manually edit** `web/src/__tests__/fixtures/canonical-face.ts` - it's auto-generated
- The fixture header warns: "Do not edit manually - regenerate from source if needed"
- All 468 landmarks are normalized to [0,1]³ for scale-independent testing
- Tests like `measurement-variance.test.ts` use the canonical fixture as a baseline
- The fixture provides correct MediaPipe landmark topology and facial proportions

## See Also

- [CLAUDE.md](../../CLAUDE.md#canonical-fixture-system) - Detailed documentation on the canonical fixture system
- [MediaPipe Face Mesh](https://github.com/google-ai-edge/mediapipe/blob/master/docs/solutions/face_mesh.md) - Official MediaPipe documentation
