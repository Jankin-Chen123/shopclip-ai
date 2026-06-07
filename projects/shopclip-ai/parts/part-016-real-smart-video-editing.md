# Part 016: Real Smart Video Editing Step 05

## Status

- Project slug: shopclip-ai
- Part number: 016
- Owner role: `implementation-engineer`
- Status: In Progress
- Created: 2026-06-02
- Last updated: 2026-06-06

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

## 2026-06-02 Smart Edit Duration And Timeline UI Hardening

- User-facing issue:
  - Step 05 segment duration input still allowed `0.5-15s`, while the current supported single-segment duration range is `[4,12]`.
  - The timeline separator previously used a non-ASCII middle dot, which rendered correctly in browser but is fragile in logs/terminals and could be confused with mojibake-style symbols.
- Fix:
  - `SmartEditSegmentSchema` and `SmartEditSegmentOverrideSchema` now enforce `durationSeconds` in `[4,12]`.
  - The smart-edit planner normalizes both local and model-returned durations into `[4,12]`.
  - The ffmpeg smart-edit composer clamps segment duration to `[4,12]` before materializing still/video clips.
  - Step 05 duration input now exposes `min=4`, `max=12`, `step=1`, and clamps user edits before updating the plan.
  - Timeline segment labels now use ASCII ` - ` separators.
- Verification:
  - `corepack pnpm --filter @shopclip/shared exec vitest run src/schemas.test.ts`
  - `corepack pnpm --filter @shopclip/web exec vitest run src/app/App.test.tsx`
  - `corepack pnpm --filter @shopclip/api exec vitest run src/providers/ai/smartEditPlannerProvider.test.ts src/providers/renderer/smartEditComposer.test.ts src/smart-edit-flow.test.ts`
  - `corepack pnpm --filter @shopclip/shared build`
  - `corepack pnpm --filter @shopclip/api typecheck`
  - `corepack pnpm --filter @shopclip/web typecheck`
  - `corepack pnpm --filter @shopclip/api lint`
  - `corepack pnpm --filter @shopclip/web lint`
  - `corepack pnpm --filter @shopclip/api build`
  - `corepack pnpm --filter @shopclip/web build`

## 2026-06-05 Caption Track Export Control

- User-facing improvement:
  - Smart edit now treats storyboard text as an editable caption material track instead of a display-only timeline row.
  - Each segment has `captionHidden`, so users can hide/show captions per segment, in batches, or for the whole caption track.
- Backend behavior:
  - `SmartEditSegment` and `SmartEditSegmentOverride` carry `captionHidden`.
  - The ffmpeg composer skips ASS subtitle burn-in only for caption-hidden segments while preserving the video segment, source audio, voiceover, and other captions.
  - Backend timeline metadata marks text elements as hidden when `captionHidden` is set.
- Frontend behavior:
  - The smart edit inspector exposes a per-segment caption export toggle.
  - Multi-select actions can hide/show selected captions.
  - The caption track header can hide/show the entire caption track.
- Verification:
  - `corepack pnpm --filter @shopclip/shared build`
  - `corepack pnpm --filter @shopclip/api typecheck`
  - `corepack pnpm --filter @shopclip/web typecheck`

## 2026-06-05 Audio Fade Controls For Smart Edit Timeline

- User-facing improvement:
  - Smart edit now exposes audio fade-in and fade-out controls for generated scene source audio, segment voiceover clips, and independent timeline audio elements.
  - These controls align the timeline closer to OpenCut-style clip inspection: users can trim/move audio material and control fade envelopes without leaving the editor.
- Contract/backend behavior:
  - `SmartEditTimelineElement`, `SmartEditSegment`, and `SmartEditSegmentOverride` now accept optional audio fade fields.
  - The smart-edit ffmpeg composer applies `afade` to separated source audio clips, independent audio timeline elements, segment voiceover, and independent voice elements.
  - Backend project route timeline metadata includes the fade values so persisted plans round-trip through render-task history.
- Test maintenance:
  - Updated the ffmpeg subtitle tests to assert the current generated ASS end timestamp `9:59:59.99`.
- Verification:
  - `corepack pnpm --filter @shopclip/shared build`
  - `corepack pnpm --filter @shopclip/shared test -- src/schemas.test.ts`
  - `corepack pnpm --filter @shopclip/api run test src/providers/renderer/ffmpegComposer.test.ts src/providers/renderer/smartEditComposer.test.ts`
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx`
  - `corepack pnpm --filter @shopclip/api typecheck`
  - `corepack pnpm --filter @shopclip/web typecheck`
  - `corepack pnpm --filter @shopclip/api build`
  - `corepack pnpm --filter @shopclip/web build`
  - `corepack pnpm --filter @shopclip/api lint`
  - `corepack pnpm --filter @shopclip/web lint`
  - `corepack pnpm --filter @shopclip/api exec vitest run src/providers/renderer/smartEditComposer.test.ts`
  - `corepack pnpm --filter @shopclip/web exec vitest run src/app/App.test.tsx`
  - `corepack pnpm --filter @shopclip/api build`
  - `corepack pnpm --filter @shopclip/web build`

## 2026-06-05 Caption And Voice Clip Offsets

- User-facing improvement:
  - Smart edit segments now persist separate in-segment offsets for caption text and generated voiceover.
  - The inspector exposes caption start and voice start fields, so text and narration material can be moved inside a clip instead of always starting at the video cut point.
  - Timeline metadata places caption and voice clips at their offset positions, making the track stack closer to a multi-track editor model.
- Backend behavior:
  - `SmartEditSegment` and `SmartEditSegmentOverride` carry `captionStartOffsetSeconds` and `voiceoverStartOffsetSeconds`.
  - ASS subtitle burn-in writes a real Dialogue start/end range for caption offset.
  - Voiceover generation applies ffmpeg `adelay` before padding/trimming the segment-length voice asset.
- Verification:
  - `corepack pnpm --filter @shopclip/shared build`
  - `corepack pnpm --filter @shopclip/api typecheck`
  - `corepack pnpm --filter @shopclip/web typecheck`
  - `corepack pnpm --filter @shopclip/api exec vitest run src/providers/renderer/smartEditComposer.test.ts`
  - `corepack pnpm --filter @shopclip/web exec vitest run src/app/App.test.tsx`
  - `corepack pnpm --filter @shopclip/web build`

## 2026-06-02 Partial Refresh Text Safety

- Issue found during live API verification:
  - A hand-written PowerShell refresh request could corrupt Chinese `currentPlan` copy into replacement-symbol text such as `????????`.
  - The browser path sends UTF-8 correctly, but accepting corrupted client-side plan text is still unsafe because it can flow into reused unchanged segments during partial refresh.
- Fix:
  - `buildSmartEditRefreshPlan` now sanitizes both refreshed and reused segments against the project storyboard scenes.
  - If segment `subtitle` or `voiceover` is unreadable replacement-symbol text, or mixed readable/symbol text with too high a symbol ratio such as `ins???????,?????????`, the backend falls back to readable text from the segment's other field or the authoritative storyboard scene.
  - Unchanged segments still reuse prior uploaded segment clips through `generated-scene-clip`; only their unsafe copy fields are repaired before the final compose metadata is stored.
- Verification:
  - `corepack pnpm --filter @shopclip/api exec vitest run src/smart-edit-flow.test.ts`
  - `corepack pnpm --filter @shopclip/api typecheck`
  - `corepack pnpm --filter @shopclip/shared exec vitest run src/schemas.test.ts`
  - `corepack pnpm --filter @shopclip/web exec vitest run src/app/App.test.tsx`
  - `corepack pnpm --filter @shopclip/api exec vitest run src/providers/ai/smartEditPlannerProvider.test.ts src/providers/renderer/smartEditComposer.test.ts src/smart-edit-flow.test.ts`
  - `corepack pnpm --filter @shopclip/api lint`
  - `corepack pnpm --filter @shopclip/web lint`
  - `corepack pnpm --filter @shopclip/shared build`
  - `corepack pnpm --filter @shopclip/api build`
  - `corepack pnpm --filter @shopclip/web build`
- Live verification after deploy:
  - Deployed commit `adabb8c` with `/www/wwwroot/shopclip-ai/deploy.sh`.
  - `http://152.136.252.134/health` returned `{"service":"api","status":"ok","version":"0.1.0"}` and homepage returned HTTP 200.
  - Posted a real segment refresh request for project `cmpqigao80001whl4g32ii0bv` using an intentionally corrupted `currentPlan` containing `????????` and `ins???????,?????????`.
  - Refresh task `fccce941-409c-4194-9773-339400dd9304` completed with readable Chinese subtitles restored from the authoritative storyboard scenes.
  - Export URL: `https://shopclip-standard-1436426026.cos.ap-beijing.myqcloud.com/projects/cmpqigao80001whl4g32ii0bv/smart-edits/19a5b26f-14f0-4025-be80-39f0723fd34b/export.mp4`.
  - Server ffmpeg extracted a frame from the export; visual inspection confirmed the bottom burn-in subtitle is readable Chinese text, not symbol blocks.
- Live UI verification before this backend hardening:
  - Loaded the latest `水杯` project on `http://152.136.252.134/#edit`.
  - Step 05 showed the completed smart edit timeline with `4s - cut/fade` labels and readable Chinese copy.
  - Filling the duration spinbutton with `3` clamped it back to `4`.

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

## 2026-06-02 Smart Edit Output Geometry Fix

- Issue found during completion audit:
  - Step 05 requests already carried `videoSettings.ratio` and `videoSettings.resolution`, but the ffmpeg smart-edit composer always normalized clips to fixed `720x1280`.
  - This meant horizontal, square, or 1080p edit requests were accepted by the API but not reflected in the final edited video.
- Fix:
  - `smartEditComposer` now derives output dimensions from `videoSettings`, using the requested resolution as the short side and preserving even dimensions for H.264.
  - Segment scale/crop filters now use the derived dimensions, for example `16:9 + 480p` becomes `854x480`.
  - Burned subtitle ASS metadata now uses the same dynamic `PlayResX` / `PlayResY` and scales font size and bottom margin by output height.
  - Smart-edit full render and segment refresh routes now pass `videoSettings` into the ffmpeg composer.
- Verification:
  - `corepack pnpm --filter @shopclip/api exec vitest run src/providers/renderer/smartEditComposer.test.ts`
  - `corepack pnpm --filter @shopclip/api exec vitest run src/smart-edit-flow.test.ts src/providers/ai/smartEditPlannerProvider.test.ts`
  - `corepack pnpm --filter @shopclip/api typecheck`
  - `corepack pnpm --filter @shopclip/api lint`
  - `corepack pnpm --filter @shopclip/api build`

## 2026-06-03 Selected Segment Live Preview

- Issue found during completion audit:
  - Step 05 preview showed the composed final video, but changing the selected segment source/copy did not give the user an immediate visual check before refreshing or rerendering.
- Fix:
  - Added a selected-segment live preview inside Step 05 that renders the current segment's image, video slice, or reused generated clip from the actual plan/source URL.
  - The live preview overlays the current segment copy, so edits to the segment copy are immediately visible in the editor.
  - Video previews use media fragments when slice start/end times are available.
  - Chinese copy now labels the voice field as `配音文案` instead of the ambiguous `音频参考`.
- Verification:
  - `corepack pnpm --filter @shopclip/web exec vitest run src/app/App.test.tsx`
  - `corepack pnpm --filter @shopclip/web typecheck`
  - `corepack pnpm --filter @shopclip/web lint`
  - `corepack pnpm --filter @shopclip/web build`
- Live verification after deploy:
  - Deployed commit `75ce438` with `/www/wwwroot/shopclip-ai/deploy.sh`.
  - `POST /api/projects/cmpqigao80001whl4g32ii0bv/smart-edit` with `bgmTrack: "tech-pulse"` completed as task `1e77494c-600e-4eee-a8f8-738113b525f6`.
  - Trace included `smart-edit-plan-model` and `smart-edit-ffmpeg-compose`, and the returned `smartEditPlan.audio.bgmTrack` stayed `tech-pulse`.
  - Export URL: `https://shopclip-standard-1436426026.cos.ap-beijing.myqcloud.com/projects/cmpqigao80001whl4g32ii0bv/smart-edits/fc239888-1ba5-4b69-8f93-8f47dece8c87/export.mp4`.
  - Server `ffmpeg -i` reported both an H.264 video stream and an AAC audio stream, proving the deployed smart-edit ffmpeg path produced an audio-bearing export.
- Live verification after deploy:
  - Deployed commit `d2fff9e` with `/www/wwwroot/shopclip-ai/deploy.sh`.
  - `POST /api/projects/cmpqigao80001whl4g32ii0bv/smart-edit` with `videoSettings: { ratio: "16:9", resolution: "480p" }` completed as task `fcca8ed2-bda6-4cbd-852f-85e04a194cc9`.
  - Trace included `smart-edit-plan-model` and `smart-edit-ffmpeg-compose`.
  - Export URL: `https://shopclip-standard-1436426026.cos.ap-beijing.myqcloud.com/projects/cmpqigao80001whl4g32ii0bv/smart-edits/d0d3711b-d620-46e2-96c0-a3a07edc821b/export.mp4`.
  - Server `ffmpeg -i` reported the exported stream as `854x480`, proving the requested horizontal 480p geometry was applied.
  - Browser verification on `http://152.136.252.134/#edit` loaded project `cmpqigao80001whl4g32ii0bv`, opened Step 05, and confirmed the timeline/inspector rendered the completed smart-edit plan.
  - Playwright keyboard check: clicking timeline segment 1 then pressing `ArrowRight` selected segment 2 and updated the inspector copy/source/transition fields; pressing `Delete` disabled segment 2 and the timeline label changed to `4s - fade - Disabled`.

## 2026-06-03 Subtitle Symbol Guard

- User-visible issue:
  - A generated smart-edit export could appear to have no readable subtitles and show symbol-like captions instead.
- Root cause investigation:
  - The latest server-side ASS subtitle files under `/www/wwwroot/shopclip-ai/render-exports/.../smart-edit/.../*.ass` contained normal UTF-8 Chinese Dialogue text, and a pulled frame from the latest deployed `export.mp4` rendered readable Chinese subtitles.
  - Remaining risk was in the render guard: ASS style used default charset encoding, the subtitle filter could not explicitly receive a fonts directory, and unreadable captions were still burned in when both subtitle and voiceover were symbol/garbled strings.
- Fix:
  - ASS styles now use Unicode encoding and the subtitle filter supports `FFMPEG_SUBTITLE_FONTS_DIR` / `RENDER_SUBTITLE_FONTS_DIR` for explicit font loading.
  - Smart-edit composition now skips subtitle burn-in for a segment when both subtitle and voiceover are unreadable symbol/garbled text, preventing garbage captions from appearing in exports.
- Verification:
  - `corepack pnpm --filter @shopclip/api exec vitest run src/providers/renderer/ffmpegComposer.test.ts src/providers/renderer/smartEditComposer.test.ts`
  - `corepack pnpm --filter @shopclip/api typecheck`
  - `corepack pnpm --filter @shopclip/api lint`
  - `corepack pnpm --filter @shopclip/api build`

## 2026-06-03 Live Step 05 Interaction Audit

- Browser verification against `http://152.136.252.134/#edit`:
  - Loaded the latest `水杯 / 小猫水杯` history project and opened Step 05.
  - Confirmed the completed smart-edit result rendered `Edited preview`, `Selected segment live preview`, the current segment image URL, and the live caption `这软萌小猫水杯颜值也太戳少女心了！`.
  - Confirmed the timeline rendered three draggable segment buttons with real captions and durations: `4s - cut`, `4s - fade`, `4s - fade`.
  - Pressing `ArrowRight` selected segment 2; pressing `Delete` changed segment 2 to `4s - fade - Disabled`; dragging segment 1 onto segment 3 reordered the visible timeline to `2 -> 3 -> 1`.
- Live backend trace evidence:
  - Full smart edit task `1e77494c-600e-4eee-a8f8-738113b525f6` completed with `smart-edit-plan-model`, `smart-edit-ffmpeg-compose-started`, and `smart-edit-ffmpeg-compose`.
  - The task produced three uploaded segment outputs and COS export `projects/cmpqigao80001whl4g32ii0bv/smart-edits/fc239888-1ba5-4b69-8f93-8f47dece8c87/export.mp4`.
  - Segment refresh tasks including `fccce941-409c-4194-9773-339400dd9304` completed with `smart-edit-segment-plan-model` and `smart-edit-segment-refresh-compose`, proving the real local-refresh route reused existing segment outputs before final ffmpeg recomposition.
- Current completion caveats:
  - The current refresh implementation still recomposes the final export after reusing unchanged segment outputs; this satisfies the no-full-segment-regeneration goal but does not avoid final ffmpeg recomposition.
  - BGM choices are real ffmpeg-generated beds, not merchant-selected commercial music assets.

## 2026-06-03 Structured Slice Recall Baseline

- Issue found during completion audit:
  - The model prompt already included structured assets and slices, but the fallback/baseline plan still leaned too much on an existing `scene.assetId` or the first available asset.
  - This was weak evidence for the requirement that smart editing should use the product/video/slice three-level tag system.
- Fix:
  - Added a planner-side recall baseline that scores each scene against asset-level tags, embedding/search text, structured asset metadata, and slice-level tags/metadata.
  - The scorer infers a commerce scene role (`hook`, `demo`, `trust`, `cta`) from scene order and copy, then boosts matching `slice.metadata.suitableSceneRoles`.
  - Video assets now resolve to the best matching slice when slice evidence is stronger; image assets still resolve to image sources.
  - User-provided segment source overrides still win over automatic recall.
- Verification:
  - Added a regression test where an unbound demo scene chooses `slice-leakproof-demo` from a video asset based on product, video, and slice-level metadata instead of defaulting to the first hero image.
  - `corepack pnpm --filter @shopclip/api exec vitest run src/providers/ai/smartEditPlannerProvider.test.ts`
  - `corepack pnpm --filter @shopclip/api typecheck`

## 2026-06-03 Smart Edit BGM Track Differentiation

- Issue found during completion audit:
  - Step 05 exposed `Creator pop`, `Soft lift`, and `Tech pulse` BGM choices, but the ffmpeg composer used the same `sine=frequency=220` generated audio bed for every non-`none` choice.
  - This meant the UI setting changed metadata but not the actual mixed audio track.
- Fix:
  - Added `smartEditBgmProfile` so each BGM choice maps to a distinct ffmpeg `lavfi` source and mix volume.
  - `creator-pop` now uses `sine=frequency=523`, `soft-lift` uses `sine=frequency=330`, and `tech-pulse` uses `sine=frequency=176`.
  - Voiceover + BGM and BGM-only paths now both use the selected BGM profile.
- Verification:
  - `corepack pnpm --filter @shopclip/api exec vitest run src/providers/renderer/smartEditComposer.test.ts`
  - `corepack pnpm --filter @shopclip/api exec vitest run src/smart-edit-flow.test.ts src/providers/ai/smartEditPlannerProvider.test.ts`
  - `corepack pnpm --filter @shopclip/api typecheck`
  - `corepack pnpm --filter @shopclip/api lint`
  - `corepack pnpm --filter @shopclip/api build`

## 2026-06-03 Reference Editor Track Stack Optimization

- Reference repositories read:
  - `OpenCut-app/OpenCut` current `README.md`, `.github/copilot-instructions.md`, `apps/web/src/routes/index.tsx`, and `apps/web/src/styles.css`.
  - Finding: the current OpenCut repo is a rewrite scaffold rather than a complete editor implementation; useful transferable constraints are editor-first accessibility, strict typed React, stable UI primitives, and caption-aware media behavior.
  - `Hommy-master/capcut-mate` `src/pyJianYingDraft/track.py`, `segment.py`, `video_segment.py`, `script_file.py`, plus service files for videos, captions, audio timelines, and async render tasks.
  - Finding: capcut-mate models editing as typed tracks containing non-overlapping segments with `target_timerange`, optional `source_timerange`, render order, captions, voice/audio timelines, and async task status.
- Fix:
  - Step 05 now renders a multi-track review stack beneath the existing draggable timeline.
  - The stack derives Video, Caption, Voice, and BGM tracks from the current `SmartEditPlan`, without changing the real backend smart-edit/ffmpeg path.
  - Each visible track clip shows target timeline range, source media range where available, source asset name, subtitle/voice text, transition, voice, and BGM profile.
  - English and Chinese UI copy were added for the track stack.
- Verification:
  - Added `App.test.tsx` coverage for video-slice source range `00:01.3-00:03.3`, target range `00:00.0-00:04.0`, and visible Video/Caption/Voice/BGM tracks.
  - `corepack pnpm --filter @shopclip/web exec vitest run src/app/App.test.tsx`
  - `corepack pnpm --filter @shopclip/web typecheck`
  - `corepack pnpm --filter @shopclip/web lint`
  - `corepack pnpm --filter @shopclip/web build`

## 2026-06-03 Step 05 Interaction UX Repair

- User-visible issue:
  - Step 05 still felt like a backend configuration form: target language, BGM, and edit instructions were placed before the editor surface, while preview, selected segment context, and per-segment actions were visually disconnected.
  - The selected segment inspector was a flat field list, making it hard to understand what belonged to timing/source, copy/voice, or enable/disable state.
- Fix:
  - Added an editor status strip above the workspace with enabled cut duration, selected segment index, selected source, and active audio/BGM.
  - Moved global edit settings into a compact `Edit settings` disclosure so preview and timeline are the primary working surface.
  - Grouped the segment inspector into `Timing and source`, `Copy and voice`, and `Segment state`.
  - Strengthened selected timeline cards with a visible `Selected` label and active background while preserving drag, arrow-key selection, Delete-to-disable, and refresh controls.
  - Added responsive CSS so the status strip/settings/editor grid collapse cleanly on narrow screens.
- Verification:
  - Added `App.test.tsx` coverage for the status strip, settings disclosure, grouped inspector, selected segment state, source label, and audio summary.
  - `corepack pnpm --filter @shopclip/web exec vitest run src/app/App.test.tsx`
  - `corepack pnpm --filter @shopclip/web typecheck`
  - `corepack pnpm --filter @shopclip/web lint`
  - `corepack pnpm --filter @shopclip/web build`

## 2026-06-05 Manual Timeline Start And Gap Export

- OpenCut-style gap closed:
  - The previous smart-edit timeline could trim, split, reorder, mute, and offset captions/voice, but clips still exported as a strict sequence.
  - This made the UI closer to a segment list than a real editing timeline because an empty gap before a clip could not survive export.
- Fix:
  - Added `timelineStartSecond` to smart-edit segment contracts and request overrides.
  - The Smart Edit inspector now exposes a timeline start field. When a user first edits a start time or splits a clip, the current sequential positions are materialized onto all clips so later clips do not accidentally jump to `0s`.
  - Timeline duration, ruler, playhead bounds, track-stack elements, and segment cards now use the maximum clip end time rather than only the sum of durations.
  - The primary timeline row now uses absolute positioning so visible empty space matches the target timeline.
  - Backend ffmpeg export now detects timeline gaps and inserts generated black video gaps before concat.
  - Source audio and generated voiceover tracks insert matching silent audio gaps so separated scene audio, text/voice, and video stay aligned.
- Verification:
  - Added `smartEditComposer.test.ts` coverage for a `2s` manual gap across video, source audio, and voice tracks.
  - `corepack pnpm --filter @shopclip/shared build`
  - `corepack pnpm --filter @shopclip/api exec vitest run src/providers/renderer/smartEditComposer.test.ts`
  - `corepack pnpm --filter @shopclip/api typecheck`
  - `corepack pnpm --filter @shopclip/web typecheck`
  - `corepack pnpm --filter @shopclip/web exec vitest run src/app/App.test.tsx`
- Remaining:
  - The next OpenCut-level increment should replace numeric start editing with direct horizontal drag, snapping, collision/ripple behavior, and explicit track lanes for independent video/audio/text clips.

## 2026-06-05 Horizontal Timeline Clip Move

- Reference model:
  - Read `Jankin-Chen123/opencut-classic` at `cf5e79e`.
  - The transferable pattern is command/action based timeline element movement: OpenCut's `MoveElementCommand` updates each selected element's `startTime` instead of treating drag as only list reordering.
- Fix:
  - Added `moveSmartEditSegmentOnTimeline(plan, segmentId, deltaSeconds)` as a tested timeline move helper.
  - The helper materializes existing clip start positions, applies a snapped horizontal delta to the target clip, rebuilds the timeline, and updates total duration from the maximum clip end.
  - The main Smart Edit timeline card now uses pointer drag to move the clip horizontally on the timeline. Reordering remains available through the existing `Move earlier` / `Move later` inspector controls.
  - Added UI feedback and localized copy so users know clips can be dragged horizontally.
- Verification:
  - Added `App.test.tsx` coverage for moving a second clip from `4s` to snapped `2.8s`, preserving the first clip at `0s`, and rebuilding the timeline duration to `6.8s`.
  - `corepack pnpm --filter @shopclip/web exec vitest run src/app/App.test.tsx -t "moves a smart edit segment horizontally"`
  - `corepack pnpm --filter @shopclip/web typecheck`
  - `corepack pnpm --filter @shopclip/web exec vitest run src/app/App.test.tsx`
  - `corepack pnpm --filter @shopclip/api typecheck`
  - `corepack pnpm --filter @shopclip/shared build`
- Remaining:
  - Collision/ripple editing, multi-track clip movement, copy/paste/duplicate commands, and richer clip transform/effect panels are still needed before claiming OpenCut-level editing depth.

## 2026-06-05 Duplicate Timeline Clip Command

- Reference model:
  - Read `Jankin-Chen123/opencut-classic` `apps/web/src/commands/timeline/element/duplicate-elements.ts`.
  - OpenCut duplicates selected timeline elements as command-driven editable clips while preserving the original media source and editable attributes.
- Fix:
  - Added `duplicateSmartEditSegmentOnTimeline(plan, segmentId, duplicateToken)`.
  - Duplicated smart-edit clips preserve source media, scene linkage, speed, original-audio mute state, caption/voice offsets, transition, asset tags, and duration.
  - The duplicate receives a new segment id, is inserted after the source clip in order, starts at the source clip's timeline end, and rebuilds timeline duration/export metadata.
  - Added a `Duplicate` / `复制` action in the Smart Edit inspector beside Split and Remove.
- Verification:
  - Added `App.test.tsx` coverage for duplicating a clip at `1s-5s` into a second editable clip at `5s-9s`.
  - `corepack pnpm --filter @shopclip/web exec vitest run src/app/App.test.tsx -t "duplicates a smart edit segment"`
  - `corepack pnpm --filter @shopclip/web typecheck`
- Remaining:
  - Clipboard copy/paste across timeline positions, multi-select duplication, separate audio/text clip duplication, and command-level undo labels are still open.

## 2026-06-05 Multi-Select Duplicate Timeline Command

- Reference model:
  - OpenCut `DuplicateElementsCommand` accepts multiple selected elements and duplicates them as command output.
- Fix:
  - Extended the smart-edit duplicate helper into `duplicateSmartEditSegmentsOnTimeline(plan, segmentIds, duplicateToken)`.
  - Multi-selected clips are duplicated in timeline order, each duplicate is inserted directly after its source clip, and each duplicate starts at the source clip's timeline end.
  - The duplicate command preserves all source/media/editing metadata and rebuilds target duration and timeline elements for export.
  - Added `Duplicate selected` / `复制已选` to the smart-edit batch toolbar; after execution the generated copies become the active selection.
- Verification:
  - Added `App.test.tsx` coverage for duplicating two selected clips while preserving order, starts, and rebuilt timeline duration.
  - `corepack pnpm --filter @shopclip/web exec vitest run src/app/App.test.tsx -t "duplicates multiple selected smart edit segments"`
  - `corepack pnpm --filter @shopclip/web typecheck`
- Remaining:
  - Clipboard paste-at-playhead, duplicate-to-free-track, ripple collision handling, and independent audio/text clip duplication remain open.

## 2026-06-05 Paste Selected Clips At Playhead

- Reference model:
  - OpenCut `PasteCommand` pastes copied elements at a target time while preserving relative offsets from the earliest copied element.
- Fix:
  - Added `pasteSmartEditSegmentsAtPlayhead(plan, segmentIds, playheadSecond, duplicateToken)`.
  - Selected smart-edit clips can now be copied to the current playhead position from the batch toolbar.
  - The earliest selected clip is aligned to the playhead; later selected clips keep their relative timeline offsets.
  - Pasted clips preserve source media, scene linkage, speed, original-audio mute state, caption/voice offsets, transition, asset tags, and duration.
  - Newly pasted clips become the active multi-selection for immediate dragging, muting, deletion, or further duplication.
- Verification:
  - Added `App.test.tsx` coverage for pasting two selected clips from `1s` and `4s` to playhead `10s`, yielding pasted clips at `10s` and `13s`.
  - `corepack pnpm --filter @shopclip/web exec vitest run src/app/App.test.tsx -t "pastes selected smart edit segments"`
  - `corepack pnpm --filter @shopclip/web typecheck`
- Remaining:
  - True clipboard storage, keyboard shortcuts, collision-aware placement, ripple overwrite/insert modes, and independent multi-track paste are still open.

## 2026-06-05 Clipboard Copy Paste Shortcuts

- Reference model:
  - OpenCut `ElementsClipboardHandler` copies selected elements into a clipboard entry and `PasteCommand` later places that snapshot at the target time.
- Fix:
  - Added `copySmartEditSegmentsToClipboard(plan, segmentIds)` and `pasteSmartEditClipboardAtPlayhead(plan, clipboard, playheadSecond, duplicateToken)`.
  - Smart Edit now stores a local clipboard snapshot with copied segments and their original timeline starts.
  - Added `Copy selected` / `复制已选` and `Paste copied` / `粘贴复制片段` actions.
  - Added Ctrl/Cmd+C and Ctrl/Cmd+V support on the Smart Edit panel. Inputs, textareas, selects, and contenteditable elements keep their native copy/paste behavior.
  - Clipboard is cleared when a new smart-edit plan is loaded to avoid cross-plan stale clips.
- Verification:
  - Added `App.test.tsx` coverage for copying two clips into a clipboard snapshot and pasting them later at playhead `12s` while preserving their `3s` relative offset.
  - `corepack pnpm --filter @shopclip/web exec vitest run src/app/App.test.tsx -t "copies smart edit segments into a clipboard"`
  - `corepack pnpm --filter @shopclip/web typecheck`
- Remaining:
  - Collision-aware placement, overwrite/insert/ripple modes, independent audio/text clip clipboard entries, and named command history remain open.

## 2026-06-05 Collision-Aware Timeline Placement

- Reference model:
  - OpenCut timeline commands resolve element placement against existing timeline elements instead of blindly writing a start time.
- Fix:
  - Added shared timeline interval helpers and block placement resolution for Smart Edit clips.
  - Dragging a clip now snaps to playhead/clip edges and resolves to the nearest non-overlapping legal position.
  - Duplicate, paste-at-playhead, and clipboard paste now treat selected clips as a block: relative offsets are preserved, then the whole block is moved to the nearest open range.
  - The timeline rebuild still drives target duration and export metadata, so render/export receives the resolved clip starts.
- Verification:
  - Updated `App.test.tsx` coverage for collision-aware drag placement: dragging a clip left into another clip now lands at the adjacent edge instead of overlapping.
  - Updated multi-select duplicate coverage to verify copied blocks are moved after existing occupied ranges.
  - `corepack pnpm --filter @shopclip/web exec vitest run src/app/App.test.tsx`
  - `corepack pnpm --filter @shopclip/web typecheck`
- Remaining:
  - Explicit overwrite/insert/ripple modes, independent audio/text track items, edge preview guides, transform/effect panels, and named command history remain open.

## 2026-06-05 Track Material Inspector

- Reference model:
  - OpenCut treats media/text/audio entries as timeline elements with their own selection and editing surface, not only as passive rows under a scene.
- Fix:
  - Smart Edit track stack now includes source-audio material rows when rendered scene clips have separated audio assets.
  - Track rows use resolved timeline starts instead of assuming sequential-only timing, so manual moved clips and gaps stay reflected in the track stack.
  - Added track-material selection state. Clicking a video/audio/caption/voice/BGM row highlights that exact track material and opens a track-material inspector.
  - The track-material inspector supports direct per-material operations for source audio mute/unmute, caption text/offset/show-hide, and voiceover text/offset.
  - Existing segment selection stays synchronized with selected track materials so the current segment preview, batch selection, and export timeline stay coherent.
- Verification:
  - Updated `App.test.tsx` coverage for source-audio material rows in the track stack, including button semantics for selectable track materials.
  - `corepack pnpm --filter @shopclip/web typecheck`
  - `.\\node_modules\\.bin\\vitest.CMD run src/app/App.test.tsx -t "track stack"`
- Remaining:
  - True independent clip records for audio/text, drag handles on each track row, overwrite/insert/ripple modes, effect/transform panels, and visual snap guide overlays remain open.

## 2026-06-05 Track-Level Timeline Movement

- Reference model:
  - OpenCut timeline elements carry their own track, start time, duration, and editable media metadata. Moving an element is a timeline command, not only a scene reorder.
- Fix:
  - Added `moveSmartEditTrackClipOnTimeline(plan, trackClip, deltaSeconds, playheadSecond)` for track-level command adaptation.
  - Track stack clips now carry `startSecond` and render against the same `timelineWidth` / pixels-per-second scale as the main timeline.
  - Dragging video or source-audio material rows moves the owning segment through the existing collision-aware placement path, keeping video and separated source audio aligned for export.
  - Dragging caption or voice rows adjusts only `captionStartOffsetSeconds` or `voiceoverStartOffsetSeconds`, so text/audio timing can be edited independently while still persisting into the current `SmartEditPlan`.
  - The track stack now visually behaves like a real timeline surface instead of a proportional flex summary row.
- Verification:
  - Added `App.test.tsx` coverage for moving a source-audio track material with its video segment and moving a caption material by changing only its offset.
  - `.\\node_modules\\.bin\\vitest.CMD run src/app/App.test.tsx -t "track-level"`
  - `.\\node_modules\\.bin\\vitest.CMD run src/app/App.test.tsx`
  - `corepack pnpm --filter @shopclip/web typecheck`
- Remaining:
  - Separate persistent clip records for video/audio/text, ripple/overwrite/insert edit modes, clip transform/effect panels, visual snap guides, and full OpenCut-style command history are still needed before claiming CapCut/OpenCut-level parity.

## 2026-06-05 Independent Track Clip Durations

- Reference model:
  - OpenCut media/text/audio elements can have independent timeline duration, even when they originate from the same scene or source asset.
- Fix:
  - Extended `SmartEditSegment` with independent `sourceAudioStartOffsetSeconds`, `sourceAudioDurationSeconds`, `captionDurationSeconds`, and `voiceoverDurationSeconds`.
  - Smart Edit track stack now renders source audio, caption, and voice rows using their own start and duration instead of always stretching to the end of the scene.
  - Track-material inspector now exposes duration controls for source audio, captions, and voiceover.
  - Source-audio track dragging now offsets the detached audio material within the scene instead of moving the video segment.
  - API smart-edit composer now uses ffmpeg filters to trim separated source audio, caption ASS timing, and generated voiceover audio to the requested track material duration before padding/mixing.
  - Planner fallback and refresh request paths preserve the new track timing fields.
- Verification:
  - `.\\node_modules\\.bin\\vitest.CMD run src/app/App.test.tsx -t "track-level"`
  - `.\\node_modules\\.bin\\vitest.CMD run src/app/App.test.tsx`
  - `.\\node_modules\\.bin\\vitest.CMD run src/providers/renderer/smartEditComposer.test.ts`
  - `.\\node_modules\\.bin\\vitest.CMD run src/providers/ai/smartEditPlannerProvider.test.ts`
  - `corepack pnpm --filter @shopclip/shared build`
  - `corepack pnpm --filter @shopclip/web typecheck`
  - `corepack pnpm --filter @shopclip/api typecheck`
- Remaining:
  - Fully separate persistent timeline element records, ripple/overwrite/insert modes, transform/effect panels, visual snap guides, and OpenCut-style command labels/history are still open.

## 2026-06-05 Timeline Edit Modes

- Reference model:
  - OpenCut timeline commands distinguish placement semantics instead of always resolving collisions the same way.
- Fix:
  - Added `SmartEditTimelineEditMode` with `magnetic`, `insert`, and `overwrite` modes.
  - Existing magnetic mode keeps collision-aware placement and edge/playhead snapping.
  - Insert mode places the moved or pasted clip at the requested insertion point and ripples later enabled clips forward by the inserted block duration. If the user drops inside an existing clip, the insertion point resolves to that clip's end boundary to avoid creating an impossible partial overlap in the current segment-backed model.
  - Overwrite mode places the moved or pasted clip at the requested time and disables enabled clips that overlap the replacement interval, so export receives only the surviving timeline material.
  - Timeline toolbar now exposes a compact three-state edit-mode switch; main video clip dragging, selected paste, and clipboard paste all use the current mode.
  - Track-level source-audio/caption/voice movement remains independent offset editing and does not trigger video overwrite/insert semantics.
- Verification:
  - Added `App.test.tsx` coverage for segment movement in insert/overwrite modes and selected-clip paste in insert/overwrite modes.
  - `.\\node_modules\\.bin\\vitest.CMD run src/app/App.test.tsx -t "edit modes|pasting selected|moves a smart edit segment"`
  - `corepack pnpm --filter @shopclip/web typecheck`
- Remaining:
  - Partial-clip split-on-insert, true timeline-element persistence, transform/effect panels, visual snap guides, and named command history are still open.

## 2026-06-05 Split-On-Insert Timeline Editing

- Reference model:
  - OpenCut insert edits can place a block inside an occupied range by splitting the existing timeline element and rippling the right-hand side forward.
- Fix:
  - Insert mode no longer snaps mid-clip drops to the occupied clip's end.
  - Added insert helpers that detect the containing enabled timeline interval, split that segment into left/right segment-backed clips, and place the moved or pasted block between them.
  - The right-hand split receives a stable generated id, keeps the original source media metadata, and starts after the inserted block.
  - Later enabled clips ripple forward by the inserted block duration.
  - Move-insert and paste-insert now share the same split/ripple semantics, while overwrite mode remains a disable-overlapped-clips operation.
- Verification:
  - Updated `App.test.tsx` edit-mode coverage to assert that inserting into the middle of a clip creates a split right-hand segment.
  - Updated selected paste insert coverage to assert split original, pasted block, split right-hand segment, and rippled later clips.
  - `.\\node_modules\\.bin\\vitest.CMD run src/app/App.test.tsx -t "edit modes|pasting selected"`
  - `corepack pnpm --filter @shopclip/web typecheck`
- Remaining:
  - True timeline-element persistence, transform/effect panels, visual snap guides, and named command history are still open.

## 2026-06-05 Segment Transform And Effects Inspector

- Reference model:
  - Read `Jankin-Chen123/opencut-classic` command/effects modules in a temporary checkout under `C:\tmp\opencut-classic`.
  - The reusable pattern is that visual timeline elements own editable transform/effect state, and update/effect commands patch element properties instead of only reordering clips.
- Fix:
  - Added `SmartEditTransformSchema` and `SmartEditEffectsSchema` to the shared smart-edit segment contracts.
  - Smart Edit segment plans can now persist scale, rotation, X/Y offset, opacity, blur, sharpen, fade-in, and fade-out controls.
  - The segment inspector now exposes Visual transform and Visual effects sections, so users can edit those properties on the selected video segment.
  - The ffmpeg smart-edit composer now converts those properties into real video filters: scaled crop/pan, rotation, alpha channel adjustment, blur, sharpen, and independent fade-in/fade-out.
- Verification:
  - `.\\node_modules\\.pnpm\\node_modules\\.bin\\vitest.CMD run packages/shared/src/schemas.test.ts -t "validates real smart edit"`
  - `.\\node_modules\\.pnpm\\node_modules\\.bin\\vitest.CMD run apps/api/src/providers/renderer/smartEditComposer.test.ts -t "transform and effect"`
  - `.\\node_modules\\.pnpm\\node_modules\\.bin\\vitest.CMD run apps/web/src/app/App.test.tsx -t "editor workspace"`
  - `corepack pnpm --filter @shopclip/shared build`
  - `corepack pnpm --filter @shopclip/api typecheck`
  - `corepack pnpm --filter @shopclip/web typecheck`
- Remaining:
  - True independent timeline-element persistence, visual snap guide overlays, named command history, keyframes, masks, and richer OpenCut-style effect stacking are still open.

## 2026-06-05 Labeled Timeline Command History

- Reference model:
  - OpenCut's `CommandManager` stores command entries with undo/redo behavior rather than anonymous state snapshots.
  - The transferable pattern is keeping command history as a first-class editing surface so users can understand what Undo and Redo will do next.
- Fix:
  - Added a `SmartEditCommandHistory` model around Smart Edit plan changes.
  - Each committed timeline operation now records a command label, such as `Trim clip in`, `Move clip (insert)`, `Duplicate selected clips`, `Paste copied clips (overwrite)`, `Split clip`, or `Edit video material`.
  - The Smart Edit toolbar now shows the next command target directly in the Undo/Redo buttons, for example `Undo Adjust visual transform` and `Redo Paste copied clips (magnetic)`.
  - Existing keyboard shortcuts keep using the same command history so Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, and Ctrl/Cmd+Y stay aligned with toolbar behavior.
- Verification:
  - `.\\node_modules\\.pnpm\\node_modules\\.bin\\vitest.CMD run apps/web/src/app/App.test.tsx -t "labeled smart edit commands|smart edit timeline controls|editor workspace"`
  - `corepack pnpm --filter @shopclip/web typecheck`
- Remaining:
  - The next OpenCut-level increment should persist independent timeline element records instead of deriving all command targets from segment-backed projections.

## 2026-06-05 Persistent Timeline Element Bridge

- Reference model:
  - OpenCut treats timeline elements as first-class records with their own track, start time, trim, duration, text/audio metadata, and command targets.
  - The current ShopClip editor still needs the existing segment-backed ffmpeg composer, so this increment adds a compatibility bridge instead of replacing the whole renderer in one step.
- Fix:
  - `SmartEditPlan.timeline.elements` is now preserved when present; front-end editing no longer blindly rebuilds persistent timeline elements into derived `segment-*` projections.
  - Track-level caption/source-audio/voice movement updates the matching persistent element and then syncs the segment offset/duration/text fields as a compatibility bridge.
  - The track stack continues to prefer persistent elements for display, while older plans without timeline elements still fall back to derived segment rows.
  - The smart-edit composer now applies persistent timeline element overrides before ffmpeg composition, so persistent text elements drive subtitle text/timing and persistent source-audio elements drive independent source URL, trim, delay, and duration.
  - Source-audio trim is handled as an audio-specific override so independent audio edits do not accidentally change the video clip's source trim.
- Verification:
  - `.\\node_modules\\.pnpm\\node_modules\\.bin\\vitest.CMD run packages/shared/src/schemas.test.ts -t "smart edit|timeline"`
  - `.\\node_modules\\.pnpm\\node_modules\\.bin\\vitest.CMD run apps/web/src/app/App.test.tsx -t "smart edit|track-level|edit modes|persistent"`
  - `.\\node_modules\\.pnpm\\node_modules\\.bin\\vitest.CMD run apps/api/src/providers/renderer/smartEditComposer.test.ts -t "subtitle|source audio|persistent|timeline"`
  - `corepack pnpm --filter @shopclip/web typecheck`
  - `corepack pnpm --filter @shopclip/api typecheck`
- Remaining:
  - Export is still bridged through `SmartEditSegment` rather than directly rendering arbitrary element stacks.
  - Next increments should move duplicate/paste/split commands onto element records, then add visual snap guides, keyframes, masks, and richer OpenCut-style effect stacks.

## 2026-06-05 Element-Level Duplicate And Clipboard Paste

- Reference model:
  - OpenCut's `DuplicateElementsCommand` clones selected timeline elements directly, keeps their media/edit metadata, creates new element ids, and returns the duplicated element selection.
  - This ShopClip increment adapts that model to the existing `SmartEditPlan.timeline.elements` bridge while preserving the segment compatibility layer needed by current ffmpeg export.
- Fix:
  - Duplicating a smart-edit segment now also clones any persistent timeline elements attached to that segment, preserving track id, source URL, trim, duration, text, hidden/muted state, playback rate, and relative in-segment offsets.
  - Copying selected clips now stores a local clipboard snapshot of persistent timeline elements alongside the segment snapshot.
  - Pasting from the local clipboard at the playhead now recreates persistent video/text/audio elements with stable copied ids and playhead-aligned relative timing, instead of falling back to derived `segment-*` rows.
  - Older plans without persistent timeline elements still use the derived segment timeline path.
- Verification:
  - `.\\node_modules\\.pnpm\\node_modules\\.bin\\vitest.CMD run apps/web/src/app/App.test.tsx -t "duplicates persistent|copies and pastes persistent"`
  - `.\\node_modules\\.pnpm\\node_modules\\.bin\\vitest.CMD run apps/web/src/app/App.test.tsx -t "smart edit|track-level|edit modes|persistent|duplicates|pastes|copies|clipboard"`
  - `corepack pnpm --filter @shopclip/web typecheck`
- Remaining:
  - Split-at-playhead still splits segment-backed clips first; the next OpenCut parity step is element-native split for video/audio/text rows.
  - Keyframes, masks, richer effect stacks, and direct element-native export are still open.

## 2026-06-05 Element-Level Split At Playhead

- Reference model:
  - OpenCut's `SplitElementsCommand` splits each selected timeline element at the playhead, keeps the left element id, creates a right-side element id, and adjusts source trim spans once at the split point.
- Fix:
  - Added `splitSmartEditSegmentOnTimeline` as the shared pure path for playback-head segment splitting.
  - When a plan contains persistent `timeline.elements`, splitting a segment now also splits persistent video/audio/text elements whose own time range crosses the split point.
  - Video and audio elements preserve source URL, muted/hidden/detached state, playback rate, and trim metadata; the left side gets a shortened `trimEndSecond`, and the right side gets a new id plus adjusted `trimStartSecond`.
  - Text elements split by timeline timing and preserve text/label metadata; elements entirely to the right of the cut are reassigned to the new right-hand segment.
  - The Smart Edit toolbar's playhead split button now uses this same pure helper instead of maintaining a separate component-local segment-only implementation.
- Verification:
  - `.\\node_modules\\.pnpm\\node_modules\\.bin\\vitest.CMD run apps/web/src/app/App.test.tsx -t "splits persistent smart edit timeline elements"`
  - `.\\node_modules\\.pnpm\\node_modules\\.bin\\vitest.CMD run apps/web/src/app/App.test.tsx -t "smart edit|track-level|edit modes|persistent|duplicates|pastes|copies|clipboard|splits"`
- Remaining:
  - Export is still bridged through `SmartEditSegment`; direct arbitrary element-stack rendering is still open.
  - Keyframes, masks, richer effect stacks, grouped element selection, and OpenCut-level timeline UI polish are still open.

## 2026-06-05 Visual Transform Keyframes

- Reference model:
  - OpenCut stores keyframes on timeline elements and command handlers upsert/remove/retime keyframes against a property path.
  - This increment adapts that model to ShopClip's current segment-backed compatibility layer by adding visual keyframes to smart-edit segments, then exporting them as ffmpeg time expressions.
- Fix:
  - Added `SmartEditVisualKeyframeSchema` with id, in-segment time, easing, transform, and optional effects.
  - Smart edit planner prompt and model normalization now accept `visualKeyframes`, clamp out-of-range times/values, and preserve normalized model keyframes in the executable plan.
  - Smart Edit inspector now shows a Visual keyframes section, can add a keyframe at the current playhead using the segment's current transform/effects, and can delete existing keyframes.
  - ffmpeg segment rendering now converts two or more visual keyframes into time-based expressions for scale, crop X/Y offset, rotation, and opacity while preserving the existing static transform/effects path for non-keyframed segments.
- Verification:
  - `.\\node_modules\\.pnpm\\node_modules\\.bin\\vitest.CMD run packages/shared/src/schemas.test.ts -t "smart edit|timeline"`
  - `.\\node_modules\\.pnpm\\node_modules\\.bin\\vitest.CMD run apps/api/src/providers/renderer/smartEditComposer.test.ts -t "transform|keyframes|persistent|timeline|subtitle|source audio"`
  - `.\\node_modules\\.pnpm\\node_modules\\.bin\\vitest.CMD run apps/api/src/providers/ai/smartEditPlannerProvider.test.ts`
  - `.\\node_modules\\.pnpm\\node_modules\\.bin\\vitest.CMD run apps/web/src/app/App.test.tsx -t "smart edit|editor workspace|persistent|duplicates|pastes|copies|clipboard|splits"`
- Remaining:
  - Keyframes are still segment-backed, not fully arbitrary element property paths.
  - Masks, richer effect stacks, curve editing, grouped element selection, and direct arbitrary element-stack export are still open.

## 2026-06-05 Visual Mask Controls

- Reference model:
  - OpenCut stores masks on editable timeline elements and exposes command handlers for toggling inverted masks, removing masks, and editing custom mask points.
  - This increment adapts that model to ShopClip's current segment-backed Smart Edit bridge before adding freeform point editing.
- Fix:
  - Added `SmartEditVisualMaskSchema` with rectangle/ellipse mask type, inverted mode, center position, and size percentages.
  - Smart edit planner prompt and model normalization now accept `visualMask`, clamp out-of-range values, and preserve normalized masks in the executable plan.
  - Smart Edit inspector now shows a Visual mask section with mask type, invert toggle, and X/Y/W/H controls on the selected video segment.
  - The ffmpeg smart-edit composer now exports rectangle and ellipse masks as real `geq` pixel expressions, including inverted mask behavior.
- Verification:
  - `.\\node_modules\\.pnpm\\node_modules\\.bin\\vitest.CMD run packages/shared/src/schemas.test.ts -t "validates real smart edit"`
  - `.\\node_modules\\.pnpm\\node_modules\\.bin\\vitest.CMD run apps/api/src/providers/renderer/smartEditComposer.test.ts -t "visual masks"`
  - `.\\node_modules\\.pnpm\\node_modules\\.bin\\vitest.CMD run apps/web/src/app/App.test.tsx -t "editor workspace"`
  - `.\\node_modules\\.pnpm\\node_modules\\.bin\\vitest.CMD run packages/shared/src/schemas.test.ts -t "smart edit|timeline"`
  - `.\\node_modules\\.pnpm\\node_modules\\.bin\\vitest.CMD run apps/api/src/providers/renderer/smartEditComposer.test.ts -t "transform|keyframes|mask|persistent|timeline|subtitle|source audio"`
  - `.\\node_modules\\.pnpm\\node_modules\\.bin\\vitest.CMD run apps/api/src/providers/ai/smartEditPlannerProvider.test.ts`
  - `.\\node_modules\\.pnpm\\node_modules\\.bin\\vitest.CMD run apps/web/src/app/App.test.tsx -t "smart edit|editor workspace|persistent|duplicates|pastes|copies|clipboard|splits"`
  - `corepack pnpm --filter @shopclip/shared build`
  - `corepack pnpm --filter @shopclip/api typecheck`
  - `corepack pnpm --filter @shopclip/web typecheck`
- Remaining:
  - Mask support is still segment-backed and limited to rectangle/ellipse export.
  - Freeform mask points, mask feathering, curve editing, richer effect stacks, grouped element selection, and direct arbitrary element-stack export are still open.

## 2026-06-05 Visual Effect Stack

- Reference model:
  - OpenCut stores ordered effect instances on visual timeline elements and exposes command handlers for adding, removing, toggling, reordering, and updating effect params.
  - This increment adapts that model to ShopClip's Smart Edit bridge by adding a reusable `visualEffects` array to both timeline elements and segments while keeping the current segment-backed exporter.
- Fix:
  - Added `SmartEditVisualEffectSchema` with id, type, enabled state, and effect params.
  - Smart edit planner prompt and model normalization now accept `visualEffects`, clamp model-produced params, and keep malformed effect types from invalidating the plan.
  - Persistent video timeline elements can carry `visualEffects`; the composer applies them to the segment compatibility layer before export.
  - Smart Edit inspector now exposes an ordered Effect stack with add, enable/disable, amount editing, up/down reorder, and remove controls.
  - The ffmpeg smart-edit composer now exports enabled effect-stack items in order for blur, sharpen, brightness, contrast, saturation, and vignette filters.
- Verification:
  - `.\\node_modules\\.pnpm\\node_modules\\.bin\\vitest.CMD run packages/shared/src/schemas.test.ts -t "validates real smart edit"`
  - `.\\node_modules\\.pnpm\\node_modules\\.bin\\vitest.CMD run apps/api/src/providers/renderer/smartEditComposer.test.ts -t "visual effect stacks"`
  - `.\\node_modules\\.pnpm\\node_modules\\.bin\\vitest.CMD run apps/web/src/app/App.test.tsx -t "editor workspace"`
  - `.\\node_modules\\.pnpm\\node_modules\\.bin\\vitest.CMD run packages/shared/src/schemas.test.ts -t "smart edit|timeline"`
  - `.\\node_modules\\.pnpm\\node_modules\\.bin\\vitest.CMD run apps/api/src/providers/renderer/smartEditComposer.test.ts -t "transform|keyframes|mask|effect|persistent|timeline|subtitle|source audio"`
  - `.\\node_modules\\.pnpm\\node_modules\\.bin\\vitest.CMD run apps/api/src/providers/ai/smartEditPlannerProvider.test.ts`
  - `.\\node_modules\\.pnpm\\node_modules\\.bin\\vitest.CMD run apps/web/src/app/App.test.tsx -t "smart edit|editor workspace|persistent|duplicates|pastes|copies|clipboard|splits"`
  - `corepack pnpm --filter @shopclip/shared build`
  - `corepack pnpm --filter @shopclip/api typecheck`
  - `corepack pnpm --filter @shopclip/web typecheck`
- Remaining:
  - Effect stack export is limited to the first stable ffmpeg-backed visual effects.
  - Effect param keyframes, richer OpenCut effect definitions, grouped element selection, and direct arbitrary element-stack export are still open.

## 2026-06-05 Effect Parameter Keyframes

- Reference model:
  - OpenCut stores effect parameter animation against a specific effect id and parameter path, then command handlers upsert/remove keyframes on that path.
  - This increment adapts that model to ShopClip's current `visualEffects` bridge by attaching `amount` keyframes directly to each visual effect instance.
- Fix:
  - Added `SmartEditVisualEffectParamKeyframeSchema` and `SmartEditVisualEffect.keyframes` for effect-level `amount` animation.
  - Smart edit planner prompt and normalization now accept `visualEffects[].keyframes`, clamp time to the segment duration, and clamp values by effect type.
  - Smart Edit inspector now shows per-effect Amount keyframes, can add an amount keyframe at the playhead, and can delete existing amount keyframes.
  - The ffmpeg smart-edit composer now exports effect amount keyframes as time expressions for blur, sharpen, brightness, contrast, saturation, and vignette where the backing filter supports a scalar expression path.
- Verification:
  - `.\node_modules\.pnpm\node_modules\.bin\vitest.CMD run packages/shared/src/schemas.test.ts -t "smart edit|timeline"`
  - `.\node_modules\.pnpm\node_modules\.bin\vitest.CMD run apps/api/src/providers/renderer/smartEditComposer.test.ts -t "transform|keyframes|mask|effect|persistent|timeline|subtitle|source audio"`
  - `.\node_modules\.pnpm\node_modules\.bin\vitest.CMD run apps/api/src/providers/ai/smartEditPlannerProvider.test.ts`
  - `.\node_modules\.pnpm\node_modules\.bin\vitest.CMD run apps/web/src/app/App.test.tsx -t "smart edit|editor workspace|persistent|duplicates|pastes|copies|clipboard|splits"`
  - `corepack pnpm --filter @shopclip/shared build`
  - `corepack pnpm --filter @shopclip/api typecheck`
  - `corepack pnpm --filter @shopclip/web typecheck`
  - `corepack pnpm --filter @shopclip/api build`
  - `corepack pnpm --filter @shopclip/web build`
- Remaining:
  - Effect keyframes are still segment/effect-instance backed, not arbitrary element property-path animations.
  - Curve editing, direct arbitrary element-stack export, grouped element selection, and fuller OpenCut effect definitions remain open.

## 2026-06-05 Persistent Video Element Export Units

- Reference model:
  - OpenCut renders timeline elements as first-class edit records instead of collapsing all operations back into scene-sized segments.
  - This increment starts replacing the compatibility bridge by compiling persistent video elements into independent executable export units.
- Fix:
  - Added a composer compile pass that detects multiple persistent video timeline elements and turns each visible video element into its own executable smart-edit segment.
  - Each generated export unit keeps the element id, timeline start, duration, playback rate, trim in/out, source URL, scene id, and per-element visual effects.
  - Non-video timeline elements are reassigned to the owning video element by segment id and timeline overlap so existing subtitle/source-audio/voice override logic can continue to operate on element-native video units.
  - Segment uploads and `segmentOutputs` now use persistent video element ids for these compiled units, so repeated cuts from one original scene no longer collapse into one backend segment output.
- Verification:
  - `.\\node_modules\\.pnpm\\node_modules\\.bin\\vitest.CMD run apps/api/src/providers/renderer/smartEditComposer.test.ts -t "independent export units"`
  - `.\\node_modules\\.pnpm\\node_modules\\.bin\\vitest.CMD run apps/api/src/providers/renderer/smartEditComposer.test.ts -t "independent export units|derived timeline"`
  - `.\\node_modules\\.pnpm\\node_modules\\.bin\\vitest.CMD run apps/api/src/providers/renderer/smartEditComposer.test.ts -t "persistent|timeline|source audio|subtitle|effect|keyframes|mask|transition"`
  - `corepack pnpm --filter @shopclip/api typecheck`
  - `corepack pnpm --filter @shopclip/api build`
- Remaining:
  - Audio/text elements are still rendered through the existing segment override path after being reassigned to owning video elements.
  - The next step is direct arbitrary element-stack rendering for audio/text overlays without requiring segment-compatible fields.

## 2026-06-05 Global Audio And Text Timeline Element Export

- Reference model:
  - OpenCut lets audio and text elements exist on the timeline independently from a source video element or scene segment.
  - This increment moves ShopClip's export path closer to that model by rendering unowned source-audio and text elements directly from `SmartEditPlan.timeline.elements`.
- Fix:
  - Reworked source-audio export around timeline clip descriptors so both legacy segment audio and unowned `audio-source` elements are rendered into the final source-audio track by global `startSecond`.
  - Preserved segment-level in-clip audio offsets as `adelay`, while unowned timeline audio elements are positioned with real silence gaps in the source-audio track.
  - Added global timeline text overlay after video stitching and before audio mixing, so unowned text elements are burned into the final video by absolute timeline time.
  - Hidden/muted timeline elements are skipped, and derived segment elements remain on the legacy segment-backed path.
- Verification:
  - `.\\node_modules\\.pnpm\\node_modules\\.bin\\vitest.CMD run apps/api/src/providers/renderer/smartEditComposer.test.ts -t "global source-audio"`
  - `.\\node_modules\\.pnpm\\node_modules\\.bin\\vitest.CMD run apps/api/src/providers/renderer/smartEditComposer.test.ts -t "persistent|timeline|source audio|subtitle|effect|keyframes|mask|transition|global source-audio"`
  - `corepack pnpm --filter @shopclip/api typecheck`
  - `corepack pnpm --filter @shopclip/api build`
- Remaining:
  - Source-audio element overlap is still serialized with gaps/concat rather than fully mixed as overlapping tracks.
  - Voiceover is still generated from segment text rather than arbitrary text/audio timeline elements.
  - Full direct rendering should next support overlapping audio lanes, arbitrary text style/keyframes, and final export from element stacks without segment compatibility fields.

## 2026-06-05 Overlapping Source Audio Lane Mixing

- Reference model:
  - OpenCut-style timelines allow multiple audio elements to overlap on separate lanes; overlapping elements must be mixed, not serialized into a single concat list.
- Fix:
  - Added overlap detection for source-audio timeline clips before creating the final source audio track.
  - Non-overlapping source audio keeps the existing gap/concat path so manual timeline gaps remain stable.
  - Overlapping source-audio elements are now materialized as independent full-timeline WAV lanes: each lane trims its source span, applies playback-rate filters, delays to `startSecond + delaySeconds`, pads/trims to the global timeline duration, and then mixes with `amix=duration=longest`.
  - Global unowned audio elements and segment-backed separated scene audio use the same overlap-aware path.
- Verification:
  - `.\node_modules\.pnpm\node_modules\.bin\vitest.CMD run apps/api/src/providers/renderer/smartEditComposer.test.ts -t "mixes overlapping global source-audio"`
  - `.\node_modules\.pnpm\node_modules\.bin\vitest.CMD run apps/api/src/providers/renderer/smartEditComposer.test.ts -t "global source-audio|source audio|timeline gaps"`
- Remaining:
  - Voiceover is still generated from segment text rather than arbitrary timeline text/audio elements.
  - Direct element-stack rendering still needs richer text styling/keyframes and fuller audio lane controls such as volume envelopes and clip-level fades.

## 2026-06-05 Timeline Voice Element Export

- Reference model:
  - OpenCut treats text/audio timeline elements as independent edit records; a voice item should be able to exist on the timeline without being forced through a storyboard segment field.
- Fix:
  - Reworked smart-edit voiceover export around `VoiceoverTimelineClip` descriptors.
  - Segment voiceover remains supported, but explicit `segment.voiceover` is now the source for segment narration; subtitles are not implicitly converted into narration when voiceover is empty.
  - Unowned timeline elements on the `voiceover` track can now carry `text` and generate TTS audio independently from any `segmentId`.
  - Each voice clip is rendered as a full-timeline WAV lane with global `adelay`, then mixed into `voiceover.wav`; this matches the source-audio lane model and lets narration material be placed freely on the timeline.
  - Single voice tracks still flow into the final export through the existing audio attachment path; multiple source/voice/BGM tracks continue to use final `amix`.
- Verification:
  - `.\node_modules\.pnpm\node_modules\.bin\vitest.CMD run apps/api/src/providers/renderer/smartEditComposer.test.ts -t "generates voiceover audio from unowned timeline voice"`
  - `.\node_modules\.pnpm\node_modules\.bin\vitest.CMD run apps/api/src/providers/renderer/smartEditComposer.test.ts -t "voiceover|voice tracks|voice track|timeline gaps"`
  - `.\node_modules\.pnpm\node_modules\.bin\vitest.CMD run apps/api/src/providers/renderer/smartEditComposer.test.ts -t "persistent|timeline|source audio|subtitle|voice|effect|keyframes|mask|transition|global source-audio|overlapping"`
  - `corepack pnpm --filter @shopclip/api typecheck`
- Remaining:
  - Frontend still needs richer direct creation/conversion controls for arbitrary timeline voice/text elements.
  - Voice lanes do not yet expose volume envelopes, fades, or waveform-level editing.
  - Full completion still requires live runtime evidence for render-to-material-to-smart-edit and broader OpenCut-style editor parity.

## 2026-06-05 Frontend Independent Voice Timeline Controls

- Reference model:
  - OpenCut lets users add and move independent timeline audio items directly, instead of only editing audio attached to a scene-sized segment.
- Fix:
  - Added `addSmartEditTimelineVoiceElement` so the Smart Edit UI can create a persistent unowned `voiceover` timeline element at the current playhead.
  - Added a timeline toolbar action for adding a voice clip and selecting the new timeline item immediately.
  - Updated track-clip selection so unowned voice elements clear storyboard segment selection and open their own inspector state.
  - Added inspector editing for unowned timeline elements: text/label, start time, duration, mute, and hidden state.
  - Localized the new timeline action and independent-material inspector labels for English and Chinese workspaces.
  - Updated track-clip movement so unowned timeline elements can move on the timeline without requiring a `segmentId`.
- Verification:
  - `.\node_modules\.pnpm\node_modules\.bin\vitest.CMD run apps/web/src/app/App.test.tsx -t "adds an independent voice element"`
  - `.\node_modules\.pnpm\node_modules\.bin\vitest.CMD run apps/web/src/app/App.test.tsx -t "independent voice element"`
  - `.\node_modules\.pnpm\node_modules\.bin\vitest.CMD run apps/web/src/app/App.test.tsx -t "smart edit|timeline|voice|persistent|track"`
  - `corepack pnpm --filter @shopclip/web typecheck`
  - `corepack pnpm --filter @shopclip/web build`
- Remaining:
  - Direct text-copy creation controls and richer voice lane operations such as volume envelopes, fades, and waveform editing remain open.
  - Full completion still requires live runtime evidence for render-to-material-to-smart-edit and broader OpenCut-style editor parity.

## 2026-06-05 Frontend Independent Text Timeline Controls

- Reference model:
  - The render-to-edit material chain separates every generated scene into picture, audio, and text. OpenCut-style editing requires each material type to be placeable directly on the timeline.
- Fix:
  - Added `addSmartEditTimelineTextElement` so Smart Edit can create a persistent unowned `text-copy` timeline element at the current playhead.
  - Added a toolbar action for adding text material next to the independent voice action.
  - Reused the unowned timeline-element inspector so text material can edit text/label, start time, duration, and visibility without binding to a storyboard segment.
  - Localized the new text action for English and Chinese workspaces.
- Verification:
  - `.\node_modules\.pnpm\node_modules\.bin\vitest.CMD run apps/web/src/app/App.test.tsx -t "adds an independent text element"`
  - `.\node_modules\.pnpm\node_modules\.bin\vitest.CMD run apps/web/src/app/App.test.tsx -t "smart edit|timeline|voice|text|persistent|track"`
  - `corepack pnpm --filter @shopclip/web typecheck`
  - `corepack pnpm --filter @shopclip/web build`
- Remaining:
  - Independent text elements still use the base text overlay model; richer text styling, animation/keyframes, and direct text template controls remain open.
  - Voice lanes still need volume envelopes, fades, and waveform-level editing.
  - Full completion still requires live runtime evidence for render-to-material-to-smart-edit and broader OpenCut-style editor parity.

## 2026-06-05 Audio Volume Envelopes

- Reference model:
  - OpenCut stores animated scalar parameters as keyframes on timeline elements. This increment adapts that model to ShopClip audio material by supporting static volume plus time-based volume keyframes for source-audio clips, voiceover clips, and independent audio timeline elements.
- Fix:
  - Added `SmartEditAudioVolumeKeyframeSchema` and optional audio volume fields to smart-edit timeline elements, segment overrides, and segments.
  - The smart-edit planner prompt and model normalization now accept `sourceAudioVolume`, `sourceAudioVolumeKeyframes`, `voiceoverVolume`, and `voiceoverVolumeKeyframes`.
  - App request serialization, backend timeline metadata, and composer persistent-element bridging preserve volume fields across plan edits, refreshes, render-task history, and derived timeline elements.
  - The ffmpeg smart-edit composer exports static volume as `volume=<value>` and two-or-more keyframes as a frame-evaluated `volume='if(...)':eval=frame` expression before delay/pad/mix.
  - The Smart Edit inspector exposes source-audio volume, voice volume, independent audio volume, and add/delete volume keyframe controls at the current playhead.
- Verification:
  - `corepack pnpm --filter @shopclip/shared test -- src/schemas.test.ts`
  - `corepack pnpm --filter @shopclip/api run test src/providers/renderer/smartEditComposer.test.ts`
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx`
  - `corepack pnpm --filter @shopclip/shared build`
  - `corepack pnpm --filter @shopclip/api typecheck`
  - `corepack pnpm --filter @shopclip/web typecheck`
  - `corepack pnpm --filter @shopclip/api run test src/providers/ai/smartEditPlannerProvider.test.ts`
  - `corepack pnpm --filter @shopclip/api build`
  - `corepack pnpm --filter @shopclip/web build`
  - `corepack pnpm --filter @shopclip/api lint`
  - `corepack pnpm --filter @shopclip/web lint`
- Remaining:
  - Volume keyframes are still numeric list controls; waveform display, drag handles on the waveform, curve handles, and richer multitrack audio bus controls remain open.
  - Full completion still requires live runtime evidence after deployment for render-to-material-to-smart-edit using real generated scene clips.

## 2026-06-05 Audio Waveform Materials

- Reference model:
  - OpenCut-style audio clips show the actual audio shape on the timeline, and trims reveal the corresponding source-audio slice instead of a generic placeholder.
- Fix:
  - Added shared `SmartEditAudioWaveform` contracts with RMS/peak buckets for generated scene materials, smart-edit sources, and timeline elements.
  - Extended scene clip materialization so ffmpeg exports 8kHz mono float PCM from each extracted scene audio file; Node computes compact RMS/peak buckets and persists them on `SceneRenderClipMaterial.audioWaveform`.
  - Carried waveform metadata from generated scene clips into Smart Edit requests, planner-normalized sources, backend timeline audio elements, and frontend track clips.
  - Added Smart Edit timeline waveform strips for source-audio clips, including clipped-peak styling and trim-aware bucket selection.
- Verification:
  - `corepack pnpm --filter @shopclip/shared test -- src/schemas.test.ts`
  - `corepack pnpm --filter @shopclip/api run test src/providers/renderer/sceneClipMaterializer.test.ts`
  - `corepack pnpm --filter @shopclip/shared build`
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx`
  - `corepack pnpm --filter @shopclip/api typecheck`
  - `corepack pnpm --filter @shopclip/web typecheck`
  - `corepack pnpm --filter @shopclip/api run test src/providers/renderer/smartEditComposer.test.ts`
  - `corepack pnpm --filter @shopclip/api build`
  - `corepack pnpm --filter @shopclip/web build`
  - `corepack pnpm --filter @shopclip/api lint`
  - `corepack pnpm --filter @shopclip/web lint`
- Remaining:
  - The waveform is currently a visual timeline summary; direct drag editing on waveform/volume lines and waveform-level split handles remain open.
  - Full completion still requires live runtime evidence after deployment for real model render to ffmpeg materialization to Smart Edit waveform display.

## 2026-06-05 OpenCut Split-Left And Split-Right Actions

- Reference model:
  - OpenCut exposes `S` for split, `Q` for split-left, and `W` for split-right. Split-left keeps the right side of the clip at the playhead; split-right keeps the left side.
- Fix:
  - Added `trimSmartEditSegmentAtPlayhead` so Smart Edit can retain only the left or right side of a timeline clip without creating a second clip.
  - Segment source ranges, playback-rate-aware durations, timeline starts, and persistent video/source-audio/text timeline elements are trimmed together.
  - Added toolbar actions for trimming left/right at the playhead and keyboard shortcuts matching OpenCut: `S`, `Q`, and `W`.
  - Localized the new timeline actions in English and Chinese.
- Verification:
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "trims persistent smart edit timeline elements"`
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx`
  - `corepack pnpm --filter @shopclip/web typecheck`
- Remaining:
  - Split-left/right currently operate on the enabled segment under the playhead; direct retain-side operations on arbitrary unowned audio/text elements should be added next.
  - Full completion still requires broader OpenCut-style element-level editing and live runtime proof after deployment.

## 2026-06-05 OpenCut Element-Level Split And Trim

- Reference model:
  - OpenCut applies `S`, `Q`, and `W` to selected timeline items first, so independent audio/text materials can be cut without forcing users back to scene-sized storyboard clips.
- Fix:
  - Added `splitSmartEditTimelineElementAtPlayhead` for splitting a selected persistent timeline element at an absolute playhead time.
  - Added `trimSmartEditTimelineElementAtPlayhead` for keeping only the left or right side of a selected timeline element.
  - Audio/video element trims preserve playback-rate-aware `trimStartSecond`/`trimEndSecond`; text elements preserve content while changing timeline duration and start.
  - Smart Edit keyboard and toolbar actions now prefer the selected non-video track clip under the playhead, then fall back to the prior segment-level behavior.
  - Independent voice/text elements remain unbound to a storyboard `segmentId` after split or trim, so they behave like standalone editor materials.
- Verification:
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "independent smart edit timeline element"` initially failed because the new element-level functions were missing.
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "independent smart edit timeline element"`
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx`
  - `corepack pnpm --filter @shopclip/web typecheck`
  - `corepack pnpm --filter @shopclip/web build`
  - `corepack pnpm --filter @shopclip/web lint`
- Remaining:
  - Ripple delete/trim for following clips is still incomplete.
  - Waveform editing is still display-first; direct waveform volume/keyframe manipulation remains open.
  - Full completion still requires live runtime proof for the real model render -> ffmpeg materialization -> Smart Edit editing/export chain.

## 2026-06-05 Basic Demo Scope And Ripple Editing

- Scope decision:
  - The current demo target is video, audio, and subtitle editing only.
  - OpenCut-style fine-grained features such as stickers and complex effects are intentionally deferred until the base editing demo is usable.
- Reference model:
  - OpenCut has a ripple editing toggle. In ShopClip this is adapted as a fourth timeline edit mode alongside Magnetic, Insert, and Overwrite.
- Fix:
  - Added `ripple` as a Smart Edit timeline mode in English and Chinese.
  - Added `removeSmartEditSegmentsFromTimeline` so deleting a video segment can remove its video/audio/text elements and shift later video, audio, subtitle, and independent material clips left by the deleted gap.
  - Extended segment trim-left/trim-right so ripple mode shifts later timeline materials by the removed side duration.
  - Extended independent timeline element trim-left/trim-right so audio/subtitle material cuts can also close the gap across the timeline.
  - The feature stays within the base demo surface: video clips, source audio/voice audio, and text/subtitle clips.
- Verification:
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "ripples"` initially failed because ripple delete was missing and trim did not shift later clips.
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "ripples"`
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx`
  - `corepack pnpm --filter @shopclip/web typecheck`
  - `corepack pnpm --filter @shopclip/web build`
  - `corepack pnpm --filter @shopclip/web lint`
- Remaining:
  - The basic demo still needs a real browser pass on the deployed Studio timeline to confirm the visible workflow is smooth enough for user trial.
  - Waveform display exists, but direct drag editing of volume/keyframes can wait until after the base video/audio/subtitle demo is reviewed.

## 2026-06-05 Basic Demo Track Material Delete

- Scope:
  - This continues the narrowed base demo scope: video, audio, and subtitle timeline editing only.
- Fix:
  - Added `removeSmartEditTimelineElementFromTimeline` for deleting a selected audio/subtitle timeline material directly.
  - Delete now works on the selected track clip before falling back to deleting the selected video/storyboard segment.
  - Independent material inspectors now expose a `Delete material` / `删除素材` action.
  - In Ripple mode, deleting an independent audio/subtitle material shifts later timeline materials left by the removed material duration.
- Verification:
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "deletes an independent smart edit timeline material"` initially failed because the delete function was missing.
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "deletes an independent smart edit timeline material"`
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx`
  - `corepack pnpm --filter @shopclip/web typecheck`
  - `corepack pnpm --filter @shopclip/web build`
  - `corepack pnpm --filter @shopclip/web lint`
- Remaining:
  - Need a deployed browser pass through the Studio Smart Edit timeline to validate the base demo ergonomics end to end.

## 2026-06-05 Studio Source Render Material Handoff

- Browser finding:
  - A live `https://shopclip.site/` pass reached Project -> Video library -> Generate video -> Studio -> Smart edit.
  - The Smart Edit workspace showed video, caption, voice, and BGM tracks, but `Source audio track` was empty for the selected project.
  - API inspection showed the project had later `smart-edit-ffmpeg` tasks after the original `volcengine-seedance` scene-render tasks. The frontend loaded the latest smart-edit export as the studio input, so Smart Edit did not start from the original rendered scene clips that should be materialized into video/audio/text.
- Fix:
  - Added frontend render-task selection helpers so the Studio base render prefers the latest completed non-smart-edit scene render with scene clips, instead of blindly using the latest render task.
  - Source-render selection now prioritizes tasks that already expose audio material, then completed source render tasks configured with `generateAudio=true`, so silent or failed historical tasks do not outrank usable audio inputs.
  - Entering the project video flow now clears stale smart-edit result state and uses the selected source render task as the material input for the Smart Edit step.
  - Changed the default video render settings to generate audio, matching the current product assumption that model-rendered scene clips include audio by default.
  - Added a frontend material-refresh detector for completed Seedance tasks whose scene clips have `videoUrl` but no ffmpeg `material` payload.
  - Extended `GET /render-tasks/:renderTaskId` so historical completed Seedance tasks can be materialized on demand when scene clips are missing video/audio/text material records.
  - Avoided repeat materialization for clips that already have a material payload.
- Verification:
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "studio base|audio materials|materialization|generates audio"`
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx`
  - `corepack pnpm --filter @shopclip/web typecheck`
  - `corepack pnpm --filter @shopclip/api typecheck`
  - `corepack pnpm --filter @shopclip/api build`
  - `corepack pnpm --filter @shopclip/web build`
  - `corepack pnpm --filter @shopclip/api lint`
  - `corepack pnpm --filter @shopclip/web lint`
  - `git diff --check` passed with only the existing CRLF normalization warning for `apps/web/src/app/App.tsx`.
- Deployment evidence:
  - Deployed commit `44318e1` to `/www/wwwroot/shopclip-ai`; server health returned `{"service":"api","status":"ok","version":"0.1.0"}` and public `https://shopclip.site/` returned `200`.
  - Calling `GET /api/render-tasks/d091315f-97d8-4c36-8c01-f5a55ea6326e` after deployment triggered the new materialization path. The 2026-05-29 historical Volcengine clip URLs returned HTTP 403, so the task recorded `scene-clip-materialize-partial` with zero ready materials; this confirms the route runs but old signed provider URLs are not a valid acceptance sample.
- Remaining:
  - Deploy the follow-up default-audio/source-priority patch and re-run the live Studio Smart Edit browser pass.
  - Full completion still requires runtime evidence for a fresh render-to-material-to-smart-edit path using newly generated scene clips.

## 2026-06-05 Stable Seedance Reference Image Selection

- Runtime finding:
  - A live browser run clicked `Start render` on `https://shopclip.site/#delivery` with `Generate audio` checked.
  - The new render task `c085cac6-1e91-4243-ac7a-f94af8e9533a` failed immediately with `Seedance request failed with HTTP 400`.
  - The provider error was `content[1].image_url ... resource download failed`, and the failed project still had storyboard scene images from short-lived Volcengine/TOS generated-image URLs.
- Fix:
  - Changed Seedance request construction to prefer the scene's bound project asset image URL first, then stable project image assets, and only use the storyboard generated image URL as a fallback.
  - Updated the renderer regression test so stable asset-slot image URLs outrank storyboard scene image URLs.
- Verification:
  - `corepack pnpm --filter @shopclip/api run test src/providers/renderer/seedanceRenderer.test.ts -t "asset slot image|Seedance task"`
  - `corepack pnpm --filter @shopclip/api run test src/providers/renderer/seedanceRenderer.test.ts`
  - `corepack pnpm --filter @shopclip/api typecheck`
  - `corepack pnpm --filter @shopclip/api build`
  - `corepack pnpm --filter @shopclip/api lint`
  - `git diff --check`
- Remaining:
  - Deploy this fix and re-trigger a fresh audio-enabled render task. The goal remains open until the fresh task produces materialized video/audio/text clips and the Smart Edit timeline shows editable source audio and captions.

## 2026-06-05 Basic Demo Scope Lock

- Scope decision:
  - The current user-trial demo intentionally supports only video, audio, and subtitle editing.
  - Fine-grained OpenCut-style visual work such as stickers, visual effects, masks, and visual keyframes is deferred until after the base demo is reviewed.
- Fix:
  - Hid the Smart Edit inspector sections for visual effects, visual mask, and visual keyframes behind a disabled feature flag.
  - Kept existing shared contracts and backend compatibility fields intact so old smart-edit plans can still round-trip and future upgrades can re-enable the advanced visual controls without a data migration.
  - Updated the editor workspace regression test to assert that the base demo still exposes video transform, audio volume envelopes, independent voice/text material actions, copy/voice, and segment state, while not showing advanced visual controls.
- Verification:
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "smart edit|timeline|ripples|independent"`
  - `corepack pnpm --filter @shopclip/web typecheck`
  - `corepack pnpm --filter @shopclip/web build`
  - `corepack pnpm --filter @shopclip/web lint`
- Remaining:
  - Deploy this scope lock and let the user experience the simplified Studio Smart Edit demo before adding advanced visual editing features.

## 2026-06-05 Independent Audio Speed Control

- Scope:
  - Continues the user-trial demo direction: video, audio, and subtitle editing only.
  - Targets the "speed up / slow down" part of basic editing for standalone audio or voice material placed on the Smart Edit timeline.
- Fix:
  - Exposed `playbackRate` updates through the existing smart-edit timeline element update helper.
  - Added a `Speed` control to the independent audio material inspector, clamped to the shared `[0.25, 4]` range.
  - Reused the existing backend composer path that applies ffmpeg `atempo` for independent audio timeline elements, so the UI field is connected to export behavior rather than being display-only.
  - Added regression coverage proving independent audio material speed is clamped and persisted in the smart-edit plan.
- Verification:
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "independent audio material speed|smart edit|timeline"`
  - `corepack pnpm --filter @shopclip/web typecheck`
  - `corepack pnpm --filter @shopclip/web build`
  - `corepack pnpm --filter @shopclip/web lint`
- Remaining:
  - Direct browser validation on the deployed Studio timeline is still needed before claiming the full objective complete.
  - The fresh model-render -> ffmpeg scene-materialization -> Smart Edit timeline evidence is still required for full completion.

## 2026-06-05 Seedance Completion Materialization Regression

- Objective alignment:
  - The requested Studio flow requires model-rendered scene clips to become separate video, audio, and text materials before Smart Edit consumes them.
  - The backend already materializes completed Seedance scene clips during `GET /render-tasks/:renderTaskId`; this increment adds direct regression evidence for that contract.
- Verification fix:
  - Upgraded the multi-scene Seedance render flow test so a completed render-task poll now proves both final export publication and scene-clip materialization.
  - Injected a fake `sceneClipMaterializer` and asserted that completed scene clips return `material.status=ready`, `videoOnlyUrl`, `audioUrl`, and text copied from the storyboard subtitle.
  - Asserted the response trace includes `scene-clip-materialize`, which is the server-side handoff signal for Smart Edit material readiness.
- Verification:
  - `corepack pnpm --filter @shopclip/api run test src/seedance-render-flow.test.ts -t "published COS final video URL and materializes"`
  - `corepack pnpm --filter @shopclip/api typecheck`
  - `corepack pnpm --filter @shopclip/api build`
  - `corepack pnpm --filter @shopclip/api lint`
- Remaining:
  - Still need a live fresh render on `shopclip.site` that produces non-expired scene clip URLs, materializes them with real ffmpeg, and shows editable video/audio/subtitle tracks in Smart Edit.

## 2026-06-05 Source Audio Detach Demo

- Scope:
  - Continues the narrowed base demo: video, audio, and subtitle editing only.
  - Targets the user-trial gap where generated scene audio was visible as a segment-bound source-audio clip but could not yet be detached into an independently editable material.
- Fix:
  - Added `detachSmartEditSourceAudioToTimelineElement` to copy a generated scene clip's `sceneClipAudioUrl`, waveform, volume, fade, keyframe, playback-rate, trim, and timeline timing into a persistent `audio-source` timeline element.
  - The source segment is marked `sourceAudioMuted=true` after detach so export does not double-mix the original source audio and the new independent audio material.
  - Added a `Detach audio` action to the source-audio inspector. After detaching, the newly created independent audio material is selected and can reuse the existing move, split, trim, delete, volume, mute, and speed controls.
- Verification:
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "detaches generated scene source audio"` initially failed because the helper was missing.
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "detaches generated scene source audio"`
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "smart edit|timeline|independent|source audio"`
  - `corepack pnpm --filter @shopclip/web typecheck`
  - `corepack pnpm --filter @shopclip/web build`
  - `corepack pnpm --filter @shopclip/web lint`
- Remaining:
  - This is still not full objective completion. The open acceptance gap is live runtime evidence for a fresh model render -> real ffmpeg video/audio/text materialization -> Smart Edit timeline editing/export on `shopclip.site`.

## 2026-06-05 Generated Scene Video Material Compose Fix

- Runtime finding:
  - A live smart-edit task consumed materialized Seedance scene clips correctly and produced a timeline with video, source-audio, and text elements.
  - The task failed during ffmpeg composition with `Option loop not found` because a generated scene `sceneClipVideoOnlyUrl` was still treated as an image input when the segment also retained an image asset id.
- Fix:
  - Changed smart-edit source classification so the actual selected source URL decides the media kind.
  - `sceneClipVideoOnlyUrl` and `sceneClipUrl` are now always treated as video inputs, while `imageUrl`, image assets, and fallback stills keep the image-to-video `-loop 1` path.
  - Added a regression test for generated scene video-only material that still carries an image asset id.
- Verification:
  - `corepack pnpm --filter @shopclip/api exec vitest run src/providers/renderer/smartEditComposer.test.ts -t "treats generated scene video-only material"`
  - `corepack pnpm --filter @shopclip/api exec vitest run src/providers/renderer/smartEditComposer.test.ts`
  - `corepack pnpm --filter @shopclip/api typecheck`
  - `corepack pnpm --filter @shopclip/api build`
  - `corepack pnpm --filter @shopclip/api lint`
- Deployment evidence:
  - Deployed commit `e3fc925` to `/www/wwwroot/shopclip-ai`; server health returned `{"service":"api","status":"ok","version":"0.1.0"}` and public `https://shopclip.site/` returned `200`.
  - Re-triggered smart edit from materialized Seedance render `e01d667a-2288-4440-8911-889682aab179` in project `cmpq7vbgg0000wh6cn1qs9u69`.
  - New smart-edit task `fcdca96f-02fe-48d4-8dcd-02cc52121517` reached `completed` with trace `smart-edit-ffmpeg-compose` and 3 segment outputs.
  - Export URL: `https://shopclip-standard-1436426026.cos.ap-beijing.myqcloud.com/projects/cmpq7vbgg0000wh6cn1qs9u69/smart-edits/a3adea18-6659-4764-a898-4c86b3208863/export.mp4`.
- Remaining:
  - The ffmpeg composition blocker is fixed for the base video/audio/subtitle demo path.
  - The live run used smart-edit planner fallback before composition; if strict model-planned editing is required for acceptance, planner response stability should be hardened separately.

## 2026-06-05 SRT Caption Import For Text Track

- Scope:
  - Continues the narrowed base demo direction: video, audio, and subtitle editing only.
  - Uses the OpenCut Classic subtitle/timeline model as reference: imported subtitle cues become timeline text materials rather than a single global caption blob.
- Fix:
  - Added SRT parsing for standard `HH:MM:SS,mmm --> HH:MM:SS,mmm` and dot-millisecond timestamps.
  - Added `importSmartEditSrtCaptionsToTimeline` to create independent `text-copy` timeline elements, preserving cue start time, duration, and multi-line text.
  - Added a compact SRT import panel inside the Smart Edit timeline so users can paste subtitles and add them as editable text clips.
  - Imported captions reuse the existing text-material controls: move, split, trim, hide/show, delete, and backend export as timeline text.
- Verification:
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "imports SRT captions"` initially failed because the helper did not exist, then passed after implementation.
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "SRT|smart edit|timeline|independent|source audio"`
  - `corepack pnpm --filter @shopclip/web typecheck`
  - `corepack pnpm --filter @shopclip/web build`
  - `corepack pnpm --filter @shopclip/web lint`
- Remaining:
  - This adds subtitle import/editing for the base demo. Fine-grained subtitle style editing can be added later if user testing calls for it.

## 2026-06-06 Independent Material Magnetic Move

- Scope:
  - Continues the narrowed base demo direction: video, audio, and subtitle editing only.
  - Targets OpenCut-style timeline placement for standalone audio/text materials after they are added or imported onto the Smart Edit timeline.
- Fix:
  - Independent timeline materials without a storyboard `segmentId` now use the same magnetic placement resolver as video/storyboard segment moves.
  - Moving a standalone audio or subtitle clip clamps to timeline start, snaps to nearby playhead and clip edges, and avoids overlapping clips on the same concrete timeline track.
  - Non-magnetic movement modes keep their prior direct nudge behavior for now; ripple/insert/overwrite element-level move semantics can be expanded after the base demo is reviewed.
- Verification:
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "snaps and prevents overlap"`
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "smart edit|timeline|independent|SRT|source audio"`
  - `corepack pnpm --filter @shopclip/web typecheck`
  - `corepack pnpm --filter @shopclip/web build`
  - `corepack pnpm --filter @shopclip/web lint`
- Remaining:
  - Full objective completion still requires live runtime evidence for a fresh model render -> real ffmpeg video/audio/text materialization -> Smart Edit timeline editing/export on `shopclip.site`.

## 2026-06-06 Independent Material Insert And Overwrite

- Scope:
  - Continues the narrowed base demo direction: video, audio, and subtitle editing only.
  - Extends the OpenCut-style edit-mode behavior from storyboard/video clips to standalone timeline materials.
- Fix:
  - Moving an independent audio/text material in Insert mode now shifts later overlapping materials on the same concrete track to the right by the moved clip duration.
  - Moving an independent audio/text material in Overwrite mode now removes same-track independent materials overlapped by the moved clip.
  - Magnetic mode continues to clamp, snap, and avoid same-track overlap; direct non-magnetic nudge remains available through other modes where no insert/overwrite semantics are requested.
- Verification:
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "applies insert and overwrite modes when moving independent"`
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "smart edit|timeline|independent|SRT|source audio|insert|overwrite"`
  - `corepack pnpm --filter @shopclip/web typecheck`
  - `corepack pnpm --filter @shopclip/web build`
  - `corepack pnpm --filter @shopclip/web lint`
- Remaining:
  - Full objective completion still requires live runtime evidence for a fresh model render -> real ffmpeg video/audio/text materialization -> Smart Edit timeline editing/export on `shopclip.site`.

## 2026-06-06 Independent Text Material Styling

- Scope:
  - Continues the narrowed base demo direction: video, audio, and subtitle editing only.
  - Adds practical subtitle-card editing controls without enabling stickers, effects, masks, or other advanced visual features.
- Fix:
  - Added optional `textColor`, `textFontSize`, and `textPositionYPercent` fields to persistent smart-edit timeline elements.
  - Added Smart Edit inspector controls for independent text materials so a user can change subtitle size, vertical placement, and color on the timeline clip.
  - The frontend clamps text size to `[12,72]`, vertical placement to `[8,92]`, and keeps invalid colors out of the plan.
  - The ffmpeg smart-edit composer now maps independent text timeline materials into per-caption ASS styles, preserving color, font size, and vertical placement in exported videos.
- Verification:
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "text material style"` initially failed because text style values were not clamped or persisted.
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "text material style"`
  - `corepack pnpm --filter @shopclip/api run test src/providers/renderer/smartEditComposer.test.ts -t "bridges persistent timeline elements"`
  - `corepack pnpm --filter @shopclip/shared test -- src/schemas.test.ts`
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "smart edit|timeline|independent|SRT|source audio|text material style"`
  - `corepack pnpm --filter @shopclip/api run test src/providers/renderer/smartEditComposer.test.ts`
  - `corepack pnpm --filter @shopclip/shared build`
  - `corepack pnpm --filter @shopclip/web typecheck`
  - `corepack pnpm --filter @shopclip/api typecheck`
  - `corepack pnpm --filter @shopclip/web build`
  - `corepack pnpm --filter @shopclip/api build`
  - `corepack pnpm --filter @shopclip/web lint`
  - `corepack pnpm --filter @shopclip/api lint`
- Remaining:
  - Full objective completion still requires live runtime evidence for a fresh model render -> real ffmpeg video/audio/text materialization -> Smart Edit timeline editing/export on `shopclip.site`.

## 2026-06-06 Scene Video Detach Demo

- Scope:
  - Continues the narrowed base demo direction: video, audio, and subtitle editing only.
  - Targets the remaining video-side material gap: generated scene video should be separable into a timeline clip just like generated source audio can be detached.
- Fix:
  - Added `detachSmartEditSceneVideoToTimelineElement` to copy a generated scene clip's `sceneClipVideoOnlyUrl` / `sceneClipUrl`, playback rate, source trim range, timeline start, scene id, and visual-effect metadata into a persistent `video-main` timeline element.
  - The original storyboard segment is marked `enabled=false` after detaching so the export path does not duplicate the same generated picture material.
  - Added a `Detach video` action when selecting a video track clip that has a generated scene video source. The newly created video material becomes the selected timeline clip and can reuse existing move, split, trim, speed, insert/overwrite, and export behavior.
  - This stays inside the base demo scope; no stickers, effects, masks, or advanced visual controls were enabled.
- Verification:
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "detaches generated scene video"` initially failed because the helper did not exist.
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "detaches generated scene video"`
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "smart edit|timeline|independent|source audio|detaches generated scene video"`
  - `corepack pnpm --filter @shopclip/api run test src/providers/renderer/smartEditComposer.test.ts -t "persistent timeline elements|generated scene video-only"`
  - `corepack pnpm --filter @shopclip/web typecheck`
  - `corepack pnpm --filter @shopclip/web build`
  - `corepack pnpm --filter @shopclip/web lint`
- Remaining:
  - Full objective completion still requires live runtime evidence for a fresh model render -> real ffmpeg video/audio/text materialization -> Smart Edit timeline editing/export on `shopclip.site`.

## 2026-06-06 Default Generated Audio

- Scope:
  - Continues the narrowed base demo direction: video, audio, and subtitle editing only.
  - Aligns request contracts with the product expectation that generated scene videos include source audio by default before ffmpeg materialization.
- Fix:
  - Changed `VideoGenerationSettingsSchema.generateAudio` default from `false` to `true`.
  - Updated default `videoSettings` for render, smart-edit, and smart-edit segment refresh requests so callers that omit the field still request audio.
  - Added a shared schema regression test covering all three request paths.
- Verification:
  - `corepack pnpm --filter @shopclip/shared test -- src/schemas.test.ts`
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "smart edit|timeline|independent|source audio|detaches generated scene video"`
  - `corepack pnpm --filter @shopclip/api run test src/providers/renderer/smartEditComposer.test.ts -t "persistent timeline elements|generated scene video-only"`
  - `corepack pnpm --filter @shopclip/shared build`
  - `corepack pnpm --filter @shopclip/web typecheck`
  - `corepack pnpm --filter @shopclip/api typecheck`
  - `corepack pnpm --filter @shopclip/web build`
  - `corepack pnpm --filter @shopclip/api build`
  - `corepack pnpm --filter @shopclip/web lint`
  - `corepack pnpm --filter @shopclip/api lint`
- Live evidence in progress:
  - Fresh Seedance render task `6a028699-932d-4f3c-b2e5-a415d935d63d` was created for project `cmpq7vbgg0000wh6cn1qs9u69` with `generateAudio: true`.
  - The task reached `running`; scene 1 completed and scene 2 started before SSH polling became intermittently unavailable.
- Remaining:
  - Full objective completion still requires live runtime evidence for fresh model render completion, real ffmpeg video/audio/text materialization, and Smart Edit timeline/export consumption.

## 2026-06-06 Fresh Scene Material Bridge For Smart Edit

- Scope:
  - Continues the narrowed base demo direction: video, audio, and subtitle editing only.
  - Fixes the live failure where the planner returned expired provider image/video URLs even though a fresh Seedance render had already produced stable video/audio/text materials.
- Fix:
  - Smart Edit now inspects the project's latest completed Seedance render tasks before ffmpeg composition.
  - For every matching `sceneId` with ready material, the planner segment source is overwritten with stable `sceneClipVideoOnlyUrl`, `sceneClipAudioUrl`, waveform, and the fresh scene clip URL.
  - The plan timeline is regenerated after this bridge, so the UI-visible timeline and composer both use the fresh material URLs rather than stale planner URLs.
  - Source audio is unmuted when a fresh material audio URL exists, keeping generated clip audio available for the base editing demo.
  - The same bridge is applied to smart-edit segment refresh.
  - Added trace step `smart-edit-scene-materials-applied`.
- Verification:
  - `corepack pnpm --filter @shopclip/api run test src/smart-edit-flow.test.ts -t "latest materialized Seedance"` initially failed because the test helper was missing, then passed after adding the helper.
  - `corepack pnpm --filter @shopclip/api run test src/smart-edit-flow.test.ts`
  - `corepack pnpm --filter @shopclip/api run test src/providers/renderer/smartEditComposer.test.ts -t "persistent timeline elements|generated scene video-only"`
  - `corepack pnpm --filter @shopclip/shared test -- src/schemas.test.ts`
  - `corepack pnpm --filter @shopclip/api typecheck`
  - `corepack pnpm --filter @shopclip/api build`
  - `corepack pnpm --filter @shopclip/web typecheck`
  - `corepack pnpm --filter @shopclip/web build`
  - `corepack pnpm --filter @shopclip/api lint`
  - `corepack pnpm --filter @shopclip/web lint`
- Live evidence before fix:
  - Smart-edit task `5cd9fc77-1aab-4bab-8a08-a545c957cbd2` failed at `smart-edit-ffmpeg-compose-failed` because ffmpeg tried to download an expired Seedream URL and received HTTP 403.
  - The failed plan had not consumed the fresh materialized task `6a028699-932d-4f3c-b2e5-a415d935d63d`.
- Remaining:
  - Redeployed commit `a16aaff` to `/www/wwwroot/shopclip-ai`; server health returned `{"service":"api","status":"ok","version":"0.1.0"}`, PM2 showed `shopclip-ai-api` online, and public `https://shopclip.site/` returned `200`.
  - Re-ran Smart Edit against project `cmpq7vbgg0000wh6cn1qs9u69` after fresh render task `6a028699-932d-4f3c-b2e5-a415d935d63d` had materialized scene video/audio/text assets.
  - New Smart Edit task `8324a78c-8d1f-4569-805e-c2b9c123ffc6` reached `completed`.
  - Trace included `smart-edit-scene-materials-applied` with message `Applied 3 fresh scene video/audio/text material sources before ffmpeg composition.` and then `smart-edit-ffmpeg-compose`.
  - Export URL: `https://shopclip-standard-1436426026.cos.ap-beijing.myqcloud.com/projects/cmpq7vbgg0000wh6cn1qs9u69/smart-edits/86a01150-0120-4d76-884c-4a73de2510b6/export.mp4`.
  - The exported file returned HTTP 200 with `Content-Type: video/mp4`.
  - `ffmpeg -i` on the downloaded export confirmed both streams:
    - Video: `h264`, `720x1280`, `30 fps`.
    - Audio: `aac (LC)`, `44100 Hz`, `stereo`.
- Remaining:
  - Base demo is ready for user experience review. Later upgrades can focus on targeted timeline UX improvements rather than stickers/effects/advanced OpenCut features.

## 2026-06-06 Timeline Track State Controls

- Scope:
  - Continues the narrowed base demo direction: video, audio, and subtitle editing only.
  - Adds an OpenCut/CutCap-style track-level editing primitive without enabling stickers, effects, masks, or advanced visual controls.
- Fix:
  - Added `updateSmartEditTimelineTrack` to update timeline track `hidden`, `muted`, and `locked` state and mirror hidden/muted state to elements on that track.
  - Track stack controls now support lock/unlock on every track, mute/unmute on audio-like tracks, and hide/show on video/caption tracks.
  - Locked tracks no longer start drag moves or delete selected track clips from the UI.
  - The ffmpeg smart-edit composer now respects timeline track state:
    - hidden tracks do not contribute global duration.
    - hidden video/text tracks are skipped.
    - muted/hidden source-audio tracks are skipped.
    - muted/hidden voice tracks are skipped.
- Verification:
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "timeline track state"`
  - `corepack pnpm --filter @shopclip/api run test src/providers/renderer/smartEditComposer.test.ts -t "muted and hidden timeline track"`
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "smart edit|timeline|independent|track state|source audio|SRT"`
  - `corepack pnpm --filter @shopclip/api run test src/providers/renderer/smartEditComposer.test.ts -t "persistent timeline elements|global source-audio|muted and hidden timeline track|generated scene video-only"`
  - `corepack pnpm --filter @shopclip/web typecheck`
  - `corepack pnpm --filter @shopclip/api typecheck`
  - `corepack pnpm --filter @shopclip/api build`
  - `corepack pnpm --filter @shopclip/web build`
  - `corepack pnpm --filter @shopclip/web lint`
  - `corepack pnpm --filter @shopclip/api lint`
- Remaining:
  - Full OpenCut-level parity is still broader than the current base demo. The next practical upgrades should stay focused on video/audio/subtitle timeline ergonomics such as slip edit, linked selection, and better clip handles.

## 2026-06-06 Timeline Clip Edge Resize

- Scope:
  - Continues the narrowed base demo direction: video, audio, and subtitle editing only.
  - Adds a CutCap/OpenCut-style direct manipulation primitive: users can trim timeline materials from the left or right edge instead of relying only on playhead trim commands.
- Fix:
  - Added `resizeSmartEditTrackClipEdge` for track-level clip resizing.
  - Independent video/audio timeline materials now update `startSecond`, `durationSeconds`, `trimStartSecond`, and `trimEndSecond` when their edges are resized.
  - Independent subtitle/text materials now update timeline start and duration from edge resize while preserving text/style payload.
  - Main video storyboard clips can also be resized from the track stack; resizing updates the segment source range and timeline start/duration.
  - Track stack clips now render left/right trim handles, support click nudge and pointer-drag resize, and respect locked tracks.
- Verification:
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "resizes independent smart edit video"`
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "smart edit|timeline|independent|track state|source audio|SRT|resize"`
  - `corepack pnpm --filter @shopclip/web typecheck`
  - `corepack pnpm --filter @shopclip/web build`
  - `corepack pnpm --filter @shopclip/web lint`
- Remaining:
  - This improves the base timeline editing demo. Later upgrades can add linked A/V selection, slip edit, drag previews, and multi-track selection ergonomics.

## 2026-06-06 Linked Scene Video And Audio Materials

- Scope:
  - Continues the requested video/audio/subtitle editing path and adapts the OpenCut-style source-audio separation model to ShopClip's generated scene materials.
  - Generated scene video and extracted/generated audio are treated as linked timeline materials when both are available.
- Fix:
  - Added optional `linkedGroupId` to persistent smart-edit timeline elements.
  - Detaching a generated scene video now creates a `video-main` element and, when `sceneClipAudioUrl` exists, a linked `audio-source` element with the same start, duration, playback rate, trim range, waveform, fade, and volume metadata.
  - Moving one linked element moves the other by the same resolved timeline delta.
  - Resizing either linked edge applies the same trim operation to the linked counterpart.
  - Deleting one linked element removes the whole linked video/audio group so orphan picture or sound is not left behind.
- Verification:
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "linked detached scene"`
  - `corepack pnpm --filter @shopclip/shared test -- src/schemas.test.ts`
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "smart edit|timeline|independent|track state|source audio|SRT|resize|linked"`
  - `corepack pnpm --filter @shopclip/shared build`
  - `corepack pnpm --filter @shopclip/web typecheck`
  - `corepack pnpm --filter @shopclip/web build`
  - `corepack pnpm --filter @shopclip/web lint`
  - `corepack pnpm --filter @shopclip/api typecheck`
  - `corepack pnpm --filter @shopclip/api build`
- Remaining:
  - Linked A/V now works for generated scene materials. Later improvements can add explicit unlink/relink controls and multi-select box selection.

## 2026-06-06 Linked Material Unlink And Relink Controls

- Scope:
  - Continues the video/audio/subtitle editing path and turns linked generated scene materials into a controllable editing primitive.
  - Matches the OpenCut-style source-audio workflow expectation that linked A/V can be separated for independent edits and restored when needed.
- Fix:
  - Added `unlinkSmartEditTimelineElementGroup` to clear `linkedGroupId` across the selected linked video/audio group.
  - Added `relinkSmartEditTimelineElements` and `relinkSmartEditTimelineElementWithSceneMate` to rebuild a video/audio group for unlinked elements from the same scene.
  - Independent timeline material inspector now shows linked/unlinked status.
  - Linked video/audio elements expose an `Unlink audio/video` action.
  - Unlinked scene video/audio elements expose a `Relink scene material` action when a compatible scene mate exists.
- Verification:
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "unlinks and relinks"`
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "linked detached scene|unlinks and relinks"`
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "smart edit|timeline|independent|track state|source audio|SRT|resize|linked|unlink"`
  - `corepack pnpm --filter @shopclip/web typecheck`
  - `corepack pnpm --filter @shopclip/web lint`
  - `corepack pnpm --filter @shopclip/web build`
- Remaining:
  - The next interaction gap is multi-select box selection or slip edit. Unlink/relink is now available as a base demo control.

## 2026-06-06 Timeline Source Slip Controls

- Scope:
  - Continues the narrowed base demo direction: video, audio, and subtitle editing only.
  - Adds source-range slip editing for generated video/audio materials without introducing stickers, effects, masks, or other advanced OpenCut extras.
- Fix:
  - Added `slipSmartEditTimelineElementSource` to shift video/audio `trimStartSecond` and `trimEndSecond` while preserving timeline `startSecond` and `durationSeconds`.
  - Linked generated scene video/audio materials now slip together until the user explicitly unlinks them.
  - Slip edits clamp to the available source range so controls cannot push the selected span beyond the generated clip.
  - The independent material inspector now exposes source in/out readout plus `-0.1s` and `+0.1s` nudge controls for selected video/audio timeline clips.
- Verification:
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "slips linked"`
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "smart edit|timeline|independent|track state|source audio|SRT|resize|linked|unlink|slip"`
  - `corepack pnpm --filter @shopclip/web typecheck`
  - `corepack pnpm --filter @shopclip/web build`
  - `corepack pnpm --filter @shopclip/web lint`
- Remaining:
  - The base demo now covers practical video/audio/subtitle editing primitives: split, trim, delete, move, resize, track state, linked A/V unlink/relink, source slip, subtitles, and audio volume/fade/keyframes.
  - Later upgrades should target timeline selection ergonomics, drag previews, and denser multi-track workflows.

## 2026-06-06 Timeline Material Multi-Select

- Scope:
  - Continues the narrowed base demo direction: video, audio, and subtitle editing only.
  - Adds OpenCut/CutCap-style multi-selection ergonomics for independent timeline materials after generated scene clips have been split into video/audio/text assets.
- Fix:
  - Added `moveSmartEditTimelineElementsOnTimeline` for batch moving persistent timeline materials while preserving their relative offsets.
  - Added `removeSmartEditTimelineElementsFromTimeline` for deleting multiple selected persistent timeline materials.
  - Batch operations expand linked video/audio groups so selecting one side of generated scene media keeps the group together.
  - Track clip selection now supports Ctrl/Meta toggling and Shift range selection.
  - Dragging one selected independent material can move the selected material batch together.
  - The timeline batch toolbar now supports nudge-left, nudge-right, delete, and clear selection for selected independent materials.
- Verification:
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "moves and deletes multiple independent"`
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "smart edit|timeline|independent|track state|source audio|SRT|resize|linked|unlink|slip|multiple independent"`
  - `corepack pnpm --filter @shopclip/web typecheck`
  - `corepack pnpm --filter @shopclip/web build`
  - `corepack pnpm --filter @shopclip/web lint`
- Remaining:
  - The next high-value editor upgrades are drag ghost previews, box selection, and denser keyboard/mouse operations.

## 2026-06-06 Timeline Material Box Selection

- Scope:
  - Continues the narrowed base demo direction: video, audio, and subtitle editing only.
  - Adds a direct-manipulation selection primitive inspired by OpenCut/CutCap editors.
- Fix:
  - Added `selectSmartEditTimelineElementIdsInBox` to select persistent video/audio/text timeline materials by time range and track.
  - The selector ignores derived storyboard timeline elements so box selection targets the editable material clips.
  - Track lanes now support dragging on empty lane background to draw a selection rectangle and select independent materials in that range.
  - Selected materials continue to use the existing batch toolbar for nudge-left, nudge-right, delete, and clear selection.
- Verification:
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "selects independent timeline materials inside a track box range"`
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "smart edit|timeline|independent|track state|source audio|SRT|resize|linked|unlink|slip|multiple independent|box range"`
  - `corepack pnpm --filter @shopclip/web typecheck`
  - `corepack pnpm --filter @shopclip/web build`
  - `corepack pnpm --filter @shopclip/web lint`
- Remaining:
  - Cross-track marquee selection and drag ghost previews remain high-value editor upgrades.

## 2026-06-06 Timeline Drag Ghost Preview

- Scope:
  - Continues the narrowed base demo direction: video, audio, and subtitle editing only.
  - Adds a direct manipulation affordance expected from CutCap/OpenCut-style timelines: previewing target clip positions while dragging.
- Fix:
  - Added `previewSmartEditTrackClipDrag` to compute ghost positions from pointer delta, selected material ids, timeline scale, and clip starts.
  - Dragging a single independent material now renders a dashed ghost at the candidate target position.
  - Dragging within a multi-selected material group renders ghost positions for the full selected group while preserving relative offsets.
  - Ghost positions clamp at timeline start so negative drags do not preview outside the timeline.
- Verification:
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "previews track clip drag positions"`
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "smart edit|timeline|independent|track state|source audio|SRT|resize|linked|unlink|slip|multiple independent|box range|drag positions"`
  - `corepack pnpm --filter @shopclip/web typecheck`
  - `corepack pnpm --filter @shopclip/web build`
  - `corepack pnpm --filter @shopclip/web lint`
- Remaining:
  - Cross-track marquee selection and richer keyboard/mouse operations remain the next high-value editor upgrades.

## 2026-06-06 Cross-Track Timeline Marquee Selection

- Scope:
  - Continues the narrowed base demo direction: video, audio, and subtitle editing only.
  - Improves OpenCut/CutCap-style timeline ergonomics by letting a box selection span multiple track rows instead of only the lane where the drag started.
- Fix:
  - Added `selectSmartEditTrackIdsInMarquee` to resolve timeline track ids from a vertical marquee range while skipping locked tracks.
  - Track box selection now records per-track row geometry at drag start, updates vertical drag coordinates, and selects editable timeline materials across all intersected tracks.
  - The selection overlay now appears on every crossed track row, while single-lane horizontal box selection remains supported when vertical movement is effectively zero.
- Verification:
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "cross-track marquee"`
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "box range|cross-track marquee|drag positions|multiple independent"`
  - `corepack pnpm --filter @shopclip/web typecheck`
- Remaining:
  - The next high-value editor upgrades are denser keyboard operations and browser-level validation of marquee drag behavior on the live workspace.

## 2026-06-06 Timeline Keyboard Nudge Controls

- Scope:
  - Continues the narrowed base demo direction: video, audio, and subtitle editing only.
  - Adds keyboard-level timeline positioning controls expected in an editor workflow.
- Fix:
  - Added `smartEditTimelineKeyboardNudgeSeconds` to map ArrowLeft/ArrowRight to `-0.1s`/`+0.1s`, with Shift expanding the nudge to `-1s`/`+1s`.
  - Selected independent video/audio/text timeline materials now move with ArrowLeft/ArrowRight instead of only changing storyboard selection.
  - The same move path supports one selected independent material or a multi-selected material batch, preserving linked A/V expansion and track-lock checks.
- Verification:
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "keyboard arrow nudges|multiple independent|box range|cross-track marquee"`
  - `corepack pnpm --filter @shopclip/web typecheck`
- Remaining:
  - Browser-level validation should confirm keyboard focus handling in the live workspace when a real project timeline is loaded.

## 2026-06-06 Timeline Material Select All

- Scope:
  - Continues the narrowed base demo direction: video, audio, and subtitle editing only.
  - Improves the editor selection model so keyboard shortcuts operate on independent timeline materials, not only storyboard segments.
- Fix:
  - Added `selectSmartEditTimelineElementIds` to collect editable persistent timeline material ids in track order while skipping derived storyboard clips and locked tracks.
  - `Ctrl+A` / `Cmd+A` now selects all independent timeline materials when the user is in timeline-material context; storyboard segment select-all remains the fallback.
  - The selected timeline material batch can then be moved with keyboard nudges or deleted with the existing batch controls.
- Verification:
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "selects all editable independent|keyboard arrow nudges|multiple independent|box range|cross-track marquee"`
  - `corepack pnpm --filter @shopclip/web typecheck`
- Remaining:
  - Browser-level validation should confirm focus routing for `Ctrl+A` on the live workspace once a real timeline is loaded.

## 2026-06-06 Timeline Material Clipboard

- Scope:
  - Continues the narrowed base demo direction: video, audio, and subtitle editing only.
  - Adds editor-style copy/paste for independent timeline materials after scene clips have been split into video/audio/text assets.
- Fix:
  - Extended `SmartEditClipboard` with `timelineItems` for persistent timeline material snapshots while keeping the existing storyboard segment clipboard intact.
  - Added `copySmartEditTimelineElementsToClipboard` and `pasteSmartEditTimelineClipboardAtPlayhead` to copy selected independent video/audio/text materials, preserve relative offsets, and paste them at the playhead.
  - Linked video/audio materials are expanded during copy so a selected linked side can paste the group together with a fresh linked group id.
  - `Ctrl+C` / `Cmd+C` and `Ctrl+V` / `Cmd+V` now prefer selected independent timeline materials; storyboard segment copy/paste remains the fallback.
- Verification:
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "copies and pastes independent|copies and pastes persistent|copies smart edit segments|selects all editable independent|keyboard arrow nudges|multiple independent"`
  - `corepack pnpm --filter @shopclip/web typecheck`
- Remaining:
  - Browser-level validation should confirm clipboard focus routing in the live workspace with a loaded timeline.

## 2026-06-06 Timeline Material Cut

- Scope:
  - Continues the narrowed base demo direction: video, audio, and subtitle editing only.
  - Adds the editor-standard cut operation for independent timeline materials after generated scene clips have been split into video/audio/text assets.
- Fix:
  - Added `cutSmartEditTimelineElementsToClipboard` to snapshot selected independent timeline materials, expand linked video/audio mates, and remove the originals from the timeline.
  - `Ctrl+X` / `Cmd+X` now cuts selected independent video/audio/text materials into the local smart edit clipboard.
  - The multi-selection material toolbar now exposes Copy, Cut, and Delete controls side by side.
  - Cut materials can be pasted back at the playhead with the existing timeline material paste path.
- Verification:
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "cuts independent smart edit timeline materials"`
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "cuts independent|copies and pastes independent|multiple independent|selects all editable independent|keyboard arrow nudges"`
  - `corepack pnpm --filter @shopclip/web typecheck`
  - `corepack pnpm --filter @shopclip/web lint`
  - `corepack pnpm --filter @shopclip/web build`
- Remaining:
  - Browser-level validation should confirm shortcut focus routing on the deployed workspace with a real loaded timeline.

## 2026-06-06 Timeline Material Duplicate

- Scope:
  - Continues the narrowed base demo direction: video, audio, and subtitle editing only.
  - Adds the one-click duplicate operation expected in CutCap/OpenCut-style timeline editing for independent materials.
- Fix:
  - Added `duplicateSmartEditTimelineElementsOnTimeline` to duplicate selected persistent video/audio/text timeline materials.
  - Duplicate expands linked generated video/audio mates, preserves relative offsets, assigns fresh ids/linked group ids, and places the copied block directly after the selected block.
  - The independent-material multi-selection toolbar now exposes `Copy`, `Cut`, `Duplicate`, and `Delete` as first-class actions.
- Verification:
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "duplicates independent smart edit timeline materials"`
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "duplicates independent|cuts independent|copies and pastes independent|multiple independent|selects all editable independent|keyboard arrow nudges"`
  - `corepack pnpm --filter @shopclip/web typecheck`
  - `corepack pnpm --filter @shopclip/web lint`
  - `corepack pnpm --filter @shopclip/web build`
- Remaining:
  - Browser-level validation should confirm the duplicate toolbar action on a real loaded timeline.

## 2026-06-06 Timeline Material Batch Speed

- Scope:
  - Continues the narrowed base demo direction: video, audio, and subtitle editing only.
  - Adds a high-frequency timeline speed control for selected generated video/audio materials.
- Fix:
  - Added `updateSmartEditTimelineElementsPlaybackRate` for batch speed updates on persistent timeline materials.
  - The helper expands linked generated video/audio mates, skips derived storyboard clips, skips text/subtitle materials, and clamps speed to the existing `0.25x`-`4x` range.
  - The independent-material multi-selection toolbar now exposes `0.5x`, `1x`, and `2x` speed actions.
- Verification:
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "updates playback speed for selected independent"`
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "updates playback speed for selected|updates independent audio material speed|duplicates independent|cuts independent|copies and pastes independent|multiple independent|selects all editable independent"`
  - `corepack pnpm --filter @shopclip/web typecheck`
  - `corepack pnpm --filter @shopclip/web lint`
  - `corepack pnpm --filter @shopclip/web build`
- Remaining:
  - Browser-level validation should confirm speed actions on selected linked scene video/audio materials in a loaded workspace.

## 2026-06-06 Timeline Material Batch Split

- Scope:
  - Continues the narrowed base demo direction: video, audio, and subtitle editing only.
  - Adds multi-material splitting at the playhead, matching the expected editor behavior for cutting selected video/audio/subtitle clips together.
- Fix:
  - Added `splitSmartEditTimelineElementsAtPlayhead` for batch splitting persistent timeline materials.
  - The helper expands linked generated video/audio mates, skips derived storyboard clips, and splits only materials intersected by the playhead.
  - `S` / `Split at playhead` now splits multi-selected independent materials in one action and selects the generated right-side clips.
- Verification:
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "splits multiple selected independent"`
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "splits multiple selected|splits an independent|splits persistent|trims an independent|resizes independent|updates playback speed for selected|duplicates independent|cuts independent|multiple independent|selects all editable independent"`
  - `corepack pnpm --filter @shopclip/web typecheck`
  - `corepack pnpm --filter @shopclip/web lint`
  - `corepack pnpm --filter @shopclip/web build`
- Remaining:
  - Browser-level validation should confirm multi-selected linked video/audio/text materials split together in a loaded workspace.

## 2026-06-06 Timeline Material Batch Trim

- Scope:
  - Continues the narrowed base demo direction: video, audio, and subtitle editing only.
  - Adds multi-material trim-to-playhead behavior so selected generated video/audio/text clips can be shortened together.
- Fix:
  - Added `trimSmartEditTimelineElementsAtPlayhead` for batch trimming persistent timeline materials.
  - The helper expands linked generated video/audio mates, skips derived storyboard clips, and trims only materials intersected by the playhead.
  - `Q` / `W` and toolbar trim actions now trim multi-selected independent materials in one operation.
- Verification:
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "trims multiple selected independent"`
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "trims multiple selected|trims an independent|trims persistent|splits multiple selected|splits an independent|resizes independent|updates playback speed for selected|duplicates independent|cuts independent|multiple independent"`
  - `corepack pnpm --filter @shopclip/web typecheck`
  - `corepack pnpm --filter @shopclip/web lint`
  - `corepack pnpm --filter @shopclip/web build`
- Remaining:
  - Browser-level validation should confirm multi-selected linked video/audio/text materials trim together in a loaded workspace.

## 2026-06-06 Timeline Material Batch State

- Scope:
  - Continues the narrowed base demo direction: video, audio, and subtitle editing only.
  - Adds bulk state controls for selected independent timeline materials without expanding into stickers, effects, masks, or other fine-grained OpenCut extras.
- Fix:
  - Added `updateSmartEditTimelineElementsState` for batch mute/show-hide updates on persistent timeline materials.
  - The helper expands linked generated video/audio mates, skips derived storyboard timeline clips, applies `muted` only to audio/BGM materials, and applies `hidden` only to video/text materials.
  - The independent-material multi-selection toolbar now exposes Mute selected, Unmute selected, Hide selected materials, and Show selected materials.
  - Added localized copy for generic selected-material visibility actions.
- Verification:
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "updates mute and hidden state"`
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "updates mute and hidden state|updates playback speed for selected|trims multiple selected|splits multiple selected|duplicates independent|cuts independent|copies and pastes independent|multiple independent|selects all editable independent|keyboard arrow nudges|renders smart edit as an editor workspace"`
  - `corepack pnpm --filter @shopclip/web typecheck`
  - `corepack pnpm --filter @shopclip/web lint`
  - `corepack pnpm --filter @shopclip/web build`
- Remaining:
  - The base demo now covers the essential video/audio/subtitle timeline editing set. Browser-level validation on the deployed workspace is still needed before marking the broader OpenCut-like objective complete.

## 2026-06-06 Timeline Gap Close

- Scope:
  - Continues the narrowed base demo direction: video, audio, and subtitle editing only.
  - Adds a practical editing operation for cleaning up rough cuts after dragging, trimming, or deleting clips.
- Fix:
  - Added `closeSmartEditTimelineGapAtPlayhead` to detect the empty interval under the playhead and shift all later storyboard and persistent timeline materials left by that gap duration.
  - The operation preserves existing clips when the playhead is inside occupied media instead of creating accidental timeline movement.
  - The timeline toolbar now exposes `Close gap` / `闭合空隙`.
- Verification:
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "closes the timeline gap"`
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "closes the timeline gap|ripple|updates mute and hidden state|updates playback speed for selected|trims multiple selected|splits multiple selected|duplicates independent|cuts independent|copies and pastes independent|multiple independent|keyboard arrow nudges|renders smart edit as an editor workspace"`
  - `corepack pnpm --filter @shopclip/web typecheck`
  - `corepack pnpm --filter @shopclip/web lint`
  - `corepack pnpm --filter @shopclip/web build`
- Remaining:
  - Browser-level validation should confirm the toolbar action on a loaded project timeline after deploy.

## 2026-06-06 Linked Material Ripple Gap Merge

- Scope:
  - Continues the narrowed base demo direction: video, audio, and subtitle editing only.
  - Fixes a real editing edge case for CutCap/OpenCut-style ripple deletion after generated scene clips are split into linked video and source-audio materials.
- Fix:
  - `normalizedRippleGaps` now merges overlapping or adjacent ripple gaps before computing timeline shifts.
  - Batch deleting a linked generated video/audio pair now closes the removed clip span once instead of counting the video track and audio track as two separate gaps.
  - Later independent text/audio/video materials keep the expected relative timeline position after ripple delete.
- Verification:
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "ripples a linked generated video"`
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "ripples a linked generated video|ripples the timeline|deletes an independent|trims multiple selected|splits multiple selected|moves and deletes multiple independent|closes the timeline gap|keeps linked detached"`
- Remaining:
  - Continue browser-level validation on the deployed workspace as larger smart-edit flows mature.

## 2026-06-06 Timeline Material Batch Edge Resize

- Scope:
  - Continues the narrowed base demo direction: video, audio, and subtitle editing only.
  - Adds a multi-clip edge-trim primitive expected in CutCap/OpenCut-style timeline editors.
- Fix:
  - Added `resizeSmartEditTimelineElementsEdge` for trimming the same in/out edge across selected persistent timeline materials.
  - The helper expands linked generated video/audio mates, skips derived storyboard clips, respects locked tracks, and applies the edit as an all-or-nothing batch when every selected material can be resized.
  - Track clip trim clicks and trim-handle drags now preserve a selected independent material group and trim the selected group together.
- Verification:
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "resizes multiple selected independent"`
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "resizes multiple selected|resizes independent|keeps linked detached|moves and deletes multiple independent|trims multiple selected|splits multiple selected|ripples a linked generated video|updates playback speed for selected|updates mute and hidden state"`
- Remaining:
  - Browser-level validation should confirm multi-selected trim handles feel correct on a loaded project timeline.

## 2026-06-06 Timeline Material Batch Audio Properties

- Scope:
  - Continues the narrowed base demo direction: video, audio, and subtitle editing only.
  - Adds high-frequency batch audio controls for selected independent timeline materials.
- Fix:
  - Added `updateSmartEditTimelineElementsAudioProperties` for batch audio volume, fade-in, and fade-out updates.
  - The helper expands linked generated video/audio mates, updates only audio/BGM materials, skips derived storyboard clips, and respects locked tracks.
  - The selected-material toolbar now exposes volume presets `50%`, `100%`, `150%`, plus quick `Fade in` and `Fade out` actions.
- Verification:
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "updates audio volume and fades"`
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "updates audio volume and fades|updates playback speed for selected|updates mute and hidden state|updates independent audio material speed"`
- Remaining:
  - Browser-level validation should confirm the quick audio controls are ergonomic in a loaded project timeline.

## 2026-06-06 Timeline Material Batch Audio Keyframes

- Scope:
  - Continues the narrowed base demo direction: video, audio, and subtitle editing only.
  - Adds a basic dynamic-audio editing primitive for selected independent timeline materials.
- Fix:
  - Added `addSmartEditTimelineElementsAudioVolumeKeyframeAtPlayhead` for batch volume keyframes at the current playhead.
  - The helper expands linked generated video/audio mates, updates only audio/BGM materials, skips derived storyboard clips, respects locked tracks, and ignores materials outside the playhead span.
  - The selected-material toolbar now exposes a `Keyframe` action beside volume and fade controls.
- Verification:
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "adds audio volume keyframes"`
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "adds audio volume keyframes|updates audio volume and fades|updates playback speed for selected|updates mute and hidden state|trims multiple selected|splits multiple selected|resizes multiple selected|duplicates independent|cuts independent|copies and pastes independent|multiple independent|keyboard arrow nudges|renders smart edit as an editor workspace"`
- Remaining:
  - Browser-level validation should confirm the keyframe action lands on the expected selected audio clips after deploy.

## 2026-06-06 Timeline Material Edge Snapping

- Scope:
  - Continues the narrowed base demo direction: video, audio, and subtitle editing only.
  - Improves timeline precision for CutCap/OpenCut-style editing without adding stickers, effects, or other advanced extras.
- Fix:
  - `resolveTimelineBlockStart` now snaps both selected material starts and selected material ends to playhead and neighboring material edges.
  - `resizeSmartEditTimelineElementsEdge` now accepts snap points and snaps selected trim edges to the playhead or unselected material boundaries.
  - Multi-selected trim-handle edits pass the current playhead into the edge-resize helper so UI drag operations use the same tested snapping behavior.
- Verification:
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "snaps selected independent timeline material"`
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "snaps selected independent timeline material|moves and deletes multiple independent|resizes multiple selected|resizes independent|keeps linked detached|updates playback speed for selected|updates mute and hidden state|updates audio volume and fades|adds audio volume keyframes|trims multiple selected|splits multiple selected|duplicates independent|cuts independent|copies and pastes independent|keyboard arrow nudges|renders smart edit as an editor workspace"`
- Remaining:
  - Browser-level validation should confirm the snapping feels predictable during drag and trim interactions after deploy.

## 2026-06-06 Timeline Drag Preview Snapping

- Scope:
  - Continues the narrowed base demo direction: video, audio, and subtitle editing only.
  - Aligns drag preview behavior with the actual magnetic drop behavior so edits feel predictable while dragging.
- Fix:
  - `previewSmartEditTrackClipDrag` now accepts snap points and snaps preview starts/ends to playhead or edge points when close enough.
  - The Smart Edit UI passes the current playhead plus unselected timeline material boundaries into drag previews.
  - Existing non-snapping preview behavior remains unchanged when no snap points are provided.
- Verification:
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "snaps track clip drag previews"`
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "snaps track clip drag previews|previews track clip drag|snaps selected independent timeline material|moves and deletes multiple independent|resizes multiple selected|resizes independent|keeps linked detached|updates playback speed for selected|updates mute and hidden state|updates audio volume and fades|adds audio volume keyframes|trims multiple selected|splits multiple selected|duplicates independent|cuts independent|copies and pastes independent|keyboard arrow nudges|renders smart edit as an editor workspace"`
- Remaining:
  - Browser-level validation should confirm the ghost clip and final drop position stay aligned in a loaded project timeline.

## 2026-06-06 Timeline Trim Preview Ghost

- Scope:
  - Continues the narrowed base demo direction: video, audio, and subtitle editing only.
  - Improves direct manipulation feedback for CutCap/OpenCut-style clip edge trimming.
- Fix:
  - Added `previewSmartEditTrackClipTrimDrag` to calculate in/out trim previews with minimum duration and edge snapping.
  - Trim handles now update pointer position while dragging and render a ghost clip for the expected resized video, audio, or subtitle block.
  - Releasing a trim handle now commits the same snapped trim result shown by the preview, keeping visual feedback and final timeline state aligned.
- Verification:
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "previews track clip trim"`
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "previews track clip trim|snaps track clip drag previews|previews track clip drag|snaps selected independent timeline material|resizes multiple selected|resizes independent|keeps linked detached|moves and deletes multiple independent|trims multiple selected|splits multiple selected|renders smart edit as an editor workspace"`
- Remaining:
  - Browser-level validation should confirm trim ghost feedback feels natural on a loaded project timeline after deploy.

## 2026-06-06 Timeline Playhead Scrubbing

- Scope:
  - Continues the narrowed base demo direction: video, audio, and subtitle editing only.
  - Adds a direct timeline navigation primitive expected in CutCap/OpenCut-style editors.
- Fix:
  - Added `playheadSecondsFromTimelinePointer` to map timeline ruler pointer positions into snapped, bounded playhead seconds.
  - The timeline ruler now supports click-and-drag playhead positioning, including scrolled timelines and zoomed timelines.
  - The playhead line itself is draggable, with visible dragging feedback, so split/trim/paste actions can be positioned directly from the timeline.
- Verification:
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "maps timeline pointer"`
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "maps timeline pointer|splits multiple selected|trims multiple selected|pastes selected smart edit segments|copies and pastes independent|previews track clip trim|snaps track clip drag previews|renders smart edit as an editor workspace"`
- Remaining:
  - Browser-level validation should confirm ruler scrubbing is comfortable with real timeline scrolling after deploy.

## 2026-06-06 Track Stack Playhead Ruler

- Scope:
  - Continues the narrowed base demo direction: video, audio, and subtitle editing only.
  - Extends the playhead/navigation model from the main sequence timeline into the actual multi-track material editor.
- Fix:
  - Added a multi-track ruler row above the video, subtitle, source-audio, voice, and BGM lanes.
  - The multi-track ruler reuses the same snapped playhead pointer mapping as the main timeline, so click-and-drag scrubbing works consistently across both areas.
  - Each material lane now renders the shared playhead line, making split/trim/paste targets visible directly over the editable video/audio/subtitle tracks.
- Verification:
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "renders smart edit as an editor workspace"`
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "renders smart edit as an editor workspace|maps timeline pointer|splits multiple selected|trims multiple selected|pastes selected smart edit segments|copies and pastes independent|previews track clip trim|snaps track clip drag previews"`
- Remaining:
  - Browser-level validation should confirm the multi-track ruler and lane playheads stay visually aligned while horizontally scrolled.

## 2026-06-06 Track Stack Scroll Sync

- Scope:
  - Continues the narrowed base demo direction: video, audio, and subtitle editing only.
  - Improves the multi-track editor ergonomics needed for CutCap/OpenCut-style timeline editing.
- Fix:
  - Added `smartEditSyncedScrollLeft` to clamp synchronized scroll positions to each target lane's available width.
  - The multi-track ruler and every video/audio/subtitle material lane now synchronize horizontal scroll positions.
  - This keeps the ruler ticks, shared playhead, and material clips aligned while the user scrolls any track row.
- Verification:
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "clamps synced track stack scroll"`
  - `corepack pnpm --filter @shopclip/web run test src/app/App.test.tsx -t "clamps synced track stack scroll|renders smart edit as an editor workspace|maps timeline pointer|splits multiple selected|trims multiple selected|pastes selected smart edit segments|copies and pastes independent|previews track clip trim|snaps track clip drag previews"`
- Remaining:
  - Browser-level validation should confirm synchronized scroll stays smooth on long real render timelines.

## 2026-06-06 Track Lane Empty-Click Playhead

- Scope:
  - Small interaction polish for the narrowed video, audio, and subtitle editing demo.
- Fix:
  - Clicking an empty area of a multi-track material lane now moves the shared playhead to that timeline position.
  - Dragging farther than the existing box-select threshold still performs multi-material marquee selection.
- Verification:
  - No local tests run for this small low-risk interaction change per updated user preference.

## 2026-06-06 Track Edit Point Navigation

- Scope:
  - Small interaction polish for the narrowed video, audio, and subtitle editing demo.
- Fix:
  - Added previous/next edit point buttons in the Smart Edit timeline toolbar.
  - Edit points are derived from multi-track material starts and ends, so navigation follows video, audio, subtitle, voice, and BGM clip boundaries.
- Verification:
  - No local tests run for this small low-risk interaction change per updated user preference.

## 2026-06-06 Timeline Keyboard Polish

- Scope:
  - Small interaction polish for the narrowed video, audio, and subtitle editing demo.
  - Improves keyboard-driven editing ergonomics without adding non-demo sticker/effect features.
- Fix:
  - Added `Alt/Option + ArrowLeft/ArrowRight` shortcuts to jump the playhead to the previous or next edit point.
  - Added `Backspace` as an alternate delete shortcut for selected timeline materials or storyboard clips.
  - Added `Esc` to collapse multi-selection back to the active selected material or clip.
  - Updated the Smart Edit timeline hint text to expose the core split, trim, edit-point, delete, and clear-selection shortcuts.
- Verification:
  - No local tests run for this small low-risk keyboard/UI hint change per updated user preference.

## 2026-06-06 Preview Playhead Sync

- Scope:
  - Small interaction polish for the narrowed video, audio, and subtitle editing demo.
  - Makes the rendered preview behave more like a real editor monitor tied to the timeline playhead.
- Fix:
  - Added editor-level Space playback toggling when focus is inside Smart Edit but not on a text field or native control.
  - Seeking the timeline playhead through the slider, ruler drag, edit-point navigation, empty lane click, or gap close now seeks the rendered preview video when metadata is available.
  - Preview video `timeupdate` and `seeked` events now update the shared Smart Edit playhead, keeping the ruler and multi-track lane playhead aligned during playback.
  - Updated timeline shortcut hints to include Space playback.
- Verification:
  - No local tests run for this small low-risk preview/playhead interaction change per updated user preference.

## 2026-06-06 Timeline Follow Playhead

- Scope:
  - Small interaction polish for the narrowed video, audio, and subtitle editing demo.
  - Improves long-timeline editing ergonomics while preview playback is driving the playhead.
- Fix:
  - Added playhead-follow scrolling for the main sequence timeline and the multi-track material stack.
  - Preview playback, preview seek, timeline slider changes, ruler drag, edit-point navigation, empty lane click, and gap close now keep the shared playhead inside the visible timeline window when possible.
  - The follow behavior centers the playhead only when it leaves a guarded visible region, so manual scrolling is not constantly overridden.
- Verification:
  - No local tests run for this small low-risk playback/timeline viewport change per updated user preference.

## 2026-06-06 Audio Keyframe Timeline Markers

- Scope:
  - Small interaction polish for the narrowed video, audio, and subtitle editing demo.
  - Makes audio volume envelope edits visible directly on the timeline instead of only in the inspector.
- Fix:
  - Carried audio volume keyframes into multi-track audio clip view models.
  - Rendered keyframe markers inside source-audio, voice, and BGM timeline clips when keyframes exist.
  - Added compact marker styling that aligns keyframe diamonds by clip-relative time while preserving the existing waveform display.
- Verification:
  - No local tests run for this small low-risk audio timeline visualization change per updated user preference.

## 2026-06-06 Text Material Inspector Cleanup

- Scope:
  - Small interaction polish for the narrowed video, audio, and subtitle editing demo.
  - Makes the material inspector clearer when editing subtitle/text clips versus video/audio clips.
- Fix:
  - Text timeline materials now show a dedicated subtitle body textarea.
  - Clearing a text clip body now updates the clip card label to a neutral `Text clip` fallback instead of keeping stale subtitle text.
  - Video and audio timeline materials now show a material-name input instead of a misleading subtitle textarea.
- Verification:
  - No local tests run for this small low-risk inspector/UI copy change per updated user preference.

## 2026-06-06 Subtitle Material Editing Batch

- Scope:
  - Coherent subtitle/text editing batch for the narrowed video, audio, and subtitle editing demo.
  - Groups several small text-material UX improvements before commit/deploy, following the updated batching preference.
- Fix:
  - Text timeline materials show a dedicated subtitle body editor, while video/audio materials show a material-name field.
  - Text clips can be cleared without leaving stale subtitle labels behind; the card falls back to `Text clip`.
  - Added common subtitle style presets for bottom white, highlighted, and top-note captions.
  - Caption timeline cards now show compact style metadata: color swatch, font size, and vertical position.
- Verification:
  - `git diff --check`
  - `git ls-files .agents AGENTS.md plugins .gitignore.agent-workflow-pack .agents/memory`
  - No local tests run for this low-risk subtitle/text UI batch per updated user preference.

## 2026-06-06 Playhead Material Alignment Batch

- Scope:
  - Coherent playhead-centered editing batch for the narrowed video, audio, and subtitle editing demo.
  - Improves timeline operations that CutCap/OpenCut-style editors usually expose around the current playhead.
- Fix:
  - Added a timeline control to select all unlocked material clips intersecting the current playhead.
  - Added start-to-playhead and end-to-playhead alignment actions for selected independent timeline materials.
  - The same alignment actions are exposed in the multi-material batch toolbar for faster grouped edits.
  - Added English and Chinese UI copy for the new playhead selection/alignment controls.
- Verification:
  - `git diff --check`
  - `git ls-files .agents AGENTS.md plugins .gitignore.agent-workflow-pack .agents/memory`
  - `corepack pnpm --filter @shopclip/web typecheck`

## 2026-06-06 Subtitle SRT Export Batch

- Scope:
  - Coherent subtitle workflow improvement for the narrowed video, audio, and subtitle editing demo.
  - Complements the existing SRT import and text-track editing flow.
- Fix:
  - Added a Smart Edit SRT exporter that collects visible text-track timeline materials, sorts them by start time, and serializes them to standard SRT timestamps.
  - Added a Download SRT action in the subtitle import/export panel so edited subtitle timing and text can be exported from the current timeline.
  - Added English and Chinese UI copy plus empty/exported status messages for the SRT export action.
- Verification:
  - `corepack pnpm --filter @shopclip/web typecheck`

## 2026-06-06 Batch Source Slip Controls

- Scope:
  - Coherent source-trim workflow improvement for the narrowed video, audio, and subtitle editing demo.
  - Extends single-material source slipping into multi-selected video/audio materials.
- Fix:
  - Added a batch source-slip helper for selected timeline materials.
  - Linked scene video/audio groups are deduplicated during batch slipping so the same group is not shifted twice.
  - Added source -0.1s / +0.1s actions to the multi-material toolbar for OpenCut/CutCap-style source slipping without moving clips on the timeline.
  - Added English and Chinese UI copy for the new batch source-slip actions.
- Verification:
  - `corepack pnpm --filter @shopclip/web typecheck`
  - `git diff --check -- apps/web/src/features/edit/SmartEditPanel.tsx apps/web/src/app/i18n.ts projects/shopclip-ai/parts/part-016-real-smart-video-editing.md`

## 2026-06-06 Batch Subtitle Style Presets

- Scope:
  - Coherent subtitle styling workflow improvement for the narrowed video, audio, and subtitle editing demo.
  - Extends single-text-material styling into multi-selected text materials.
- Fix:
  - Added a batch text-style update helper for selected independent timeline text materials.
  - Multi-selected subtitle/text materials can now apply bottom-white, highlight, and top-note presets from the batch toolbar.
  - Reused the same preset copy in the single-material inspector and batch toolbar for English and Chinese UI.
- Verification:
  - `corepack pnpm --filter @shopclip/web typecheck`
  - `git diff --check -- apps/web/src/features/edit/SmartEditPanel.tsx apps/web/src/app/i18n.ts projects/shopclip-ai/parts/part-016-real-smart-video-editing.md`

## 2026-06-06 Track Material Selection Controls

- Scope:
  - Coherent multi-track selection workflow improvement for the narrowed video, audio, and subtitle editing demo.
  - Makes batch actions faster when the user wants to operate on all editable materials in one track.
- Fix:
  - Added a helper to select all unlocked independent timeline materials for a specific track.
  - Added a Select track action to every multi-track header, disabled when the track has no selectable independent materials.
  - Selecting a track clears storyboard selection and prepares the selected track materials for batch style, source slip, audio, visibility, copy, cut, duplicate, or delete actions.
  - Added English and Chinese UI copy for the track-selection action.
- Verification:
  - `corepack pnpm --filter @shopclip/web typecheck`
  - `git diff --check -- apps/web/src/features/edit/SmartEditPanel.tsx apps/web/src/app/i18n.ts projects/shopclip-ai/parts/part-016-real-smart-video-editing.md`

## 2026-06-06 Timeline Localization Polish

- Scope:
  - Small but coherent UX polish for the narrowed video, audio, and subtitle editing demo.
  - Keeps the Smart Edit timeline controls usable in Chinese mode while preserving the existing command-history stack.
- Fix:
  - Localized the multi-selected audio quick actions for 50%/100%/150% volume, fade in/out, and audio keyframe creation.
  - Localized audio-volume keyframe inspector titles, add-keyframe buttons, empty states, and keyframe delete actions for source audio, voiceover, and independent timeline audio materials.
  - Localized core material/segment inspector controls for source in/out, speed, audio fades, source/voice volume, detach/relink, split/remove, text styling, and linked-material status.
  - Localized audio keyframe marker aria-labels and tooltips so timeline accessibility text follows the active UI language.
  - Updated the Smart Edit command-history label formatter so Undo/Redo buttons can use localized prefixes and translated common timeline action names.
  - Added English and Chinese history-action label maps for common clip, material, subtitle, source-slip, split, keyframe, detach, and relink operations.
- Verification:
  - `corepack pnpm --filter @shopclip/web typecheck`
  - `git diff --check -- apps/web/src/features/edit/SmartEditPanel.tsx apps/web/src/app/i18n.ts`

## 2026-06-06 Timeline Text Merge Batch

- Scope:
  - Coherent subtitle/text editing improvement for the narrowed video, audio, and subtitle editing demo.
  - Adds practical timeline operations expected in short-video editors when caption fragments need to be merged or split for timing edits.
- Fix:
  - Added `mergeSmartEditTimelineTextElements` to merge selected independent text timeline materials on unlocked tracks.
  - The merged caption spans the earliest start to latest end, keeps the first caption style, and joins selected caption text in timeline order.
  - Added a Merge text action in the multi-material toolbar that appears for selected text materials and is enabled only when at least two text clips are selected.
  - Added `splitSmartEditTimelineTextElementByLines` to split a single multi-line text material into consecutive per-line text clips while preserving style.
  - Added a Split lines action in the single text-material inspector, enabled only when the selected text material has at least two non-empty lines.
  - Added English and Chinese UI copy plus command-history copy for the merge and split-line actions.
- Verification:
  - `corepack pnpm --filter @shopclip/web typecheck`
  - `git diff --check -- apps/web/src/features/edit/SmartEditPanel.tsx apps/web/src/app/i18n.ts projects/shopclip-ai/parts/part-016-real-smart-video-editing.md`

## 2026-06-07 Timeline Preview Range Batch

- Scope:
  - Coherent preview-range workflow improvement for the narrowed video, audio, and subtitle editing demo.
  - Adds In/Out range operations expected in CutCap/OpenCut-style editors before batch edits or focused playback.
- Fix:
  - Added preview-range state and normalization for the Smart Edit timeline.
  - Added Set In / Set Out / Loop range / Select range / Clear range controls to the timeline toolbar.
  - Added `I` and `O` keyboard shortcuts to set range points from the current playhead.
  - Rendered the preview range on the storyboard timeline, ruler, and multi-track lanes.
  - Preview playback starts from the range start when the playhead is outside the active range and loops inside the range when enabled.
  - Selecting the range chooses unlocked video, audio, and subtitle clips that overlap the preview range.
- Verification:
  - `corepack pnpm --filter @shopclip/web typecheck`
  - `git diff --check -- apps/web/src/features/edit/SmartEditPanel.tsx apps/web/src/app/i18n.ts apps/web/src/styles.css projects/shopclip-ai/parts/part-016-real-smart-video-editing.md`

## 2026-06-07 Preview Range Cut Batch

- Scope:
  - Builds on the preview In/Out range workflow for the narrowed video, audio, and subtitle editing demo.
  - Adds a CutCap/OpenCut-style range deletion operation for independent timeline materials produced from rendered scene clips.
- Fix:
  - Added `cutSmartEditTimelineElementsInRange` to remove the selected preview range from unlocked independent video, audio, and subtitle/text timeline materials.
  - Range cuts preserve material portions before and after the range; video/audio portions keep source trim offsets aligned with their original media.
  - The timeline toolbar now exposes a Cut range action beside Select range.
  - If independent materials are selected, the action cuts only those selected materials; otherwise it cuts all unlocked independent video/audio/text materials intersecting the preview range.
  - Ripple mode shifts later timeline elements and segment starts by the removed preview range; other edit modes keep existing timeline positions.
- Verification:
  - `corepack pnpm --filter @shopclip/web typecheck`
  - `git diff --check -- apps/web/src/features/edit/SmartEditPanel.tsx apps/web/src/app/i18n.ts`

## 2026-06-07 Rendered Scene Materialization Batch

- Scope:
  - Connects rendered scene clip materials more directly into the narrowed video, audio, and subtitle editing demo.
  - Makes ffmpeg-materialized scene video, separated source audio, waveform metadata, and storyboard text usable as independent timeline clips.
- Fix:
  - Added `materializeSmartEditRenderedSegmentsToTimelineElements` to convert enabled rendered scenes into independent video, source-audio, and text timeline materials.
  - Materialized video/audio clips keep their original source trim, playback rate, audio fades, volume, keyframes, and waveform data.
  - Materialized subtitle/text clips preserve storyboard copy, caption timing, and visibility.
  - Materialized video/audio pairs receive a linked group so movement and trim operations can keep scene media aligned.
  - Added a timeline toolbar action, `素材化分镜`, which materializes selected renderable segments or all renderable segments when no segment subset is selected.
  - Original derived segments are disabled after materialization to avoid duplicate final export content.
- Verification:
  - `corepack pnpm --filter @shopclip/web typecheck`
  - `git diff --check -- apps/web/src/features/edit/SmartEditPanel.tsx apps/web/src/app/i18n.ts`

## 2026-06-07 Single Materialized Scene Export Batch

- Scope:
  - Backend export consistency fix for the rendered-scene materialization workflow.
  - Ensures the smart edit ffmpeg composer can export a timeline after the user materializes only one rendered scene.
- Fix:
  - Updated `planWithPersistentVideoElementSegments` so one independent video timeline material is enough to become the executable export segment.
  - This preserves the intended materialized-scene behavior where the original derived segment is disabled to avoid duplicate output.
  - Adjusted the existing persistent-timeline bridge test to the corrected single-video conversion behavior.
  - Added a regression test covering one materialized video/audio/text timeline group with the original segment disabled.
- Verification:
  - `corepack pnpm --filter @shopclip/api typecheck`
  - `apps/api/node_modules/.bin/vitest.CMD run src/providers/renderer/smartEditComposer.test.ts`
  - `git diff --check -- apps/api/src/providers/renderer/smartEditComposer.ts apps/api/src/providers/renderer/smartEditComposer.test.ts`
