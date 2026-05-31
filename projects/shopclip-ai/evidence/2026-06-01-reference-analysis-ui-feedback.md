# Reference Analysis UI Feedback Verification

Date: 2026-06-01

## Scope

Verified and improved the public reference video breakdown interaction on the production site.

## Root Cause

The real backend chain was available, but the user-facing feedback after clicking "Analyze reference" was too weak. A submitted job could move to `analyzing`, while the page mainly relied on the list row to communicate progress.

## Changes

- `apps/web/src/features/references/ReferenceLibraryPanel.tsx`
  - Shows `Submitting...` while the submit request is in flight.
  - Shows a visible running summary for `registered` or `analyzing` reference jobs.
  - Shows a failed summary with retry guidance when any reference job is `failed`.
- `apps/web/src/styles.css`
  - Adds responsive styling for the running and failed reference task summaries.
- `apps/web/src/app/App.test.tsx`
  - Adds regression coverage for submit feedback and failed job guidance.

## Local Verification

```powershell
corepack pnpm --filter @shopclip/web test -- App.test.tsx
corepack pnpm --filter @shopclip/web typecheck
corepack pnpm --filter @shopclip/web build
```

Results:

- `App.test.tsx`: 78 tests passed.
- Web typecheck: passed.
- Web production build: passed.

## Deployment Verification

Command:

```powershell
ssh -i C:\Users\23909\.ssh\Codex.pem ubuntu@152.136.252.134 "cd /www/wwwroot/shopclip-ai && ./deploy.sh"
```

Result:

- Server pulled commit `cd55b2d`.
- Shared package build passed.
- Prisma client generation and migrations passed; no pending migrations.
- API build passed.
- Web build passed.
- PM2 restarted `shopclip-ai-api`.
- Nginx config test passed and reloaded.
- Health check returned `{"service":"api","status":"ok","version":"0.1.0"}` after the first retry.

## Production Browser Verification

Production URL: `http://152.136.252.134/#inspiration`

Input:

- Source video: direct Douyin VOD MP4 URL provided by the user.
- Platform: `TikTok`
- Category: `water cup`
- Test title: `water cup ui smoke 1780245530173`

Observed:

- Submit button was enabled before click.
- `POST /api/references/analyze` returned HTTP `202`.
- The page immediately displayed `Reference breakdown is running`.
- The new reference row appeared with `analyzing`.
- Polling `GET /api/references` showed the job became `ready` after about 162 seconds.
- Ready analysis contained 5 commerce narrative segments and 4 key viral factors.
- Reloading the inspiration page showed the same title with `ready` and an enabled `Add to script library` action.

## Remaining Notes

- Some older reference jobs can remain `analyzing`; this task did not change historical job cleanup.
- Public VOD URLs can expire. If a future URL is no longer downloadable, the frontend now surfaces failed-job guidance and the row-level provider/download error.
