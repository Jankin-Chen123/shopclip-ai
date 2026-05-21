# P0 Browser Verification Evidence

## Summary

- Date: 2026-05-21
- Part: `part-005-p0-integration-and-browser-verification`
- Result: Passed
- Browser runner: Playwright with Microsoft Edge channel
- API dev server: `http://localhost:4000`
- Web dev server: `http://localhost:5173`

## Flow Covered

1. Opened the P0 workspace at `/#project`.
2. Verified recoverable error state by loading a missing project ID and confirming `Project was not found.`
3. Created the default `GlowGrip Phone Stand` project.
4. Uploaded seeded asset metadata and verified the ready asset row.
5. Generated the deterministic fallback storyboard and verified four scenes.
6. Opened Studio, edited a scene subtitle, and saved the local edit.
7. Started render, verified completed trace events including `preview-created`.
8. Exported the demo video and verified the export-ready download URL.

## Screenshots

- `p0-00-recoverable-error-state.png`
- `p0-01-project-created.png`
- `p0-02-assets-and-storyboard.png`
- `p0-03-studio-edit.png`
- `p0-04-delivery-export.png`

## Commands Run

```text
corepack pnpm --filter @shopclip/web test
corepack pnpm --filter @shopclip/web typecheck
corepack pnpm --filter @shopclip/web lint
corepack pnpm --filter @shopclip/api test
corepack pnpm --filter @shopclip/web build
corepack pnpm --filter @shopclip/web test:e2e
corepack pnpm test
corepack pnpm typecheck
corepack pnpm build
corepack pnpm lint
```

## Results

- Web unit tests: passed, 2 tests.
- API tests: passed, 3 tests.
- Workspace tests: passed, 11 tests across shared, API, and web.
- Workspace typecheck: passed.
- Workspace build: passed.
- Workspace lint: passed.
- Playwright P0 E2E: passed, 1 test.
- API health check returned `{"service":"api","status":"ok","version":"0.1.0"}`.
- Web health check returned HTTP 200.
- Secret string check against `apps/web/dist/assets/*` found no matches for `sk-`, `OPENAI`, `API_KEY`, `SECRET`, `TOKEN`, or `DATABASE_URL`.

## Defects And Risk

- Initial Playwright assertions were too broad for duplicate status labels; the E2E selectors were tightened and rerun successfully.
- Root lint found an API test type-only import issue; it was fixed in `apps/api/src/p0-flow.test.ts` and lint was rerun successfully.
- No blocking P0 defects remain.
