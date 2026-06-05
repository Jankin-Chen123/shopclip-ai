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
