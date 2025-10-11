# Tasks & Work Log

## Now
- Visual QA: test segmentation-based scoring on diverse images to validate that similarity scores now reflect actual visual feature overlap rather than just landmark geometry

## Done (recent)
- **Implemented segmentation-based similarity scoring**:
  - Created `lib/segmentation-scoring.ts` with mask-based regional similarity computation
  - Uses Dice coefficient for shape overlap (less sensitive than IoU to size differences)
  - Combines shape (60%), position (25%), and size (15%) metrics into final score
  - Worker automatically uses mask-based scoring when available (Transformers.js/ONNX adapters)
  - Falls back to Procrustes landmark scoring when masks unavailable (facemesh adapter)
  - Added comprehensive unit tests (23 test cases) covering IoU, Dice, centroid, area similarity
  - All tests passing (63/63 total, including 23 new segmentation tests)
- **Fixed canvas transfer bug that enabled segmentation**:
  - Moved `transferToImageBitmap()` call to AFTER `computeOutlinePolys()` in worker
  - Transfer operation detaches/empties canvas, so must compute segmentation first
  - This fix enabled both Transformers.js and ONNX Runtime adapters to work correctly
  - Updated adapter labels: "Transformers.js (SegFormer)", "ONNX Runtime (ResNet34)", "Landmarks only (MediaPipe)"
- **Added debugging discipline to AGENTS.md and CLAUDE.md**:
  - Read documentation first before guessing at APIs
  - Test code changes before suggesting them
  - Trace data flow to catch lifecycle bugs (transfer, detach, invalidation)
  - Ask for fresh logs rather than relying on stale debugging context
  - Check simple issues first (null values, timing, lifecycle) before complex debugging

## Done (recent debugging)
- **Fixed ONNX nose alias height constraint** (eleventh iteration - SUCCESS):
  - Identified that alias height check (segMaskHeight > heurHeightPx * 1.15) was causing fallback
  - Segmentation mask height (135.8px) was slightly exceeding the 1.15× limit (133.2px)
  - Relaxed constraint from 1.15× to 1.25× (new limit: 144.8px) to allow accurate ONNX segmentation to be used
  - Console now shows `[parsing] nose SUCCESS: using ONNX-based outline with 10 points`
  - ONNX face parsing model now successfully generates nose outlines following actual nose contours
  - Nose overlay now uses segmentation-derived teardrop shape instead of landmark-based approximation
- **Added ONNX nose debug logging** (tenth iteration):
  - Added console.info logs for rowCount, maskPixels, polyPixels, coverage, and required coverage
  - Added console.warn logs for each fallback condition (rowCount < 4, coverage too low, alias mask too tall, noseWidth too small)
  - Added console.info log for successful ONNX-based outline generation
  - Added alias height check logging (segMaskHeight, heurHeightPx, limit)
  - This helped identify the exact condition causing ONNX nose generation to fall back to heuristic teardrop

## Done
- **Use actual nose contour landmarks** (ninth iteration - abandon synthetic teardrop):
  - Nose: completely rewrote to use FEATURE_OUTLINES.nose[0] landmark sequence [94,19,98,4,2,309,331] which traces actual nose contour (left alar → nostril → near tip → tip apex → nostril → right alar); connect with bridge width at landmark 168; no more synthetic interpolation or quadratic formulas - just follow MediaPipe's anatomical landmarks
  - All tests passing (36/36)
- **Use mid-bridge landmark** (eighth iteration - shorten nose to visible region):
  - Nose: switched from bridgeRoot(6) to bridgeMid(168) as starting point; landmark 6 is too high (between eyebrows), while 168 is where visible nose bridge starts; this shortens the nose outline to match the actual visible nose region; increased bridge width to 15% of alar width for better visibility
  - All tests passing (36/36)
- **Centering and bridge width** (seventh iteration - fix off-center and pointy top):
  - Nose: calculate centerX from average of alar landmarks (more reliable than bridge landmark) to fix off-center issue; add explicit bridge width (10% of alar width) instead of single-point top; interpolate from bridge width to alar width using quadratic gradient; top now traces narrow bridge outline instead of connecting to sharp point
  - All tests passing (36/36)
- **Simplified nose path** (sixth iteration - three-segment teardrop):
  - Nose: removed nostril inner landmarks (19, 309) from path; now uses only bridge(6) → alar(94,331) → tip(1); three segments with separate interpolation: bridge→alar (4 steps, quadratic widening), alar→tip (2 steps, slight narrowing), tip→alar→bridge (mirrored); creates cleaner teardrop profile
  - All tests passing (36/36)
- **Critical shape refinement** (fifth iteration - quadratic width gradient and angular sorting):
  - Nose: implemented QUADRATIC width expansion (not linear) using widthFactor = t² to create true teardrop; interpolates from bridgeRoot(6) directly to alar with 5 steps per side; horizontal offset grows quadratically while vertical progresses linearly
  - Brows: changed from X-coordinate sorting to angular sorting (atan2 from eye center) to follow natural curved arc instead of straight horizontal progression; prevents "upside-down trapezoid" shape
  - All tests passing (36/36)
- **Refinement of landmark extraction** (fourth iteration - spatial sorting and no smoothing):
  - Brows: added spatial sorting (left-to-right by X coordinate) to MediaPipe's eyebrow landmarks to ensure smooth left-to-right arcs without zigzag
  - Nose: removed smoothCurve call (which was collapsing width gradient) and increased interpolation steps from 1 to 3 per side (t=0.25, 0.5, 0.75) for clearer teardrop shape progression
  - All tests passing (36/36)
- **Final landmark-based extraction** (third iteration - using actual eyebrow landmarks):
  - Brows: switched from derived upper-lid offsets to MediaPipe's dedicated eyebrow landmarks (FEATURE_OUTLINES.brows: left=[70,63,105,66,107,55,193,35,124], right=[300,293,334,296,336,285,417,265,353]); now shows full eyebrow arcs instead of short dashes
  - Nose: added proper width gradient with interpolated transition points; bridge(6) → mid-transition → widest at alar(94,331) → nostril inner(19,309) → tip(1) → nostril → alar → mid-transition → bridge for true teardrop
  - All tests passing (36/36)
- **Critical fixes to brow and nose extraction** (second iteration after visual feedback):
  - Brows: changed from radial offset to simple vertical (upward) offset by 18% of IPD; eliminated complex taper logic that was pushing brows inward toward pupils instead of upward toward forehead
  - Nose: rebuilt with explicit clockwise ordering (bridge → left alar → tip → right alar → bridge) and added small horizontal offsets (±5% IPD) at bridge mid-point to create width gradient for teardrop shape
  - All tests passing (36/36) after updating test expectations
- **Fixed brow and nose extraction issues** based on initial visual feedback:
  - Brows: increased lift from 5% to 15% of IPD for visibility; removed aggressive 80% trimming that was hiding brows; simplified taper to only affect extreme ends
  - Nose: rewritten as true teardrop (wide bottom, narrow top) using explicit landmark ordering: bridge(6,168) → left alar(94,98) → tip(1) → right alar(327,331) → bridge; eliminated centroid-based symmetry that caused diamond shape
  - All tests still passing (36/36)
- **Hybrid precision feature extraction (Option D)**: implemented landmark-based brow and nose extraction using MediaPipe's 468 landmarks for high-frequency features
  - Landmark-based brows: extract upper eyelid arcs, offset away from eye center with anatomical lift and parabolic taper, smooth with moving average
  - Landmark-based nose: use bridge (landmarks 6, 168) and alar landmarks (94, 19, 98, 327, 309, 331) to build anatomically accurate outline
  - Updated hints.ts to use landmark extraction as primary method with fallback to static contours
  - Updated parsing adapter to report 'landmarks' as source instead of 'heuristic' (clarifies that these are precision landmark-derived features, not crude geometric templates)
  - All tests passing (36/36) including new landmark-features.test.ts with coverage for brow extraction, nose extraction, and PCA-based curvature computation
  - Created landmark-features.ts module with smoothCurve, extractUpperLidArc, deriveBrowFromLid, extractLandmarkBrows, extractLandmarkNose, computeLocalCurvature functions
- Nose overlay: replaced triangle heuristic with segmentation-derived teardrop outline, added dev `?showMask=` overlay plumbing, and extended unit coverage for the new mask pipeline (`npm test`).
- Nose coverage widening: inflated the segmentation sampling window, broadened the teardrop outline with additional side/top anchors, and pruned debug masks to the clipped region so class `6` no longer floods the face (`npm test`).
- Nose fallback: when segmentation confidence is low (or only glasses class appears), fall back to a landmark-driven teardrop that respects nose bounds instead of stretching below the nostrils (`npm test`).
- Mask overlay debug: capture segmentation masks on every dev run, add UI toggle to select mask classes post-analysis, and update overlays/tests to honor the highlight without re-running analysis (`npm test`).
- Type hygiene: removed remaining `any` usages across src; added `DetectorImage` union type, typed ORT session metadata, output tensor guards, and replaced helper funcs with typed variants.
- Parsing adapter: added face-centered square crop (eye-based) before ORT and mapped outlines back to full image coordinates.
- Parsing adapter: selects best preprocessing attempt (layout/order/norm), merges ONNX-derived brows/nose hints with heuristics, and exposes env overrides for class IDs.
- Parsing adapter: allows brow/nose class aliases (glasses class 6 included by default) via env, clips segmentation to heuristic polygons to avoid large outlines, and added mocked coverage.
- Parsing adapter: clip segmentation masks to heuristic polygons, ensuring ORT outlines stay local (prevents big rectangles) and added mocked tests for the merge path.
- Dev log: show active adapter and parsing time per image in UI near the adapter toggle. Instrument worker to measure `regionHints` time and return `{adapter, parseMsA, parseMsB}`; page renders a small text log.
- E2E: added `e2e/ui-dev-log.spec.ts` to assert dev log visibility on `/`.
- Hydration: removed `suppressHydrationWarning` from dev log; element is mount-gated to avoid SSR/client mismatch.
- Dev log enhancement: show hints source (`onnx` or `heuristic`) per image when available.
- Parsing adapter: target package is `onnxruntime-web` (browser runtime); removed scoped alternative.
- ORT wiring: use literal dynamic import and explicit wasmPaths for jsep loader; docs note to copy `ort-wasm-simd-threaded.wasm` and `ort-wasm-simd-threaded.jsep.mjs` into `public/ort/`.
- Parsing IDs: switched tentative class IDs to CelebAMask-like mapping `{brows: 2/3, nose: 9}` and added a dev-only class histogram log to confirm labels.
- Output layout: parsing adapter now detects NHWC vs NCHW output tensors and computes argmax accordingly to avoid all-background masks.
- Input handling: detects input tensor layout from session metadata; tries RGB first, then flips layout and channel order to BGR if needed before falling back, to avoid background-only results.
- Output selection: when multiple outputs exist, pick the tensor that matches [1,K,H,W] or [1,H,W,K] (K>1, H/W≈S) before decoding to labels.
- Stage verification: project is in Stage 2 (workerized analysis, health route, PWA shell, E2E smoke present).
- Added unit tests:
  - `src/__tests__/summaries.test.ts`
  - `src/__tests__/offset-polygon.test.ts`
- Verified green suites:
  - `npm test`
  - `npm run e2e` and `npm run e2e:deep`

## Prospective Plan - Feature Selection & Stroking
- Detector upgrades
  - Keep `getDetector()` stable but allow alternative adapters (TFJS/ONNX) in `web/src/models/`.
  - Pin compatible versions; run both smoke tests after any bump.
- Eyebrows via parsing (expected-looking arcs)
  - Add a face-parsing/segmentation adapter (future `face-parsing-adapter.ts`).
  - Extract eyebrow masks ? contour ? medial curve; smooth and draw as short open arcs.
  - Gate new path behind a flag, fallback to current static outlines.
- Nose enrichment
  - Prefer parsing or higher-fidelity landmark sets to extract alar contours + bridge with confidence gating.
  - Replace current fallback nose sequence when parsing is available.
- 3D normalization
  - Estimate head pose from landmarks; canonicalize before curve extraction to reduce foreshortening.
  - Keep regional similarity in normalized space (already using `normalizeByEyes`).
- Confidence-aware rendering
  - Use per-landmark (or mask) confidence to prune/smooth and to adjust stroke alpha/width in `ImageOverlayPanel.tsx`.
- Similarity-driven styling
  - Map region similarity ? color + width (already partially in place); refine scale/ticks and add a legend.
- Tests and smoke
  - Keep `/health/detector` client-only and fast.
  - Add lightweight unit tests for new adapters and curve extraction; avoid flaky visual snapshots.
- Acceptance
  - Brows: compact arcs above each eye, no temple-length sweeps.
  - Nose: clean alar curve + short bridge, stable across roll/yaw.
  - All unit + smoke tests green.


## Now (overlay follow-ups)
- Visual QA: validate new overlay shapes on varied samples; consider tuning brow crop fraction (0.85) and max radius cap (0.28xIPD), and nose bridge length.

## Done (recent)
- Added tests: src/__tests__/eye-center.test.ts, src/__tests__/regions-shape.test.ts.
- Overlay improvements: jaw concave-hull bottom chain; brows from static contours (central crop); nose alar arc + short bridge; similarity-colored strokes and reduced tension.
