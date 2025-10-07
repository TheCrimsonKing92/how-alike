# Rules for Agents

## Implementation
- Prefer modern techniques and standards

## Quality
- All code must be tested, and all tests must pass, to be considered acceptable
- Add or update tests for the code you change, even if nobody asked
- When any test errors are found, resolve them until the entire test suite is green
- After moving files or changing imports, run tests to confirm everything still passes

## E2E Smoke Test — Best Practices
- When to run in CI
  - On main branch merges and release builds
  - Nightly (to catch CDN/model or browser updates)
  - On PRs that touch any of:
    - `web/src/models/**`, `web/src/app/**`, `web/src/lib/**`, `web/next.config.*`, `web/playwright.config.*`
    - Dependency bumps affecting Next.js, Playwright, TensorFlow.js, or MediaPipe
- When to run locally
  - Before pushing changes to detector init, routing, or build config
  - After upgrading TFJS/face-landmarks-detection/Next.js
  - If Analyze breaks or model fails to load
  - Quick loop: keep `npm run dev` running and use `npm run e2e` (Playwright is configured to `reuseExistingServer`)
- Performance tips
  - Run only Chromium locally (`--project=chromium`)
  - Use headless and disable tracing (defaults set)
  - Cache Playwright browsers (`npx playwright install`) and npm modules
- Health route
  - The smoke test targets `/health/detector` which calls `getDetector()` and returns `ok` on success. Ensure this route remains lightweight and client-only.

## E2E Smoke Test — Required
- The Playwright smoke test must remain green. Failing smoke tests block merges.
- Do not skip, quarantine, or disable the smoke test to merge code.
- If the smoke test breaks due to external causes (e.g., CDN outage), either:
  - Add a temporary, clearly documented retry with a short timeout, or
  - Mark the build as unstable and create a tracking issue. Do not merge unrelated code until green.
- Run the smoke test locally before merging changes affecting model init, routing, or build config.

## Process Adjustments
- Merge gating
  - All unit tests and the shallow E2E smoke must pass on PRs.
  - The deep E2E smoke must pass on main/nightly; for PRs that modify detector/runtime or dependencies (see below), run deep locally before merge when possible.
- Changes requiring extra validation
  - Touching: `web/src/models/**`, `web/src/app/**`, `web/src/lib/**`, `web/playwright.config.*`, `web/package.json`
  - Dependency bumps involving: Next.js, `@tensorflow-models/face-landmarks-detection`, `@tensorflow/tfjs-*`, `@playwright/test`
  - Action: run `npm run e2e` (shallow) during dev loop and `npm run e2e:deep` before merge.
- Runtime selection
  - Default to TFJS runtime; include a safe fallback (WebGL → CPU) and keep unit/E2E tests green.
  - If changing runtime logic, document it in the PR and update smoke tests as needed.
- TFJS backends
  - Register backends via static imports; keep `@tensorflow/tfjs-backend-cpu` as a dependency.
  - Ensure `tf.ready()` is awaited before detector creation.
- Version pinning
  - Pin compatible versions for Next.js, TFJS, and face-landmarks-detection. After bumps, run both smoke tests.
- Observability
  - Log chosen TFJS backend and detector init duration in dev (info-level) to aid diagnosis; keep noise minimal in prod.
- Health route
  - Keep `/health/detector` stable. It must remain client-only and fast; update smoke tests if its behavior changes.
- Model hosting (if deep test flakiness persists)
  - Prefer self-hosting model assets under `public/models/` and pointing the detector to local URLs; track with an issue if adopted later.

## Self-Improvement
- After each interaction, reflect on any way to update this AGENTS.md file to improve future interactions
