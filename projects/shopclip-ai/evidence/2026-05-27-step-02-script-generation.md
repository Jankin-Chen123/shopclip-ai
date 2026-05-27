# Step 02 Script Generation Verification

## Scope

- Moved the editable script-generation panel into Creation Step 02 after asset preparation.
- Added a script draft textarea, "One-click generate" rewrite action, and "Generate storyboard" action.
- Added `POST /api/projects/:projectId/rewrite-script` so the backend receives the draft script, prepared asset ids/material metadata, keywords, and project selling points before returning a polished script.
- Kept Step 03 focused on storyboard re-editing after storyboard generation.

## Verification

- `corepack pnpm --filter @shopclip/shared build`: passed.
- `corepack pnpm --filter @shopclip/web test -- App.test.tsx`: passed, 47 tests.
- `corepack pnpm --filter @shopclip/api test -- p0-flow.test.ts`: passed, API suite 49 tests.
- `corepack pnpm typecheck`: passed.
- `corepack pnpm lint`: passed.
- `corepack pnpm build`: passed.
- `corepack pnpm test`: passed.
- Playwright screenshots captured:
  - `output/playwright/step02-script-generation.png`
  - `output/playwright/step02-script-generation-full.png`
  - `output/playwright/step03-storyboard-reedit.png`

## Notes

- In mock mode, script polishing uses deterministic fallback copy. When `AI_PROVIDER_MODE` is configured for a real provider, the rewrite endpoint routes through the existing text-generation provider path and falls back deterministically if provider output is unavailable.
