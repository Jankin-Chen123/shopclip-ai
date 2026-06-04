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
