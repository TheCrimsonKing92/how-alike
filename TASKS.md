# Tasks & Work Log

## Now
- **Segmentation neck cleanup guardrails** (NEW - 2025-10-22)
  - Done: flag scaffold plus ROI clamp/margin gating wired into transformers adapter (tests: `npm test -- parsing-config`)
  - Done: flag enabled via `web/.env.local` (`NEXT_PUBLIC_PARSING_NECK_GUARD=true`)
  - Done: margin increased to 0.7 and guard band reduced to 0.18x face height to stomp residual islands (`npm test -- parsing-config`)
  - Next: verify cloth alias suppression clears jaw artifacts across QA set; if stable, bake default on (update docs/tests)
- **Synthetic jaw integration roadmap** (In progress - 2025-10-23)
  - Done: adapters expose face/skin/neck logits in `transformers-parsing-adapter.ts` and return them through worker messaging
  - Done: shared `Point`/`Pt` types centralized in `web/src/lib/points.ts` and adopted across consumers for mask-driven jaw geometry
  - Done: `computeJawFromMasks` integrated in `analyze.worker.ts`, replacing jaw outlines with synthetic curves when confidence >= 0.12 and returning `{ polyline, confidence }` alongside fallback landmarks
  - Done: `feature-axes.ts` prioritizes synthetic jaw metrics (with fallback when confidence < tau) and overlay hit-testing uses the synthetic jaw polyline
- **Axis noise tolerance calibration** (NEW - 2025-10-24)
  - Done: canonical landmark fixture plus deterministic jitter harness feeds a new `measurement-variance.test.ts` (use `npm test -- measurement-variance`)
  - Done: calibrated eye-axis tolerances (canthal tilt absolute threshold 6 deg, eye size 0.24, IPD 0.09) based on observed variance
  - Done: added dev-only toggle (and worker plumbing) to disable axis noise compensation for debugging detailed scores
  - Next: expand variance coverage to brows/nose/jaw axes so remaining tolerances move off placeholder values
## Next
- Glossary rollout follow-ups: surface `DefinitionTooltip` in condensed result summaries, draft copy review workflow, and scope Phase 2 SVG overlay assets.

## Done (recent)
- Removed age validation pipeline (models, scripts, datasets, fixtures, and docs) so analysis returns to morphology-only signals.
- Jaw labeling improvement plan captured in `FEATURE_AXES_PLAN.md` with synthetic jaw, blending, cleanup, wiring targets, and validation checklist.
- Overlay hover upgrade: added segmentation-aware hit testing so tooltips fire across full SegFormer regions and validated with new `overlay-hit-test` Vitest coverage plus `npm test`.
- Feature narratives annotated with glossary tooltips: FeatureDetailPanel and ResultsPanel use `DefinitionTooltip` plus `annotateGlossaryText` for summaries and region lists (`definition-tooltip.test.tsx`, `feature-detail-panel.test.tsx`, `results-panel.test.tsx`).
- DefinitionTooltip component built with lazy glossary loading, hover capability detection, IntersectionObserver gating, and unit coverage (`definition-tooltip.test.tsx`).
- Narrative run-on cleanup plan (2025-10-24): Refactored `overallNarrative` bucket logic to emit short sentences per region tier, added helper utilities, and expanded `feature-narratives.test.ts` coverage (`npm test -- feature-narratives`).
