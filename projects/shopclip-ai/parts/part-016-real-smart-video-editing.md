# Part 016: Real Smart Video Editing Step 05

## Status

- Project slug: shopclip-ai
- Part number: 016
- Owner role: `implementation-engineer`
- Status: In Progress
- Created: 2026-06-02
- Last updated: 2026-06-02

## Source Of Truth

Before coding, read `../00-requirements.md`, `../01-design-spec.md`, `../02-development-plan.md`, `AGENTS.md`, and this file.

## Objective

Add a real Step 05 video editing stage that uses the existing structured asset/slice metadata, storyboard scenes, AI planning, and ffmpeg composition to produce an edited final video with clip stitching, transitions, subtitles, optional voice/BGM layers, and a usable timeline editor.

## Non-Negotiable Scope

- No mock-only implementation. Tests may mock process boundaries, but the product path must call the real backend endpoint and real ffmpeg composition.
- Step 05 must be visible in the creation workflow, not hidden behind Step 04 export.
- The editor must use current project scenes and structured asset slices as source material.
- The backend must return a persistent, inspectable edit plan and an edited video URL.
- The frontend must expose timeline-level editing with drag/reorder, keyboard actions, live preview, and per-scene refresh without rerendering the whole storyboard.

## Architecture

1. Shared contracts define `SmartEditRequest`, `SmartEditPlan`, `SmartEditSegment`, `SmartEditResult`, and smart-edit metadata on `RenderTask`.
2. Backend route `POST /projects/:projectId/smart-edit` loads the project, creates a queued render task immediately, and runs the general-model planning plus ffmpeg composition in the background.
3. ffmpeg editing service materializes selected source clips from COS/local URLs, trims by slice time, normalizes aspect ratio, adds simple crossfade/fade transitions where supported, burns ASS subtitles, mixes optional generated voice/BGM audio, and publishes the edited MP4 through the existing storage provider.
4. Frontend adds `edit` as creation Step 05. The page shows a real timeline, selected segment inspector, drag/reorder controls, keyboard shortcuts, preview player, AI plan button, segment refresh button, and export result.

## Implementation Tasks

### Task 1: Shared Contracts

**Files**
- Modify: `packages/shared/src/schemas.ts`
- Modify: `packages/shared/src/types.ts`
- Test: `packages/shared/src/schemas.test.ts`

**Acceptance**
- `SmartEditRequestSchema` validates media settings, locale, optional target language, and optional segment overrides.
- `SmartEditPlanSchema` requires every segment to map to a storyboard scene and a source asset or generated scene clip.
- `SmartEditResultSchema` includes `plan`, `renderTaskId`, `previewUrl`, `exportUrl`, and `traceEvents`.

### Task 2: Backend Planning Provider

**Files**
- Create: `apps/api/src/providers/ai/smartEditPlannerProvider.ts`
- Test: `apps/api/src/providers/ai/smartEditPlannerProvider.test.ts`

**Acceptance**
- Builds a prompt from product brief, storyboard scenes, structured asset metadata, slice metadata, and media settings.
- Calls the configured general model when available.
- Validates model JSON output with `SmartEditPlanSchema`.
- Falls back only to deterministic local planning when provider call fails, and marks trace as fallback instead of pretending it was AI output.

### Task 3: ffmpeg Smart Edit Composer

**Files**
- Create: `apps/api/src/providers/renderer/smartEditComposer.ts`
- Modify: `apps/api/src/providers/renderer/ffmpegComposer.ts`
- Test: `apps/api/src/providers/renderer/smartEditComposer.test.ts`

**Acceptance**
- Downloads/materializes video clips from selected asset URLs or existing render scene clips.
- Uses slice `startSecond` and `endSecond` for `-ss`/`-t` trimming.
- Converts still images into timed video clips when no source video slice exists.
- Normalizes to selected ratio/resolution.
- Adds ASS subtitles with `Noto Sans CJK SC`.
- Supports simple transitions: cut, fade, crossfade where clip durations allow.
- Produces a local MP4 and uploads it through COS using the same storage provider pattern as render exports.

### Task 4: Backend API Route

**Files**
- Modify: `apps/api/src/modules/projects/router.ts`
- Modify: `apps/api/src/modules/projects/projectStore.ts`
- Modify: `apps/api/src/modules/projects/projectStorePrisma.ts`
- Test: `apps/api/src/smart-edit-flow.test.ts`

**Acceptance**
- `POST /projects/:projectId/smart-edit` creates a traceable queued edit job and returns `202 + RenderSnapshot` quickly; `/render-tasks/:id` exposes progress and final output.
- `POST /projects/:projectId/smart-edit/segments/:sceneId/refresh` creates a queued partial refresh job, recomposes only the requested segment, and then rebuilds the final output from cached segment outputs.
- Errors are user-facing and include the ffmpeg stderr tail.

### Task 5: Frontend API and Step 05 Page

**Files**
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/components/layout/AppShell.tsx`
- Create: `apps/web/src/features/edit/SmartEditPanel.tsx`
- Modify: `apps/web/src/app/App.tsx`
- Modify: `apps/web/src/app/i18n.ts`
- Test: `apps/web/src/app/App.test.tsx`

**Acceptance**
- Creation workflow order becomes Project -> Assets/Script -> Studio -> Render -> Edit -> Dashboard.
- Step 05 shows timeline segments with stable widths based on duration.
- Drag/drop and arrow buttons reorder timeline segments.
- Keyboard actions: left/right selects segment, delete disables/removes a segment from the edit plan, space toggles preview play when focused on preview.
- Segment inspector can change duration, source asset/slice, transition, subtitle, voice text, target language, and BGM settings.
- “AI smart edit” calls the backend endpoint, not a local mock.
- “Refresh selected segment” calls the backend partial refresh endpoint.

### Task 6: Deployment Verification

**Commands**
- `corepack pnpm --filter @shopclip/shared test`
- `corepack pnpm --filter @shopclip/api exec vitest run src/smart-edit-flow.test.ts src/providers/renderer/smartEditComposer.test.ts`
- `corepack pnpm --filter @shopclip/web exec vitest run src/app/App.test.tsx`
- `corepack pnpm --filter @shopclip/api typecheck`
- `corepack pnpm --filter @shopclip/web typecheck`
- `corepack pnpm --filter @shopclip/api build`
- `corepack pnpm --filter @shopclip/web build`
- `corepack pnpm --filter @shopclip/api lint`
- `corepack pnpm --filter @shopclip/web lint`
- Deploy with `/www/wwwroot/shopclip-ai/deploy.sh`.
- Server smoke test must run real ffmpeg against at least one local image/video clip plus Chinese subtitles.

## Current Notes

- Current Step 05 dashboard must move to Step 06 or remain as the dashboard page after editing.
- Existing `SceneRenderClip` composition is not enough because it only stitches already generated Seedance clips. Smart edit must also be able to use merchant video slices and image assets.
- Existing structured slice metadata is sufficient for first implementation: role, timing, search text, tags, action, and product visibility.

## 2026-06-02 Async Smart Edit Job Fix

- User-visible issue:
  - Smart edit could block the HTTP request while the server called the general model and ffmpeg, making Nginx/browser timeout likely on real renders.
  - Frontend needed a clearer running state and polling path instead of assuming `/smart-edit` returned a finished video.
- Fix:
  - Added `smartEditPlan` and `smartEditSegmentOutputs` to `RenderTask` in the shared schema and Prisma model.
  - Added migration `apps/api/prisma/migrations/20260602153000_add_smart_edit_render_metadata/migration.sql`.
  - `POST /projects/:projectId/smart-edit` now returns `202` with a queued render task, then runs model planning and ffmpeg composition in a background job.
  - `POST /projects/:projectId/smart-edit/segments/:sceneId/refresh` now also returns `202` and stores the refreshed plan/output on the render task.
  - Frontend converts completed smart-edit render tasks back into the Step 05 preview/result model, polls queued/running tasks, and restores completed smart-edit history after project reload.
- Subtitle/copy guard:
  - The focused flow test now uses readable copy and verifies refreshed segment copy survives into `smartEditPlan`, preventing regressions where symbol-like text silently enters the final ASS burn-in path.
- Verification:
  - `corepack pnpm --filter @shopclip/shared build`
  - `corepack pnpm --filter @shopclip/api exec vitest run src/smart-edit-flow.test.ts src/providers/renderer/ffmpegComposer.test.ts src/providers/renderer/smartEditComposer.test.ts src/providers/ai/smartEditPlannerProvider.test.ts`
  - `corepack pnpm --filter @shopclip/web exec vitest run src/app/App.test.tsx`
  - `corepack pnpm --filter @shopclip/api typecheck`
  - `corepack pnpm --filter @shopclip/web typecheck`
  - `corepack pnpm --filter @shopclip/api lint`
  - `corepack pnpm --filter @shopclip/web lint`
  - `corepack pnpm --filter @shopclip/api build`
  - `corepack pnpm --filter @shopclip/web build`

## 2026-06-02 Smart Edit Model Plan Normalization

- Live verification after async deployment:
  - `POST /api/projects/cmpqigao80001whl4g32ii0bv/smart-edit` returned `202` with queued render task `f69daa20-e10e-4bbc-8d45-cddd58bdfb94`.
  - The task completed and produced COS export, but trace showed `smart-edit-plan-fallback`.
  - Root cause: the general model had been called, but returned near-valid JSON with natural-language transition/audio values and empty source URL strings, causing strict schema parsing to reject the whole model plan.
- Fix:
  - `normalizeModelPlan` now merges model output with the local executable baseline by `sceneId`.
  - Invalid transition/audio enum values fall back to the requested/local settings.
  - Empty source URL strings are ignored so valid local `assetId`/`imageUrl` source data survives.
  - Serious missing structure still fails and falls back; this fix only normalizes recoverable model-output shape issues.
- Regression coverage:
  - Added a planner provider test where the model returns `transition: "quick push-in"`, `sceneClipUrl: ""`, `imageUrl: ""`, `bgmTrack: "upbeat pop music"`, and `voice: "female creator"`.
  - Expected behavior is `fallback.used === false` with normalized `cut`, `creator-pop`, `clear-host`, and valid source asset information.
- Live verification after deployment:
  - `POST /api/projects/cmpqigao80001whl4g32ii0bv/smart-edit` returned `202` with queued render task `00b2943b-5d52-4b79-a924-5b3b9a565119`.
  - Polling `/api/render-tasks/00b2943b-5d52-4b79-a924-5b3b9a565119` reached `completed`.
  - Trace included `smart-edit-plan-model` and `smart-edit-ffmpeg-compose`.
  - Final export URL: `https://shopclip-standard-1436426026.cos.ap-beijing.myqcloud.com/projects/cmpqigao80001whl4g32ii0bv/smart-edits/6a2480a3-a7c6-415b-bb04-ef23f1bccbc2/export.mp4`.
  - Extracted frame from the export showed readable Chinese burned subtitle: `这软萌小猫水杯颜值也太戳少女心了！`.
- Verification:
  - `corepack pnpm --filter @shopclip/api exec vitest run src/providers/ai/smartEditPlannerProvider.test.ts`
  - `corepack pnpm --filter @shopclip/api exec vitest run src/providers/ai/smartEditPlannerProvider.test.ts src/smart-edit-flow.test.ts`
  - `corepack pnpm --filter @shopclip/api typecheck`
  - `corepack pnpm --filter @shopclip/api lint`
  - `corepack pnpm --filter @shopclip/api build`

## 2026-06-02 Subtitle Rendering Fix

- Root cause investigation:
  - Server `ffmpeg` + `libass` + `Noto Sans CJK SC` can render Chinese correctly when the ASS file contains valid UTF-8 text.
  - Recent business export ASS files under `/www/wwwroot/shopclip-ai/render-exports` contained valid UTF-8 Chinese, and a pulled frame from the latest export showed normal bottom subtitles.
  - A separate SSH pipe smoke file showed `????????` only because Windows PowerShell converted Chinese text before it reached the server; this is not the product path because Node writes ASS files as UTF-8 directly.
- Code fix:
  - `smartEditComposer` now derives burn-in subtitle text through `subtitleTextForSegment`.
  - If `segment.subtitle` is empty, replacement symbols, or mostly unreadable symbols, it falls back to the readable `segment.voiceover` text.
  - `mediaSettings.subtitlesEnabled` is now passed from the smart edit routes into the ffmpeg composer, so the UI setting controls whether ASS subtitles are burned in.
- Verification:
  - `corepack pnpm --filter @shopclip/api exec vitest run src/providers/renderer/smartEditComposer.test.ts`
  - `corepack pnpm --filter @shopclip/api typecheck`
  - `corepack pnpm --filter @shopclip/api build`

## 2026-06-02 Transition And Dubbing Hardening

- Real transition implementation:
  - `fade` now adds actual ffmpeg `fade=t=in` / `fade=t=out` filters to the segment video filter.
  - `crossfade` and `wipe` now use a real ffmpeg `xfade` filter chain for timeline stitching instead of plain concat.
  - Timeline audio is intentionally rebuilt after video stitching through TTS/BGM, so xfade output maps video only and avoids stale source audio conflicts.
- Polyglot / dubbing implementation:
  - The smart edit planner system prompt now explicitly requires `subtitle` and `voiceover` to be rewritten in `targetLanguage` when provided.
  - The user prompt includes a concrete dubbing requirement so the configured general model returns localized copy for both burned subtitles and TTS voiceover.
  - The composer already maps `targetLanguage` to `espeak-ng` voices for real TTS generation.
- Verification:
  - `corepack pnpm --filter @shopclip/api exec vitest run src/providers/renderer/smartEditComposer.test.ts src/providers/ai/smartEditPlannerProvider.test.ts src/smart-edit-flow.test.ts`
  - `corepack pnpm --filter @shopclip/api typecheck`
  - `corepack pnpm --filter @shopclip/api lint`
  - Server smoke: real ffmpeg generated two color clips, applied `fade` and `xfade=transition=fade`, and produced `/tmp/shopclip-xfade-smoke/out.mp4`.

## 2026-06-02 Planner Configuration Fix

- Browser verification against `http://152.136.252.134/#edit` showed Step 05 loaded and ffmpeg composition completed, but trace reported `smart-edit-plan-fallback` because the planner did not read the server general model config.
- Root cause:
  - Server `.env`, `apps/api/.env`, and PM2 runtime environment had `AI_GENERAL_API_KEY`, `AI_GENERAL_MODEL_ID`, `ARK_API_KEY`, and `ARK_API_BASE_URL`.
  - The frontend can send partial general settings such as provider/model/base URL without an API key.
  - `getRequiredConfig` treated that partial user config as authoritative and returned `undefined` instead of merging it with server env credentials.
- Fix:
  - Partial frontend model/base/provider settings now use server env credentials when no frontend API key is provided.
  - Added a planner provider regression test that asserts the Ark request uses the env key while preserving the frontend-selected model/base URL.
- Verification:
  - `corepack pnpm --filter @shopclip/api exec vitest run src/providers/ai/smartEditPlannerProvider.test.ts src/smart-edit-flow.test.ts`
  - `corepack pnpm --filter @shopclip/api typecheck`
  - `corepack pnpm --filter @shopclip/api lint`

## 2026-06-02 Ark Endpoint Routing Fix

- Browser verification after the configuration fix showed the planner reached Ark, but `AI_GENERAL_MODEL_ID=ep-...` was still sent to `/responses` and Ark returned `InvalidEndpointOrModel.ModelIDAccessDisabled`.
- Fix:
  - Ark versioned model IDs continue to use `/responses`.
  - Ark custom endpoint IDs beginning with `ep-` now use `/chat/completions`.
  - Added a planner provider regression test proving `ep-` routes through chat completions and still uses server env credentials.
- Verification:
  - `corepack pnpm --filter @shopclip/api exec vitest run src/providers/ai/smartEditPlannerProvider.test.ts`
  - `corepack pnpm --filter @shopclip/api typecheck`

## 2026-06-02 Mojibake Subtitle Guard

- User-visible issue:
  - Some smart-edit outputs could show unreadable symbol-like subtitles when a scene subtitle contained mojibake text such as `鍊掕繃...`.
- Root cause:
  - `subtitleTextForSegment` rejected pure replacement-symbol captions like `????????`, but treated mojibake CJK-looking text as readable, so the bad subtitle could be burned into ASS instead of falling back to the readable voiceover/copy field.
  - Server evidence showed the latest product ASS file itself was valid UTF-8 and a pulled frame from `export.mp4` rendered Chinese subtitles correctly, so the remaining risk was bad input text selection rather than ffmpeg/font rendering.
- Fix:
  - Added mojibake detection before ASS burn-in.
  - If `subtitle` is unreadable, replacement symbols, or likely mojibake, the composer now falls back to readable `voiceover`.
  - Added regression coverage for both replacement-symbol subtitles and mojibake subtitles.
- Verification:
  - `corepack pnpm --filter @shopclip/api exec vitest run src/providers/renderer/smartEditComposer.test.ts`
  - `corepack pnpm --filter @shopclip/api typecheck`
  - `corepack pnpm --filter @shopclip/api lint`
  - `corepack pnpm --filter @shopclip/api build`
  - Deployed commit `c052959` with `/www/wwwroot/shopclip-ai/deploy.sh`.
  - Live checks: `http://152.136.252.134/health` returned ok, homepage returned 200.
  - Server smoke: importing `apps/api/dist/providers/renderer/smartEditComposer.js` returned `倒过来摇也不漏` for a mojibake subtitle with readable voiceover.
