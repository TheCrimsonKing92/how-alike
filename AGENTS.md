# Rules for Agents

## Follow Project Instructions
- Always read the current contents of the following files and abide by their direction: ./PROJECT.md, ./ARCHITECTURE.md, ./IMPLEMENTATION.md, and ./FEATURE_AXES_PLAN.md (for detailed feature analysis work)

## Don't Be Too Hasty
- You can and should check your work before you tell me something which might be false
- If the user somehow indicates they need to take action, don't offer a bunch of instruction if they haven't asked for assistance (they are likely just updating you on their next steps)

## Communication Style
- Be concise and terse in responses unless asked for greater detail
- Avoid lengthy explanations, summaries, or play-by-play narration of what you're doing
- Focus on executing tasks and sharing results, not documenting every step
- When finished, provide a brief summary of what was accomplished
- Save detailed explanations for when the user explicitly requests them

## Debugging Discipline
- **Read documentation first** - Before guessing at APIs or implementing workarounds, search for and read official documentation, existing test scripts, or working examples in the codebase
- **Test before suggesting** - Never propose code changes without first verifying they work via tests, isolated scripts, or inspection of the actual API
- **Trace data flow** - When bugs occur, trace the data flow from source to usage. Check if objects are being modified, transferred, or invalidated before use
- **Ask for fresh logs** - When the user shares visual results or says they tested something, always ask for fresh console logs rather than assuming old debugging context still applies
- **Simple explanations first** - Before adding complex debugging code, check for simple issues: null/undefined values, timing problems, object lifecycle issues (transfer, close, detach)

## Track Your Work
- Use appropriate git commit messages to explain what's been done
- ALWAYS track current and future work in TASKS.md
- After changes are made ALWAYS update TASKS.md to current state (most importantly remove tasks that are done)
- Update TASKS.md progressively as you work:
  - Move completed items from ## Now to ## Done with a brief summary
  - Add new discovered tasks to ## Now or ## Next as appropriate
  - Keep ## Now focused on active work (1-3 items maximum)
  - Update TASKS.md before making git commits so the task log stays synchronized with code changes

## Implementation
- Prefer modern techniques and standards

## Quality
- All code must be tested, and all tests must pass, to be considered acceptable
- When using TypeScript, avoid the use of the `unknown` and `any` types where possible
- Add only absolutely necessary observability code to aid diagnosing problems in logs
- Add or update tests for the code you change, even if nobody asked
- When any test errors are found, resolve them until the entire test suite is green
- After moving files or changing imports, run tests to confirm everything still passes

## E2E Smoke Test - Best Practices
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

## E2E Smoke Test - Required
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
  - Default to TFJS runtime; include a safe fallback (WebGL to CPU) and keep unit/E2E tests green.
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
- When the user shares visual outputs (screenshots, UI captures) without fresh console logs, do not assume previously seen logs still apply; explicitly ask for new logs or confirmation before relying on past debugging context.
- When updating workflow guidance, testing requirements, or development practices in AGENTS.md, also update CLAUDE.md to keep both files synchronized. AGENTS.md contains detailed rules for ongoing work, while CLAUDE.md provides high-level guidance for new Claude Code instances.

## Editing Hygiene
- Never insert literal escape sequences (like `\n`) into files. Write real newlines.
- Prefer using the apply_patch tool for edits; avoid ad-hoc regex replacements that can corrupt content.
- After scripted changes, open the file and verify content before proceeding.
- Keep docs ASCII-only (no smart quotes, em/en dashes, or fancy arrows).
