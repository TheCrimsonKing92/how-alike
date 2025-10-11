# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

How Alike is a privacy-first, browser-based face similarity comparison tool that runs 100% client-side. It uses MediaPipe FaceMesh (TF.js) for landmark detection and compares facial features through geometric analysis (Procrustes alignment) and optional face parsing. All ML processing happens locally via Web Workers for performance.

The app emphasizes explainable similarity (not biometric identity) through regional breakdowns (eyes, brows, nose, mouth, jaw) with visual overlays and textual summaries.

## Development Commands

All commands run from the `web/` directory:

```bash
cd web

# Development
npm run dev              # Start dev server on port 3000
npm run build            # Production build
npm run start            # Start production server on port 3000

# Testing
npm test                 # Run unit tests (Vitest)
npm run test:watch       # Run tests in watch mode
npm run e2e              # Shallow E2E smoke test (detector health)
npm run e2e:deep         # Deep E2E tests including sample analysis
npm run e2e:ui           # Open Playwright UI for debugging

# Code Quality
npm run lint             # ESLint check
npm run format           # Format with Prettier
```

### Running Individual Tests

```bash
# Single test file
npx vitest run src/__tests__/geometry.test.ts

# Watch mode for specific test
npx vitest src/__tests__/geometry.test.ts

# E2E test targeting specific spec
npx playwright test e2e/smoke.shallow.spec.ts --project=chromium
```

## Architecture Overview

### Core Pipeline

1. **Image Input** → User uploads/captures two images
2. **Web Worker** (`web/src/workers/analyze.worker.ts`) → Runs all heavy computation off main thread
3. **Landmark Detection** → MediaPipe FaceMesh extracts 468 landmarks per face
4. **Alignment** → Normalize faces by eye centers and interpupillary distance (IPD)
5. **Region Scoring** → Procrustes RMSE-based similarity per facial region
6. **Visualization** → Canvas overlays + textual summaries

### Key Directories

- `web/src/workers/` — Web Worker that runs analysis pipeline
- `web/src/models/` — Pluggable detector adapters (FaceMesh, parsing)
- `web/src/lib/` — Core geometry, region definitions, hulls, hints
- `web/src/app/` — Next.js App Router pages and components
- `web/src/__tests__/` — Vitest unit tests
- `web/e2e/` — Playwright E2E smoke tests
- `web/public/models/` — Cached model binaries for offline use

### Pluggable Detector Architecture

The app uses a **detector adapter pattern** to support multiple landmark/parsing backends:

- `web/src/models/detector.ts` — Central adapter selection and routing
- `web/src/models/facemesh-adapter.ts` — MediaPipe FaceMesh (TF.js) implementation
- `web/src/models/parsing-adapter.ts` — Face parsing adapter (ONNX Runtime Web)
- `web/src/models/detector-types.ts` — Shared types for all adapters

Switch adapters via `setAdapter('facemesh' | 'parsing')` or `NEXT_PUBLIC_DETECTOR` env var.

### Region Similarity Algorithm

Regional comparison uses **Procrustes analysis** for shape-based similarity:

1. Extract landmark subset per region (e.g., `REGION_INDICES.eyes`)
2. Align via optimal 2D rotation + scale + translation (closed-form Kabsch)
3. Compute RMSE normalized by region scale (RMS radius)
4. Convert to similarity score: `exp(-alpha * normalizedRMSE)`
5. Overall score = weighted average by landmark count per region

See `web/src/lib/geometry.ts:80-115` for implementation.

### Region Hint System

The worker generates visual overlays via **region hints**:

1. **Static contours** from `FEATURE_OUTLINES` (eyes, mouth, nose arc, jaw)
2. **Derived brows** by offsetting upper-lid arc outward from eye center
3. **Concave jaw hull** computed from lower-face landmarks
4. **Adapter-provided hints** (optional): parsing-based segmentation masks override static contours

Hints are returned as arrays of `RegionPoly` objects with `{region, points, open}` for canvas rendering. See `web/src/workers/analyze.worker.ts:31-222` for generation logic.

### Worker Communication

Typed message protocol (`web/src/workers/types.ts`):

- **Page → Worker**: `INIT` (load detector), `ANALYZE` (run comparison)
- **Worker → Page**: `PROGRESS` (stage updates), `RESULT` (scores + overlays), `ERROR`

All messages include `jobId` to guard against stale results when user uploads new images rapidly.

## Important Implementation Notes

### MediaPipe FaceMesh

- Always use `staticImageMode: true` for still images to avoid motion-tracking artifacts
- Call `detector.estimateFaces()` with properly scaled images (max 1280px) to balance speed/accuracy
- Eye centers computed from subset of eyelid ring landmarks (not MediaPipe's built-in keypoints)
- 468-landmark indices documented at MediaPipe FaceMesh canonical map

### Testing Requirements

All code changes must include tests. The test suite must pass before merge:

- **Unit tests** (Vitest): Test geometry, hulls, hints, parsing logic in isolation
- **Shallow E2E** (`e2e/smoke.shallow.spec.ts`): Verify detector init and health route on every PR
- **Deep E2E** (`e2e/smoke.deep.spec.ts`, `sample-analysis.spec.ts`): Run on main branch and before merges touching detector/runtime code

Run `npm test` locally during development. After moving files or changing imports, always run tests to confirm nothing broke.

### TFJS Backend Selection

- Default backend: WebGL (fastest for inference)
- Fallback: CPU backend (if WebGL unavailable)
- Always `await tf.ready()` before calling `getDetector()`
- Register backends via static imports in adapter files
- Log backend choice and init duration at info-level in dev mode

### TypeScript Standards

- Avoid `any` and `unknown` types where possible
- Prefer explicit type imports: `import type { Foo } from './types'`
- Use branded types for domain concepts (e.g., `RegionHintsArray` extends `Array<RegionPoly>` with metadata fields)

### Performance Targets

- Model load: <2s on mid-range phones
- Comparison: <400ms on desktop, <1s on mobile
- Always run heavy work in Web Worker to keep UI responsive
- Downscale large images before inference (1280px max dimension)

## Process and Workflow

### Task Tracking

**Always maintain `TASKS.md`** with current and upcoming work. Update TASKS.md progressively as you work:

- Move completed items from `## Now` to `## Done` with a brief summary
- Add newly discovered tasks to `## Now` or `## Next` as appropriate
- Keep `## Now` focused on active work (1-3 items maximum)
- Update TASKS.md before making git commits so the task log stays synchronized with code changes

### Commit Messages

Use clear, descriptive commit messages that explain **why** (not just what). Follow the existing style in git history. Always include attribution:

```
feat(scoring): add Procrustes-based regional similarity

Use Kabsch alignment for robust shape comparison across regions.

🤖 Generated with Claude Code

Co-Authored-By: Claude <noreply@anthropic.com>
```

### Before Merging

1. Run full test suite: `npm test && npm run e2e`
2. If touching detector/models/runtime: also run `npm run e2e:deep`
3. Update TASKS.md to reflect current state
4. Verify no console errors in dev mode

## Key Project Files

Read these before making architectural changes:

- `PROJECT.md` — Project vision and use cases
- `ARCHITECTURE.md` — High-level system design
- `IMPLEMENTATION.md` — Stage-by-stage development plan
- `AGENTS.md` — Agent-specific rules and workflow guidance

**IMPORTANT**: Keep `CLAUDE.md` and `AGENTS.md` synchronized. When updating workflow guidance, testing requirements, or development practices, apply changes to both files to maintain consistency. CLAUDE.md provides high-level guidance for new Claude Code instances, while AGENTS.md contains detailed rules for ongoing work.

## Debugging Tips

- Check browser console for TFJS backend selection logs
- Use `npm run e2e:ui` to visually debug Playwright tests
- Verify worker messages in Network tab (filter by `worker`)
- Enable dev-only mask overlay via `maskA`/`maskB` in worker result
- For parse adapter issues, check ONNX Runtime Web logs in console

## Debugging Best Practices

- **Read documentation first** - Before implementing workarounds or guessing at APIs, search for official docs, test scripts, or working examples
- **Test before proposing** - Verify code changes work via isolated tests or scripts before suggesting them
- **Trace data flow** - Debug by following data from source to usage; check for object lifecycle issues (transfer, detach, invalidation)
- **Request fresh logs** - When user shares results, ask for current console output rather than relying on old debugging context
- **Start simple** - Check obvious issues (null values, timing, object lifecycle) before adding complex debugging

## Common Gotchas

- **Editing hygiene**: Never insert literal `\n` escape sequences; write real newlines
- **Worker context**: Worker files cannot access DOM or `window`; use `DedicatedWorkerGlobalScope`
- **ImageBitmap transfer**: Use `transferToImageBitmap()` to send images back from worker without copy
- **Canvas lifecycle**: Calling `transferToImageBitmap()` detaches/empties the canvas - compute all derived data BEFORE transferring
- **Stale results**: Always check `jobId` matches current request before rendering results
- **E2E flakiness**: If deep E2E fails, check `/health/detector` route and model CDN availability
