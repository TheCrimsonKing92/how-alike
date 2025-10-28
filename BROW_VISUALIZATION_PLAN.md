# Brow Visualization Improvement Plan

## Problem Statement

The brow overlay outlines don't accurately follow the hair boundary, especially for subjects with visible eyebrow hair (like subject B in test images). The blue outline hugs the anatomical brow ridge but misses the hair extent.

## Root Cause Analysis

### Landmark-based Detection Limitations
- MediaPipe FaceMesh provides 468 anatomical landmarks
- Brow landmarks (14 per brow) detect the **brow ridge anatomy**, not hair
- Magenta debug circles show landmarks cluster along the ridge, not hair boundary
- No amount of landmark adjustment can detect hair that extends beyond ridge

### Current Implementation
1. **Landmark detection** (facemesh adapter)
   - Uses `FEATURE_OUTLINES.brows` with 14 landmarks per brow
   - `web/src/lib/hints.ts` applies 1.5% IPD outward offset
   - Limited by where MediaPipe places landmarks (anatomical, not cosmetic)

2. **Segmentation exists but unused** (parsing adapter)
   - `web/src/models/transformers-parsing-adapter.ts:909-910` extracts brow masks (classes 6 & 7)
   - `maskToOutline()` converts pixel masks to polygon contours
   - Visual confirmation: parsing overlay (yellow/green) follows hair closely
   - **Issue**: These contours aren't being used for blue outlines

## What We've Tried

### ✅ Completed
1. **Expanded landmark coverage** - Increased from 10 to 14 landmarks per brow
   - Minimal improvement; still limited by ridge placement

2. **Removed smoothing** - Eliminated moving-average dampening
   - Preserves peaks but doesn't solve fundamental hair detection issue

3. **3D plane-based measurement** - Accounts for camera angle foreshortening
   - `web/src/lib/feature-axes.ts:740-877` - proper implementation
   - Improves **measurements** but not **visualization**

4. **Outward offset** - Pushes contour away from centroid
   - `web/src/lib/hints.ts:63` - currently 1.5% IPD
   - Marginal help; can't reach hair boundary

### 🔍 Investigation Needed
- **Parsing trace logs not visible** - Can't confirm segmentation contours are generated
- **Hint routing unclear** - Parsing adapter generates hints, but are they used?

## Proposed Solution Path

### Phase 1: Diagnostic (IMMEDIATE)
1. Enable parsing trace logs
   ```typescript
   // Check web/src/models/transformers-parsing-adapter.ts
   const PARSING_TRACE_LOGS = true; // or check env variable
   ```

2. Verify console shows:
   - `[transformers-parsing] processing region=brows classId=6 pixels=...`
   - `[transformers-parsing] outline for classId=6: X points`
   - Dev log shows "Hints: transformers" (not "Hints: landmarks")

3. Add hint source logging to `ImageOverlayPanel.tsx`
   ```typescript
   console.log('[overlay] Using hints from:', regions.__source);
   ```

### Phase 2: Fix Routing (IF NEEDED)
If parsing hints are generated but not used:

1. Check `web/src/workers/analyze.worker.ts` - ensure parsing hints reach UI
2. Verify `regionsA`/`regionsB` props use adapter-provided hints
3. Confirm no fallback to landmark hints when parsing available

### Phase 3: Refinement
1. **Simplify segmentation outlines**
   - Current `maskToOutline(..., 2.0)` simplification may be too aggressive
   - Try `1.0` or `1.5` for tighter fit to segmentation pixels

2. **Remove debug artifacts**
   - Remove magenta circles from `ImageOverlayPanel.tsx:242-250`
   - Remove console logs from `hints.ts`

3. **Documentation**
   - Note limitation: landmarks detect anatomy, parsing detects appearance
   - Recommend parsing adapter for accurate brow visualization

## Success Criteria

✅ **Primary Goal**: Parsing adapter blue outlines follow hair boundary as closely as yellow/green segmentation overlay

✅ **Secondary Goals**:
- No fallback to landmarks when parsing available
- Consistent behavior across different brow shapes/styles
- Performance acceptable (<100ms hint generation)

## Fallback Plan

If parsing hints can't be routed properly:

1. **Accept limitation & document**
   - Add UI note: "Brow overlays show anatomical position; individual hair may extend beyond outline"
   - Keep parsing adapter for measurements (which are correct)

2. **Optional: User override**
   - Allow users to toggle between landmark and segmentation overlays
   - Make parsing default for best accuracy

## Files Modified (So Far)

- `web/src/lib/regions.ts:69-70` - Expanded to 14 landmarks
- `web/src/lib/hints.ts:53-75` - Removed smoothing, added offset
- `web/src/lib/feature-axes.ts:740-877` - 3D plane-based measurement
- `web/src/components/ImageOverlayPanel.tsx:242-250` - Debug circles (temp)

## Next Actions

1. Run diagnostic (enable trace logs, check console)
2. Identify routing issue if hints aren't reaching overlay
3. Test with subject B images to confirm fix
4. Clean up debug code
5. Update TASKS.md with completion status
