# Part 008: P1 TTS, Subtitles, BGM, Retry, And Trace Hardening

## Status

- Project slug: shopclip-ai
- Part number: 008
- Owner role: `implementation-engineer`
- Status: Done
- Created: 2026-05-21
- Last updated: 2026-05-28

## Source Of Truth

Before starting, read `../00-requirements.md`, `../01-design-spec.md`, `../02-development-plan.md`, and `AGENTS.md`.

## Objective

Add P1 media controls and make generation failures recoverable and observable.

## Scope

### In Scope

- TTS provider adapter with mock fallback.
- Subtitle overlay/control data.
- BGM selection.
- Retry action for failed generation/render steps.
- Hardened trace statuses.

### Out Of Scope

- Perfect audio/video synchronization for arbitrary media.
- Licensed music marketplace.

## Dependencies

- Prior Parts: Part 005.

## Expected Files Or Modules

- `apps/api/src/providers/tts/`
- `apps/api/src/providers/renderer/`
- `apps/api/src/modules/render/`
- `apps/web/src/features/render/`
- `apps/web/src/features/studio/`

## Acceptance Criteria

- [x] User can select or preview TTS/subtitle/BGM settings.
- [x] Mock render visibly reflects subtitle and selected media state.
- [x] Failed render/generation step exposes retry.
- [x] Retry preserves previous successful project/storyboard data.
- [x] Trace entries include step, timestamp, status, message, and retry relationship when applicable.

## Completion Notes

- Added shared media settings and render request contracts.
- Added mock TTS provider and extended mock renderer with TTS, subtitle, BGM, failure, and retry trace events.
- Added render retry endpoint: `POST /api/render-tasks/:renderTaskId/retry`.
- Added Delivery UI controls for TTS voice, subtitle style, BGM track, subtitle toggle, forced failure, and retry.
- Added Delivery UI controls for Seedance video settings: aspect ratio, resolution, generate audio, watermark, and optional seed. These values are sent in the render request and are not required as `.env` values.
- 2026-05-28 follow-up: Reverted backend Seedance model alias normalization. Render submission now uses the exact `.env` model configuration from `AI_VIDEO_MODEL_ID` / `AI_VIDEO_ENDPOINT_ID`; production should configure the Ark `ep-...` endpoint ID for the video role.
- 2026-05-28 follow-up: API startup now loads the local `.env` with override enabled so stale process-level values cannot keep an old video model active when the server `.env` has been updated.
- Added browser evidence screenshots:
  - `projects/shopclip-ai/evidence/p1-08-failed-render-retry-state.png`
  - `projects/shopclip-ai/evidence/p1-08-media-render-success.png`
  - `projects/shopclip-ai/evidence/part-008-verification.md`
  - `projects/shopclip-ai/evidence/2026-05-28-seedance-env-model-config.md`
  - `projects/shopclip-ai/evidence/2026-05-28-env-override-for-video-model.md`

## Verification Evidence

- `corepack pnpm test`
- `corepack pnpm typecheck`
- `corepack pnpm lint`
- `corepack pnpm build`
- `corepack pnpm --filter @shopclip/web test:e2e`
- `corepack pnpm --filter @shopclip/web test -- App.test.tsx`
- `corepack pnpm --filter @shopclip/api test -- seedanceRenderer.test.ts`
- `corepack pnpm --filter @shopclip/api test -- env.test.ts`

## Verification Plan

- Automated: render retry tests and media option validation.
- Manual: force a failure, retry, and verify recovery.
- Browser/screenshot: capture failed and successful trace states.
- Security: provider errors do not leak secrets.

## Risks And Follow-Ups

- Real TTS integration may be disabled for deployed demo if quota or latency is unsafe.
