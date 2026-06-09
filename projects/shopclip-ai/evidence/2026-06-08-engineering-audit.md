# 2026-06-08 Engineering Audit

## Scope

- Reconcile actual implementation state with stale project logs.
- Fix hard verification failures before structural cleanup.
- Keep this pass focused on project optimization; no final contest submission material is included.

## Current Source-Of-Truth Snapshot

- Latest deployed optimization branch: `codex/shopclip-optimization-cleanup`.
- Latest deployed optimization commit: `714b773 Extract smart edit visual operations`.
- Production verification after that deployment:
  - `https://shopclip.site/health`: returned `status: ok`.
  - `https://shopclip.site/#project`: loaded without browser errors, failed requests, or 4xx/5xx responses.
  - `https://shopclip.site/#studio`: loaded without browser errors or 4xx/5xx responses.
- Recent deployed cleanup at `714b773`:
  - Extracted Smart Edit selected-segment visual keyframe, visual effect, effect amount keyframe, and segment audio-volume keyframe plan operations from `apps/web/src/features/edit/SmartEditPanel.tsx` into `apps/web/src/features/edit/SmartEditVisualEditOperations.ts`.
  - Added focused tests for visual keyframe add/remove, visual effect add/update/remove/reorder, effect amount keyframes, and source/voice volume keyframes.
  - Kept React state, command-history recording, and UI event wiring inside `SmartEditPanel.tsx`, while moving pure plan mutation logic into a tested helper module.
  - Current file sizes:
    - `SmartEditPanel.tsx`: 2854 lines.
    - `SmartEditVisualEditOperations.ts`: 319 lines.
    - `SmartEditVisualEditOperations.test.ts`: 189 lines.
    - `App.tsx`: 2385 lines.
    - `router.ts`: 1935 lines.
  - Fresh verification after this pass:
    - Red test: `.\node_modules\.bin\vitest.CMD run src/features/edit/SmartEditVisualEditOperations.test.ts` failed before implementation because `SmartEditVisualEditOperations` did not exist.
    - Targeted green tests: `SmartEditVisualEditOperations.test.ts`, `SmartEditSegmentUtils.test.ts`, and `SmartEditTimelineMath.test.ts` passed 13 tests.
    - Wider web regression: `corepack pnpm --filter @shopclip/web test src/app/App.test.tsx src/features/edit/SmartEditVisualEditOperations.test.ts src/features/edit/SmartEditTimelineToolbarState.test.ts src/features/edit/SmartEditTrackDerivedState.test.ts` passed 315 tests.
    - `corepack pnpm typecheck`: passed.
    - `corepack pnpm lint`: passed.
    - `corepack pnpm test`: passed, 547 tests across shared/API/web.
    - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-De5NHyT2.js` at 607.03 kB minified.
    - `git diff --check`: passed; Git still reports the existing CRLF-to-LF normalization warning for `apps/web/src/features/edit/SmartEditPanel.tsx`.
    - `git ls-files .agents/memory`: empty.
    - Deploy: server HEAD `714b773b219f17f39d05a56857666f3701d66f3c`, local API health ok, public `https://shopclip.site/health` ok after one transient TLS retry, PM2 `shopclip-ai-api` online.
    - Deploy note: production install reported the existing ignored build-script warning for ffmpeg packages; build and PM2 restart succeeded.
    - Playwright production check: `https://shopclip.site/#project` and `https://shopclip.site/#studio` loaded with no browser errors, failed requests, or 4xx/5xx responses.
- Recent deployed cleanup at `107a872`:
  - Extracted script asset template extraction from `apps/api/src/modules/projects/router.ts` into `apps/api/src/modules/projects/scriptTemplateRouteService.ts`.
  - Added focused tests for missing script assets, invalid asset types, successful provider extraction plus storage, and provider failure response mapping.
  - Replaced the inline `/references/templates/from-script-assets` asset resolution/extraction/storage block with a tested service call while keeping request parsing and HTTP response mapping in the router.
  - Current file sizes:
    - `router.ts`: 1935 lines.
    - `scriptTemplateRouteService.ts`: 80 lines.
    - `scriptTemplateRouteService.test.ts`: 117 lines.
    - `scriptDraftRouteService.ts`: 72 lines.
    - `scriptPromptContextResolution.ts`: 131 lines.
    - `scriptProviderOrchestration.ts`: 81 lines.
    - `storyboardRouteService.ts`: 156 lines.
    - `App.tsx`: 2385 lines.
  - Fresh verification after this pass:
    - Red test: `.\node_modules\.bin\vitest.CMD run src/modules/projects/scriptTemplateRouteService.test.ts` failed before implementation because `scriptTemplateRouteService.js` did not exist.
    - Targeted green tests: `scriptTemplateRouteService.test.ts`, `scriptTemplateExtractionProvider.test.ts`, `p0-flow.test.ts`, and `p1-flow.test.ts` passed 36 tests.
    - `corepack pnpm typecheck`: passed.
    - `corepack pnpm lint`: passed.
    - `corepack pnpm test`: passed, 543 tests across shared/API/web.
    - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-DYZmA1ca.js` at 605.86 kB minified.
    - `git diff --check`: passed; Git still reports the existing CRLF-to-LF normalization warning for `apps/api/src/modules/projects/router.ts`.
    - `git ls-files .agents/memory`: empty.
    - Deploy: server HEAD `107a87255b1bdc95e60a54d7ae025a19ebc593d9`, local API health ok, public `https://shopclip.site/health` ok, PM2 `shopclip-ai-api` online.
    - Deploy note: production install reported the existing ignored build-script warning for ffmpeg packages; build and PM2 restart succeeded.
    - Playwright production check: `https://shopclip.site/#project` and `https://shopclip.site/#studio` loaded with no browser errors, failed requests, or 4xx/5xx responses.
- Recent deployed cleanup at `a63a940`:
  - Extracted fallback draft script storage and saved-script contract validation from `apps/api/src/modules/projects/router.ts` into `apps/api/src/modules/projects/scriptDraftRouteService.ts`.
  - Added focused tests for empty draft short-circuiting, prepared asset forwarding to fallback generation, missing-project save handling, and invalid saved script contract mapping.
  - Replaced the inline `/projects/:projectId/scripts` draft generation/save/validation block with a tested service call while keeping request parsing and HTTP response mapping in the router.
  - Current file sizes:
    - `router.ts`: 2128 lines.
    - `scriptDraftRouteService.ts`: 80 lines.
    - `scriptDraftRouteService.test.ts`: 134 lines.
    - `scriptPromptContextResolution.ts`: 131 lines.
    - `scriptProviderOrchestration.ts`: 81 lines.
    - `storyboardRouteService.ts`: 156 lines.
    - `App.tsx`: 2529 lines.
  - Fresh verification after this pass:
    - Red test: `.\node_modules\.bin\vitest.CMD run src/modules/projects/scriptDraftRouteService.test.ts` failed before implementation because `scriptDraftRouteService.js` did not exist.
    - Targeted green tests: `scriptDraftRouteService.test.ts` passed 4 tests; `p0-flow.test.ts` and `p1-flow.test.ts` passed 30 tests.
    - `corepack pnpm typecheck`: passed.
    - `corepack pnpm lint`: passed.
    - `corepack pnpm test`: passed, 539 tests across shared/API/web.
    - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-DYZmA1ca.js` at 605.86 kB minified.
    - `git diff --check`: passed; Git still reports the existing CRLF-to-LF normalization warning for `apps/api/src/modules/projects/router.ts`.
    - `git ls-files .agents/memory`: empty.
    - Deploy: server HEAD `a63a940f8e457c3535ab4bad83fc8ef4a98b1d0c`, local API health ok, public `https://shopclip.site/health` ok, PM2 `shopclip-ai-api` online.
    - Deploy note: production install reported the existing ignored build-script warning for ffmpeg packages; build and PM2 restart succeeded.
    - Playwright production check: `https://shopclip.site/#project` and `https://shopclip.site/#studio` loaded with no browser errors, failed requests, or 4xx/5xx responses.
- Recent deployed cleanup at `5ca79e4`:
  - Extracted script prompt context resolution from `apps/api/src/modules/projects/router.ts` into `apps/api/src/modules/projects/scriptPromptContextResolution.ts`.
  - Added focused tests for resolving selected references, matching reference script assets, selected templates, viral-remix required reference validation, reference readiness and analysis validation, and template-mode required template validation.
  - Replaced three inline route uses with a store adapter so `/rewrite-script`, `/scripts`, and `/generate-script` share the same tested context resolver.
  - Current file sizes:
    - `router.ts`: 2142 lines.
    - `scriptPromptContextResolution.ts`: 131 lines.
    - `scriptPromptContextResolution.test.ts`: 173 lines.
    - `scriptProviderOrchestration.ts`: 81 lines.
    - `storyboardRouteService.ts`: 156 lines.
    - `App.tsx`: 2529 lines.
  - Fresh verification after this pass:
    - Red test: `.\node_modules\.bin\vitest.CMD run src/modules/projects/scriptPromptContextResolution.test.ts` failed before implementation because `scriptPromptContextResolution.js` did not exist.
    - Targeted green tests: `scriptPromptContextResolution.test.ts` and `scriptPromptContext.test.ts` passed 8 tests; `p0-flow.test.ts` and `p1-flow.test.ts` passed 30 tests.
    - `corepack pnpm typecheck`: passed.
    - `corepack pnpm lint`: passed.
    - `corepack pnpm test`: passed, 535 tests across shared/API/web.
    - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-DYZmA1ca.js` at 605.86 kB minified.
    - `git diff --check`: passed; Git still reports the existing CRLF-to-LF normalization warning for `apps/api/src/modules/projects/router.ts`.
    - `git ls-files .agents/memory`: empty.
    - Deploy: server HEAD `5ca79e4c8ba5d8ed935a248fa416abd6f7cf2c29`, local API health ok, public `https://shopclip.site/health` ok, PM2 `shopclip-ai-api` online.
    - Deploy note: production install reported the existing ignored build-script warning for ffmpeg packages; build and PM2 restart succeeded.
    - Playwright production check: `https://shopclip.site/#project` and `https://shopclip.site/#studio` loaded with no browser errors, failed requests, or 4xx/5xx responses.
- Recent deployed cleanup at `1d8839d`:
  - Extracted script text-provider orchestration from `apps/api/src/modules/projects/router.ts` into `apps/api/src/modules/projects/scriptProviderOrchestration.ts`.
  - Added focused tests for the model-text branch, which structures model output with `scriptSource=model`, and the fallback branch, which preserves the original draft request and uses deterministic fallback generation.
  - Replaced the inline `/projects/:projectId/generate-script` provider assembly block with a pure helper while keeping route-level preparation, storage, and HTTP error handling in the router.
  - Current file sizes:
    - `router.ts`: 2244 lines.
    - `scriptProviderOrchestration.ts`: 81 lines.
    - `scriptProviderOrchestration.test.ts`: 103 lines.
    - `storyboardRouteService.ts`: 156 lines.
    - `App.tsx`: 2529 lines.
  - Fresh verification after this pass:
    - Red test: `.\node_modules\.bin\vitest.CMD run src/modules/projects/scriptProviderOrchestration.test.ts` failed before implementation because `scriptProviderOrchestration.js` did not exist.
    - Targeted green tests: `scriptProviderOrchestration.test.ts` passed 2 tests; `p0-flow.test.ts` and `p1-flow.test.ts` passed 30 tests.
    - `corepack pnpm typecheck`: passed.
    - `corepack pnpm lint`: passed.
    - `corepack pnpm test`: passed, 531 tests across shared/API/web.
    - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-DYZmA1ca.js` at 605.86 kB minified.
    - `git diff --check`: passed; Git still reports the existing CRLF-to-LF normalization warning for `apps/api/src/modules/projects/router.ts`.
    - `git ls-files .agents/memory`: empty.
    - Deploy: server HEAD `1d8839d0d27413aaa6fec320bd2fdd7a0eade36f`, local API health ok, public `https://shopclip.site/health` ok, PM2 `shopclip-ai-api` online.
    - Deploy note: production install reported the existing ignored build-script warning for ffmpeg packages; build and PM2 restart succeeded.
    - Playwright production check: `https://shopclip.site/#project` and `https://shopclip.site/#studio` loaded with no browser errors, failed requests, or 4xx/5xx responses.
- Recent deployed cleanup at `72abb89`:
  - Extracted storyboard route request construction, prepared asset error mapping, render-and-persist flow, and generated script contract validation from `apps/api/src/modules/projects/router.ts` into `apps/api/src/modules/projects/storyboardRouteService.ts`.
  - Added focused tests for saved-script storyboard request construction, invalid prepared asset short-circuiting, fallback storyboard scene persistence, and invalid generated storyboard contract mapping.
  - Replaced the inline `/projects/:projectId/scripts/:scriptId/storyboard` fallback storyboard flow and the `/projects/:projectId/generate-script` render/store/validate tail with service calls.
  - Current file sizes:
    - `router.ts`: 2254 lines.
    - `storyboardRouteService.ts`: 156 lines.
    - `storyboardRouteService.test.ts`: 182 lines.
    - `App.tsx`: 2529 lines.
  - Fresh verification after this pass:
    - Red test: `.\node_modules\.bin\vitest.CMD run src/modules/projects/storyboardRouteService.test.ts` failed before implementation because `storyboardRouteService.js` did not exist.
    - Targeted green tests: `storyboardRouteService.test.ts` passed 4 tests; `p0-flow.test.ts` and `p1-flow.test.ts` passed 30 tests.
    - `corepack pnpm typecheck`: passed.
    - `corepack pnpm lint`: passed.
    - `corepack pnpm test`: passed, 529 tests across shared/API/web.
    - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-DYZmA1ca.js` at 605.86 kB minified.
    - `git diff --check`: passed; Git still reports the existing CRLF-to-LF normalization warning for `apps/api/src/modules/projects/router.ts`.
    - `git ls-files .agents/memory`: empty.
    - Deploy: server HEAD `72abb892bcb6939434b593a00979fc878ba7505b`, local API health ok, public `https://shopclip.site/health` ok, PM2 `shopclip-ai-api` online.
    - Deploy note: production install reported the existing ignored build-script warning for ffmpeg packages; build and PM2 restart succeeded.
    - Playwright production check: `https://shopclip.site/#project` and `https://shopclip.site/#studio` loaded with no browser errors, failed requests, or 4xx/5xx responses.
- Recent deployed cleanup at `2feedb9`:
  - Extracted script request preparation from `apps/api/src/modules/projects/router.ts` into `apps/api/src/modules/projects/scriptRequestPreparation.ts`.
  - Added a tested helper for prompt context resolution, explicit keyword persistence, prepared asset resolution, and invalid script asset error mapping.
  - Replaced repeated preparation logic in `/projects/:projectId/rewrite-script`, `/projects/:projectId/scripts`, and `/projects/:projectId/generate-script` while keeping storyboard-specific behavior separate.
  - Current file sizes:
    - `router.ts`: 2281 lines.
    - `scriptRequestPreparation.ts`: 83 lines.
    - `scriptRequestPreparation.test.ts`: 130 lines.
    - `App.tsx`: 2529 lines.
  - Fresh verification after this pass:
    - Red test: `.\node_modules\.bin\vitest.CMD run src/modules/projects/scriptRequestPreparation.test.ts` failed before implementation because `scriptRequestPreparation.js` did not exist.
    - Targeted green tests: `scriptRequestPreparation.test.ts` passed 4 tests; `p0-flow.test.ts` and `p1-flow.test.ts` passed 30 tests.
    - `corepack pnpm typecheck`: passed.
    - `corepack pnpm lint`: passed.
    - `corepack pnpm test`: passed, 525 tests across shared/API/web.
    - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-DYZmA1ca.js` at 605.86 kB minified.
    - `git diff --check`: passed; Git still reports the existing CRLF-to-LF normalization warning for `apps/api/src/modules/projects/router.ts`.
    - `git ls-files .agents/memory`: empty.
    - Deploy: server HEAD `2feedb973a2bc4625f005d46bbbb7fd06b900af6`, local API health ok, public `https://shopclip.site/health` ok, PM2 `shopclip-ai-api` online.
    - Deploy script note: the first local health check failed during PM2 restart, then retried successfully with API `status: ok`.
    - Playwright production check: `https://shopclip.site/#project` and `https://shopclip.site/#studio` loaded with no browser errors, failed requests, or 4xx/5xx responses.
- Recent deployed cleanup at `7bf235c`:
  - Extracted API project asset id resolution and validation from `apps/api/src/modules/projects/router.ts` into `apps/api/src/modules/projects/projectAssetResolution.ts`.
  - Added tested helpers for prepared script asset fallback, requested asset id de-duplication, missing/cross-project asset rejection, and script-template asset type validation.
  - Replaced inline asset loading/validation in script generation/storyboard preparation and script-asset template extraction while preserving existing HTTP error responses.
  - Current file sizes:
    - `router.ts`: 2314 lines.
    - `projectAssetResolution.ts`: 85 lines.
    - `projectAssetResolution.test.ts`: 102 lines.
    - `App.tsx`: 2529 lines.
  - Fresh verification after this pass:
    - Red test: `.\node_modules\.bin\vitest.CMD run src/modules/projects/projectAssetResolution.test.ts` failed before implementation because `projectAssetResolution.js` did not exist.
    - Targeted green tests: `projectAssetResolution.test.ts` passed 6 tests; `p0-flow.test.ts` and `part015-processing-flow.test.ts` passed 26 tests.
    - First `corepack pnpm typecheck` run caught a real type mismatch because `ProjectStore.getAsset` returns `MaybePromise`; after widening the helper lookup type, rerun passed.
    - `corepack pnpm lint`: passed.
    - `corepack pnpm test`: passed, 521 tests across shared/API/web.
    - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-DYZmA1ca.js` at 605.86 kB minified.
    - `git diff --check`: passed; Git still reports the existing CRLF-to-LF normalization warning for `apps/api/src/modules/projects/router.ts`.
    - `git ls-files .agents/memory`: empty.
    - Deploy: server HEAD `7bf235c541c6d77c1284802acd77e421f69cca0a`, local API health ok, public `https://shopclip.site/health` ok, PM2 `shopclip-ai-api` online.
    - Deploy script note: the first local health check failed during PM2 restart, then retried successfully with API `status: ok`.
    - Playwright production check: `https://shopclip.site/#project` and `https://shopclip.site/#studio` loaded with no browser errors, failed requests, or 4xx/5xx responses.
- Recent deployed cleanup at `fc1586e`:
  - Extracted repeated App asset cleanup logic from `apps/web/src/app/App.tsx` into `apps/web/src/app/AppAssetCleanupUtils.ts`.
  - Added tested helpers for asset-library deletion filtering, active-script scene asset reference clearing, asset-search result filtering, and unique non-empty id selection.
  - Replaced duplicate cleanup in both `handleDeleteAssets` and `handleDeleteReferences`, keeping project-level mutation helpers and API flow behavior unchanged.
  - Current file sizes:
    - `App.tsx`: 2529 lines.
    - `AppAssetCleanupUtils.ts`: 45 lines.
    - `AppAssetCleanupUtils.test.ts`: 70 lines.
    - `AppWorkspaceDerivedState.ts`: 208 lines.
    - `SmartEditPanel.tsx`: 3087 lines.
    - `router.ts`: 2325 lines.
  - Fresh verification after this pass:
    - Red test: `.\node_modules\.bin\vitest.CMD run src/app/AppAssetCleanupUtils.test.ts` failed before implementation because `AppAssetCleanupUtils` did not exist.
    - Targeted green tests: `AppAssetCleanupUtils.test.ts` passed 5 tests; `App.test.tsx` passed 161 tests.
    - `corepack pnpm typecheck`: passed.
    - `corepack pnpm lint`: passed.
    - `corepack pnpm test`: passed, 515 tests across shared/API/web.
    - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-DYZmA1ca.js` at 605.86 kB minified.
    - `git diff --check`: passed; Git still reports the existing CRLF-to-LF normalization warning for `apps/web/src/app/App.tsx`.
    - `git ls-files .agents/memory`: empty.
    - Deploy: server HEAD `fc1586e3b0f448ecaf542df9a61e22fe27d3ec74`, local API health ok, public `https://shopclip.site/health` ok, PM2 `shopclip-ai-api` online.
    - Deploy script note: the first local health check failed during PM2 restart, then retried successfully with API `status: ok`.
    - Playwright production check: `https://shopclip.site/#project` and `https://shopclip.site/#studio` loaded with no browser errors, failed requests, or 4xx/5xx responses.
- Recent deployed cleanup at `790f6a8d`:
  - Extracted a larger App-layer derived-state/request batch from `apps/web/src/app/App.tsx` into existing focused helper modules.
  - Added tested workspace helpers for section-to-page routing, asset-prep keyword snapshot comparison, and reference source video asset selection.
  - Added a tested Smart Edit request helper for selecting the active segment override from the current plan with first-segment fallback.
  - Replaced inline nested section routing, repeated keyword snapshot string comparisons, inline reference source asset filtering, and the large repeated Smart Edit refresh segment payload copy in `App.tsx`.
  - Current file sizes:
    - `App.tsx`: 2547 lines.
    - `AppWorkspaceDerivedState.ts`: 208 lines.
    - `AppWorkspaceDerivedState.test.ts`: 280 lines.
    - `AppSmartEditRequest.ts`: 139 lines.
    - `AppSmartEditRequest.test.ts`: 447 lines.
    - `SmartEditPanel.tsx`: 3087 lines.
    - `router.ts`: 2325 lines.
  - Fresh verification after this pass:
    - Red tests: `.\node_modules\.bin\vitest.CMD run src/app/AppWorkspaceDerivedState.test.ts` failed with 5 missing-helper failures, and `.\node_modules\.bin\vitest.CMD run src/app/AppSmartEditRequest.test.ts` failed with 2 missing-helper failures before implementation.
    - Targeted green tests: `AppWorkspaceDerivedState.test.ts` passed 18 tests; `AppSmartEditRequest.test.ts` passed 10 tests.
    - `corepack pnpm typecheck`: passed.
    - `corepack pnpm lint`: passed.
    - `corepack pnpm test`: passed, 510 tests across shared/API/web.
    - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-Bl9j2g9C.js` at 606.00 kB minified.
    - `git diff --check`: passed; Git still reports the existing CRLF-to-LF normalization warning for `apps/web/src/app/App.tsx`.
    - `git ls-files .agents/memory`: empty.
    - Deploy: server HEAD `790f6a8d88de2baadaa3c2e8edf1ac0e7be7db4a`, local API health ok, public `https://shopclip.site/health` ok, PM2 `shopclip-ai-api` online.
    - Deploy script note: the first local health check failed during PM2 restart, then retried successfully with API `status: ok`.
    - Playwright production check: `https://shopclip.site/#project` and `https://shopclip.site/#studio` loaded with no browser errors, failed requests, or 4xx/5xx responses.
- Recent deployed cleanup at `f974dc6`:
  - Extracted a larger batch of Smart Edit selection and derived-state calculations from `apps/web/src/features/edit/SmartEditPanel.tsx` into existing derived-state modules.
  - Added segment helpers for ordered segment id selection and timed segment/start-second projection.
  - Added track helpers for flattened track clip id selection and marquee-selected track id set construction.
  - Replaced repeated inline `map`, `flatMap`, `new Set`, `timelineStartsForSegments`, and `selectSmartEditTrackIdsInMarquee` usage in segment retention, range/toggle selection, select-all, track clip selection, timed timeline segment projection, active marquee highlighting, and box-select completion.
  - Current file sizes:
    - `SmartEditPanel.tsx`: 3087 lines.
    - `SmartEditSegmentDerivedState.ts`: 165 lines.
    - `SmartEditSegmentDerivedState.test.ts`: 217 lines.
    - `SmartEditTrackClipDerivedState.ts`: 207 lines.
    - `SmartEditTrackDerivedState.test.ts`: 511 lines.
    - `App.tsx`: 2581 lines.
    - `router.ts`: 2325 lines.
  - Fresh verification after this pass:
    - Red tests: `.\node_modules\.bin\vitest.CMD run src/features/edit/SmartEditSegmentDerivedState.test.ts` and `.\node_modules\.bin\vitest.CMD run src/features/edit/SmartEditTrackDerivedState.test.ts` failed before implementation because the new helpers were not exported.
    - Targeted green tests: both files passed, 37 tests total.
    - `corepack pnpm typecheck`: passed.
    - `corepack pnpm lint`: passed.
    - First `corepack pnpm test` run hit two API media/ffmpeg timeout flakes unrelated to the frontend selection refactor; targeted API rerun passed, then a full `corepack pnpm test` rerun passed with 503 tests across shared/API/web.
    - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-CaWPVXEt.js` at 607.05 kB minified.
    - `git diff --check`: passed; Git still reports the existing CRLF-to-LF normalization warning for `apps/web/src/features/edit/SmartEditPanel.tsx`.
    - `git ls-files .agents/memory`: empty.
    - Deploy: server HEAD `f974dc607d1b939b7ae86c1a2641e87ea1fe0730`, local API health ok, public `https://shopclip.site/health` ok, PM2 `shopclip-ai-api` online.
    - Playwright production check: `https://shopclip.site/#project` and `https://shopclip.site/#studio` loaded with no browser errors, failed requests, or 4xx/5xx responses.
- Recent deployed cleanup at `eed48f5`:
  - Extracted a larger batch of Smart Edit timeline math and positioning calculations from `apps/web/src/features/edit/SmartEditPanel.tsx` into `apps/web/src/features/edit/SmartEditTimelineMath.ts`.
  - Added tested helpers for snapped playhead clamping, pixel-distance-to-seconds conversion, and guarded playhead auto-scroll target selection.
  - Replaced repeated inline formulas across playback seek, preview sync, asset drop positioning, segment trim drag, segment move drag, track clip move drag, track box selection, and playhead auto-scroll.
  - Added `apps/web/src/features/edit/SmartEditTimelineMath.test.ts` with 7 focused tests covering clamp bounds, invalid pixels-per-second handling, guarded visible range, centering, scroll clamping, and non-scrollable containers.
  - Current file sizes:
    - `SmartEditPanel.tsx`: 3102 lines.
    - `SmartEditTimelineMath.ts`: 211 lines.
    - `SmartEditTimelineMath.test.ts`: 91 lines.
    - `App.tsx`: 2581 lines.
    - `router.ts`: 2325 lines.
  - Fresh verification after this pass:
    - Red tests: `.\node_modules\.bin\vitest.CMD run src/features/edit/SmartEditTimelineMath.test.ts` failed before implementation because `nextTimelineScrollLeftForPlayhead`, `clampSnappedTimelineSecond`, and `timelineSecondsFromPixelDistance` were not exported.
    - Targeted green test: `.\node_modules\.bin\vitest.CMD run src/features/edit/SmartEditTimelineMath.test.ts` passed, 7 tests.
    - `corepack pnpm typecheck`: passed.
    - `corepack pnpm lint`: passed.
    - `corepack pnpm test`: passed, 498 tests across shared/API/web.
    - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-B6tksWYm.js` at 607.11 kB minified.
    - `git diff --check`: passed; Git still reports the existing CRLF-to-LF normalization warning for `apps/web/src/features/edit/SmartEditPanel.tsx`.
    - `git ls-files .agents/memory`: empty.
    - Deploy: server HEAD `eed48f5db3318ad9f8fb903e4c09386d1c396b38`, local API health ok, public `https://shopclip.site/health` ok, PM2 `shopclip-ai-api` online.
    - Playwright production check: installed missing local Playwright Chromium browser, then `https://shopclip.site/#project` and `https://shopclip.site/#studio` loaded with no browser errors, failed requests, or 4xx/5xx responses.
- Recent deployed cleanup at `e0e005c`:
  - Extracted Smart Edit timeline metric derivation from `apps/web/src/features/edit/SmartEditPanel.tsx` into `buildSmartEditTimelineMetrics` in `apps/web/src/features/edit/SmartEditSegmentDerivedState.ts`.
  - Replaced separate inline calculations for enabled duration, timeline duration, bounded playhead, pixels-per-second, and timeline width with a single tested helper call.
  - Extended `apps/web/src/features/edit/SmartEditSegmentDerivedState.test.ts` coverage for enabled-only timeline duration behavior, zoom-derived pixels, minimum timeline width, and empty-timeline fallback clamping.
  - Current file sizes:
    - `SmartEditPanel.tsx`: 3101 lines.
    - `SmartEditSegmentDerivedState.ts`: 148 lines.
    - `SmartEditSegmentDerivedState.test.ts`: 185 lines.
    - `App.tsx`: 2581 lines.
    - `router.ts`: 2325 lines.
  - Fresh verification after this pass:
    - Red test: `.\node_modules\.bin\vitest.CMD run src/features/edit/SmartEditSegmentDerivedState.test.ts` failed before implementation because `buildSmartEditTimelineMetrics` was not exported.
    - Targeted green test: `.\node_modules\.bin\vitest.CMD run src/features/edit/SmartEditSegmentDerivedState.test.ts` passed, 12 tests.
    - `corepack pnpm typecheck`: passed.
    - `corepack pnpm lint`: passed.
    - `corepack pnpm test`: passed, 491 tests across shared/API/web.
    - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-Cs8ZvNS_.js` at 607.03 kB minified.
    - `git diff --check`: passed; Git still reports the existing CRLF-to-LF normalization warning for `apps/web/src/features/edit/SmartEditPanel.tsx`.
    - `git ls-files .agents/memory`: empty.
    - Deploy: server HEAD `e0e005c18ccdd33174fafdee758db259b9f3552f`, local API health ok, public `https://shopclip.site/health` ok, PM2 `shopclip-ai-api` online.
    - Playwright production check: `https://shopclip.site/#project` and `https://shopclip.site/#studio` loaded with no browser errors, failed requests, or 4xx/5xx responses.
- Recent deployed cleanup at `4e53412`:
  - Extracted Smart Edit preview-range label formatting from `apps/web/src/features/edit/SmartEditPanel.tsx` into `selectSmartEditPreviewRangeLabel` in `apps/web/src/features/edit/SmartEditTimelineToolbarState.ts`.
  - Replaced the inline `formatTimelineTime` range interpolation in `SmartEditPanel.tsx`, removing that direct import from the large component.
  - Extended `apps/web/src/features/edit/SmartEditTimelineToolbarState.test.ts` coverage for missing normalized range fallback and formatted timeline interval output.
  - Current file sizes:
    - `SmartEditPanel.tsx`: 3097 lines.
    - `SmartEditTimelineToolbarState.ts`: 63 lines.
    - `SmartEditTimelineToolbarState.test.ts`: 86 lines.
    - `App.tsx`: 2581 lines.
    - `router.ts`: 2325 lines.
  - Fresh verification after this pass:
    - Red test: `.\node_modules\.bin\vitest.CMD run src/features/edit/SmartEditTimelineToolbarState.test.ts` failed before implementation because `selectSmartEditPreviewRangeLabel` was not exported.
    - Targeted green test: `.\node_modules\.bin\vitest.CMD run src/features/edit/SmartEditTimelineToolbarState.test.ts` passed, 4 tests.
    - `corepack pnpm typecheck`: passed.
    - `corepack pnpm lint`: initially caught a stale unused `formatTimelineTime` import in `SmartEditPanel.tsx`; after removing it, rerun passed.
    - `corepack pnpm test`: passed, 489 tests across shared/API/web.
    - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-Bp20T9be.js` at 606.67 kB minified.
    - `git diff --check`: passed; Git still reports the existing CRLF-to-LF normalization warning for `apps/web/src/features/edit/SmartEditPanel.tsx`.
    - `git ls-files .agents/memory`: empty.
    - Deploy: server HEAD `4e53412c2567c4e54355dbfb2dcb8a26dc45e649`, local API health ok, public `https://shopclip.site/health` ok, PM2 `shopclip-ai-api` online.
    - Playwright production check: `https://shopclip.site/#project` and `https://shopclip.site/#studio` loaded with no browser errors, failed requests, or 4xx/5xx responses.
- Recent deployed cleanup at `b6f0c3b`:
  - Extracted Smart Edit track-label construction from `apps/web/src/features/edit/SmartEditPanel.tsx` into `buildSmartEditTrackLabels` in `apps/web/src/features/edit/SmartEditTrackPresentationState.ts`.
  - Replaced the inline track label object in `SmartEditPanel.tsx` while preserving localized labels passed to inspector and track stack children.
  - Extended `apps/web/src/features/edit/SmartEditTrackPresentationState.test.ts` coverage for editor track id to localized label mapping.
  - Current file sizes:
    - `SmartEditPanel.tsx`: 3094 lines.
    - `SmartEditTrackPresentationState.ts`: 61 lines.
    - `SmartEditTrackPresentationState.test.ts`: 98 lines.
    - `App.tsx`: 2581 lines.
    - `router.ts`: 2325 lines.
  - Fresh verification after this pass:
    - Red test: `.\node_modules\.bin\vitest.CMD run src/features/edit/SmartEditTrackPresentationState.test.ts` failed before implementation because `buildSmartEditTrackLabels` was not exported.
    - Targeted green test: `.\node_modules\.bin\vitest.CMD run src/features/edit/SmartEditTrackPresentationState.test.ts` passed, 4 tests.
    - `corepack pnpm typecheck`: passed.
    - `corepack pnpm lint`: passed.
    - `corepack pnpm test`: passed, 487 tests across shared/API/web.
    - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-CqohxA7k.js` at 606.65 kB minified.
    - `git diff --check`: passed; Git still reports the existing CRLF-to-LF normalization warning for `apps/web/src/features/edit/SmartEditPanel.tsx`.
    - `git ls-files .agents/memory`: empty.
    - Deploy: server HEAD `b6f0c3b7cc73790c002ab31e0599eb6067448aa5`, local API health ok, public `https://shopclip.site/health` ok, PM2 `shopclip-ai-api` online.
    - Playwright production check: `https://shopclip.site/#project` and `https://shopclip.site/#studio` loaded with no browser errors, failed requests, or 4xx/5xx responses.
- Recent deployed cleanup at `07639a3`:
  - Extracted Smart Edit timeline toolbar state construction from `apps/web/src/features/edit/SmartEditPanel.tsx` into `buildSmartEditTimelineToolbarState` in `apps/web/src/features/edit/SmartEditTimelineToolbarState.ts`.
  - Replaced the inline toolbar state object in `SmartEditPanel.tsx` while keeping the command callback wiring local to the panel.
  - Added `apps/web/src/features/edit/SmartEditTimelineToolbarState.test.ts` coverage for direct field mapping and derived boolean toolbar flags.
  - Current file sizes:
    - `SmartEditPanel.tsx`: 3099 lines.
    - `SmartEditTimelineToolbarState.ts`: 52 lines.
    - `SmartEditTimelineToolbarState.test.ts`: 68 lines.
    - `App.tsx`: 2581 lines.
    - `router.ts`: 2325 lines.
  - Fresh verification after this pass:
    - Red test: `.\node_modules\.bin\vitest.CMD run src/features/edit/SmartEditTimelineToolbarState.test.ts` failed before implementation because `SmartEditTimelineToolbarState` did not exist.
    - Targeted green test: `.\node_modules\.bin\vitest.CMD run src/features/edit/SmartEditTimelineToolbarState.test.ts` passed, 2 tests.
    - `corepack pnpm typecheck`: passed.
    - `corepack pnpm lint`: passed.
    - `corepack pnpm test`: passed, 486 tests across shared/API/web.
    - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-DHD2zmcY.js` at 606.64 kB minified.
    - `git diff --check`: passed; Git still reports the existing CRLF-to-LF normalization warning for `apps/web/src/features/edit/SmartEditPanel.tsx`.
    - `git ls-files .agents/memory`: empty.
    - Deploy: server HEAD `07639a31ac0bd2dc570dfd2bc77797d303ed0eff`, local API health ok, public `https://shopclip.site/health` ok, PM2 `shopclip-ai-api` online.
    - Playwright production check: `https://shopclip.site/#project` and `https://shopclip.site/#studio` loaded with no browser errors, failed requests, or 4xx/5xx responses.
- Recent deployed cleanup at `9eb08d4`:
  - Extracted local render-task export URL synchronization from `apps/web/src/app/App.tsx` into `markRenderTaskExported` in `apps/web/src/app/AppRenderUtils.ts`.
  - Replaced the inline `setRenderTask` object update in `handleExport` while keeping export result state and project render-task export synchronization in `App.tsx`.
  - Extended `apps/web/src/app/AppRenderUtils.test.ts` coverage for setting export/preview URLs and preserving an undefined render task.
  - Current file sizes:
    - `App.tsx`: 2581 lines.
    - `AppRenderUtils.ts`: 220 lines.
    - `AppRenderUtils.test.ts`: 78 lines.
    - `AppProjectMutationUtils.ts`: 376 lines.
    - `SmartEditPanel.tsx`: 3099 lines.
  - Fresh verification after this pass:
    - Red test: `.\node_modules\.bin\vitest.CMD run src/app/AppRenderUtils.test.ts` failed before implementation because `markRenderTaskExported` was not exported.
    - Targeted green test: `.\node_modules\.bin\vitest.CMD run src/app/AppRenderUtils.test.ts` passed, 7 tests.
    - `corepack pnpm typecheck`: passed.
    - `corepack pnpm lint`: passed.
    - `corepack pnpm test`: passed, 484 tests across shared/API/web.
    - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-Bm6t6nU-.js` at 606.03 kB minified.
    - `git diff --check`: passed; Git still reports the existing CRLF-to-LF normalization warning for `apps/web/src/app/App.tsx`.
    - `git ls-files .agents/memory`: empty.
    - Deploy: server HEAD `9eb08d49812c0d09de9be8d4b1e70c085a695116`, local API health ok, public `https://shopclip.site/health` ok, PM2 `shopclip-ai-api` online.
    - Playwright production check: `https://shopclip.site/#project` and `https://shopclip.site/#studio` loaded with no browser errors, failed requests, or 4xx/5xx responses.
- Recent deployed cleanup at `b25ab16`:
  - Extracted reference-deletion project snapshot cleanup from `apps/web/src/app/App.tsx` into `removeProjectReferenceResources` in `apps/web/src/app/AppProjectMutationUtils.ts`.
  - Replaced the largest remaining inline project update in `handleDeleteReferences` while keeping reference library, asset library, active script, asset-prep, search results, selected reference/template, and current project modal state updates in `App.tsx`.
  - Extended `apps/web/src/app/AppProjectMutationUtils.test.ts` coverage for deleted assets, slices, processing events/jobs, reference videos, viral templates, project scenes, script scenes, and undefined project preservation.
  - Current file sizes:
    - `App.tsx`: 2588 lines.
    - `AppProjectMutationUtils.ts`: 376 lines.
    - `AppProjectMutationUtils.test.ts`: 570 lines.
    - `AppWorkspaceDerivedState.ts`: 189 lines.
    - `SmartEditPanel.tsx`: 3099 lines.
  - Fresh verification after this pass:
    - Red test: `.\node_modules\.bin\vitest.CMD run src/app/AppProjectMutationUtils.test.ts` failed before implementation because `removeProjectReferenceResources` was not exported.
    - Targeted green test: `.\node_modules\.bin\vitest.CMD run src/app/AppProjectMutationUtils.test.ts` passed, 28 tests.
    - `corepack pnpm typecheck`: passed.
    - `corepack pnpm lint`: passed.
    - `corepack pnpm test`: passed, 482 tests across shared/API/web.
    - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-5nwyaol8.js` at 606.02 kB minified.
    - `git diff --check`: passed; Git still reports the existing CRLF-to-LF normalization warning for `apps/web/src/app/App.tsx`.
    - `git ls-files .agents/memory`: empty.
    - Deploy: server HEAD `b25ab16df574c272eddf3106816cd0907561a7a6`, local API health ok, public `https://shopclip.site/health` ok, PM2 `shopclip-ai-api` online.
    - Playwright production check: `https://shopclip.site/#project` and `https://shopclip.site/#studio` loaded with no browser errors, failed requests, or 4xx/5xx responses.
- Recent deployed cleanup at `a56a75e`:
  - Extracted project prep-keyword synchronization from `apps/web/src/app/App.tsx` into `replaceProjectPrepKeywords` in `apps/web/src/app/AppProjectMutationUtils.ts`.
  - Replaced the inline project update after `updateProjectPrep` while keeping debounced API persistence and error swallowing behavior in `App.tsx`.
  - Extended `apps/web/src/app/AppProjectMutationUtils.test.ts` coverage for matching project updates, mismatched project preservation, and undefined project preservation.
  - Current file sizes:
    - `App.tsx`: 2616 lines.
    - `AppProjectMutationUtils.ts`: 339 lines.
    - `AppProjectMutationUtils.test.ts`: 499 lines.
    - `AppWorkspaceDerivedState.ts`: 189 lines.
    - `SmartEditPanel.tsx`: 3099 lines.
  - Fresh verification after this pass:
    - Red test: `.\node_modules\.bin\vitest.CMD run src/app/AppProjectMutationUtils.test.ts` failed before implementation because `replaceProjectPrepKeywords` was not exported.
    - Targeted green test: `.\node_modules\.bin\vitest.CMD run src/app/AppProjectMutationUtils.test.ts` passed, 26 tests.
    - `corepack pnpm typecheck`: passed.
    - `corepack pnpm lint`: passed.
    - `corepack pnpm test`: passed, 480 tests across shared/API/web.
    - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-ZSqrqO1d.js` at 606.03 kB minified.
    - `git diff --check`: passed; Git still reports the existing CRLF-to-LF normalization warning for `apps/web/src/app/App.tsx`.
    - `git ls-files .agents/memory`: empty.
    - Deploy: server HEAD `a56a75ed03ff7acc8680ff440d413c4eeaca5b5d`, local API health ok, public `https://shopclip.site/health` ok, PM2 `shopclip-ai-api` online.
    - Playwright production check: `https://shopclip.site/#project` and `https://shopclip.site/#studio` loaded with no browser errors, failed requests, or 4xx/5xx responses.
- Recent deployed cleanup at `59b9217`:
  - Extracted project viral-template upsert logic from `apps/web/src/app/App.tsx` into `upsertProjectViralTemplate` in `apps/web/src/app/AppProjectMutationUtils.ts`.
  - Replaced the inline project update in `handleApplyScriptTemplate` while keeping template-library merge, selected template state, and script production mode changes in `App.tsx`.
  - Extended `apps/web/src/app/AppProjectMutationUtils.test.ts` coverage for replacing an existing template by `templateId`, appending a new template, and preserving an undefined project.
  - Current file sizes:
    - `App.tsx`: 2619 lines.
    - `AppProjectMutationUtils.ts`: 328 lines.
    - `AppProjectMutationUtils.test.ts`: 459 lines.
    - `AppWorkspaceDerivedState.ts`: 189 lines.
    - `SmartEditPanel.tsx`: 3099 lines.
  - Fresh verification after this pass:
    - Red test: `.\node_modules\.bin\vitest.CMD run src/app/AppProjectMutationUtils.test.ts` failed before implementation because `upsertProjectViralTemplate` was not exported.
    - Targeted green test: `.\node_modules\.bin\vitest.CMD run src/app/AppProjectMutationUtils.test.ts` passed, 23 tests.
    - `corepack pnpm typecheck`: passed.
    - `corepack pnpm lint`: passed.
    - `corepack pnpm test`: passed, 477 tests across shared/API/web.
    - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-DCt8BcXT.js` at 606.02 kB minified.
    - `git diff --check`: passed; Git still reports the existing CRLF-to-LF normalization warning for `apps/web/src/app/App.tsx`.
    - `git ls-files .agents/memory`: empty.
    - Deploy: server HEAD `59b92171057d3783d763718a7a59a023196dc7ce`, local API health ok, public `https://shopclip.site/health` ok, PM2 `shopclip-ai-api` online.
    - Playwright production check: `https://shopclip.site/#project` and `https://shopclip.site/#studio` loaded with no browser errors, failed requests, or 4xx/5xx responses.
- Recent deployed cleanup at `9c1e923`:
  - Extracted project scene/script scene synchronization logic from `apps/web/src/app/App.tsx` into `replaceProjectScenesAcrossScripts` in `apps/web/src/app/AppProjectMutationUtils.ts`.
  - Replaced inline project updates in `replaceScenesInState` while keeping local script scene updates and dirty-scene reset behavior in `App.tsx`.
  - Extended `apps/web/src/app/AppProjectMutationUtils.test.ts` coverage for replacing project scenes, syncing matching script scene versions by id, dropping script scenes not present in the updated scene set, and preserving an undefined project.
  - Current file sizes:
    - `App.tsx`: 2486 lines.
    - `AppProjectMutationUtils.ts`: 287 lines.
    - `AppProjectMutationUtils.test.ts`: 363 lines.
    - `AppWorkspaceDerivedState.ts`: 169 lines.
    - `SmartEditPanel.tsx`: 2981 lines.
  - Fresh verification after this pass:
    - Red test: `.\node_modules\.bin\vitest.CMD run src/app/AppProjectMutationUtils.test.ts` failed before implementation because `replaceProjectScenesAcrossScripts` was not exported.
    - Targeted green test: `.\node_modules\.bin\vitest.CMD run src/app/AppProjectMutationUtils.test.ts` passed, 20 tests.
    - `corepack pnpm typecheck`: passed.
    - `corepack pnpm lint`: passed.
    - `corepack pnpm test`: passed, 474 tests across shared/API/web.
    - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-Ecjjqml4.js` at 606.00 kB minified.
    - `git diff --check`: passed; Git still reports the existing CRLF-to-LF normalization warning for `apps/web/src/app/App.tsx`.
    - `git ls-files .agents/memory`: empty.
    - Deploy: server HEAD `9c1e92344f8a752fd40a1b78648457b537199cc3`, local API health ok, public `https://shopclip.site/health` ok, PM2 `shopclip-ai-api` online.
    - Playwright production check: `https://shopclip.site/#project` and `https://shopclip.site/#studio` loaded with no browser errors, failed requests, or 4xx/5xx responses.
- Recent deployed cleanup at `fe33a4e`:
  - Extracted project script storyboard mutation logic from `apps/web/src/app/App.tsx` into `replaceProjectScriptStoryboard` in `apps/web/src/app/AppProjectMutationUtils.ts`.
  - Replaced inline project updates after generating storyboard for an existing script while keeping studio script loading and project history refresh behavior in `App.tsx`.
  - Extended `apps/web/src/app/AppProjectMutationUtils.test.ts` coverage for replacing an existing script storyboard, promoting storyboard scenes to project scenes, marking the project ready, and preserving an undefined project.
  - Current file sizes:
    - `App.tsx`: 2498 lines.
    - `AppProjectMutationUtils.ts`: 271 lines.
    - `AppProjectMutationUtils.test.ts`: 335 lines.
    - `AppWorkspaceDerivedState.ts`: 169 lines.
    - `SmartEditPanel.tsx`: 2981 lines.
  - Fresh verification after this pass:
    - Red test: `.\node_modules\.bin\vitest.CMD run src/app/AppProjectMutationUtils.test.ts` failed before implementation because `replaceProjectScriptStoryboard` was not exported.
    - Targeted green test: `.\node_modules\.bin\vitest.CMD run src/app/AppProjectMutationUtils.test.ts` passed, 18 tests.
    - `corepack pnpm typecheck`: passed.
    - `corepack pnpm lint`: passed.
    - `corepack pnpm test`: passed, 472 tests across shared/API/web.
    - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-CAjiBLQy.js` at 605.99 kB minified.
    - `git diff --check`: passed; Git still reports the existing CRLF-to-LF normalization warning for `apps/web/src/app/App.tsx`.
    - `git ls-files .agents/memory`: empty.
    - Deploy: server HEAD `fe33a4e2d02b9742020e43c71270206a236a7f9d`, local API health ok, public `https://shopclip.site/health` ok, PM2 `shopclip-ai-api` online.
    - Playwright production check: `https://shopclip.site/#project` and `https://shopclip.site/#studio` loaded with no browser errors, failed requests, or 4xx/5xx responses.
- Recent deployed cleanup at `7482129`:
  - Extracted render progress/export project mutation logic from `apps/web/src/app/App.tsx` into `replaceProjectRenderTaskProgress` and `markProjectRenderTaskExported` in `apps/web/src/app/AppProjectMutationUtils.ts`.
  - Replaced inline project updates in render polling and project export paths while keeping local render task, trace, export result, error, and Smart Edit state changes in `App.tsx`.
  - Extended `apps/web/src/app/AppProjectMutationUtils.test.ts` coverage for polling progress replacement, preserving project status until render completion, marking exported render tasks, writing export/preview URLs, and completing the project on export.
  - Current file sizes:
    - `App.tsx`: 2508 lines.
    - `AppProjectMutationUtils.ts`: 257 lines.
    - `AppProjectMutationUtils.test.ts`: 309 lines.
    - `AppWorkspaceDerivedState.ts`: 169 lines.
    - `SmartEditPanel.tsx`: 2981 lines.
  - Fresh verification after this pass:
    - Red test: `.\node_modules\.bin\vitest.CMD run src/app/AppProjectMutationUtils.test.ts` failed before implementation because `replaceProjectRenderTaskProgress` and `markProjectRenderTaskExported` were not exported.
    - Targeted green test: `.\node_modules\.bin\vitest.CMD run src/app/AppProjectMutationUtils.test.ts` passed, 16 tests.
    - `corepack pnpm typecheck`: passed.
    - `corepack pnpm lint`: passed.
    - `corepack pnpm test`: passed, 470 tests across shared/API/web.
    - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-qPkzsJcF.js` at 605.99 kB minified.
    - `git diff --check`: passed; Git still reports the existing CRLF-to-LF normalization warning for `apps/web/src/app/App.tsx`.
    - `git ls-files .agents/memory`: empty.
    - Deploy: server HEAD `74821292d851bdcd3549b0e5857d7974b2f3e1ff`, local API health ok, public `https://shopclip.site/health` ok, PM2 `shopclip-ai-api` online.
    - Playwright production check: `https://shopclip.site/#project` and `https://shopclip.site/#studio` loaded with no browser errors, failed requests, or 4xx/5xx responses.
- Recent deployed cleanup at `268ec45`:
  - Extracted repeated project render task mutation logic from `apps/web/src/app/App.tsx` into `appendProjectRenderTask` and `upsertProjectRenderTask` in `apps/web/src/app/AppProjectMutationUtils.ts`.
  - Replaced three inline render task project updates in start render, retry render, and Smart Edit render snapshot paths while keeping dashboard, export, render task, trace, and Smart Edit UI state changes in `App.tsx`.
  - Extended `apps/web/src/app/AppProjectMutationUtils.test.ts` coverage for appending running render tasks, appending completed render tasks, upserting render tasks by id, and project status transitions to `rendering` / `completed`.
  - Current file sizes:
    - `App.tsx`: 2527 lines.
    - `AppProjectMutationUtils.ts`: 219 lines.
    - `AppProjectMutationUtils.test.ts`: 271 lines.
    - `AppWorkspaceDerivedState.ts`: 169 lines.
    - `SmartEditPanel.tsx`: 2981 lines.
  - Fresh verification after this pass:
    - Red test: `.\node_modules\.bin\vitest.CMD run src/app/AppProjectMutationUtils.test.ts` failed before implementation because `appendProjectRenderTask` and `upsertProjectRenderTask` were not exported.
    - Targeted green test: `.\node_modules\.bin\vitest.CMD run src/app/AppProjectMutationUtils.test.ts` passed, 14 tests.
    - `corepack pnpm typecheck`: passed.
    - `corepack pnpm lint`: passed.
    - `corepack pnpm test`: passed, 468 tests across shared/API/web.
    - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-Cm9pwbFY.js` at 605.94 kB minified.
    - `git diff --check`: passed; Git still reports the existing CRLF-to-LF normalization warning for `apps/web/src/app/App.tsx`.
    - `git ls-files .agents/memory`: empty.
    - Deploy: server HEAD `268ec457b8a118875bb4b040ca07bf7bea4fed88`, local API health ok, public `https://shopclip.site/health` ok, PM2 `shopclip-ai-api` online.
    - Playwright production check: `https://shopclip.site/#project` and `https://shopclip.site/#studio` loaded with no browser errors, failed requests, or 4xx/5xx responses.
- Recent deployed cleanup at `0c08672`:
  - Extracted repeated project script append mutation logic from `apps/web/src/app/App.tsx` into `appendProjectScript` in `apps/web/src/app/AppProjectMutationUtils.ts`.
  - Replaced three inline script generation/save project updates while keeping fallback provider, dashboard, selected scene, dirty scene, asset recall, composer, tab, and navigation state changes in `App.tsx`.
  - Extended `apps/web/src/app/AppProjectMutationUtils.test.ts` coverage for appending a generated script, promoting its scenes to project scenes, marking the project ready, and preserving an undefined project.
  - Current file sizes:
    - `App.tsx`: 2552 lines.
    - `AppProjectMutationUtils.ts`: 191 lines.
    - `AppProjectMutationUtils.test.ts`: 229 lines.
    - `AppWorkspaceDerivedState.ts`: 169 lines.
    - `SmartEditPanel.tsx`: 2981 lines.
  - Fresh verification after this pass:
    - Red test: `.\node_modules\.bin\vitest.CMD run src/app/AppProjectMutationUtils.test.ts` failed before implementation because `appendProjectScript` was not exported.
    - Targeted green test: `.\node_modules\.bin\vitest.CMD run src/app/AppProjectMutationUtils.test.ts` passed, 11 tests.
    - `corepack pnpm typecheck`: passed.
    - `corepack pnpm lint`: passed.
    - `corepack pnpm test`: passed, 465 tests across shared/API/web.
    - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-EoTD9H6z.js` at 606.06 kB minified.
    - `git diff --check`: passed; Git still reports the existing CRLF-to-LF normalization warning for `apps/web/src/app/App.tsx`.
    - `git ls-files .agents/memory`: empty.
    - Deploy: server HEAD `0c086724c7fbe0e3e6255f44de68db62dcf12533`, local API health ok, public `https://shopclip.site/health` ok, PM2 `shopclip-ai-api` online.
    - Playwright production check: `https://shopclip.site/#project` and `https://shopclip.site/#studio` loaded with no browser errors, failed requests, or 4xx/5xx responses.
- Recent deployed cleanup at `043d367`:
  - Extracted processed asset project mutation logic from `apps/web/src/app/App.tsx` into `replaceProcessedProjectAsset` in `apps/web/src/app/AppProjectMutationUtils.ts`.
  - Replaced the inline project update after `processAssetStructure` while keeping asset library updates, asset search reset, and background task behavior in `App.tsx`.
  - Extended `apps/web/src/app/AppProjectMutationUtils.test.ts` coverage for replacing the processed asset, refreshing that asset's slices, appending processing events/jobs, and preserving the project when the processed asset belongs elsewhere.
  - Current file sizes:
    - `App.tsx`: 2578 lines.
    - `AppProjectMutationUtils.ts`: 179 lines.
    - `AppProjectMutationUtils.test.ts`: 201 lines.
    - `AppWorkspaceDerivedState.ts`: 169 lines.
    - `SmartEditPanel.tsx`: 2981 lines.
  - Fresh verification after this pass:
    - Red test: `.\node_modules\.bin\vitest.CMD run src/app/AppProjectMutationUtils.test.ts` failed before implementation because `replaceProcessedProjectAsset` was not exported.
    - Targeted green test: `.\node_modules\.bin\vitest.CMD run src/app/AppProjectMutationUtils.test.ts` passed, 9 tests.
    - `corepack pnpm typecheck`: passed.
    - `corepack pnpm lint`: passed.
    - `corepack pnpm test`: passed, 463 tests across shared/API/web.
    - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-CEgB9Hxp.js` at 606.18 kB minified.
    - `git diff --check`: passed; Git still reports the existing CRLF-to-LF normalization warning for `apps/web/src/app/App.tsx`.
    - `git ls-files .agents/memory`: empty.
    - Deploy: server HEAD `043d36721945e4a6e25944236e288ec0362f68f6`, local API health ok, public `https://shopclip.site/health` ok, PM2 `shopclip-ai-api` online.
    - Playwright production check: `https://shopclip.site/#project` and `https://shopclip.site/#studio` loaded with no browser errors, failed requests, or 4xx/5xx responses.
- Recent deployed cleanup at `ab2086f`:
  - Extracted imported project asset/slice merge logic from `apps/web/src/app/App.tsx` into `mergeImportedProjectAssets` in `apps/web/src/app/AppProjectMutationUtils.ts`.
  - Replaced the inline batch import project update for assets and slices while keeping asset library updates, search reset, and background task behavior in `App.tsx`.
  - Extended `apps/web/src/app/AppProjectMutationUtils.test.ts` coverage for merging project-owned imported assets, replacing slices for imported asset ids, filtering out assets from other projects, and preserving projects when no imported asset belongs to them.
  - Current file sizes:
    - `App.tsx`: 2736 lines.
    - `AppProjectMutationUtils.ts`: 169 lines.
    - `AppProjectMutationUtils.test.ts`: 152 lines.
    - `AppWorkspaceDerivedState.ts`: 189 lines.
    - `SmartEditPanel.tsx`: 3099 lines.
  - Fresh verification after this pass:
    - Red test: `.\node_modules\.bin\vitest.CMD run src/app/AppProjectMutationUtils.test.ts` failed before implementation because `mergeImportedProjectAssets` was not exported.
    - Targeted green test: `.\node_modules\.bin\vitest.CMD run src/app/AppProjectMutationUtils.test.ts` passed, 7 tests.
    - `corepack pnpm typecheck`: passed.
    - `corepack pnpm lint`: passed.
    - `corepack pnpm test`: passed, 461 tests across shared/API/web.
    - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-4N9AcSkT.js` at 606.18 kB minified.
    - `git diff --check`: passed; Git still reports the existing CRLF-to-LF normalization warning for `apps/web/src/app/App.tsx`.
    - `git ls-files .agents/memory`: empty.
    - Deploy: server HEAD `ab2086fc3ca3e367674b2966218f584a634cf95a`, local API health ok, public `https://shopclip.site/health` ok, PM2 `shopclip-ai-api` online.
    - Playwright production check: `https://shopclip.site/#project` and `https://shopclip.site/#studio` loaded with no browser errors, failed requests, or 4xx/5xx responses.
- Recent deployed cleanup at `7d365425`:
  - Extracted single project asset append/upsert mutations from `apps/web/src/app/App.tsx` into `appendProjectAsset` and `upsertProjectAsset` in `apps/web/src/app/AppProjectMutationUtils.ts`.
  - Replaced repeated project asset updates in upload, external asset import, and reference-to-script-library import paths.
  - Kept asset library state updates and surrounding UI state transitions in `App.tsx`.
  - Extended `apps/web/src/app/AppProjectMutationUtils.test.ts` coverage for appending project-owned assets, ignoring assets from other projects, and replacing existing assets by id.
  - Current file sizes:
    - `App.tsx`: 2749 lines.
    - `AppProjectMutationUtils.ts`: 138 lines.
    - `AppProjectMutationUtils.test.ts`: 97 lines.
    - `AppWorkspaceDerivedState.ts`: 189 lines.
    - `SmartEditPanel.tsx`: 3099 lines.
  - Fresh verification after this pass:
    - Red test: `.\node_modules\.bin\vitest.CMD run src/app/AppProjectMutationUtils.test.ts` failed before implementation because `appendProjectAsset` and `upsertProjectAsset` were not exported.
    - Targeted green test: `.\node_modules\.bin\vitest.CMD run src/app/AppProjectMutationUtils.test.ts` passed, 5 tests.
    - `corepack pnpm typecheck`: passed.
    - `corepack pnpm lint`: passed.
    - `corepack pnpm test`: passed, 459 tests across shared/API/web.
    - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-Cq0lZVB6.js` at 606.09 kB minified.
    - `git diff --check`: passed; Git still reports the existing CRLF-to-LF normalization warning for `apps/web/src/app/App.tsx`.
    - `git ls-files .agents/memory`: empty.
    - Deploy: server HEAD `7d3654253f0c6e44d4bf35648311d5335146f4df`, local API health ok, public `https://shopclip.site/health` ok, PM2 `shopclip-ai-api` online.
    - Playwright production check: `https://shopclip.site/#project` and `https://shopclip.site/#studio` loaded with no browser errors, failed requests, or 4xx/5xx responses.
- Recent deployed cleanup at `8621916`:
  - Extracted project asset removal mutation from `apps/web/src/app/App.tsx` into `removeProjectAssets` in `apps/web/src/app/AppProjectMutationUtils.ts`.
  - Moved project `assets` filtering, `assetSlices` filtering, project scene `assetId` clearing, and script scene `assetId` clearing out of `handleDeleteAssets`.
  - Kept asset library filtering, current script cleanup, asset prep cleanup, and search result cleanup in `App.tsx`.
  - Added `apps/web/src/app/AppProjectMutationUtils.test.ts` covering asset/slice removal, scene reference clearing, script scene reference clearing, and undefined project preservation.
  - Current file sizes:
    - `App.tsx`: 2766 lines.
    - `AppProjectMutationUtils.ts`: 106 lines.
    - `AppProjectMutationUtils.test.ts`: 46 lines.
    - `AppWorkspaceDerivedState.ts`: 189 lines.
    - `SmartEditPanel.tsx`: 3099 lines.
  - Fresh verification after this pass:
    - Red test: `.\node_modules\.bin\vitest.CMD run src/app/AppProjectMutationUtils.test.ts` failed before implementation because `removeProjectAssets` was not exported.
    - Targeted green test: `.\node_modules\.bin\vitest.CMD run src/app/AppProjectMutationUtils.test.ts` passed, 2 tests.
    - `corepack pnpm typecheck`: passed.
    - `corepack pnpm lint`: passed.
    - `corepack pnpm test`: passed, 456 tests across shared/API/web.
    - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-D8qbSvMM.js` at 606.09 kB minified.
    - `git diff --check`: passed; Git still reports the existing CRLF-to-LF normalization warning for `apps/web/src/app/App.tsx`.
    - `git ls-files .agents/memory`: empty.
    - Deploy: server HEAD `862191688d5259e9a9b48663c7f35260902137bd`, local API health ok, public `https://shopclip.site/health` ok, PM2 `shopclip-ai-api` online.
    - Playwright production check: `https://shopclip.site/#project` and `https://shopclip.site/#studio` loaded with no browser errors, failed requests, or 4xx/5xx responses.
- Recent deployed cleanup at `426ec932`:
  - Extracted loaded-project workspace derivation from `apps/web/src/app/App.tsx` into `selectLoadedProjectWorkspaceState` in `apps/web/src/app/AppWorkspaceDerivedState.ts`.
  - Moved latest-script selection, initial script draft selection, selected scene selection, studio base render selection, and initial Smart Edit result selection out of `applyLoadedProject`.
  - Kept actual React state writes, asset prep snapshot construction, and reset behavior in `App.tsx`.
  - Added `apps/web/src/app/AppWorkspaceDerivedState.test.ts` coverage for latest-script initialization and latest completed Smart Edit render priority.
  - Current file sizes:
    - `App.tsx`: 2787 lines.
    - `AppWorkspaceDerivedState.ts`: 189 lines.
    - `AppWorkspaceDerivedState.test.ts`: 238 lines.
    - `SmartEditPanel.tsx`: 3099 lines.
    - `SmartEditTrackDerivedState.ts`: 45 lines.
  - Fresh verification after this pass:
    - Red test: `.\node_modules\.bin\vitest.CMD run src/app/AppWorkspaceDerivedState.test.ts` failed before implementation because `selectLoadedProjectWorkspaceState` was not exported.
    - Targeted green test: `.\node_modules\.bin\vitest.CMD run src/app/AppWorkspaceDerivedState.test.ts` passed, 13 tests.
    - `corepack pnpm typecheck`: passed.
    - `corepack pnpm lint`: passed.
    - `corepack pnpm test`: passed, 454 tests across shared/API/web.
    - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-w_re1NPK.js` at 606.13 kB minified.
    - `git diff --check`: passed; Git still reports the existing CRLF-to-LF normalization warning for `apps/web/src/app/App.tsx`.
    - `git ls-files .agents/memory`: empty.
    - Deploy: server HEAD `426ec932a18847cc5b3808b2f576569ff784240f`, local API health ok, public `https://shopclip.site/health` ok, PM2 `shopclip-ai-api` online.
    - Playwright production check: `https://shopclip.site/#project` and `https://shopclip.site/#studio` loaded with no browser errors, failed requests, or 4xx/5xx responses.
- Recent deployed cleanup at `d76e333`:
  - Extracted the workspace asset/reference refresh decision from `apps/web/src/app/App.tsx` into `selectWorkspaceAssetRefreshAction` in `apps/web/src/app/AppWorkspaceDerivedState.ts`.
  - Replaced the inline `activePage` / `activeAssetCategory` branching in `App.tsx` with a small action dispatch while keeping the actual refresh calls and React state ownership in `App.tsx`.
  - Added `apps/web/src/app/AppWorkspaceDerivedState.test.ts` coverage for template reference refresh, non-template asset refresh, inspiration all-asset refresh, create-page refresh, and project-page no-op behavior.
  - Current file sizes:
    - `App.tsx`: 2810 lines.
    - `AppWorkspaceDerivedState.ts`: 125 lines.
    - `AppWorkspaceDerivedState.test.ts`: 146 lines.
    - `SmartEditPanel.tsx`: 3099 lines.
    - `SmartEditTrackDerivedState.ts`: 45 lines.
  - Fresh verification after this pass:
    - Red test: `.\node_modules\.bin\vitest.CMD run src/app/AppWorkspaceDerivedState.test.ts` failed before implementation because `selectWorkspaceAssetRefreshAction` was not exported.
    - Targeted green test: `.\node_modules\.bin\vitest.CMD run src/app/AppWorkspaceDerivedState.test.ts` passed, 11 tests.
    - `corepack pnpm typecheck`: passed.
    - `corepack pnpm lint`: passed.
    - `corepack pnpm test`: passed, 452 tests across shared/API/web.
    - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-B1jCFlXj.js` at 605.81 kB minified.
    - `git diff --check`: passed; Git still reports the existing CRLF-to-LF normalization warning for `apps/web/src/app/App.tsx`.
    - `git ls-files .agents/memory`: empty.
    - Deploy: server HEAD `d76e3332c745f415b1980ff492f5330578e1944c`, local API health ok, public `https://shopclip.site/health` ok, PM2 `shopclip-ai-api` online.
    - Playwright production check: `https://shopclip.site/#project` and `https://shopclip.site/#studio` loaded with no browser errors, failed requests, or 4xx/5xx responses.
- Recent deployed cleanup at `23ac77c`:
  - Extracted track-clip-specific derived state into `apps/web/src/features/edit/SmartEditTrackClipDerivedState.ts`.
  - Moved track clip flattening, edit-point construction, snap-point construction, selected clip batch selection, clip lookup, playhead clip selection, drag preview, and trim preview out of `apps/web/src/features/edit/SmartEditTrackDerivedState.ts`.
  - Converted `SmartEditTrackDerivedState.ts` into a compatibility aggregate/re-export module while updating `apps/web/src/features/edit/SmartEditPanel.tsx` to import track clip helpers from the new module directly.
  - Added `apps/web/src/features/edit/SmartEditTrackClipDerivedState.test.ts` covering edit points, id lookup/selection, unlocked playhead selection, and snap points with exclusions.
  - Current file sizes:
    - `SmartEditPanel.tsx`: 3099 lines.
    - `SmartEditTrackDerivedState.ts`: 45 lines.
    - `SmartEditTrackClipDerivedState.ts`: 186 lines.
    - `SmartEditTimelineMaterialDerivedState.ts`: 151 lines.
    - `SmartEditTrackPresentationState.ts`: 47 lines.
    - `SmartEditTimelineElementDerivedState.ts`: 88 lines.
  - Fresh verification after this pass:
    - Red test: `.\node_modules\.bin\vitest.CMD run src/features/edit/SmartEditTrackClipDerivedState.test.ts` failed before implementation because `SmartEditTrackClipDerivedState` did not exist.
    - Targeted green test: `.\node_modules\.bin\vitest.CMD run src/features/edit/SmartEditTrackClipDerivedState.test.ts src/features/edit/SmartEditTrackDerivedState.test.ts` passed, 24 tests.
    - `corepack pnpm typecheck`: passed.
    - `corepack pnpm lint`: passed.
    - `corepack pnpm test`: passed, 447 tests across shared/API/web.
    - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-BA2cvnyB.js` at 605.56 kB minified.
    - `git diff --check`: passed; Git still reports the existing CRLF-to-LF normalization warning for `apps/web/src/features/edit/SmartEditPanel.tsx`.
    - `git ls-files .agents/memory`: empty.
    - Deploy: server HEAD `23ac77cbca81fbaf1a2a52a84c1868088d2e854b`, local API health ok, public `https://shopclip.site/health` ok, PM2 `shopclip-ai-api` online.
    - Playwright production check: `https://shopclip.site/#project` and `https://shopclip.site/#studio` loaded with no browser errors, failed requests, or 4xx/5xx responses.
- Recent deployed cleanup at `04f3e68`:
  - Extracted timeline-material-specific derived state into `apps/web/src/features/edit/SmartEditTimelineMaterialDerivedState.ts`.
  - Moved editable/movable/resizable material selection, text material selection/counting, mergeability, clipboard copy selection, removable/resizable batch selection, and align anchor selection out of `apps/web/src/features/edit/SmartEditTrackDerivedState.ts`.
  - Kept compatibility re-exports from `SmartEditTrackDerivedState.ts` while updating `apps/web/src/features/edit/SmartEditPanel.tsx` to import material helpers from the new module directly.
  - Added `apps/web/src/features/edit/SmartEditTimelineMaterialDerivedState.test.ts` covering editable material filtering, move/resize eligibility, clipboard selection priority, and align anchor selection.
  - Current file sizes:
    - `SmartEditPanel.tsx`: 3099 lines.
    - `SmartEditTrackDerivedState.ts`: 221 lines.
    - `SmartEditTimelineMaterialDerivedState.ts`: 151 lines.
    - `SmartEditTrackPresentationState.ts`: 47 lines.
    - `SmartEditTimelineElementDerivedState.ts`: 88 lines.
  - Fresh verification after this pass:
    - Red test: `.\node_modules\.bin\vitest.CMD run src/features/edit/SmartEditTimelineMaterialDerivedState.test.ts` failed before implementation because `SmartEditTimelineMaterialDerivedState` did not exist.
    - Targeted green test: `.\node_modules\.bin\vitest.CMD run src/features/edit/SmartEditTimelineMaterialDerivedState.test.ts src/features/edit/SmartEditTrackDerivedState.test.ts` passed, 24 tests.
    - `corepack pnpm typecheck`: passed.
    - `corepack pnpm lint`: passed.
    - `corepack pnpm test`: passed, 443 tests across shared/API/web.
    - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-BtYgriT4.js` at 605.56 kB minified.
    - `git diff --check`: passed; Git still reports the existing CRLF-to-LF normalization warning for `apps/web/src/features/edit/SmartEditPanel.tsx`.
    - `git ls-files .agents/memory`: empty.
    - Deploy: server HEAD `04f3e68bddefd3e9bbe5cf5868e83cc2119b5c0b`, local API health ok, public `https://shopclip.site/health` ok, PM2 `shopclip-ai-api` online.
    - Playwright production check: `https://shopclip.site/#project` and `https://shopclip.site/#studio` loaded with no browser errors, failed requests, or 4xx/5xx responses.
- Recent deployed cleanup at `9ad004d`:
  - Extracted track presentation derived state into `apps/web/src/features/edit/SmartEditTrackPresentationState.ts`.
  - Moved track ID mapping, timeline track lookup, track presentation state, and track lock lookup out of `apps/web/src/features/edit/SmartEditTrackDerivedState.ts`.
  - Kept compatibility re-exports from `SmartEditTrackDerivedState.ts` while updating `apps/web/src/features/edit/SmartEditPanel.tsx` to import presentation helpers from the new module directly.
  - Added `apps/web/src/features/edit/SmartEditTrackPresentationState.test.ts` covering editor-to-timeline track ID mapping, locked track lookup, timeline setting precedence, segment fallback state, and selectable material counts.
  - Current file sizes:
    - `SmartEditPanel.tsx`: 3097 lines.
    - `SmartEditTrackDerivedState.ts`: 350 lines.
    - `SmartEditTrackPresentationState.ts`: 47 lines.
    - `SmartEditTimelineElementDerivedState.ts`: 88 lines.
    - `App.tsx`: 2818 lines.
  - Fresh verification after this pass:
    - Red test: `.\node_modules\.bin\vitest.CMD run src/features/edit/SmartEditTrackPresentationState.test.ts` failed before implementation because `SmartEditTrackPresentationState` did not exist.
    - Targeted green test: `.\node_modules\.bin\vitest.CMD run src/features/edit/SmartEditTrackPresentationState.test.ts src/features/edit/SmartEditTrackDerivedState.test.ts` passed, 23 tests.
    - `corepack pnpm test`: passed, 439 tests across shared/API/web.
    - `corepack pnpm lint`: passed after removing the migrated unused `SmartEditPlan` import from `SmartEditTrackDerivedState.ts`.
    - `corepack pnpm typecheck`: passed.
    - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-BoL2B-8u.js` at 605.56 kB minified.
    - `git diff --check`: passed; Git still reports the existing CRLF-to-LF normalization warning for `apps/web/src/features/edit/SmartEditPanel.tsx`.
    - `git ls-files .agents/memory`: empty.
    - Deploy: server HEAD `9ad004ddee43d8595f391c8788259e60314817d1`, local API health ok, public `https://shopclip.site/health` ok, PM2 `shopclip-ai-api` online.
    - Playwright production check: `https://shopclip.site/#project` and `https://shopclip.site/#studio` loaded with no browser errors, failed requests, or 4xx/5xx responses.
- Recent deployed cleanup at `44f886c`:
  - Extracted timeline-element-specific derived state into `apps/web/src/features/edit/SmartEditTimelineElementDerivedState.ts`.
  - Moved generated element ID selection, existing element ID selection, split text element selection, selected timeline element lookup, linked element lookup, text line counting, and relink eligibility out of `apps/web/src/features/edit/SmartEditTrackDerivedState.ts`.
  - Kept compatibility re-exports from `SmartEditTrackDerivedState.ts` while updating `apps/web/src/features/edit/SmartEditPanel.tsx` to import timeline element selectors from the new module directly.
  - Added `apps/web/src/features/edit/SmartEditTimelineElementDerivedState.test.ts` covering exact generated ID matching, text line counts, linked elements, and relink eligibility.
  - Current file sizes:
    - `SmartEditPanel.tsx`: 3095 lines.
    - `SmartEditTrackDerivedState.ts`: 388 lines.
    - `SmartEditTimelineElementDerivedState.ts`: 88 lines.
    - `SmartEditSelectionUtils.ts`: 56 lines.
    - `App.tsx`: 2818 lines.
  - Fresh verification after this pass:
    - Red test: `.\node_modules\.bin\vitest.CMD run src/features/edit/SmartEditTimelineElementDerivedState.test.ts` failed before implementation because `SmartEditTimelineElementDerivedState` did not exist.
    - Targeted green test: `.\node_modules\.bin\vitest.CMD run src/features/edit/SmartEditTimelineElementDerivedState.test.ts src/features/edit/SmartEditTrackDerivedState.test.ts` passed, 23 tests.
    - `corepack pnpm typecheck`: passed.
    - `corepack pnpm lint`: passed.
    - `corepack pnpm test`: passed, 436 tests across shared/API/web.
    - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-DNCuKJ9E.js` at 605.56 kB minified.
    - `git diff --check`: passed; Git still reports the existing CRLF-to-LF normalization warning for `apps/web/src/features/edit/SmartEditPanel.tsx`.
    - `git ls-files .agents/memory`: empty.
    - Deploy: server HEAD `44f886ceb1ec4768eae361a8efa37000b7a2ddfc`, local API health ok, public `https://shopclip.site/health` ok, PM2 `shopclip-ai-api` online.
    - Playwright production check: `https://shopclip.site/#project` and `https://shopclip.site/#studio` loaded with no browser errors, failed requests, or 4xx/5xx responses.
- Recent deployed cleanup at `b0afb3a`:
  - Extracted `selectSelectedSmartEditTrackClipBatchIds` in `apps/web/src/features/edit/SmartEditTrackDerivedState.ts`.
  - Reused that selector in `apps/web/src/features/edit/SmartEditPanel.tsx` for timeline material move and trim commit paths.
  - Reused the same selector in `buildSmartEditTrackClipTrimPreview` so preview and commit paths share the same "target clip belongs to a multi-selection" rule.
  - Added focused coverage in `apps/web/src/features/edit/SmartEditTrackDerivedState.test.ts` for included targets, missing targets, and single-selection fallback.
  - Current file sizes:
    - `SmartEditPanel.tsx`: 3093 lines.
    - `SmartEditTrackDerivedState.ts`: 463 lines.
    - `SmartEditSelectionUtils.ts`: 56 lines.
    - `App.tsx`: 2818 lines.
  - Fresh verification after this pass:
    - Red test: `.\node_modules\.bin\vitest.CMD run src/features/edit/SmartEditTrackDerivedState.test.ts` failed before implementation because `selectSelectedSmartEditTrackClipBatchIds` was not exported.
    - Targeted green test: `.\node_modules\.bin\vitest.CMD run src/features/edit/SmartEditTrackDerivedState.test.ts` passed, 20 tests.
    - `corepack pnpm typecheck`: passed.
    - `corepack pnpm lint`: passed.
    - `corepack pnpm test`: passed, 433 tests across shared/API/web.
    - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-B9S7IRDD.js` at 605.56 kB minified.
    - `git diff --check`: passed; Git still reports the existing CRLF-to-LF normalization warning for `apps/web/src/features/edit/SmartEditPanel.tsx`.
    - `git ls-files .agents/memory`: empty.
    - Deploy: server HEAD `b0afb3a6dc951238068314b24761ee035e3b33ab`, local API health ok, public `https://shopclip.site/health` ok, PM2 `shopclip-ai-api` online.
    - Playwright production check: `https://shopclip.site/#project` and `https://shopclip.site/#studio` loaded with no browser errors, failed requests, or 4xx/5xx responses.
- Recent deployed cleanup at `cea4fea`:
  - Extracted `selectSmartEditTrackClipSnapPoints` in `apps/web/src/features/edit/SmartEditTrackDerivedState.ts`.
  - Reused that selector in `buildSmartEditTrackClipDragPreview`, `buildSmartEditTrackClipTrimPreview`, and `apps/web/src/features/edit/SmartEditPanel.tsx` trim-drag finish handling.
  - Removed repeated inline construction of `[playhead, non-excluded clip starts/ends]` snap point arrays while preserving track order and existing `snapTimelineSeconds` end-point rounding.
  - Added focused coverage in `apps/web/src/features/edit/SmartEditTrackDerivedState.test.ts` for excluded clips, track-order preservation, and snapped clip end points.
  - Current file sizes:
    - `SmartEditPanel.tsx`: 3090 lines.
    - `SmartEditTrackDerivedState.ts`: 449 lines.
    - `SmartEditSelectionUtils.ts`: 56 lines.
    - `App.tsx`: 2818 lines.
  - Fresh verification after this pass:
    - Red test: `.\node_modules\.bin\vitest.CMD run src/features/edit/SmartEditTrackDerivedState.test.ts` failed before implementation because `selectSmartEditTrackClipSnapPoints` was not exported.
    - Targeted green test: `.\node_modules\.bin\vitest.CMD run src/features/edit/SmartEditTrackDerivedState.test.ts` passed, 19 tests.
    - `corepack pnpm typecheck`: passed.
    - `corepack pnpm lint`: passed.
    - `corepack pnpm test`: passed, 432 tests across shared/API/web.
    - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-RCiUJuh-.js` at 605.32 kB minified.
    - `git diff --check`: passed; Git still reports the existing CRLF-to-LF normalization warning for `apps/web/src/features/edit/SmartEditPanel.tsx`.
    - `git ls-files .agents/memory`: empty.
    - Deploy: server HEAD `cea4fea86bab3977f3fed6face460181db3dfed4`, local API health ok, public `https://shopclip.site/health` ok, PM2 `shopclip-ai-api` online.
    - Playwright production check: `https://shopclip.site/#project` and `https://shopclip.site/#studio` loaded with no browser errors, failed requests, or 4xx/5xx responses.
- Recent deployed cleanup at `869a848`:
  - Extracted `selectSmartEditTimelineElementIdsByExactToken` in `apps/web/src/features/edit/SmartEditTrackDerivedState.ts`.
  - Reused that selector in `apps/web/src/features/edit/SmartEditPanel.tsx` after splitting selected timeline materials, replacing the inline exact generated element ID filter.
  - Added focused coverage in `apps/web/src/features/edit/SmartEditTrackDerivedState.test.ts` for exact source-token matching, rejecting longer suffix matches, preserving timeline element order, and absent timeline elements.
  - Current file sizes:
    - `SmartEditPanel.tsx`: 3095 lines.
    - `SmartEditTrackDerivedState.ts`: 439 lines.
    - `SmartEditSelectionUtils.ts`: 56 lines.
    - `App.tsx`: 2818 lines.
  - Fresh verification after this pass:
    - Red test: `.\node_modules\.bin\vitest.CMD run src/features/edit/SmartEditTrackDerivedState.test.ts` failed before implementation because `selectSmartEditTimelineElementIdsByExactToken` was not exported.
    - Targeted green test: `.\node_modules\.bin\vitest.CMD run src/features/edit/SmartEditTrackDerivedState.test.ts` passed, 18 tests.
    - `corepack pnpm lint`: passed.
    - `corepack pnpm typecheck`: passed.
    - `corepack pnpm test`: passed, 431 tests across shared/API/web.
    - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-Dnk0VeJX.js` at 605.31 kB minified.
    - `git diff --check`: passed; Git still reports the existing CRLF-to-LF normalization warning for `apps/web/src/features/edit/SmartEditPanel.tsx`.
    - `git ls-files .agents/memory`: empty.
    - Deploy: server HEAD `869a84883de19221b0c2941ec2dd78e8830cb539`, local API health ok, public `https://shopclip.site/health` ok, PM2 `shopclip-ai-api` online.
    - Playwright production check: `https://shopclip.site/#project` and `https://shopclip.site/#studio` loaded with no browser errors, failed requests, or 4xx/5xx responses.
- Recent deployed cleanup at `02ae600`:
  - Extracted `selectExistingSmartEditTimelineElementIds` in `apps/web/src/features/edit/SmartEditTrackDerivedState.ts`.
  - Reused that selector in `apps/web/src/features/edit/SmartEditPanel.tsx` so trim-at-playhead no longer directly filters selected timeline material IDs against `nextPlan.timeline.elements`.
  - Added focused coverage in `apps/web/src/features/edit/SmartEditTrackDerivedState.test.ts` for preserving requested ID order and returning an empty list when timeline elements are absent.
  - Current file sizes:
    - `SmartEditPanel.tsx`: 3095 lines.
    - `SmartEditTrackDerivedState.ts`: 430 lines.
    - `SmartEditSelectionUtils.ts`: 56 lines.
    - `App.tsx`: 2818 lines.
  - Fresh verification after this pass:
    - Red test: `.\node_modules\.bin\vitest.CMD run src/features/edit/SmartEditTrackDerivedState.test.ts` failed before implementation because `selectExistingSmartEditTimelineElementIds` was not exported.
    - Targeted green test: `.\node_modules\.bin\vitest.CMD run src/features/edit/SmartEditTrackDerivedState.test.ts` passed, 17 tests.
    - `corepack pnpm lint`: passed.
    - `corepack pnpm typecheck`: passed.
    - `corepack pnpm test`: passed, 430 tests across shared/API/web.
    - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-BB6PO94M.js` at 605.29 kB minified.
    - `git diff --check`: passed; Git still reports the existing CRLF-to-LF normalization warning for touched files.
    - `git ls-files .agents/memory`: empty.
    - Deploy: server HEAD `02ae60098ef583e970f6890464e0edddc8c312fd`, local API health ok, public `https://shopclip.site/health` ok, PM2 `shopclip-ai-api` online.
    - Playwright production check: `https://shopclip.site/#project` and `https://shopclip.site/#studio` loaded with no browser errors, failed requests, or 4xx/5xx responses.
- Recent deployed cleanup at `08731f1`:
  - Reused `selectSmartEditSelectionRangeIdsOrUndefined` in `apps/web/src/features/edit/SmartEditPanel.tsx` for segment Shift multi-select.
  - Removed the remaining segment-selection anchor/target index lookup, range normalization, slice, and ID mapping from the panel.
  - Kept the existing behavior of using the active selected segment as the range anchor and selecting the clicked segment as the active segment.
  - Current file sizes:
    - `SmartEditPanel.tsx`: 3093 lines.
    - `SmartEditSelectionUtils.ts`: 56 lines.
    - `SmartEditTrackDerivedState.ts`: 422 lines.
    - `App.tsx`: 2818 lines.
  - Fresh verification after this pass:
    - Targeted green test: `.\node_modules\.bin\vitest.CMD run src/features/edit/SmartEditSelectionUtils.test.ts` passed, 6 tests.
    - `corepack pnpm lint`: passed.
    - `corepack pnpm typecheck`: passed.
    - `corepack pnpm test`: passed, 429 tests across shared/API/web.
    - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-_-K_tPnu.js` at 605.24 kB minified.
    - `git diff --check`: passed; Git still reports the existing CRLF-to-LF normalization warning for touched files.
    - `git ls-files .agents/memory`: empty.
    - Deploy: server HEAD `08731f11f6e18b7be9d8a65ce97f80e038862312`, local API health ok, public `https://shopclip.site/health` ok, PM2 `shopclip-ai-api` online.
    - Playwright production check: `https://shopclip.site/#project` and `https://shopclip.site/#studio` loaded with no browser errors, failed requests, or 4xx/5xx responses.
- Recent deployed cleanup at `d448076`:
  - Extracted ordered range selection into `selectSmartEditSelectionRangeIdsOrUndefined` in `apps/web/src/features/edit/SmartEditSelectionUtils.ts`.
  - Reused that helper in `apps/web/src/features/edit/SmartEditPanel.tsx` so timeline material Shift multi-select no longer hand-rolls anchor/target index lookup and slice/map logic.
  - Added focused coverage in `apps/web/src/features/edit/SmartEditSelectionUtils.test.ts` for forward/backward range selection and missing anchor/target fallback.
  - Current file sizes:
    - `SmartEditPanel.tsx`: 3092 lines.
    - `SmartEditSelectionUtils.ts`: 56 lines.
    - `SmartEditTrackDerivedState.ts`: 422 lines.
    - `App.tsx`: 2818 lines.
  - Fresh verification after this pass:
    - Red test: `.\node_modules\.bin\vitest.CMD run src/features/edit/SmartEditSelectionUtils.test.ts` failed before implementation because `selectSmartEditSelectionRangeIdsOrUndefined` was not exported.
    - Targeted green test: `.\node_modules\.bin\vitest.CMD run src/features/edit/SmartEditSelectionUtils.test.ts` passed, 6 tests.
    - `corepack pnpm lint`: passed.
    - `corepack pnpm typecheck`: passed.
    - `corepack pnpm test`: passed, 429 tests across shared/API/web.
    - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-BsBoBfD_.js` at 605.31 kB minified.
    - `git diff --check`: passed; Git still reports the existing CRLF-to-LF normalization warning for touched files.
    - `git ls-files .agents/memory`: empty.
    - Deploy: server HEAD `d448076e7f0b7372b5a3dc7bad98a69c726f33b7`, local API health ok, public `https://shopclip.site/health` ok, PM2 `shopclip-ai-api` online.
    - Playwright production check: `https://shopclip.site/#project` and `https://shopclip.site/#studio` loaded with no browser errors, failed requests, or 4xx/5xx responses.
- Recent deployed cleanup at `f180341`:
  - Passed `isTimelineTrackLocked` into `buildSmartEditTrackClipTrimPreview` from `apps/web/src/features/edit/SmartEditPanel.tsx`.
  - Reused `canResizeSelectedSmartEditTimelineMaterials` inside the trim-preview builder so selected trim previews now follow the same scene-material, bgm, and locked-track eligibility as the actual trim commit path.
  - Added focused coverage in `apps/web/src/features/edit/SmartEditTrackDerivedState.test.ts` proving locked track clips stay out of selected trim previews.
  - Current file sizes:
    - `SmartEditPanel.tsx`: 3095 lines.
    - `SmartEditTrackDerivedState.ts`: 422 lines.
    - `SmartEditSegmentDerivedState.ts`: 119 lines.
    - `App.tsx`: 2818 lines.
  - Fresh verification after this pass:
    - Red test: `.\node_modules\.bin\vitest.CMD run src/features/edit/SmartEditTrackDerivedState.test.ts` failed before implementation because the locked voice clip was still included in trim previews.
    - Targeted green test: `.\node_modules\.bin\vitest.CMD run src/features/edit/SmartEditTrackDerivedState.test.ts` passed, 16 tests.
    - `corepack pnpm lint`: passed.
    - `corepack pnpm typecheck`: passed.
    - `corepack pnpm test`: passed, 427 tests across shared/API/web.
    - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-jl6c0Gu_.js` at 605.21 kB minified.
    - `git diff --check`: passed; Git still reports the existing CRLF-to-LF normalization warning for touched files.
    - `git ls-files .agents/memory`: empty.
    - Deploy: server HEAD `f1803416de3b9256047da5d3c0e17d81055a37f7`, local API health ok, public `https://shopclip.site/health` ok, PM2 `shopclip-ai-api` online.
    - Playwright production check: `https://shopclip.site/#project` and `https://shopclip.site/#studio` loaded with no browser errors, failed requests, or 4xx/5xx responses.
- Recent deployed cleanup at `85fa0b7`:
  - Extracted selected Smart Edit timeline material batch resize eligibility into `canResizeSelectedSmartEditTimelineMaterials` in `apps/web/src/features/edit/SmartEditTrackDerivedState.ts`.
  - Reused that guard in `selectResizableSmartEditTimelineMaterialIdsOrUndefined`, leaving the selector focused on the multi-selection and ID-return contract.
  - Added focused coverage in `apps/web/src/features/edit/SmartEditTrackDerivedState.test.ts` for resizable batches, scene material exclusion, bgm exclusion, and locked track exclusion.
  - Current file sizes:
    - `SmartEditPanel.tsx`: 3093 lines.
    - `SmartEditTrackDerivedState.ts`: 422 lines.
    - `SmartEditSegmentDerivedState.ts`: 119 lines.
    - `App.tsx`: 2818 lines.
  - Fresh verification after this pass:
    - Red test: `.\node_modules\.bin\vitest.CMD run src/features/edit/SmartEditTrackDerivedState.test.ts` failed before implementation because `canResizeSelectedSmartEditTimelineMaterials` was not exported.
    - Targeted green test: `.\node_modules\.bin\vitest.CMD run src/features/edit/SmartEditTrackDerivedState.test.ts` passed, 15 tests.
    - `corepack pnpm lint`: passed.
    - `corepack pnpm typecheck`: passed.
    - `corepack pnpm test`: passed, 426 tests across shared/API/web.
    - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-BMjGsFDF.js` at 605.18 kB minified.
    - `git diff --check`: passed.
    - `git ls-files .agents/memory`: empty.
    - Deploy: server HEAD `85fa0b77b74d525991555a5043ba463b2981dae9`, local API health ok, public `https://shopclip.site/health` ok, PM2 `shopclip-ai-api` online.
    - Playwright production check: `https://shopclip.site/#project` and `https://shopclip.site/#studio` loaded with no browser errors, failed requests, or 4xx/5xx responses.
- Recent deployed cleanup at `79badc0`:
  - Reused `canMoveSelectedSmartEditTimelineMaterials` inside `selectRemovableSmartEditTimelineMaterialIds` in `apps/web/src/features/edit/SmartEditTrackDerivedState.ts`.
  - Removed the duplicated inline standalone-material and locked-track batch predicate from the removable timeline material selector.
  - Kept the selector's command-facing contract unchanged: removable batches still return IDs, while single selections or partially blocked batches return an empty list.
  - Current file sizes:
    - `SmartEditPanel.tsx`: 3093 lines.
    - `SmartEditTrackDerivedState.ts`: 417 lines.
    - `SmartEditSegmentDerivedState.ts`: 119 lines.
    - `App.tsx`: 2818 lines.
  - Fresh verification after this pass:
    - Targeted green test: `.\node_modules\.bin\vitest.CMD run src/features/edit/SmartEditTrackDerivedState.test.ts` passed, 14 tests.
    - `corepack pnpm lint`: passed.
    - `corepack pnpm typecheck`: passed.
    - `corepack pnpm test`: passed, 425 tests across shared/API/web.
    - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-sZE1YyFD.js` at 605.17 kB minified.
    - `git diff --check`: passed.
    - `git ls-files .agents/memory`: empty.
    - Deploy: server HEAD `79badc077eb1dd2b29df5d80c1a08609f4f22b68`, local API health ok, public `https://shopclip.site/health` ok, PM2 `shopclip-ai-api` online.
    - Playwright production check: `https://shopclip.site/#project` and `https://shopclip.site/#studio` loaded with no browser errors, failed requests, or 4xx/5xx responses.
- Recent deployed cleanup at `621cf23`:
  - Extracted selected Smart Edit timeline material batch move eligibility into `canMoveSelectedSmartEditTimelineMaterials` in `apps/web/src/features/edit/SmartEditTrackDerivedState.ts`.
  - Reused that guard in `apps/web/src/features/edit/SmartEditPanel.tsx` so the selected-batch timeline move path no longer embeds segment-material and locked-track checks inline.
  - Kept the panel responsible for selected batch lookup, drag preview timing, move command dispatch, and command history labels.
  - Added focused coverage in `apps/web/src/features/edit/SmartEditTrackDerivedState.test.ts` for movable multi-track batches, scene material exclusion, and locked track exclusion.
  - Current file sizes:
    - `SmartEditPanel.tsx`: 3093 lines.
    - `SmartEditTrackDerivedState.ts`: 417 lines.
    - `SmartEditSegmentDerivedState.ts`: 119 lines.
    - `App.tsx`: 2818 lines.
  - Fresh verification after this pass:
    - Targeted green test: `.\node_modules\.bin\vitest.CMD run src/features/edit/SmartEditTrackDerivedState.test.ts` passed, 14 tests.
    - `corepack pnpm lint`: passed.
    - `corepack pnpm typecheck`: passed.
    - `corepack pnpm test`: passed, 425 tests across shared/API/web.
    - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-BRMEWD-Q.js` at 605.20 kB minified.
    - `git diff --check`: passed; Git still reports the existing CRLF-to-LF normalization warning for touched files.
    - `git ls-files .agents/memory`: empty.
    - Deploy: server HEAD `621cf237fb6fac35284ffe1776f412429257de47`, local API health ok, public `https://shopclip.site/health` ok, PM2 `shopclip-ai-api` online.
    - Playwright production check: `https://shopclip.site/#project` and `https://shopclip.site/#studio` loaded with no browser errors, failed requests, or 4xx/5xx responses.
- Recent deployed cleanup at `13d5171`:
  - Extracted resizable Smart Edit timeline material ID selection into `selectResizableSmartEditTimelineMaterialIdsOrUndefined` in `apps/web/src/features/edit/SmartEditTrackDerivedState.ts`.
  - Reused that selector in `apps/web/src/features/edit/SmartEditPanel.tsx` so the trim-track-clip edge command no longer performs its own multi-select resize eligibility checks inline.
  - Kept the panel responsible for current dragged clip membership, trim command dispatch, selection restoration, and history labels.
  - Added focused coverage in `apps/web/src/features/edit/SmartEditTrackDerivedState.test.ts` for batch resize eligibility, single selection fallback, scene material exclusion, bgm exclusion, and locked track exclusion.
  - Current file sizes:
    - `SmartEditPanel.tsx`: 3092 lines.
    - `SmartEditTrackDerivedState.ts`: 411 lines.
    - `SmartEditSegmentDerivedState.ts`: 119 lines.
    - `App.tsx`: 2818 lines.
  - Fresh verification after this pass:
    - Red test: `.\node_modules\.bin\vitest.CMD run src/features/edit/SmartEditTrackDerivedState.test.ts` failed before implementation because `selectResizableSmartEditTimelineMaterialIdsOrUndefined` was not exported.
    - Targeted green test: `.\node_modules\.bin\vitest.CMD run src/features/edit/SmartEditTrackDerivedState.test.ts` passed, 13 tests.
    - `corepack pnpm lint`: passed.
    - `corepack pnpm typecheck`: passed.
    - `corepack pnpm test`: passed, 424 tests across shared/API/web.
    - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-D5W7-4Lo.js` at 605.18 kB minified.
    - `git diff --check`: passed; Git still reports the existing CRLF-to-LF normalization warning for touched files.
    - `git ls-files .agents/memory`: empty.
    - Deploy: server HEAD `13d5171e4b4ad5c566abd61e21ed81b8e7b3175e`, local API health ok, public `https://shopclip.site/health` ok, PM2 `shopclip-ai-api` online.
    - Playwright production check: `https://shopclip.site/#project` and `https://shopclip.site/#studio` loaded with no browser errors, failed requests, or 4xx/5xx responses.
- Recent deployed cleanup at `053255e`:
  - Extracted mergeable Smart Edit text timeline material ID selection into `selectMergeableSmartEditTimelineTextMaterialIdsOrUndefined` in `apps/web/src/features/edit/SmartEditTrackDerivedState.ts`.
  - Reused that selector in `apps/web/src/features/edit/SmartEditPanel.tsx` so the merge-selected-text-materials command no longer performs its own text material count guard.
  - Removed the now-unused `selectSmartEditTimelineTextMaterialIds` import from the panel while keeping merge command execution, selection restoration, and history labels in the panel.
  - Added focused coverage in `apps/web/src/features/edit/SmartEditTrackDerivedState.test.ts` for two-or-more text material selection and non-mergeable fallback.
  - Current file sizes:
    - `SmartEditPanel.tsx`: 3091 lines.
    - `SmartEditTrackDerivedState.ts`: 399 lines.
    - `SmartEditSegmentDerivedState.ts`: 119 lines.
    - `App.tsx`: 2818 lines.
  - Fresh verification after this pass:
    - Red test: `.\node_modules\.bin\vitest.CMD run src/features/edit/SmartEditTrackDerivedState.test.ts` failed before implementation because `selectMergeableSmartEditTimelineTextMaterialIdsOrUndefined` was not exported.
    - Targeted green test: `.\node_modules\.bin\vitest.CMD run src/features/edit/SmartEditTrackDerivedState.test.ts` passed, 12 tests.
    - `corepack pnpm lint`: passed.
    - `corepack pnpm typecheck`: passed.
    - `corepack pnpm test`: passed, 423 tests across shared/API/web.
    - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-CXwx-zI6.js` at 605.12 kB minified.
    - `git diff --check`: passed; Git still reports the existing CRLF-to-LF normalization warning for touched files.
    - `git ls-files .agents/memory`: empty.
    - Deploy: server HEAD `053255eac04eefc8222176ae701d132d913c2e6f`, local API health ok, public `https://shopclip.site/health` ok, PM2 `shopclip-ai-api` online.
    - Playwright production check: `https://shopclip.site/#project` and `https://shopclip.site/#studio` loaded with no browser errors, failed requests, or 4xx/5xx responses.
- Recent deployed cleanup at `d3d0fb9`:
  - Extracted editable Smart Edit timeline material clip selection into `selectEditableSmartEditTimelineMaterials` in `apps/web/src/features/edit/SmartEditTrackDerivedState.ts`.
  - Reused that selector from `selectEditableSmartEditTimelineMaterialIds` and from the Smart Edit panel's align-selected-materials command.
  - Removed the panel's local selected-ID `Set` and selected-track-clip filtering for alignment while keeping anchor calculation, move command dispatch, and history labels in the panel.
  - Added focused coverage in `apps/web/src/features/edit/SmartEditTrackDerivedState.test.ts` for commands that need editable clip timing data.
  - Current file sizes:
    - `SmartEditPanel.tsx`: 3091 lines.
    - `SmartEditTrackDerivedState.ts`: 392 lines.
    - `SmartEditSegmentDerivedState.ts`: 119 lines.
    - `App.tsx`: 2818 lines.
  - Fresh verification after this pass:
    - Red test: `.\node_modules\.bin\vitest.CMD run src/features/edit/SmartEditTrackDerivedState.test.ts` failed before implementation because `selectEditableSmartEditTimelineMaterials` was not exported.
    - Targeted green test: `.\node_modules\.bin\vitest.CMD run src/features/edit/SmartEditTrackDerivedState.test.ts` passed, 11 tests.
    - `corepack pnpm lint`: passed.
    - `corepack pnpm typecheck`: passed.
    - `corepack pnpm test`: passed, 422 tests across shared/API/web.
    - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-Cvg7LqeV.js` at 605.08 kB minified.
    - `git diff --check`: passed; Git still reports the existing CRLF-to-LF normalization warning for touched files.
    - `git ls-files .agents/memory`: empty.
    - Deploy: server HEAD `d3d0fb9dcc963ac11dbd0298eec323c665a6a787`, local API health ok, public `https://shopclip.site/health` ok, PM2 `shopclip-ai-api` online.
    - Playwright production check: `https://shopclip.site/#project` and `https://shopclip.site/#studio` loaded with no browser errors, failed requests, or 4xx/5xx responses.
- Recent deployed cleanup at `2788e31`:
  - Extracted movable Smart Edit timeline material ID selection into `selectMovableSmartEditTimelineMaterialIdsOrUndefined` in `apps/web/src/features/edit/SmartEditTrackDerivedState.ts`.
  - Reused that selector in `apps/web/src/features/edit/SmartEditPanel.tsx` so the selected-track-clip move command no longer filters selected clips and maps IDs inline.
  - Kept the panel responsible for plan guards, timeline edit mode, playhead context, and command history labels.
  - Added focused coverage in `apps/web/src/features/edit/SmartEditTrackDerivedState.test.ts` for movable standalone materials, scene material exclusion, locked track exclusion, and no-movable-selection fallback.
  - Current file sizes:
    - `SmartEditPanel.tsx`: 3090 lines.
    - `SmartEditTrackDerivedState.ts`: 387 lines.
    - `SmartEditSegmentDerivedState.ts`: 119 lines.
    - `App.tsx`: 2818 lines.
  - Fresh verification after this pass:
    - Red test: `.\node_modules\.bin\vitest.CMD run src/features/edit/SmartEditTrackDerivedState.test.ts` failed before implementation because `selectMovableSmartEditTimelineMaterialIdsOrUndefined` was not exported.
    - Targeted green test: `.\node_modules\.bin\vitest.CMD run src/features/edit/SmartEditTrackDerivedState.test.ts` passed, 10 tests.
    - `corepack pnpm lint`: passed.
    - `corepack pnpm typecheck`: passed.
    - `corepack pnpm test`: passed, 421 tests across shared/API/web.
    - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-Bn8uVKGg.js` at 605.10 kB minified.
    - `git diff --check`: passed; Git still reports the existing CRLF-to-LF normalization warning for touched files.
    - `git ls-files .agents/memory`: empty.
    - Deploy: server HEAD `2788e3121df67214b7464134b4ab56af6b5c522a`, local API health ok, public `https://shopclip.site/health` ok, PM2 `shopclip-ai-api` online.
    - Playwright production check: `https://shopclip.site/#project` and `https://shopclip.site/#studio` loaded with no browser errors, failed requests, or 4xx/5xx responses.
- Recent deployed cleanup at `69a55e3`:
  - Extracted selected Smart Edit segment batch-update logic into `updateSelectedSmartEditSegments` in `apps/web/src/features/edit/SmartEditSegmentDerivedState.ts`.
  - Reused that helper in `apps/web/src/features/edit/SmartEditPanel.tsx` so the panel no longer builds the selected ID `Set` and maps `plan.segments` inline for batch edits.
  - Kept the panel responsible for plan guards, rebuilt timeline wrapping, and command history commit labels.
  - Added focused coverage in `apps/web/src/features/edit/SmartEditSegmentDerivedState.test.ts` for updating only selected segments and preserving the original segment list for empty batch selection.
  - Current file sizes:
    - `SmartEditPanel.tsx`: 3088 lines.
    - `SmartEditSegmentDerivedState.ts`: 119 lines.
    - `SmartEditTrackDerivedState.ts`: 381 lines.
    - `App.tsx`: 2818 lines.
  - Fresh verification after this pass:
    - Red test: `.\node_modules\.bin\vitest.CMD run src/features/edit/SmartEditSegmentDerivedState.test.ts` failed before implementation because `updateSelectedSmartEditSegments` was not exported.
    - Targeted green test: `.\node_modules\.bin\vitest.CMD run src/features/edit/SmartEditSegmentDerivedState.test.ts` passed, 10 tests.
    - `corepack pnpm lint`: passed.
    - `corepack pnpm typecheck`: passed.
    - `corepack pnpm test`: passed, 420 tests across shared/API/web.
    - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-CEplRwB0.js` at 605.15 kB minified.
    - `git diff --check`: passed; Git still reports the existing CRLF-to-LF normalization warning for touched files.
    - `git ls-files .agents/memory`: empty.
    - Deploy: server HEAD `69a55e3b6f2bae8a78501521ede0f8f8b71b43fe`, local API health ok, public `https://shopclip.site/health` ok, PM2 `shopclip-ai-api` online.
    - Playwright production check: `https://shopclip.site/#project` and `https://shopclip.site/#studio` loaded with no browser errors, failed requests, or 4xx/5xx responses.
- Recent deployed cleanup at `9b1d45b`:
  - Extracted selected Smart Edit segment ID fallback into `selectSmartEditSegmentIdsOrUndefined` in `apps/web/src/features/edit/SmartEditSegmentDerivedState.ts`.
  - Reused that selector in `apps/web/src/features/edit/SmartEditPanel.tsx` for duplicate-selected-segments and paste-selected-segments-at-playhead command guards.
  - Kept the remaining `selectedBatchSegments` membership `Set` logic local because it is a different update-filtering use case.
  - Added focused coverage in `apps/web/src/features/edit/SmartEditSegmentDerivedState.test.ts` for non-empty ID selection and empty batch fallback.
  - Current file sizes:
    - `SmartEditPanel.tsx`: 3088 lines.
    - `SmartEditSegmentDerivedState.ts`: 106 lines.
    - `SmartEditTrackDerivedState.ts`: 381 lines.
    - `App.tsx`: 2818 lines.
  - Fresh verification after this pass:
    - Red test: `.\node_modules\.bin\vitest.CMD run src/features/edit/SmartEditSegmentDerivedState.test.ts` failed before implementation because `selectSmartEditSegmentIdsOrUndefined` was not exported.
    - Targeted green test: `.\node_modules\.bin\vitest.CMD run src/features/edit/SmartEditSegmentDerivedState.test.ts` passed, 8 tests.
    - `corepack pnpm lint`: passed.
    - `corepack pnpm typecheck`: passed.
    - `corepack pnpm test`: passed, 418 tests across shared/API/web.
    - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-B6g6IBdm.js` at 605.11 kB minified.
    - `git diff --check`: passed; Git still reports the existing CRLF-to-LF normalization warning for touched files.
    - `git ls-files .agents/memory`: empty.
    - Deploy: server HEAD `9b1d45b788cc27a851f0082dce9ca23a9402504e`, local API health ok, public `https://shopclip.site/health` ok, PM2 `shopclip-ai-api` online.
    - Playwright production check: `https://shopclip.site/#project` and `https://shopclip.site/#studio` loaded with no browser errors, failed requests, or 4xx/5xx responses.
- Recent deployed cleanup at `f9161ef`:
  - Extracted editable timeline material ID fallback into `selectEditableSmartEditTimelineMaterialIdsOrUndefined` in `apps/web/src/features/edit/SmartEditTrackDerivedState.ts`.
  - Reused that selector from `selectSmartEditClipboardCopySelection` and the Smart Edit panel's timeline material commands.
  - Added focused coverage in `apps/web/src/features/edit/SmartEditTrackDerivedState.test.ts` for editable standalone materials, scene material exclusion, locked track exclusion, and empty selection fallback.
  - Current file sizes:
    - `SmartEditPanel.tsx`: 3081 lines.
    - `SmartEditTrackDerivedState.ts`: 381 lines.
    - `App.tsx`: 2818 lines.
  - Fresh verification after this pass:
    - Red test: `.\node_modules\.bin\vitest.CMD run src/features/edit/SmartEditTrackDerivedState.test.ts` failed before implementation because `selectEditableSmartEditTimelineMaterialIdsOrUndefined` was not exported.
    - Targeted green test: `.\node_modules\.bin\vitest.CMD run src/features/edit/SmartEditTrackDerivedState.test.ts` passed, 9 tests.
    - `corepack pnpm lint`: passed.
    - `corepack pnpm typecheck`: passed.
    - `corepack pnpm test`: passed, 417 tests across shared/API/web.
    - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-BXsg9z5R.js` at 605.07 kB minified.
    - `git diff --check`: passed; Git still reports the existing CRLF-to-LF normalization warning for touched files.
    - `git ls-files .agents/memory`: empty.
    - Deploy: server HEAD `f9161ef572b4948c9a0375bcc7e2cd6decc9105a`, local API health ok, public `https://shopclip.site/health` ok, PM2 `shopclip-ai-api` online.
    - Playwright production check: `https://shopclip.site/#project` and `https://shopclip.site/#studio` loaded with no browser errors, failed requests, or 4xx/5xx responses.
- Recent deployed cleanup at `1863fddf`:
  - Extracted reusable Smart Edit selection helpers into `apps/web/src/features/edit/SmartEditSelectionUtils.ts`.
  - Replaced repeated inline ordered-selection filtering/toggle logic in `apps/web/src/features/edit/SmartEditPanel.tsx`.
  - Added focused tests in `apps/web/src/features/edit/SmartEditSelectionUtils.test.ts`.
  - Continued consolidating Smart Edit track-clip selection state updates in `apps/web/src/features/edit/SmartEditPanel.tsx`.
  - Added local helpers for segment selection updates so repeated `setSelectedSegmentIds` and `onSelectedSegmentChange` pairs now share one path.
  - Added a local guard helper for selected editable timeline material IDs so timeline material commands share the same empty-selection return path.
  - Moved selected-segment reorder handlers and preview segment label derivation out of JSX props into named local values.
  - Moved Smart Edit keyboard shortcut dispatch out of the JSX `onKeyDown` prop into a named local handler.
  - `SmartEditPanel.tsx`: 3103 lines after the follow-up.
  - `App.tsx`: 2871 lines.
  - `router.ts`: 2325 lines.
  - Verification for the follow-up: `corepack pnpm --filter @shopclip/web typecheck`, `corepack pnpm --filter @shopclip/web lint`, and `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx` all passed during incremental checks.
  - Verification for this local selection-helper cleanup: `corepack pnpm --filter @shopclip/web test -- src/features/edit/SmartEditSelectionUtils.test.ts`, `corepack pnpm --filter @shopclip/web typecheck`, and `corepack pnpm --filter @shopclip/web lint` all passed.
  - Full local gate for this cleanup: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`, `corepack pnpm build`, `git diff --check`, and `git ls-files .agents/memory` passed. An initial full `corepack pnpm test` run hit a transient Windows temp-file lock in `realMediaProcessing.test.ts`; the targeted rerun and subsequent full rerun both passed. The build still reports the existing Vite chunk-size warning, now for `assets/index-D59HmPy1.js` at 604.01 kB minified.
- Recent deployed cleanup at `d1c41be3`:
  - Extracted offset-based segment navigation into `selectSmartEditSegmentIdByOffset` in `apps/web/src/features/edit/SmartEditSegmentDerivedState.ts`.
  - Added focused tests in `apps/web/src/features/edit/SmartEditSegmentDerivedState.test.ts`.
  - Stabilized `apps/api/src/modules/media/realMediaProcessing.test.ts` by using a smaller real ffmpeg fixture, adding realistic per-test timeout, and retrying Windows temp-directory cleanup on transient `EBUSY`.
  - `SmartEditPanel.tsx`: 3102 lines after the follow-up.
  - Verification for this local segment-derived-state cleanup: `corepack pnpm --filter @shopclip/web test -- src/features/edit/SmartEditSegmentDerivedState.test.ts src/features/edit/SmartEditSelectionUtils.test.ts`, `corepack pnpm --filter @shopclip/web typecheck`, and `corepack pnpm --filter @shopclip/web lint` all passed.
  - Verification for the real media test stability fix: `corepack pnpm --filter @shopclip/api test -- src/modules/media/realMediaProcessing.test.ts`, `corepack pnpm --filter @shopclip/api typecheck`, and `corepack pnpm --filter @shopclip/api lint` all passed.
  - Full local gate for this cleanup: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`, `corepack pnpm build`, `git diff --check`, and `git ls-files .agents/memory` passed. The build still reports the existing Vite chunk-size warning, now for `assets/index-Cg07RHC7.js` at 604.12 kB minified.
- Recent deployed cleanup at `3290baa6`:
  - Extracted selected-segment preview labels into `smartEditPreviewSegmentLabel` in `apps/web/src/features/edit/SmartEditSegmentDerivedState.ts`.
  - Extracted selected-segment asset-slice filtering into `selectSmartEditAssetSlicesForSegment`.
  - Added focused tests for preview labels and selected asset slices in `apps/web/src/features/edit/SmartEditSegmentDerivedState.test.ts`.
  - `SmartEditPanel.tsx`: 3099 lines after the follow-up.
  - Verification for this local derived-state cleanup: `corepack pnpm --filter @shopclip/web test -- src/features/edit/SmartEditSegmentDerivedState.test.ts`, `corepack pnpm --filter @shopclip/web typecheck`, and `corepack pnpm --filter @shopclip/web lint` all passed.
  - Full local gate for this cleanup: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`, `corepack pnpm build`, `git diff --check`, and `git ls-files .agents/memory` passed. The build still reports the existing Vite chunk-size warning, now for `assets/index-DHMi_bSY.js` at 604.15 kB minified.
- Recent deployed cleanup at `97ed769b`:
  - Extracted selected text timeline material counting into `smartEditTimelineTextMaterialCount` and `hasSmartEditTimelineTextMaterials` in `apps/web/src/features/edit/SmartEditTrackDerivedState.ts`.
  - Added focused tests in `apps/web/src/features/edit/SmartEditTrackDerivedState.test.ts`.
  - `SmartEditPanel.tsx`: 3098 lines after the follow-up.
  - Verification for this local track-derived-state cleanup: `corepack pnpm --filter @shopclip/web test -- src/features/edit/SmartEditTrackDerivedState.test.ts src/features/edit/SmartEditSegmentDerivedState.test.ts`, `corepack pnpm --filter @shopclip/web typecheck`, and `corepack pnpm --filter @shopclip/web lint` all passed.
  - Full local gate for this cleanup: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`, `corepack pnpm build`, `git diff --check`, and `git ls-files .agents/memory` passed. The build still reports the existing Vite chunk-size warning, now for `assets/index-DydsKih6.js` at 604.16 kB minified.
- Recent deployed cleanup at `2573dce4`:
  - Extracted command-history label formatting into `formatSmartEditCommandHistoryLabel` in `apps/web/src/features/edit/SmartEditCommandHistory.ts`.
  - Re-exported the formatter through `apps/web/src/features/edit/SmartEditTimelineOperations.ts`.
  - Added focused tests in `apps/web/src/features/edit/SmartEditCommandHistory.test.ts`.
  - `SmartEditPanel.tsx`: 3098 lines after the follow-up.
  - Verification for this local command-history cleanup: `corepack pnpm --filter @shopclip/web test -- src/features/edit/SmartEditCommandHistory.test.ts`, `corepack pnpm --filter @shopclip/web typecheck`, and `corepack pnpm --filter @shopclip/web lint` all passed.
  - Full local gate for this cleanup: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`, `corepack pnpm build`, `git diff --check`, and `git ls-files .agents/memory` passed. The build still reports the existing Vite chunk-size warning, now for `assets/index-BA__XTub.js` at 604.17 kB minified.
- Recent deployed cleanup at `7cea59cf`:
  - Extracted current background task target derivation from `apps/web/src/app/App.tsx` into `selectCurrentBackgroundTaskTarget` in `apps/web/src/app/AppWorkspaceDerivedState.ts`.
  - Added focused coverage in `apps/web/src/app/AppWorkspaceDerivedState.test.ts` for project-page tab targeting, non-project tab removal, and project studio flow targeting.
  - Verification for this local App derived-state cleanup: `corepack pnpm --filter @shopclip/web test -- src/app/AppWorkspaceDerivedState.test.ts`, `corepack pnpm --filter @shopclip/web typecheck`, and `corepack pnpm --filter @shopclip/web lint` all passed.
  - Full local gate for this cleanup: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`, `corepack pnpm build`, `git diff --check`, and `git ls-files .agents/memory` passed. The build still reports the existing Vite chunk-size warning, now for `assets/index-CphaHgzv.js` at 604.31 kB minified.
- Recent deployed cleanup at `885ce686`:
  - Extracted workspace scene selection from `apps/web/src/app/App.tsx` into `selectWorkspaceScenes` in `apps/web/src/app/AppWorkspaceDerivedState.ts`.
  - Added focused coverage in `apps/web/src/app/AppWorkspaceDerivedState.test.ts` for active-script scene priority, project-scene fallback, and empty-state fallback.
  - Verification for this local App scene-selector cleanup: `corepack pnpm --filter @shopclip/web test -- src/app/AppWorkspaceDerivedState.test.ts`, `corepack pnpm --filter @shopclip/web typecheck`, and `corepack pnpm --filter @shopclip/web lint` all passed.
  - Full local gate for this cleanup: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`, `corepack pnpm build`, `git diff --check`, and `git ls-files .agents/memory` passed. The build still reports the existing Vite chunk-size warning, now for `assets/index-o8j_qiiU.js` at 604.32 kB minified.
- Recent deployed cleanup at `dce67bfd`:
  - Extracted completed render scene-clip to Smart Edit segment override mapping from `apps/web/src/app/App.tsx` into `selectRenderedSmartEditSceneSegments` in `apps/web/src/app/AppWorkspaceDerivedState.ts`.
  - Added focused coverage in `apps/web/src/app/AppWorkspaceDerivedState.test.ts` for clip filtering, material subtitle/audio/video propagation, scene duration/voiceover fallback, existing Smart Edit result guard, and incomplete render guard.
  - Verification for this local Smart Edit request cleanup: `corepack pnpm --filter @shopclip/web test -- src/app/AppWorkspaceDerivedState.test.ts`, `corepack pnpm --filter @shopclip/web typecheck`, and `corepack pnpm --filter @shopclip/web lint` all passed.
  - Full local gate for this cleanup: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`, `corepack pnpm build`, `git diff --check`, and `git ls-files .agents/memory` passed. The build still reports the existing Vite chunk-size warning, now for `assets/index-DMufcPRS.js` at 604.34 kB minified.
- Recent deployed cleanup at `e5debcaa`:
  - Extracted active Smart Edit plan segment to request override mapping from `apps/web/src/app/App.tsx` into `selectSmartEditPlanSegmentOverrides` in `apps/web/src/app/AppWorkspaceDerivedState.ts`.
  - Added focused coverage in `apps/web/src/app/AppWorkspaceDerivedState.test.ts` for editable segment field propagation, omission of non-request plan fields, and undefined fallback when no plan is active.
  - Verification for this local Smart Edit plan override cleanup: `corepack pnpm --filter @shopclip/web test -- src/app/AppWorkspaceDerivedState.test.ts`, `corepack pnpm --filter @shopclip/web typecheck`, and `corepack pnpm --filter @shopclip/web lint` all passed.
  - Full local gate for this cleanup: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`, `corepack pnpm build`, `git diff --check`, and `git ls-files .agents/memory` passed. The build still reports the existing Vite chunk-size warning, now for `assets/index-CXfI_BoO.js` at 604.35 kB minified.
- Recent deployed cleanup at `9278a846`:
  - Moved Smart Edit request segment selectors out of `apps/web/src/app/AppWorkspaceDerivedState.ts` into the dedicated `apps/web/src/app/AppSmartEditRequest.ts` module.
  - Split the corresponding tests from `apps/web/src/app/AppWorkspaceDerivedState.test.ts` into `apps/web/src/app/AppSmartEditRequest.test.ts`, leaving workspace-derived-state tests focused on workspace/page selectors.
  - Verification for this local Smart Edit request module cleanup: `corepack pnpm --filter @shopclip/web test -- src/app/AppSmartEditRequest.test.ts src/app/AppWorkspaceDerivedState.test.ts`, `corepack pnpm --filter @shopclip/web typecheck`, and `corepack pnpm --filter @shopclip/web lint` all passed.
  - Full local gate for this cleanup: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`, `corepack pnpm build`, `git diff --check`, and `git ls-files .agents/memory` passed. The build still reports the existing Vite chunk-size warning, now for `assets/index-fXfWNSVo.js` at 604.35 kB minified.
- Recent deployed cleanup at `30205d94`:
  - Extracted full Smart Edit request payload assembly from `apps/web/src/app/App.tsx` into `createSmartEditRequestPayload` in `apps/web/src/app/AppSmartEditRequest.ts`.
  - Added request-level coverage in `apps/web/src/app/AppSmartEditRequest.test.ts` for rendered segment fallback, active plan override priority, locale selection, instruction empty fallback, and target-language trimming.
  - Verification for this local Smart Edit request payload cleanup: `corepack pnpm --filter @shopclip/web test -- src/app/AppSmartEditRequest.test.ts src/app/AppWorkspaceDerivedState.test.ts`, `corepack pnpm --filter @shopclip/web typecheck`, and `corepack pnpm --filter @shopclip/web lint` all passed.
  - Full local gate for this cleanup: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`, `corepack pnpm build`, `git diff --check`, and `git ls-files .agents/memory` passed. The build still reports the existing Vite chunk-size warning, now for `assets/index-BjmEquNf.js` at 604.62 kB minified.
- Recent deployed cleanup at `afe318e`:
  - Extracted Seedance per-scene duration validation from `apps/web/src/app/App.tsx` into `selectInvalidSeedanceSceneDuration` in `apps/web/src/app/AppRenderUtils.ts`.
  - Added focused boundary coverage in `apps/web/src/app/AppRenderUtils.test.ts` for empty scene lists, valid 4s and 12s limits, below-limit scenes, above-limit scenes, and first-invalid-scene selection.
  - Verification for this local render-utils cleanup: `corepack pnpm --filter @shopclip/web test -- src/app/AppRenderUtils.test.ts src/app/App.test.tsx`, `corepack pnpm --filter @shopclip/web typecheck`, and `corepack pnpm --filter @shopclip/web lint` all passed.
  - Full local gate for this cleanup: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`, `corepack pnpm build`, `git diff --check`, and `git ls-files .agents/memory` passed. The build still reports the existing Vite chunk-size warning, now for `assets/index-DlZ85_rg.js` at 604.63 kB minified.
  - Production verification after deployment:
    - Server HEAD: `afe318ef9b1db7ba8ba7478c63fc45c460c5b50a`.
    - Server API health and `https://shopclip.site/health`: returned `status: ok`.
    - `https://shopclip.site/#project` and `https://shopclip.site/#studio`: loaded without browser console errors, failed requests, or 4xx/5xx responses.
- Recent deployed cleanup at `85f95af`:
  - Extracted Smart Edit timeline bookmark add/remove logic from `apps/web/src/features/edit/SmartEditPanel.tsx` into `apps/web/src/features/edit/SmartEditTimelineBookmarks.ts`.
  - Added focused coverage in `apps/web/src/features/edit/SmartEditTimelineBookmarks.test.ts` for sorted insertion with formatted labels, near-duplicate prevention, nearest-bookmark removal, and empty removal no-op behavior.
  - `SmartEditPanel.tsx`: 3085 lines after this follow-up.
  - Verification for this local bookmark cleanup: `corepack pnpm --filter @shopclip/web test -- src/features/edit/SmartEditTimelineBookmarks.test.ts src/app/App.test.tsx`, `corepack pnpm --filter @shopclip/web typecheck`, and `corepack pnpm --filter @shopclip/web lint` all passed.
  - Full local gate for this cleanup: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`, `corepack pnpm build`, `git diff --check`, and `git ls-files .agents/memory` passed. The build still reports the existing Vite chunk-size warning, now for `assets/index-BM5x0BZe.js` at 604.77 kB minified.
  - Production verification after deployment:
    - Server HEAD: `85f95af7d6a0459ca42e32e45a7ac9fb6b5b3ef9`.
    - Server API health and `https://shopclip.site/health`: returned `status: ok`.
    - `https://shopclip.site/#project` and `https://shopclip.site/#studio`: loaded without browser console errors, failed requests, or 4xx/5xx responses.
- Recent deployed cleanup at `8f4e897`:
  - Extracted Smart Edit rendered-scene materialization target selection and newly materialized timeline element selection from `apps/web/src/features/edit/SmartEditPanel.tsx` into `apps/web/src/features/edit/SmartEditMaterialization.ts`.
  - Added focused coverage in `apps/web/src/features/edit/SmartEditMaterialization.test.ts` for selected-materializable priority, all-materializable fallback, empty selection fallback, token-suffixed timeline element selection, and absent timeline fallback.
  - `SmartEditPanel.tsx`: 3086 lines after this follow-up.
  - Verification for this local materialization cleanup: `corepack pnpm --filter @shopclip/web test -- src/features/edit/SmartEditMaterialization.test.ts src/app/App.test.tsx`, `corepack pnpm --filter @shopclip/web typecheck`, and `corepack pnpm --filter @shopclip/web lint` all passed.
  - Full local gate for this cleanup: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`, `corepack pnpm build`, `git diff --check`, and `git ls-files .agents/memory` passed. The build still reports the existing Vite chunk-size warning, now for `assets/index-CiSf-uAp.js` at 604.93 kB minified.
  - Production verification after deployment:
    - Server HEAD: `8f4e897b5ace517488fcc49c112638b157511e61`.
    - Server API health and `https://shopclip.site/health`: returned `status: ok`.
    - `https://shopclip.site/#project` and `https://shopclip.site/#studio`: loaded without browser console errors, failed requests, or 4xx/5xx responses.
- Recent deployed cleanup at `2bd6f28`:
  - Extracted Smart Edit batch timeline-material removal eligibility and selected-material alignment anchor calculation from `apps/web/src/features/edit/SmartEditPanel.tsx` into `apps/web/src/features/edit/SmartEditTrackDerivedState.ts`.
  - Added focused coverage in `apps/web/src/features/edit/SmartEditTrackDerivedState.test.ts` for removable standalone material batches, scene/locked/single-selection guards, start-anchor selection, snapped end-anchor selection, and empty-selection fallback.
  - `SmartEditPanel.tsx`: 3086 lines after this follow-up.
  - Verification for this local track-derived-state cleanup: `corepack pnpm --filter @shopclip/web test -- src/features/edit/SmartEditTrackDerivedState.test.ts src/app/App.test.tsx`, `corepack pnpm --filter @shopclip/web typecheck`, and `corepack pnpm --filter @shopclip/web lint` all passed.
  - Full local gate for this cleanup: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`, `corepack pnpm build`, `git diff --check`, and `git ls-files .agents/memory` passed. The build still reports the existing Vite chunk-size warning, now for `assets/index-CdulQu6Q.js` at 605.08 kB minified.
  - Production verification after deployment:
    - Server HEAD: `2bd6f281a85f492a98d24789cc69167aa11c2b9d`.
    - Server API health and `https://shopclip.site/health`: returned `status: ok`.
    - `https://shopclip.site/#project` and `https://shopclip.site/#studio`: loaded without browser console errors, failed requests, or 4xx/5xx responses.
- Recent deployed cleanup at `0b2e731`:
  - Extracted repeated Smart Edit keyframe upsert filtering/sorting logic from `apps/web/src/features/edit/SmartEditPanel.tsx` into `upsertSmartEditKeyframeAtTime` in `apps/web/src/features/edit/SmartEditSegmentUtils.ts`.
  - Reused the helper for visual transform keyframes, visual effect amount keyframes, segment audio volume keyframes, and standalone timeline element audio volume keyframes.
  - Added focused coverage in `apps/web/src/features/edit/SmartEditSegmentUtils.test.ts` for sorted insertion and near-time keyframe replacement.
  - `SmartEditPanel.tsx`: 3079 lines after this follow-up.
  - Verification for this local keyframe cleanup: `corepack pnpm --filter @shopclip/web test -- src/features/edit/SmartEditSegmentUtils.test.ts src/app/App.test.tsx`, `corepack pnpm --filter @shopclip/web typecheck`, and `corepack pnpm --filter @shopclip/web lint` all passed.
  - Full local gate for this cleanup: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`, `corepack pnpm build`, `git diff --check`, and `git ls-files .agents/memory` passed. The build still reports the existing Vite chunk-size warning, now for `assets/index-7mnE7Cm0.js` at 604.85 kB minified.
  - Production verification after deployment:
    - Server HEAD: `0b2e731d0b9b1f7f1b49a3bc8fc9f50856181f49`.
    - Server API health and `https://shopclip.site/health`: returned `status: ok`.
    - `https://shopclip.site/#project` and `https://shopclip.site/#studio`: loaded without browser console errors, failed requests, or 4xx/5xx responses.
- Recent deployed cleanup at `73b4209`:
  - Extracted Smart Edit clipboard-copy selection priority from `apps/web/src/features/edit/SmartEditPanel.tsx` into `selectSmartEditClipboardCopySelection` in `apps/web/src/features/edit/SmartEditTrackDerivedState.ts`.
  - Added focused coverage in `apps/web/src/features/edit/SmartEditTrackDerivedState.test.ts` for editable timeline-material priority, selected-segment fallback, and empty-selection no-op behavior.
  - `SmartEditPanel.tsx`: 3079 lines after this follow-up.
  - Verification for this local clipboard selector cleanup: `corepack pnpm --filter @shopclip/web test -- src/features/edit/SmartEditTrackDerivedState.test.ts src/app/App.test.tsx`, `corepack pnpm --filter @shopclip/web typecheck`, and `corepack pnpm --filter @shopclip/web lint` all passed.
  - Full local gate for this cleanup: `corepack pnpm lint`, `corepack pnpm typecheck`, `corepack pnpm test`, `corepack pnpm build`, `git diff --check`, and `git ls-files .agents/memory` passed. The build still reports the existing Vite chunk-size warning, now for `assets/index-BSQKKMnS.js` at 605.05 kB minified.
  - Production verification after deployment:
    - Server HEAD: `73b4209a3512dd1bfb8c4b182d150c791c27aec6`.
    - Server API health and `https://shopclip.site/health`: returned `status: ok`.
    - `https://shopclip.site/#project` and `https://shopclip.site/#studio`: loaded without browser console errors, failed requests, or 4xx/5xx responses.
- Remaining risks:
  - `SmartEditPanel.tsx` is still the largest frontend maintenance hotspot, even after the major split.
  - `App.tsx` still owns broad workspace orchestration.
  - `router.ts` is much smaller than the original but still has route clusters that could be split further.
  - `projects/shopclip-ai/02-development-plan.md` still contains stale/encoding-sensitive historical content; use this audit file as the accurate status source until a byte-safe rewrite is scheduled.

## Findings

- The codebase was more complete than `02-development-plan.md` indicated. Several old table entries still said `Planned`, while part files and implementation showed P0/P1 features were already built.
- Browser E2E specs were stale after the Project workspace redesign. They still expected legacy labels such as `Product setup`, `Project loaded`, `Subtitle`, `completed`, and `Create template`.
- E2E runs could accidentally route storyboard/script requests through real provider config when browser API settings were present.
- At the start of this audit pass, the largest structure risks were:
  - `apps/web/src/features/edit/SmartEditPanel.tsx`: about 11268 lines.
  - `apps/api/src/modules/projects/router.ts`: about 4588 lines.
  - `apps/web/src/app/App.tsx`: about 3832 lines.

## Fixes Applied

- Added a shared E2E `createDefaultProject` helper and updated P0/P1 specs to use the current Project workspace flow.
- Updated render tests to use valid 4-second scene duration data and current user-facing render labels.
- Updated media/retry tests to open `Advanced settings` before selecting hidden controls.
- Updated structured reference tests to use the current `Add to script library` flow and row-scoped waits.
- Added `SHOPCLIP_FORCE_MOCK_PROVIDERS=1` to the E2E server runner and backend handling so browser tests remain deterministic without changing normal provider override behavior.
- Removed unused Smart Edit local variables that caused lint failures.

## Fresh Verification

- `corepack pnpm lint`: passed.
- `corepack pnpm --filter @shopclip/api exec vitest run src/p0-flow.test.ts`: passed, 24 tests.
- `corepack pnpm --filter @shopclip/web test:e2e -- e2e/p0-flow.spec.ts`: passed, 1 test.
- `corepack pnpm --filter @shopclip/web test:e2e -- e2e/p1-flow.spec.ts`: passed, 1 test.
- `corepack pnpm --filter @shopclip/web test:e2e -- e2e/p0-flow.spec.ts e2e/p1-flow.spec.ts e2e/p1-media-flow.spec.ts e2e/part-015-structure-and-reference.spec.ts`: passed, 5 tests.
- `corepack pnpm --filter @shopclip/web test:e2e`: passed, 12 tests.
- `corepack pnpm typecheck`: passed.
- `corepack pnpm test`: passed, 365 tests across shared/API/web.
- `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning.

## Next Cleanup Order

1. Keep verification green while extracting pure helpers from `SmartEditPanel.tsx`.
2. Extract provider selection, storyboard image fallback, and render/reference helpers from `apps/api/src/modules/projects/router.ts`.
3. Split `apps/web/src/app/App.tsx` state orchestration into hooks after the feature panels and E2E suite remain stable.

## 2026-06-08 Incremental Structure Cleanup

- Extracted Smart Edit timeline math/clamp helpers from `apps/web/src/features/edit/SmartEditPanel.tsx` into `apps/web/src/features/edit/SmartEditTimelineMath.ts`.
- Moved timeline time labels, ruler ticks, snapping, and playhead pointer conversion into `SmartEditTimelineMath.ts`.
- Extracted SRT cue parsing and timestamp formatting into `apps/web/src/features/edit/SmartEditSrt.ts`.
- Extracted track ordering, synced scroll, and marquee track hit-testing into `apps/web/src/features/edit/SmartEditTrackUtils.ts`.
- Extracted Smart Edit segment normalization, media preview, visual effect helpers, audio keyframe normalization, and source trim helpers into `apps/web/src/features/edit/SmartEditSegmentUtils.ts`.
- Extracted timeline track presentation components into `apps/web/src/features/edit/SmartEditAudioKeyframeMarkers.tsx`, `apps/web/src/features/edit/SmartEditTextStyleStrip.tsx`, and `apps/web/src/features/edit/SmartEditWaveformStrip.tsx`.
- Kept the existing public import surface stable by re-exporting `smartEditTimelineKeyboardNudgeSeconds`, `playheadSecondsFromTimelinePointer`, `smartEditSyncedScrollLeft`, and `selectSmartEditTrackIdsInMarquee` from `SmartEditPanel.tsx`.
- Extracted storyboard SVG fallback generation and mock-mode fallback gating into `apps/api/src/modules/projects/storyboardFallback.ts`.
- Extracted external asset import helpers for tag normalization, MIME/content-type handling, safe filenames, and download host allow-list checks into `apps/api/src/modules/projects/externalAssetImportUtils.ts`.
- Extracted asset library category parsing and synchronized asset/slice filtering into `apps/api/src/modules/projects/assetLibraryUtils.ts`.
- Extracted Smart Edit plan utilities for readable text fallback, segment output indexing, scene clip placeholders, latest Seedance material backfill, and default Smart Edit timeline construction into `apps/api/src/modules/projects/smartEditPlanUtils.ts`.
- Left script prompt generation in `router.ts` for now because the existing prompt text contains non-ASCII user-facing model instructions; preserving prompt behavior is higher priority than a risky mechanical move.
- Current file sizes:
  - `SmartEditPanel.tsx`: 10702 lines.
  - `SmartEditTimelineMath.ts`: 174 lines.
  - `SmartEditSrt.ts`: 71 lines.
  - `SmartEditTrackUtils.ts`: 56 lines.
  - `SmartEditSegmentUtils.ts`: 277 lines.
  - `SmartEditAudioKeyframeMarkers.tsx`: 48 lines.
  - `SmartEditTextStyleStrip.tsx`: 29 lines.
  - `SmartEditWaveformStrip.tsx`: 54 lines.
  - `router.ts`: 4040 lines.
  - `storyboardFallback.ts`: 59 lines.
  - `externalAssetImportUtils.ts`: 127 lines.
  - `assetLibraryUtils.ts`: 46 lines.
  - `smartEditPlanUtils.ts`: 361 lines.
- Verification:
  - `corepack pnpm --filter @shopclip/web lint`: passed.
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`: passed, 161 tests.
  - `corepack pnpm --filter @shopclip/api lint`: passed.
  - `corepack pnpm --filter @shopclip/api typecheck`: passed.
  - `corepack pnpm --filter @shopclip/api exec vitest run src/p0-flow.test.ts`: passed, 24 tests.
  - `corepack pnpm --filter @shopclip/api exec vitest run src/external-asset-structure-flow.test.ts src/p1-flow.test.ts src/p0-flow.test.ts`: passed, 31 tests.
  - `corepack pnpm --filter @shopclip/api exec vitest run src/asset-cos-flow.test.ts src/external-asset-structure-flow.test.ts src/p1-flow.test.ts src/p0-flow.test.ts`: passed, 37 tests.
  - `corepack pnpm --filter @shopclip/api exec vitest run src/smart-edit-flow.test.ts src/seedance-render-flow.test.ts src/p0-flow.test.ts`: passed, 32 tests.
  - `corepack pnpm lint`: passed.
  - `corepack pnpm typecheck`: passed.
  - `corepack pnpm test`: passed, 365 tests.
  - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning.

## 2026-06-08 App And Test Infrastructure Cleanup

- Extracted app bootstrap/default/persistence helpers from `apps/web/src/app/App.tsx` into `apps/web/src/app/AppSetupUtils.ts`.
- Kept compatibility exports from `App.tsx` for existing tests and callers: `createAssetInputFromFile`, `createScriptGenerationRequestPayload`, `getCreationAssetLibraryRefreshCategory`, `hasActivePendingReferenceAnalysis`, and `mergeReferences`.
- Added `apps/api/src/testServer.ts` so API integration tests avoid ports blocked by `fetch`/undici. This fixed a real full-suite failure where `app.listen(0)` selected blocked port `6000`, causing `TypeError: fetch failed` before the request reached the API.
- Replaced direct `app.listen(0)` usage in API integration tests with `listenOnFetchSafePort`.
- Current file sizes:
  - `App.tsx`: 3390 lines.
  - `AppSetupUtils.ts`: 270 lines.
  - `SmartEditPanel.tsx`: 10416 lines.
  - `router.ts`: 3719 lines.
  - `testServer.ts`: 38 lines.
- Fresh verification after this pass:
  - `corepack pnpm --filter @shopclip/web lint`: passed.
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`: passed, 161 tests.
  - `corepack pnpm --filter @shopclip/api lint`: passed.
  - `corepack pnpm --filter @shopclip/api typecheck`: passed.
  - `corepack pnpm lint`: passed.
  - `corepack pnpm typecheck`: passed.
  - `corepack pnpm test`: passed, 365 tests across shared/API/web.
  - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning.

## Remaining Optimization Queue

1. Continue extracting cohesive UI subcomponents/hooks from `SmartEditPanel.tsx`; it is still the largest frontend maintenance risk.
2. Continue splitting project router responsibilities from `apps/api/src/modules/projects/router.ts`, especially prompt orchestration and long route handlers once prompt text can be moved byte-safely.
3. Split `App.tsx` state orchestration into feature hooks only after the Smart Edit and router seams stay stable under full verification.
4. Preserve the corrupted/encoding-sensitive project plan file until a byte-safe recovery step is scheduled; use this audit document as the current accurate status source.

## 2026-06-08 Smart Edit Timeline Operations Cleanup

- Extracted the Smart Edit timeline operation layer from `apps/web/src/features/edit/SmartEditPanel.tsx` into `apps/web/src/features/edit/SmartEditTimelineOperations.ts`.
- Kept the existing public Smart Edit operation exports available through `SmartEditPanel.tsx` so tests and callers that import from the panel module remain compatible.
- Moved command history, clipboard operations, segment/timeline split/trim/move/duplicate/paste logic, timeline element editing, preview range selection, track clip drag previews, and render material materialization out of the React panel file.
- Current file sizes:
  - `SmartEditPanel.tsx`: 6093 lines.
  - `SmartEditTimelineOperations.ts`: 4494 lines.
  - `App.tsx`: 3390 lines.
  - `router.ts`: 3719 lines.
- Fresh verification after this pass:
  - `corepack pnpm --filter @shopclip/web lint`: passed.
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`: passed, 161 tests.
  - `corepack pnpm lint`: passed.
  - `corepack pnpm typecheck`: passed.
  - `corepack pnpm test`: passed, 365 tests across shared/API/web.
  - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning.

## Updated Optimization Queue

1. Split `SmartEditTimelineOperations.ts` by operation domain next: segment operations, timeline element operations, command history/clipboard, and drag preview math.
2. Continue splitting project router responsibilities from `apps/api/src/modules/projects/router.ts`, especially long route handlers and prompt orchestration after a byte-safe text move is planned.
3. Split `App.tsx` state orchestration into feature hooks after the Smart Edit operation modules settle under full verification.
4. Keep the audit document as the current accurate status source until `02-development-plan.md` can be recovered or rewritten safely from a clean source.

## 2026-06-08 Timeline Operations Type And History Cleanup

- Extracted Smart Edit command history state and undo/redo helpers into `apps/web/src/features/edit/SmartEditCommandHistory.ts`.
- Extracted Smart Edit timeline operation types, drag state types, clipboard shape, and track segment view models into `apps/web/src/features/edit/SmartEditTimelineTypes.ts`.
- Kept `SmartEditTimelineOperations.ts` re-exporting the moved types/history helpers so the existing `SmartEditPanel.tsx` import surface remains stable.
- Current file sizes:
  - `SmartEditPanel.tsx`: 6093 lines.
  - `SmartEditTimelineOperations.ts`: 4352 lines.
  - `SmartEditCommandHistory.ts`: 64 lines.
  - `SmartEditTimelineTypes.ts`: 116 lines.
  - `router.ts`: 3719 lines.
- Fresh verification after this pass:
  - `corepack pnpm --filter @shopclip/web lint`: passed.
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`: passed, 161 tests.
  - `corepack pnpm lint`: passed.
  - `corepack pnpm typecheck`: passed.
  - `corepack pnpm test`: passed, 365 tests across shared/API/web.
  - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning.

## Next Optimization Queue

1. Split `SmartEditTimelineOperations.ts` into segment operations and persistent timeline element operations; those are now the largest remaining cohesive blocks.
2. Split drag preview math from `SmartEditTimelineOperations.ts` after the operation-domain split, because it depends on both segment and element movement helpers.
3. Continue reducing `apps/api/src/modules/projects/router.ts` route-handler size without moving encoding-sensitive prompt text mechanically.
4. Keep `02-development-plan.md` untouched until a clean source or byte-safe recovery plan is available.

## 2026-06-08 Segment Operations Cleanup

- Extracted Smart Edit segment-level operations into `apps/web/src/features/edit/SmartEditSegmentOperations.ts`.
- Moved timeline base construction, segment start/interval math, magnetic/insert/overwrite/ripple segment movement, segment split/trim/remove/duplicate/paste, and segment clipboard helpers out of `SmartEditTimelineOperations.ts`.
- Kept `SmartEditTimelineOperations.ts` re-exporting segment operations so `SmartEditPanel.tsx` and existing tests keep the same compatibility surface.
- Left persistent timeline element editing and drag preview math in `SmartEditTimelineOperations.ts`; those are now the next cohesive split candidates.
- Current file sizes:
  - `SmartEditPanel.tsx`: 6093 lines.
  - `SmartEditTimelineOperations.ts`: 2941 lines.
  - `SmartEditSegmentOperations.ts`: 1483 lines.
  - `SmartEditCommandHistory.ts`: 64 lines.
  - `SmartEditTimelineTypes.ts`: 116 lines.
  - `router.ts`: 3719 lines.
- Fresh verification after this pass:
  - `corepack pnpm --filter @shopclip/web lint`: passed.
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`: passed, 161 tests.
  - `corepack pnpm lint`: passed.
  - `corepack pnpm typecheck`: passed.
  - `corepack pnpm test`: passed, 365 tests across shared/API/web.
  - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning.

## Current Optimization Queue

1. Split persistent timeline element operations from `SmartEditTimelineOperations.ts`.
2. Split drag preview math from `SmartEditTimelineOperations.ts` after persistent element helpers are isolated.
3. Continue reducing `apps/api/src/modules/projects/router.ts` route-handler size while preserving encoding-sensitive prompt text.
4. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md` instead of editing it mechanically.

## 2026-06-08 Timeline Element Operations Cleanup

- Extracted persistent timeline element operations into `apps/web/src/features/edit/SmartEditTimelineElementOperations.ts`.
- Moved timeline element clipboard/cut/duplicate/paste, track updates, SRT import/export, manual voice/text/media insertion, media materialization, element split/trim/resize/slip/link/unlink, text-style updates, range selection, and multi-element move/remove operations out of `SmartEditTimelineOperations.ts`.
- Kept `SmartEditTimelineOperations.ts` re-exporting the moved functions so the existing `SmartEditPanel.tsx` import surface remains stable.
- `SmartEditTimelineOperations.ts` now mainly contains drag preview math, track clip movement, and `timelineTrackSegments`.
- Current file sizes:
  - `SmartEditPanel.tsx`: 6093 lines.
  - `SmartEditTimelineOperations.ts`: 730 lines.
  - `SmartEditTimelineElementOperations.ts`: 2293 lines.
  - `SmartEditSegmentOperations.ts`: 1483 lines.
  - `router.ts`: 3719 lines.
- Fresh verification after this pass:
  - `corepack pnpm --filter @shopclip/web lint`: passed.
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`: passed, 161 tests.
  - `corepack pnpm lint`: passed.
  - `corepack pnpm typecheck`: passed.
  - `corepack pnpm test`: passed, 365 tests across shared/API/web.
  - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning.

## Current Optimization Queue

1. Split drag preview and track clip movement out of `SmartEditTimelineOperations.ts`; that file is now small enough to become a facade or track view-model module.
2. Continue reducing `apps/api/src/modules/projects/router.ts` route-handler size while preserving encoding-sensitive prompt text.
3. Review whether `SmartEditPanel.tsx` should next be split by UI region or whether router cleanup has higher risk reduction.
4. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md` instead of editing it mechanically.

## 2026-06-08 Track Clip Operations Cleanup

- Extracted Smart Edit track clip drag/trim preview math, track clip movement, and track view-model construction into `apps/web/src/features/edit/SmartEditTrackClipOperations.ts`.
- Reduced `apps/web/src/features/edit/SmartEditTimelineOperations.ts` to a compatibility facade that re-exports command history, operation types, segment operations, timeline element operations, and track clip operations.
- Preserved existing imports from `SmartEditTimelineOperations.ts` so `SmartEditPanel.tsx` and tests do not need another import migration during this pass.
- Current file sizes:
  - `SmartEditPanel.tsx`: 6093 lines.
  - `SmartEditTimelineOperations.ts`: 107 lines.
  - `SmartEditTrackClipOperations.ts`: 631 lines.
  - `SmartEditTimelineElementOperations.ts`: 2293 lines.
  - `SmartEditSegmentOperations.ts`: 1483 lines.
  - `router.ts`: 3719 lines.
- Fresh verification after this pass:
  - `corepack pnpm --filter @shopclip/web lint`: passed.
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`: passed, 161 tests.
  - `corepack pnpm lint`: passed.
  - `corepack pnpm typecheck`: passed.
  - First parallel `corepack pnpm test` run hit a transient API media test timeout while `build` was also running; `src/modules/media/realMediaProcessing.test.ts` then passed in the API test suite.
  - Fresh non-parallel `corepack pnpm test`: passed, 365 tests across shared/API/web.
  - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Split cohesive UI regions/hooks out of `apps/web/src/features/edit/SmartEditPanel.tsx`; after the operation split, it is again the largest frontend maintenance risk.
2. Continue reducing `apps/api/src/modules/projects/router.ts` route-handler size while preserving encoding-sensitive prompt text.
3. Split `apps/web/src/app/App.tsx` state orchestration into feature hooks after Smart Edit UI and router cleanup are stable under full verification.
4. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-09 API Smart Edit Audio Filter Extraction

- Extracted Smart Edit renderer audio filter and BGM profile helpers from `apps/api/src/providers/renderer/smartEditComposer.ts` into `apps/api/src/providers/renderer/smartEditAudioFilters.ts`.
- Extracted shared ffmpeg keyframe expression helpers into `apps/api/src/providers/renderer/smartEditFfmpegExpressions.ts`.
- Added `apps/api/src/providers/renderer/smartEditAudioFilters.test.ts` covering playback-rate `atempo` splitting, fade clamping, fixed/keyframed audio volume filters, and BGM profile mapping.
- Kept segment video creation, source-audio rendering, voiceover rendering, BGM mixing, upload publishing, and high-level composer dependency orchestration inside `smartEditComposer.ts`.
- Current file sizes:
  - `smartEditComposer.ts`: 1474 lines.
  - `smartEditAudioFilters.ts`: 107 lines.
  - `smartEditAudioFilters.test.ts`: 64 lines.
  - `smartEditFfmpegExpressions.ts`: 44 lines.
  - `smartEditSubtitleOverlay.ts`: 300 lines.
  - `smartEditTimelinePlan.ts`: 316 lines.
- Fresh verification after this pass:
  - First targeted audio-helper run failed because `audioVolumeKeyframes` was not imported from the new helper module; fixed by importing it in `smartEditComposer.ts`.
  - Targeted renderer tests passed: `smartEditAudioFilters.test.ts`, `smartEditComposer.test.ts`, and `smartEditSubtitleOverlay.test.ts`, 43 tests.
  - `corepack pnpm --filter @shopclip/api typecheck`: passed.
  - `corepack pnpm --filter @shopclip/api lint`: passed.
  - `corepack pnpm --filter @shopclip/api test`: passed, 219 API tests.
  - `corepack pnpm typecheck`: passed.
  - `corepack pnpm lint`: passed.
  - `corepack pnpm test`: passed, 560 tests total.
  - `corepack pnpm build`: passed; Vite still reports the existing large chunk warning for the web bundle.

## Current Optimization Queue

1. Commit this audio-helper cleanup and documentation sync after `git diff --check` and `.agents/memory` tracking checks pass.
2. Push and deploy `codex/shopclip-optimization-cleanup` if the branch remains clean after commit.
3. Verify production after deploy with `/health`, `#project`, and `#studio`.
4. Continue backend renderer cleanup only where helper clusters have obvious ownership; next candidates are remaining segment filter assembly or temp-file path construction, not a broad composer rewrite.
5. Continue frontend module reduction only in a branch or folder that does not conflict with the user's active frontend work.
6. Recover or rewrite `02-development-plan.md` with byte-safe handling before deeper edits to the damaged legacy body.

## 2026-06-08 Track Clip Card UI Cleanup

- Extracted the repeated Smart Edit track clip JSX into `apps/web/src/features/edit/SmartEditTrackClipCard.tsx`.
- Moved clip selection classes, trim handles, waveform/audio keyframe/text-style strips, and clip pointer/context-menu wiring out of `SmartEditPanel.tsx`.
- Kept state ownership and mutation callbacks in `SmartEditPanel.tsx`; the new component is a presentational event boundary, not a new state owner.
- Current file sizes:
  - `SmartEditPanel.tsx`: 6006 lines.
  - `SmartEditTrackClipCard.tsx`: 187 lines.
  - `SmartEditTimelineOperations.ts`: 107 lines.
  - `SmartEditTrackClipOperations.ts`: 631 lines.
  - `SmartEditTimelineElementOperations.ts`: 2293 lines.
  - `SmartEditSegmentOperations.ts`: 1483 lines.
  - `router.ts`: 3719 lines.
- Fresh verification after this pass:
  - `corepack pnpm --filter @shopclip/web lint`: passed.
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`: passed, 161 tests.
  - Sequential `corepack pnpm lint`: passed.
  - Sequential `corepack pnpm typecheck`: passed.
  - Sequential `corepack pnpm test`: passed, 365 tests across shared/API/web.
  - Sequential `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Continue splitting `SmartEditPanel.tsx` by UI region: good next candidates are the timeline batch toolbar and track stack header/tools.
2. Continue reducing `apps/api/src/modules/projects/router.ts` route-handler size while preserving encoding-sensitive prompt text.
3. Split `apps/web/src/app/App.tsx` state orchestration into feature hooks after Smart Edit UI and router cleanup are stable under full verification.
4. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 Timeline Batch Toolbar UI Cleanup

- Extracted Smart Edit multi-selection toolbar rendering into `apps/web/src/features/edit/SmartEditTimelineBatchToolbar.tsx`.
- Moved the selected timeline material toolbar, selected segment toolbar, and no-selection hint out of `SmartEditPanel.tsx`.
- Kept selection state, plan mutation, and command-history ownership in `SmartEditPanel.tsx`; the new toolbar is a pure UI/action boundary.
- Current file sizes:
  - `SmartEditPanel.tsx`: 5862 lines.
  - `SmartEditTimelineBatchToolbar.tsx`: 251 lines.
  - `SmartEditTrackClipCard.tsx`: 187 lines.
  - `SmartEditTimelineOperations.ts`: 107 lines.
  - `SmartEditTrackClipOperations.ts`: 631 lines.
  - `SmartEditTimelineElementOperations.ts`: 2293 lines.
  - `SmartEditSegmentOperations.ts`: 1483 lines.
  - `router.ts`: 3719 lines.
- Fresh verification after this pass:
  - `corepack pnpm --filter @shopclip/web lint`: passed.
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`: passed, 161 tests.
  - Sequential `corepack pnpm lint`: passed.
  - Sequential `corepack pnpm typecheck`: passed.
  - Sequential `corepack pnpm test`: passed, 365 tests across shared/API/web.
  - Sequential `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Continue splitting `SmartEditPanel.tsx` by UI region; next low-risk candidate is the track stack header/tools/ruler area.
2. Continue reducing `apps/api/src/modules/projects/router.ts` route-handler size while preserving encoding-sensitive prompt text.
3. Split `apps/web/src/app/App.tsx` state orchestration into feature hooks after Smart Edit UI and router cleanup are stable under full verification.
4. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 Track Stack Header UI Cleanup

- Extracted Smart Edit track stack tools, title/header, zoom controls, bookmark controls, and track ruler row into `apps/web/src/features/edit/SmartEditTrackStackHeader.tsx`.
- Kept playhead drag state, timeline zoom state, bookmark mutation, scroll synchronization, and selected clip deletion owned by `SmartEditPanel.tsx`.
- Fixed an import cleanup miss during typecheck by restoring `Link`, `Unlink`, and `ZoomOut` where they are still used by other Smart Edit panel regions.
- Current file sizes:
  - `SmartEditPanel.tsx`: 5776 lines.
  - `SmartEditTrackStackHeader.tsx`: 190 lines.
  - `SmartEditTimelineBatchToolbar.tsx`: 251 lines.
  - `SmartEditTrackClipCard.tsx`: 187 lines.
  - `SmartEditTimelineOperations.ts`: 107 lines.
  - `SmartEditTrackClipOperations.ts`: 631 lines.
  - `SmartEditTimelineElementOperations.ts`: 2293 lines.
  - `SmartEditSegmentOperations.ts`: 1483 lines.
  - `router.ts`: 3719 lines.
- Fresh verification after this pass:
  - First `corepack pnpm --filter @shopclip/web typecheck` caught missing icon imports after extraction.
  - `corepack pnpm --filter @shopclip/web lint`: passed after restoring imports.
  - `corepack pnpm --filter @shopclip/web typecheck`: passed after restoring imports.
  - `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`: passed, 161 tests.
  - Sequential `corepack pnpm lint`: passed.
  - Sequential `corepack pnpm typecheck`: passed.
  - Sequential `corepack pnpm test`: passed, 365 tests across shared/API/web.
  - Sequential `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Continue splitting `SmartEditPanel.tsx` by UI region; next low-risk candidates are individual track rows or the legacy segment timeline strip.
2. Continue reducing `apps/api/src/modules/projects/router.ts` route-handler size while preserving encoding-sensitive prompt text.
3. Split `apps/web/src/app/App.tsx` state orchestration into feature hooks after Smart Edit UI and router cleanup are stable under full verification.
4. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 Track Row UI Cleanup

- Extracted each Smart Edit track row into `apps/web/src/features/edit/SmartEditTrackRow.tsx`.
- Moved track label controls, select-track action, mute/hide/lock buttons, lane playhead/drop/preview overlays, box-selection overlay, drag/trim ghost previews, and `SmartEditTrackClipCard` rendering out of `SmartEditPanel.tsx`.
- Kept per-track state derivation in `SmartEditPanel.tsx` for now: timeline track lookup, muted/hidden/locked fallback state, and selectable material count are still calculated before rendering the row.
- Fixed mechanical import cleanup after extraction by restoring `Check` and `Volume2`, which are still used by other panel regions, and removing the now-unused direct `SmartEditTrackClipCard` import.
- Current file sizes:
  - `SmartEditPanel.tsx`: 5652 lines.
  - `SmartEditTrackRow.tsx`: 304 lines.
  - `SmartEditTrackStackHeader.tsx`: 190 lines.
  - `SmartEditTimelineBatchToolbar.tsx`: 251 lines.
  - `SmartEditTrackClipCard.tsx`: 187 lines.
  - `SmartEditTimelineOperations.ts`: 107 lines.
  - `SmartEditTrackClipOperations.ts`: 631 lines.
  - `SmartEditTimelineElementOperations.ts`: 2293 lines.
  - `SmartEditSegmentOperations.ts`: 1483 lines.
  - `router.ts`: 3719 lines.
- Fresh verification after this pass:
  - First `corepack pnpm --filter @shopclip/web lint` caught a now-unused `SmartEditTrackClipCard` import.
  - First `corepack pnpm --filter @shopclip/web typecheck` caught missing `Check` and `Volume2` icon imports after extraction.
  - `corepack pnpm --filter @shopclip/web lint`: passed after import cleanup.
  - `corepack pnpm --filter @shopclip/web typecheck`: passed after import cleanup.
  - `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`: passed, 161 tests.
  - Sequential `corepack pnpm lint`: passed.
  - Sequential `corepack pnpm typecheck`: passed.
  - Sequential `corepack pnpm test`: passed, 365 tests across shared/API/web.
  - Sequential `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Continue splitting `SmartEditPanel.tsx` by UI region; next low-risk candidate is the legacy segment timeline strip before the track stack.
2. Continue reducing `apps/api/src/modules/projects/router.ts` route-handler size while preserving encoding-sensitive prompt text.
3. Split `apps/web/src/app/App.tsx` state orchestration into feature hooks after Smart Edit UI and router cleanup are stable under full verification.
4. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 Legacy Segment Timeline UI Cleanup

- Extracted the legacy segment timeline strip into `apps/web/src/features/edit/SmartEditLegacySegmentTimeline.tsx`.
- Moved the legacy timeline ruler, playhead, preview range, segment articles, trim handles, and empty timeline state out of `SmartEditPanel.tsx`.
- Kept segment selection, trim/move drag state, playhead drag state, and plan mutation callbacks owned by `SmartEditPanel.tsx`.
- Removed the now-unused `timelineRangeLabel` import from `SmartEditPanel.tsx`; the formatting lives with the extracted timeline component.
- Current file sizes:
  - `SmartEditPanel.tsx`: 5540 lines.
  - `SmartEditLegacySegmentTimeline.tsx`: 254 lines.
  - `SmartEditTrackRow.tsx`: 304 lines.
  - `SmartEditTrackStackHeader.tsx`: 190 lines.
  - `SmartEditTimelineBatchToolbar.tsx`: 251 lines.
  - `SmartEditTrackClipCard.tsx`: 187 lines.
  - `SmartEditTimelineOperations.ts`: 107 lines.
  - `SmartEditTrackClipOperations.ts`: 631 lines.
  - `SmartEditTimelineElementOperations.ts`: 2293 lines.
  - `SmartEditSegmentOperations.ts`: 1483 lines.
  - `router.ts`: 3719 lines.
- Fresh verification after this pass:
  - First `corepack pnpm --filter @shopclip/web lint` caught the now-unused `timelineRangeLabel` import.
  - `corepack pnpm --filter @shopclip/web lint`: passed after import cleanup.
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`: passed, 161 tests.
  - Sequential `corepack pnpm lint`: passed.
  - Sequential `corepack pnpm typecheck`: passed.
  - Sequential `corepack pnpm test`: passed, 365 tests across shared/API/web.
  - Sequential `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Review remaining `SmartEditPanel.tsx` sections for another cohesive UI extraction; likely candidates are the asset/media palette and selected segment inspector controls.
2. Continue reducing `apps/api/src/modules/projects/router.ts` route-handler size while preserving encoding-sensitive prompt text.
3. Split `apps/web/src/app/App.tsx` state orchestration into feature hooks after Smart Edit UI and router cleanup are stable under full verification.
4. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 Asset Bin UI Cleanup

- Extracted the Smart Edit asset/media bin into `apps/web/src/features/edit/SmartEditAssetBin.tsx`.
- Moved the asset tab toolbar body, clip bin list, draggable media assets, project audio tab, text/caption tab, effects tab, stickers tab, and canvas settings tab out of `SmartEditPanel.tsx`.
- Kept the OpenCut rail in `SmartEditPanel.tsx` to preserve the existing heading layout; `SmartEditAssetBin.tsx` exports the tab metadata so the rail can still share the same tab definitions.
- Kept active tab state, media settings ownership, and timeline segment selection owned by `SmartEditPanel.tsx`.
- Removed a redundant `setActiveAssetTab` prop after lint caught it as unused inside the extracted bin component.
- Current file sizes:
  - `SmartEditPanel.tsx`: 5407 lines.
  - `SmartEditAssetBin.tsx`: 208 lines.
  - `SmartEditLegacySegmentTimeline.tsx`: 254 lines.
  - `SmartEditTrackRow.tsx`: 304 lines.
  - `SmartEditTrackStackHeader.tsx`: 190 lines.
  - `SmartEditTimelineBatchToolbar.tsx`: 251 lines.
  - `SmartEditTrackClipCard.tsx`: 187 lines.
  - `SmartEditTimelineOperations.ts`: 107 lines.
  - `SmartEditTrackClipOperations.ts`: 631 lines.
  - `SmartEditTimelineElementOperations.ts`: 2293 lines.
  - `SmartEditSegmentOperations.ts`: 1483 lines.
  - `router.ts`: 3719 lines.
- Fresh verification after this pass:
  - First `corepack pnpm --filter @shopclip/web lint` caught the unused `setActiveAssetTab` prop in `SmartEditAssetBin.tsx`.
  - `corepack pnpm --filter @shopclip/web lint`: passed after prop cleanup.
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`: passed, 161 tests.
  - Sequential `corepack pnpm lint`: passed.
  - Sequential `corepack pnpm typecheck`: passed.
  - Sequential `corepack pnpm test`: passed, 365 tests across shared/API/web.
  - Sequential `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Review remaining `SmartEditPanel.tsx` inspector and preview sections for cohesive extraction; the selected segment inspector controls are now the largest frontend UI block.
2. Continue reducing `apps/api/src/modules/projects/router.ts` route-handler size while preserving encoding-sensitive prompt text.
3. Split `apps/web/src/app/App.tsx` state orchestration into feature hooks after Smart Edit UI and router cleanup are stable under full verification.
4. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 Preview Pane UI Cleanup

- Extracted the Smart Edit preview pane into `apps/web/src/features/edit/SmartEditPreviewPane.tsx`.
- Moved the render preview video, timeline preview clock controls, transform nudge overlay, and live selected-segment preview out of `SmartEditPanel.tsx`.
- Kept playback timing, playhead synchronization, preview range loop state, transform mutation, and selected segment/media derivation owned by `SmartEditPanel.tsx`.
- Current file sizes:
  - `SmartEditPanel.tsx`: 5304 lines.
  - `SmartEditPreviewPane.tsx`: 182 lines.
  - `SmartEditAssetBin.tsx`: 208 lines.
  - `SmartEditLegacySegmentTimeline.tsx`: 254 lines.
  - `SmartEditTrackRow.tsx`: 304 lines.
  - `SmartEditTrackStackHeader.tsx`: 190 lines.
  - `SmartEditTimelineBatchToolbar.tsx`: 251 lines.
  - `SmartEditTrackClipCard.tsx`: 187 lines.
  - `SmartEditTimelineOperations.ts`: 107 lines.
  - `SmartEditTrackClipOperations.ts`: 631 lines.
  - `SmartEditTimelineElementOperations.ts`: 2293 lines.
  - `SmartEditSegmentOperations.ts`: 1483 lines.
  - `App.tsx`: 3390 lines.
  - `router.ts`: 3719 lines.
- Fresh verification after this pass:
  - `corepack pnpm --filter @shopclip/web lint`: passed.
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`: passed, 161 tests.
  - Sequential `corepack pnpm lint`: passed.
  - Sequential `corepack pnpm typecheck`: passed.
  - Sequential `corepack pnpm test`: passed, 365 tests across shared/API/web.
  - Sequential `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning.

## Current Optimization Queue

1. Continue splitting `SmartEditPanel.tsx` by cohesive UI region; the selected segment inspector controls are now the largest remaining frontend panel block.
2. Continue reducing `apps/api/src/modules/projects/router.ts` route-handler size while preserving encoding-sensitive prompt text.
3. Split `apps/web/src/app/App.tsx` state orchestration into feature hooks after Smart Edit UI and router cleanup are stable under full verification.
4. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 Selected Segment Timing Inspector Cleanup

- Extracted the selected segment action row and timing/source form into `apps/web/src/features/edit/SmartEditSelectedSegmentTimingInspector.tsx`.
- Moved clip order actions, split/copy/duplicate/delete actions, detach-video action, duration/start/speed/source trim controls, transition selection, asset reassignment, and slice selection out of `SmartEditPanel.tsx`.
- Kept plan commit ownership, command-history ownership, selected segment state, and timeline mutation callbacks in `SmartEditPanel.tsx`; the new component remains a UI/form boundary.
- Current file sizes:
  - `SmartEditPanel.tsx`: 5048 lines.
  - `SmartEditSelectedSegmentTimingInspector.tsx`: 320 lines.
  - `SmartEditPreviewPane.tsx`: 182 lines.
  - `SmartEditAssetBin.tsx`: 208 lines.
  - `SmartEditLegacySegmentTimeline.tsx`: 254 lines.
  - `SmartEditTrackRow.tsx`: 304 lines.
  - `SmartEditTrackStackHeader.tsx`: 190 lines.
  - `SmartEditTimelineBatchToolbar.tsx`: 251 lines.
  - `SmartEditTrackClipCard.tsx`: 187 lines.
  - `App.tsx`: 3390 lines.
  - `router.ts`: 3719 lines.
- Fresh verification after this pass:
  - First `corepack pnpm --filter @shopclip/web lint` caught stale `durationFromSourceRange` and `MAX_SMART_EDIT_CLIP_SECONDS` imports in `SmartEditPanel.tsx`.
  - `corepack pnpm --filter @shopclip/web lint`: passed after import cleanup.
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`: passed, 161 tests.
  - Sequential `corepack pnpm lint`: passed.
  - Sequential `corepack pnpm typecheck`: passed.
  - Sequential `corepack pnpm test`: passed, 365 tests across shared/API/web.
  - Sequential `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning.

## Current Optimization Queue

1. Continue splitting the remaining selected segment inspector sections in `SmartEditPanel.tsx`: visual transform, advanced effects, visual mask/keyframes, audio envelopes, copy/voice, and state.
2. Continue reducing `apps/api/src/modules/projects/router.ts` route-handler size while preserving encoding-sensitive prompt text.
3. Split `apps/web/src/app/App.tsx` state orchestration into feature hooks after Smart Edit UI and router cleanup are stable under full verification.
4. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 Selected Segment Transform Inspector Cleanup

- Extracted the selected segment visual transform form into `apps/web/src/features/edit/SmartEditSelectedSegmentTransformInspector.tsx`.
- Moved scale, rotation, offset X/Y, and opacity controls out of `SmartEditPanel.tsx`.
- Kept selected segment state and mutation ownership in `SmartEditPanel.tsx`; the new component receives `updateSelectedSegment` as a callback boundary.
- Current file sizes:
  - `SmartEditPanel.tsx`: 4950 lines.
  - `SmartEditSelectedSegmentTransformInspector.tsx`: 122 lines.
  - `SmartEditSelectedSegmentTimingInspector.tsx`: 320 lines.
  - `SmartEditPreviewPane.tsx`: 182 lines.
  - `App.tsx`: 3390 lines.
  - `router.ts`: 3719 lines.
- Fresh verification after this pass:
  - First `corepack pnpm --filter @shopclip/web lint` caught stale `clampOpacity`, `clampRotationDegrees`, and `clampTransformScale` imports in `SmartEditPanel.tsx`.
  - `corepack pnpm --filter @shopclip/web lint`: passed after import cleanup.
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`: passed, 161 tests.
  - Sequential `corepack pnpm lint`: passed.
  - Sequential `corepack pnpm typecheck`: passed.
  - Sequential `corepack pnpm test`: passed, 365 tests across shared/API/web.
  - Sequential `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Continue splitting the remaining selected segment inspector sections in `SmartEditPanel.tsx`: advanced effects, visual mask/keyframes, audio envelopes, copy/voice, and state.
2. Continue reducing `apps/api/src/modules/projects/router.ts` route-handler size while preserving encoding-sensitive prompt text.
3. Split `apps/web/src/app/App.tsx` state orchestration into feature hooks after Smart Edit UI and router cleanup are stable under full verification.
4. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 Selected Segment Copy And State Inspector Cleanup

- Extracted the selected segment copy/voice and state controls into `apps/web/src/features/edit/SmartEditSelectedSegmentCopyStateInspector.tsx`.
- Moved subtitle, voiceover, caption start, voiceover start, enabled, and caption visibility controls out of `SmartEditPanel.tsx`.
- Kept selected segment state and mutation ownership in `SmartEditPanel.tsx`; the new component receives `updateSelectedSegment` as a callback boundary.
- Current file sizes:
  - `SmartEditPanel.tsx`: 4858 lines.
  - `SmartEditSelectedSegmentCopyStateInspector.tsx`: 117 lines.
  - `SmartEditSelectedSegmentTransformInspector.tsx`: 122 lines.
  - `SmartEditSelectedSegmentTimingInspector.tsx`: 320 lines.
  - `SmartEditPreviewPane.tsx`: 182 lines.
  - `App.tsx`: 3390 lines.
  - `router.ts`: 3719 lines.
- Fresh verification after this pass:
  - `corepack pnpm --filter @shopclip/web lint`: passed.
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`: passed, 161 tests.
  - Sequential `corepack pnpm lint`: passed.
  - Sequential `corepack pnpm typecheck`: passed.
  - Sequential `corepack pnpm test`: passed, 365 tests across shared/API/web.
  - Sequential `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Continue splitting the remaining selected segment inspector sections in `SmartEditPanel.tsx`: advanced effects, visual mask/keyframes, and audio envelopes.
2. Continue reducing `apps/api/src/modules/projects/router.ts` route-handler size while preserving encoding-sensitive prompt text.
3. Split `apps/web/src/app/App.tsx` state orchestration into feature hooks after Smart Edit UI and router cleanup are stable under full verification.
4. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 Selected Segment Audio Envelope Inspector Cleanup

- Extracted selected segment source-audio and voiceover volume envelope controls into `apps/web/src/features/edit/SmartEditSelectedSegmentAudioEnvelopeInspector.tsx`.
- Moved source audio volume, voiceover volume, source-audio keyframe list, voice keyframe list, and add/delete keyframe buttons out of `SmartEditPanel.tsx`.
- Kept selected segment state, playhead timing, and add/remove keyframe mutation ownership in `SmartEditPanel.tsx`; the new component receives callback boundaries only.
- Current file sizes:
  - `SmartEditPanel.tsx`: 4763 lines.
  - `SmartEditSelectedSegmentAudioEnvelopeInspector.tsx`: 128 lines.
  - `SmartEditSelectedSegmentCopyStateInspector.tsx`: 117 lines.
  - `SmartEditSelectedSegmentTransformInspector.tsx`: 122 lines.
  - `SmartEditSelectedSegmentTimingInspector.tsx`: 320 lines.
  - `App.tsx`: 3390 lines.
  - `router.ts`: 3719 lines.
- Fresh verification after this pass:
  - `corepack pnpm --filter @shopclip/web lint`: passed.
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`: passed, 161 tests.
  - Sequential `corepack pnpm lint`: passed.
  - Sequential `corepack pnpm typecheck`: passed.
  - Sequential `corepack pnpm test`: passed, 365 tests across shared/API/web.
  - Sequential `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Continue splitting the remaining selected segment inspector sections in `SmartEditPanel.tsx`: advanced effects and visual mask/keyframes.
2. Continue reducing `apps/api/src/modules/projects/router.ts` route-handler size while preserving encoding-sensitive prompt text.
3. Split `apps/web/src/app/App.tsx` state orchestration into feature hooks after Smart Edit UI and router cleanup are stable under full verification.
4. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 Selected Segment Mask And Keyframe Inspector Cleanup

- Extracted selected segment visual mask and visual keyframe controls into `apps/web/src/features/edit/SmartEditSelectedSegmentMaskKeyframeInspector.tsx`.
- Moved mask type, invert mask, mask geometry controls, visual keyframe list, add keyframe, and delete keyframe controls out of `SmartEditPanel.tsx`.
- Kept selected segment state and keyframe mutation ownership in `SmartEditPanel.tsx`; the new component receives callback boundaries only.
- Removed stale `visualMaskForSegment` and `clampMaskPercentInput` imports from `SmartEditPanel.tsx`.
- Note: the old keyframe section contained an encoding-sensitive stray `U+8DEF` character; after `apply_patch` could not match it, that duplicate section was removed with a line-range mechanical edit, then verified by typecheck and full test/build.
- Current file sizes:
  - `SmartEditPanel.tsx`: 4619 lines.
  - `SmartEditSelectedSegmentMaskKeyframeInspector.tsx`: 177 lines.
  - `SmartEditSelectedSegmentAudioEnvelopeInspector.tsx`: 128 lines.
  - `SmartEditSelectedSegmentCopyStateInspector.tsx`: 117 lines.
  - `SmartEditSelectedSegmentTransformInspector.tsx`: 122 lines.
  - `SmartEditSelectedSegmentTimingInspector.tsx`: 320 lines.
  - `App.tsx`: 3390 lines.
  - `router.ts`: 3719 lines.
- Fresh verification after this pass:
  - First `corepack pnpm --filter @shopclip/web lint` caught stale `visualMaskForSegment` and `clampMaskPercentInput` imports in `SmartEditPanel.tsx`.
  - `corepack pnpm --filter @shopclip/web lint`: passed after import cleanup.
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`: passed, 161 tests.
  - Sequential `corepack pnpm lint`: passed.
  - Sequential `corepack pnpm typecheck`: passed.
  - Sequential `corepack pnpm test`: passed, 365 tests across shared/API/web.
  - Sequential `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Finish splitting the remaining selected segment advanced effects section in `SmartEditPanel.tsx`.
2. Continue reducing `apps/api/src/modules/projects/router.ts` route-handler size while preserving encoding-sensitive prompt text.
3. Split `apps/web/src/app/App.tsx` state orchestration into feature hooks after Smart Edit UI and router cleanup are stable under full verification.
4. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 Selected Segment Advanced Effects Inspector Cleanup

- Extracted selected segment advanced visual effects controls into `apps/web/src/features/edit/SmartEditSelectedSegmentAdvancedEffectsInspector.tsx`.
- Moved blur, sharpen, fade in/out, effect stack selection, effect enable/amount controls, amount keyframe controls, effect reorder, and effect removal out of `SmartEditPanel.tsx`.
- Kept selected segment state and visual-effect mutation ownership in `SmartEditPanel.tsx`; the new component receives callback boundaries only.
- Removed stale advanced-effect helper and icon imports from `SmartEditPanel.tsx`.
- Note: the old advanced effects section also contained an encoding-sensitive stray `U+8DEF` character; after adding the component, the duplicate section was replaced with a line-range mechanical edit and then verified by lint, typecheck, full test, and build.
- Current file sizes:
  - `SmartEditPanel.tsx`: 4409 lines.
  - `SmartEditSelectedSegmentAdvancedEffectsInspector.tsx`: 275 lines.
  - `SmartEditSelectedSegmentMaskKeyframeInspector.tsx`: 177 lines.
  - `SmartEditSelectedSegmentAudioEnvelopeInspector.tsx`: 128 lines.
  - `SmartEditSelectedSegmentCopyStateInspector.tsx`: 117 lines.
  - `SmartEditSelectedSegmentTransformInspector.tsx`: 122 lines.
  - `SmartEditSelectedSegmentTimingInspector.tsx`: 320 lines.
  - `App.tsx`: 3390 lines.
  - `router.ts`: 3719 lines.
- Fresh verification after this pass:
  - First `corepack pnpm --filter @shopclip/web lint` caught stale `ArrowDown`, `ArrowUp`, `clampVisualEffectAmount`, `visualEffectOptions`, `clampBlur`, `clampEffectFade`, and `clampSharpen` imports in `SmartEditPanel.tsx`.
  - `corepack pnpm --filter @shopclip/web lint`: passed after import cleanup.
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`: passed, 161 tests.
  - Sequential `corepack pnpm lint`: passed.
  - Sequential `corepack pnpm typecheck`: passed.
  - Sequential `corepack pnpm test`: passed, 365 tests across shared/API/web.
  - Sequential `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Continue reducing `apps/api/src/modules/projects/router.ts` route-handler size while preserving encoding-sensitive prompt text.
2. Split `apps/web/src/app/App.tsx` state orchestration into feature hooks after Smart Edit UI and router cleanup are stable under full verification.
3. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 Router Reference Asset Helper Cleanup

- Extracted reference/script asset and storyboard reference-image helper logic into `apps/api/src/modules/projects/referenceAssetUtils.ts`.
- Moved reference script body/tag generation, reference-owned asset detection, script-library asset detection, metadata record access, appearance anchor lines, scene-bound asset resolution, stored video reference frame parsing, and storyboard reference image URL resolution out of `router.ts`.
- Kept route handlers and prompt-heavy script/storyboard generation logic in `router.ts` to avoid changing encoding-sensitive prompt text.
- Current file sizes:
  - `router.ts`: 3539 lines.
  - `referenceAssetUtils.ts`: 203 lines.
  - `SmartEditPanel.tsx`: 4409 lines.
  - `App.tsx`: 3390 lines.
- Fresh verification after this pass:
  - `corepack pnpm --filter @shopclip/api lint`: passed.
  - `corepack pnpm --filter @shopclip/api typecheck`: passed.
  - `corepack pnpm --filter @shopclip/api test -- src/part015-processing-flow.test.ts src/p1-flow.test.ts src/smart-edit-flow.test.ts`: passed; Vitest ran the API suite, 178 tests.
  - Sequential `corepack pnpm lint`: passed.
  - Sequential `corepack pnpm typecheck`: passed.
  - Sequential `corepack pnpm test`: passed, 365 tests across shared/API/web.
  - Sequential `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Continue reducing `apps/api/src/modules/projects/router.ts`; next safer candidates are route-local asset upload/import helpers or storage cleanup helpers, while continuing to avoid prompt-heavy blocks.
2. Split `apps/web/src/app/App.tsx` state orchestration into feature hooks after API router cleanup stabilizes.
3. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 Router Upload Intent And Storage Delete Helper Cleanup

- Extracted upload-intent asset draft and upload processing-job draft construction into `apps/api/src/modules/projects/projectAssetUtils.ts`.
- Replaced duplicated project/global upload-intent asset metadata assembly in `apps/api/src/modules/projects/router.ts` with `buildUploadIntentAssetDraft` and `buildUploadIntentProcessingJobDraft`.
- Extracted repeated storage object deletion logic into `deleteStoredAssetObjects` and reused it in project deletion, asset batch deletion, and reference-owned asset cleanup.
- Kept route validation, error codes, status codes, response bodies, and background import orchestration in `router.ts`.
- Current file sizes:
  - `router.ts`: 3707 lines.
  - `projectAssetUtils.ts`: 85 lines.
  - `externalAssetImportUtils.ts`: 168 lines.
  - `SmartEditPanel.tsx`: 4524 lines.
  - `App.tsx`: 3589 lines.
- Fresh verification after this pass:
  - `corepack pnpm --filter @shopclip/api lint`: passed.
  - `corepack pnpm --filter @shopclip/api typecheck`: passed.
  - `corepack pnpm --filter @shopclip/api test -- src/asset-cos-flow.test.ts src/external-asset-structure-flow.test.ts src/p1-media-flow.test.ts`: passed; Vitest ran the API suite, 178 tests.
  - Sequential `corepack pnpm lint`: passed.
  - Sequential `corepack pnpm typecheck`: passed.
  - Sequential `corepack pnpm test`: passed, 365 tests across shared/API/web.
  - Sequential `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Continue reducing `apps/api/src/modules/projects/router.ts`; next safer candidates are external import job orchestration boundaries or small response/error helpers, while continuing to avoid prompt-heavy generation blocks.
2. Split `apps/web/src/app/App.tsx` state orchestration into feature hooks after API router cleanup stabilizes.
3. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 External Asset Import Job Extraction

- Extracted third-party asset import orchestration into `apps/api/src/modules/projects/externalAssetImportJob.ts`.
- Moved external asset download typing/default downloader and downloaded-asset cache writing into `apps/api/src/modules/projects/externalAssetImportUtils.ts`.
- Removed the background import job body from `apps/api/src/modules/projects/router.ts`; route handlers now validate requests, check project existence, enqueue imports through the job module, and keep the same status codes/error payloads.
- Preserved the existing external provider download allowlist, COS upload flow, structured asset processing trigger, queued/failed/ready job transitions, and local downloaded-asset cache behavior.
- Current file sizes:
  - `router.ts`: 3504 lines.
  - `externalAssetImportJob.ts`: 198 lines.
  - `externalAssetImportUtils.ts`: 213 lines.
  - `projectAssetUtils.ts`: 85 lines.
  - `SmartEditPanel.tsx`: 4524 lines.
  - `App.tsx`: 3589 lines.
- Fresh verification after this pass:
  - `corepack pnpm --filter @shopclip/api lint`: passed.
  - `corepack pnpm --filter @shopclip/api typecheck`: passed.
  - `corepack pnpm --filter @shopclip/api test -- src/asset-cos-flow.test.ts src/external-asset-structure-flow.test.ts src/p1-flow.test.ts src/p1-media-flow.test.ts`: passed; Vitest ran the API suite, 178 tests.
  - Sequential `corepack pnpm lint`: passed.
  - Sequential `corepack pnpm typecheck`: passed.
  - Sequential `corepack pnpm test`: passed, 365 tests across shared/API/web.
  - Sequential `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Continue reducing `apps/api/src/modules/projects/router.ts`; next safer candidates are shared asset upload/confirm-upload helpers, render retry/export response helpers, or small route response/error helpers.
2. Split `apps/web/src/app/App.tsx` state orchestration into feature hooks after API router cleanup stabilizes.
3. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 Asset Upload Service Extraction

- Extracted upload-intent enqueueing, upload confirmation, and server-proxy upload handling into `apps/api/src/modules/projects/assetUploadService.ts`.
- Removed upload asset draft/job creation, confirmation metadata update, document-text extraction metadata assembly, and server-proxy upload persistence from `apps/api/src/modules/projects/router.ts`.
- Preserved existing route validation and HTTP error mapping, including separate global asset create failure and global processing-job create failure error codes.
- Kept `router.ts` responsible for project existence checks, request body validation, object-key/body guards, and storage failure response mapping.
- Current file sizes:
  - `router.ts`: 3388 lines.
  - `assetUploadService.ts`: 221 lines.
  - `projectAssetUtils.ts`: 85 lines.
  - `externalAssetImportJob.ts`: 198 lines.
  - `externalAssetImportUtils.ts`: 213 lines.
  - `SmartEditPanel.tsx`: 4524 lines.
  - `App.tsx`: 3589 lines.
- Fresh verification after this pass:
  - `corepack pnpm --filter @shopclip/api lint`: passed.
  - `corepack pnpm --filter @shopclip/api typecheck`: passed.
  - `corepack pnpm --filter @shopclip/api test -- src/asset-cos-flow.test.ts src/external-asset-structure-flow.test.ts src/p0-flow.test.ts src/p1-flow.test.ts`: passed; Vitest ran the API suite, 178 tests.
  - Sequential `corepack pnpm lint`: passed.
  - Sequential `corepack pnpm typecheck`: passed.
  - Sequential `corepack pnpm test`: passed, 365 tests across shared/API/web.
  - Sequential `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Continue reducing `apps/api/src/modules/projects/router.ts`; next safer candidates are render retry/export response helpers, reference cleanup route helpers, or small response/error helpers.
2. Split `apps/web/src/app/App.tsx` state orchestration into feature hooks after API router cleanup stabilizes.
3. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 Render Retry And Export Service Extraction

- Extracted render retry orchestration and project export resolution into `apps/api/src/modules/projects/renderTaskService.ts`.
- Moved retry failed-render lookup, retryability checks, failed trace selection, Seedance duration error classification, and queued retry creation out of `apps/api/src/modules/projects/router.ts`.
- Moved completed-render export lookup, local export URL detection, render export publishing, render task export URL update, and export response body assembly out of `router.ts`.
- Preserved existing HTTP route validation and error mappings:
  - `RENDER_TASK_NOT_FOUND`
  - `RENDER_NOT_RETRYABLE`
  - `PROJECT_NOT_FOUND`
  - `INVALID_SCENE_DURATION`
  - `EXPORT_COMPOSE_FAILED`
  - `EXPORT_NOT_READY`
- Current file sizes:
  - `router.ts`: 3337 lines.
  - `renderTaskService.ts`: 153 lines.
  - `assetUploadService.ts`: 221 lines.
  - `externalAssetImportJob.ts`: 198 lines.
  - `SmartEditPanel.tsx`: 4524 lines.
  - `App.tsx`: 3589 lines.
- Fresh verification after this pass:
  - First `corepack pnpm --filter @shopclip/api typecheck` caught the original render creation route still referencing `isSeedanceSceneDurationError`; fixed by importing the helper from `renderTaskService.ts`.
  - `corepack pnpm --filter @shopclip/api lint`: passed.
  - `corepack pnpm --filter @shopclip/api typecheck`: passed.
  - `corepack pnpm --filter @shopclip/api test -- src/p0-flow.test.ts src/p1-media-flow.test.ts src/seedance-render-flow.test.ts src/smart-edit-flow.test.ts`: passed; Vitest ran the API suite, 178 tests.
  - Sequential `corepack pnpm lint`: passed.
  - Sequential `corepack pnpm typecheck`: passed.
  - Sequential `corepack pnpm test`: passed, 365 tests across shared/API/web.
  - Sequential `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Continue reducing `apps/api/src/modules/projects/router.ts`; next safer candidates are reference cleanup/script-asset route helpers or scene update/regeneration validation helpers.
2. Split `apps/web/src/app/App.tsx` state orchestration into feature hooks after API router cleanup stabilizes.
3. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 Reference Asset Service Extraction

- Extracted reference deletion cleanup and reference script-asset creation/reuse into `apps/api/src/modules/projects/referenceAssetService.ts`.
- Moved reference-owned asset discovery, owned storage object deletion, reference deletion, script-asset readiness checks, existing script-asset reuse, and reference script-asset metadata assembly out of `apps/api/src/modules/projects/router.ts`.
- Preserved existing route validation and HTTP mappings:
  - `REFERENCE_NOT_FOUND`
  - `STORAGE_DELETE_FAILED`
  - `INVALID_REFERENCE_SCRIPT_ASSET_REQUEST`
  - `PROJECT_NOT_FOUND`
  - `REFERENCE_NOT_READY`
  - `REFERENCE_SCRIPT_ASSET_CREATE_FAILED`
- Existing script assets still return `200`; newly created script assets still return `201`.
- Current file sizes:
  - `router.ts`: 3285 lines.
  - `referenceAssetService.ts`: 123 lines.
  - `referenceAssetUtils.ts`: 228 lines.
  - `renderTaskService.ts`: 153 lines.
  - `SmartEditPanel.tsx`: 4524 lines.
  - `App.tsx`: 3589 lines.
- Fresh verification after this pass:
  - `corepack pnpm --filter @shopclip/api lint`: passed.
  - `corepack pnpm --filter @shopclip/api typecheck`: passed.
  - `corepack pnpm --filter @shopclip/api test -- src/part015-processing-flow.test.ts src/p1-flow.test.ts src/p0-flow.test.ts`: passed; Vitest ran the API suite, 178 tests.
  - Sequential `corepack pnpm lint`: passed.
  - Sequential `corepack pnpm typecheck`: passed.
  - Sequential `corepack pnpm test`: passed, 365 tests across shared/API/web.
  - Sequential `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Continue reducing `apps/api/src/modules/projects/router.ts`; next safer candidates are scene update/regeneration validation helpers, reference analyze registration, or remaining script generation prompt-context route helpers.
2. Start splitting `apps/web/src/app/App.tsx` state orchestration into feature hooks once the next API router pass is stable.
3. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 Scene Route Service Extraction

- Extracted scene asset validation, scene patch update, and scene image regeneration orchestration into `apps/api/src/modules/projects/sceneRouteService.ts`.
- Moved scene-bound asset ownership checks, regenerated scene field assembly, image request assembly, scene persistence, and regeneration trace event creation out of `apps/api/src/modules/projects/router.ts`.
- Kept storyboard image generation itself in `router.ts` through a callback so prompt-heavy image generation logic and fallback behavior were not moved during this pass.
- Preserved existing route validation and HTTP mappings:
  - `INVALID_SCENE_UPDATE`
  - `SCENE_NOT_FOUND`
  - `INVALID_SCENE_ASSET`
  - `INVALID_SCENE_REGENERATION_REQUEST`
- Current file sizes:
  - `router.ts`: 3244 lines.
  - `sceneRouteService.ts`: 131 lines.
  - `referenceAssetService.ts`: 123 lines.
  - `SmartEditPanel.tsx`: 4524 lines.
  - `App.tsx`: 3589 lines.
- Fresh verification after this pass:
  - `corepack pnpm --filter @shopclip/api lint`: passed.
  - `corepack pnpm --filter @shopclip/api typecheck`: passed.
  - `corepack pnpm --filter @shopclip/api test -- src/p1-flow.test.ts src/p0-flow.test.ts src/seedance-render-flow.test.ts`: passed; Vitest ran the API suite, 178 tests.
  - Sequential `corepack pnpm lint`: passed.
  - Sequential `corepack pnpm typecheck`: passed.
  - Sequential `corepack pnpm test`: passed, 365 tests across shared/API/web.
  - Sequential `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Continue reducing `apps/api/src/modules/projects/router.ts`; next safer candidates are reference analyze registration or remaining script generation prompt-context route helpers.
2. Start splitting `apps/web/src/app/App.tsx` state orchestration into feature hooks after one more API stabilization pass, or if router cleanup reaches diminishing returns.
3. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 Reference Analysis Route Service Extraction

- Extracted reference analysis route registration into `apps/api/src/modules/projects/referenceAnalysisRouteService.ts`.
- Moved project existence checks, source asset lookup, source asset project/type validation, reference registration, source URL fallback assembly, and background analysis kickoff out of `apps/api/src/modules/projects/router.ts`.
- Preserved existing route validation and HTTP mappings:
  - `INVALID_REFERENCE_ANALYZE_REQUEST`
  - `PROJECT_NOT_FOUND`
  - `REFERENCE_SOURCE_ASSET_NOT_FOUND`
  - `REFERENCE_SOURCE_ASSET_PROJECT_MISMATCH`
  - `REFERENCE_SOURCE_ASSET_NOT_VIDEO`
  - `REFERENCE_ANALYSIS_REGISTRATION_FAILED`
  - `REFERENCE_ANALYSIS_FAILED`
- The background analysis still runs fire-and-forget and logs unexpected failures with the same message.
- Current file sizes:
  - `router.ts`: 3212 lines.
  - `referenceAnalysisRouteService.ts`: 92 lines.
  - `sceneRouteService.ts`: 131 lines.
  - `SmartEditPanel.tsx`: 4524 lines.
  - `App.tsx`: 3589 lines.
- Fresh verification after this pass:
  - First `corepack pnpm --filter @shopclip/api typecheck` caught that the route schema permits `sourceUrl` to be omitted when `sourceAssetId` is present; fixed the service input type to match the route schema.
  - `corepack pnpm --filter @shopclip/api lint`: passed.
  - `corepack pnpm --filter @shopclip/api typecheck`: passed.
  - `corepack pnpm --filter @shopclip/api test -- src/part015-processing-flow.test.ts src/p0-flow.test.ts src/p1-flow.test.ts`: passed; Vitest ran the API suite, 178 tests.
  - Sequential `corepack pnpm lint`: passed.
  - Sequential `corepack pnpm typecheck`: passed.
  - Sequential `corepack pnpm test`: passed, 365 tests across shared/API/web.
  - Sequential `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Start splitting `apps/web/src/app/App.tsx` state orchestration into feature hooks; API router cleanup is stable enough for the next frontend structural pass.
2. Continue smaller API cleanup only if needed around script generation prompt-context helpers.
3. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 Frontend App State Hook Extraction

- Extracted workspace navigation state from `apps/web/src/app/App.tsx` into `apps/web/src/app/useWorkspaceNavigationState.ts`.
- Moved language initialization, active page initialization, hash-change synchronization, page transition direction calculation, and active workspace section derivation into the navigation hook.
- Extracted settings persistence state from `App.tsx` into `apps/web/src/app/useSettingsState.ts`.
- Moved API config and stock-provider config localStorage loading/saving into the settings hook while preserving existing sanitization behavior.
- Kept business workflows, async project/render/asset operations, and project-studio navigation behavior in `App.tsx` for this pass.
- Current file sizes:
  - `App.tsx`: 3522 lines.
  - `useWorkspaceNavigationState.ts`: 76 lines.
  - `useSettingsState.ts`: 65 lines.
  - `router.ts`: 3212 lines.
  - `SmartEditPanel.tsx`: 4524 lines.
- Fresh verification after this pass:
  - `corepack pnpm --filter @shopclip/web lint`: passed.
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`: passed, 161 tests.
  - Sequential `corepack pnpm lint`: passed.
  - Sequential `corepack pnpm typecheck`: passed.
  - Sequential `corepack pnpm test`: passed, 365 tests across shared/API/web.
  - Sequential `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Continue splitting `apps/web/src/app/App.tsx`; next safer candidates are asset search/import state or background task tracking helpers.
2. Continue smaller API cleanup only if needed around script generation prompt-context helpers.
3. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 Frontend Asset Search State Extraction

- Extracted asset search UI state from `apps/web/src/app/App.tsx` into `apps/web/src/app/useAssetSearchState.ts`.
- Moved asset search query, search-run flag, local search results, external stock results, category-filtered result derivation, and shared search reset behavior into the hook.
- Preserved existing business request handlers in `App.tsx`; search execution, external provider calls, import, process, delete, and template extraction still stay close to project and asset-library mutations.
- Preserved the narrower process-asset behavior that only clears local search results and the search-run flag, without clearing external search results.
- Current file sizes:
  - `App.tsx`: 3502 lines.
  - `useAssetSearchState.ts`: 63 lines.
  - `useWorkspaceNavigationState.ts`: 76 lines.
  - `useSettingsState.ts`: 65 lines.
  - `router.ts`: 3212 lines.
  - `SmartEditPanel.tsx`: 4524 lines.
- Fresh verification after this pass:
  - `corepack pnpm --filter @shopclip/web lint`: passed.
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`: passed, 161 tests.
  - Sequential `corepack pnpm lint`: passed.
  - Sequential `corepack pnpm typecheck`: passed.
  - Sequential `corepack pnpm test`: passed, 365 tests across shared/API/web.
  - Sequential `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Continue splitting `apps/web/src/app/App.tsx`; next safer candidate is background task tracking helpers because task text/progress/timer logic is internally cohesive.
2. Continue smaller API cleanup only if needed around script generation prompt-context helpers.
3. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 Frontend Background Task Tracker Extraction

- Extracted background task tracking from `apps/web/src/app/App.tsx` into `apps/web/src/app/useBackgroundTaskTracker.ts`.
- Moved tracked task state, estimated progress timers, timer cleanup, task start/update helpers, render-task-derived background task synthesis, task sorting, and task list limiting into the hook.
- Kept background task target creation and task-open navigation in `App.tsx` because they depend on project-studio page state and section routing.
- Kept localized task copy in `App.tsx` for this pass to avoid mixing the existing encoded Chinese copy block with the state hook extraction.
- Current file sizes:
  - `App.tsx`: 3356 lines.
  - `useBackgroundTaskTracker.ts`: 226 lines.
  - `useAssetSearchState.ts`: 63 lines.
  - `useWorkspaceNavigationState.ts`: 76 lines.
  - `useSettingsState.ts`: 65 lines.
  - `router.ts`: 3212 lines.
  - `SmartEditPanel.tsx`: 4524 lines.
- Fresh verification after this pass:
  - `corepack pnpm --filter @shopclip/web lint`: passed.
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`: passed, 161 tests.
  - Sequential `corepack pnpm lint`: passed.
  - Sequential `corepack pnpm typecheck`: passed.
  - Sequential `corepack pnpm test`: passed, 365 tests across shared/API/web.
  - Sequential `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Continue splitting `apps/web/src/app/App.tsx`; next safer candidates are project lifecycle state helpers or project studio flow state helpers.
2. Continue smaller API cleanup only if needed around script generation prompt-context helpers.
3. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 Frontend Project Studio State Extraction

- Extracted project studio mode state from `apps/web/src/app/App.tsx` into `apps/web/src/app/useProjectStudioState.ts`.
- Moved project-studio mode, current studio flow, preview script id, and small enter/exit/reset helpers into the hook.
- Updated background task tracking to import the shared `ProjectStudioFlow` type from the new studio state hook.
- Kept page navigation, project loading, script selection, render refresh, and save/return workflows in `App.tsx` because those still depend on broader project lifecycle state.
- Preserved the old background-task-open behavior by separating studio mode changes from hidden flow value updates.
- Current file sizes:
  - `App.tsx`: 3359 lines. This pass moved state ownership but did not reduce the main file line count because call sites now use explicit helper names.
  - `useProjectStudioState.ts`: 47 lines.
  - `useBackgroundTaskTracker.ts`: 225 lines.
  - `useAssetSearchState.ts`: 63 lines.
  - `router.ts`: 3212 lines.
  - `SmartEditPanel.tsx`: 4524 lines.
- Fresh verification after this pass:
  - `corepack pnpm --filter @shopclip/web lint`: passed.
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`: passed, 161 tests.
  - Sequential `corepack pnpm lint`: passed.
  - Sequential `corepack pnpm typecheck`: passed.
  - Sequential `corepack pnpm test`: passed, 365 tests across shared/API/web.
  - Sequential `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Continue splitting `apps/web/src/app/App.tsx`; next safer candidates are project lifecycle helper functions or render/smart-edit view model derivation.
2. Consider extracting localized background task copy after separately deciding how to handle the existing encoded Chinese strings safely.
3. Continue smaller API cleanup only if needed around script generation prompt-context helpers.
4. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 Frontend Render And Smart Edit Utility Extraction

- Extracted render/smart-edit pure helpers from `apps/web/src/app/App.tsx` into `apps/web/src/app/AppRenderUtils.ts`.
- Moved render polling checks, smart-edit render detection, completed scene clip checks, Seedance material refresh detection, studio base render selection, latest smart-edit render selection, smart-edit render snapshot materialization, and completed source-render seeding into the utility module.
- Preserved the existing `App.tsx` exports for test compatibility by re-exporting the moved helpers from `AppRenderUtils.ts`.
- Fixed several already-corrupted UI strings that became syntactically unsafe during the extraction:
  - background task Chinese labels were rewritten as ASCII Unicode escape strings.
  - Seedance invalid scene duration copy was rewritten as a stable English message.
  - delete-script, delete-video, and delete-reference confirmation copy now uses stable English strings.
- Current file sizes:
  - `App.tsx`: 3180 lines.
  - `AppRenderUtils.ts`: 203 lines.
  - `useProjectStudioState.ts`: 47 lines.
  - `useBackgroundTaskTracker.ts`: 225 lines.
  - `router.ts`: 3212 lines.
  - `SmartEditPanel.tsx`: 4524 lines.
- Fresh verification after this pass:
  - `corepack pnpm --filter @shopclip/web lint`: passed.
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`: passed, 161 tests.
  - Sequential `corepack pnpm lint`: passed.
  - Sequential `corepack pnpm typecheck`: passed.
  - Sequential `corepack pnpm test`: passed, 365 tests across shared/API/web.
  - Sequential `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Continue splitting `apps/web/src/app/App.tsx`; next safer candidates are project lifecycle helper functions or project asset mutation helpers.
2. Continue reducing `apps/web/src/features/edit/SmartEditPanel.tsx`; the largest remaining frontend file still needs more component/hook extraction.
3. Continue smaller API cleanup only if needed around script generation prompt-context helpers.
4. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 Smart Edit Timeline Resize Hook Extraction

- Extracted the smart-edit timeline panel resize state into `apps/web/src/features/edit/useSmartEditTimelinePanelResize.ts`.
- Moved timeline height localStorage loading/saving, min/max clamping, pointer move/up listeners, resize state, and resize start helper out of `apps/web/src/features/edit/SmartEditPanel.tsx`.
- Kept timeline rendering, track interactions, SRT import/export, and plan mutation handlers in `SmartEditPanel.tsx`; this pass intentionally avoided touching timeline editing behavior.
- Current file sizes:
  - `SmartEditPanel.tsx`: 4482 lines.
  - `useSmartEditTimelinePanelResize.ts`: 74 lines.
  - `App.tsx`: 3180 lines.
  - `router.ts`: 3212 lines.
- Fresh verification after this pass:
  - `corepack pnpm --filter @shopclip/web lint`: passed.
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`: passed, 161 tests.
  - Sequential `corepack pnpm lint`: passed.
  - Sequential `corepack pnpm typecheck`: passed.
  - Sequential `corepack pnpm test`: passed, 365 tests across shared/API/web.
  - Sequential `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Continue reducing `apps/web/src/features/edit/SmartEditPanel.tsx`; next safer candidates are SRT import/export state or small toolbar/view sections.
2. Continue splitting `apps/web/src/app/App.tsx`; next safer candidates are project lifecycle helper functions or project asset mutation helpers.
3. Continue smaller API cleanup only if needed around script generation prompt-context helpers.
4. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 Smart Edit SRT Captions Hook Extraction

- Extracted Smart Edit SRT import/export state from `apps/web/src/features/edit/SmartEditPanel.tsx` into `apps/web/src/features/edit/useSmartEditSrtCaptions.ts`.
- Moved SRT textarea state, import/export status messages, SRT import plan mutation, and browser SRT download creation into the hook.
- Kept `SmartEditPanel.tsx` as the owner of plan history by passing `commitPlanChange` into the hook; undo/redo labels and public behavior stay unchanged.
- Preserved the existing compatibility exports from `SmartEditPanel.tsx` by re-exporting SRT operations from `SmartEditTimelineOperations.ts` instead of importing unused bindings into the component.
- Current file sizes:
  - `SmartEditPanel.tsx`: 4443 lines.
  - `useSmartEditSrtCaptions.ts`: 99 lines.
  - `useSmartEditTimelinePanelResize.ts`: 74 lines.
  - `App.tsx`: 3180 lines.
  - `router.ts`: 3212 lines.
- Fresh verification after this pass:
  - `corepack pnpm --filter @shopclip/web lint`: passed.
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`: passed, 161 tests.
  - Sequential `corepack pnpm lint`: passed.
  - Sequential `corepack pnpm typecheck`: passed.
  - Sequential `corepack pnpm test`: passed, 365 tests across shared/API/web.
  - Sequential `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Continue reducing `apps/web/src/features/edit/SmartEditPanel.tsx`; next safer candidates are small toolbar/view sections around timeline controls or SRT import UI presentation.
2. Continue splitting `apps/web/src/app/App.tsx`; next safer candidates are project lifecycle helper functions or project asset mutation helpers.
3. Continue smaller API cleanup only if needed around script generation prompt-context helpers.
4. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 Smart Edit SRT Caption Controls Extraction

- Extracted the Smart Edit SRT import/export JSX from `apps/web/src/features/edit/SmartEditPanel.tsx` into `apps/web/src/features/edit/SmartEditSrtCaptionControls.tsx`.
- Kept SRT state and behavior in `useSmartEditSrtCaptions.ts`; the new component is presentational and receives import text, status, and import/export callbacks from the panel.
- Preserved the existing labels, textarea placeholder, disabled states, and export button copy.
- Current file sizes:
  - `SmartEditPanel.tsx`: 4428 lines.
  - `SmartEditSrtCaptionControls.tsx`: 50 lines.
  - `useSmartEditSrtCaptions.ts`: 99 lines.
  - `App.tsx`: 3180 lines.
  - `router.ts`: 3212 lines.
- Fresh verification after this pass:
  - `corepack pnpm --filter @shopclip/web lint`: passed.
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`: passed, 161 tests.
  - Sequential `corepack pnpm lint`: passed.
  - Sequential `corepack pnpm typecheck`: passed.
  - Sequential `corepack pnpm test`: passed, 365 tests across shared/API/web.
  - Sequential `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Continue reducing `apps/web/src/features/edit/SmartEditPanel.tsx`; next safer candidates are timeline control toolbar presentation or compact timeline header sections.
2. Continue splitting `apps/web/src/app/App.tsx`; next safer candidates are project lifecycle helper functions or project asset mutation helpers.
3. Continue smaller API cleanup only if needed around script generation prompt-context helpers.
4. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 Smart Edit Timeline Toolbar Extraction

- Extracted the Smart Edit timeline control toolbar from `apps/web/src/features/edit/SmartEditPanel.tsx` into `apps/web/src/features/edit/SmartEditTimelineToolbar.tsx`.
- Moved undo/redo buttons, edit-mode toggles, zoom controls, playhead range input, preview range actions, playhead edit actions, voice/text insertion buttons, render materialization, and clipboard paste button into the presentational toolbar component.
- Kept timeline mutations, selection calculations, preview range state, and command history ownership in `SmartEditPanel.tsx`; the toolbar receives already-computed booleans and callbacks.
- Preserved existing labels, button icons, disabled states, and command history labels.
- Current file sizes:
  - `SmartEditPanel.tsx`: 4271 lines.
  - `SmartEditTimelineToolbar.tsx`: 248 lines.
  - `SmartEditSrtCaptionControls.tsx`: 50 lines.
  - `App.tsx`: 3180 lines.
  - `router.ts`: 3212 lines.
- Fresh verification after this pass:
  - `corepack pnpm --filter @shopclip/web lint`: passed.
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`: passed, 161 tests.
  - Sequential `corepack pnpm lint`: passed.
  - Sequential `corepack pnpm typecheck`: passed.
  - Sequential `corepack pnpm test`: passed, 365 tests across shared/API/web.
  - Sequential `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Continue reducing `apps/web/src/features/edit/SmartEditPanel.tsx`; next safer candidates are compact timeline header/context-menu sections or selected material inspector subsections.
2. Continue splitting `apps/web/src/app/App.tsx`; next safer candidates are project lifecycle helper functions or project asset mutation helpers.
3. Continue smaller API cleanup only if needed around script generation prompt-context helpers.
4. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 Smart Edit Timeline Context Menu Extraction

- Extracted the Smart Edit timeline context menu from `apps/web/src/features/edit/SmartEditPanel.tsx` into `apps/web/src/features/edit/SmartEditTimelineContextMenu.tsx`.
- Moved the menu rendering, positioning, menu roles, close behavior, and action button shell into the presentational component.
- Kept clip-versus-segment duplicate/delete branching and all timeline mutations in `SmartEditPanel.tsx`; the menu receives callbacks only.
- Preserved the existing menu labels and action order: split, duplicate, copy, add bookmark, delete, close.
- Current file sizes:
  - `SmartEditPanel.tsx`: 4224 lines.
  - `SmartEditTimelineContextMenu.tsx`: 56 lines.
  - `SmartEditTimelineToolbar.tsx`: 248 lines.
  - `App.tsx`: 3180 lines.
  - `router.ts`: 3212 lines.
- Fresh verification after this pass:
  - `corepack pnpm --filter @shopclip/web lint`: passed.
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`: passed, 161 tests.
  - Sequential `corepack pnpm lint`: passed.
  - Sequential `corepack pnpm typecheck`: passed.
  - Sequential `corepack pnpm test`: passed, 365 tests across shared/API/web.
  - Sequential `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Continue reducing `apps/web/src/features/edit/SmartEditPanel.tsx`; next safer candidates are selected material inspector subsections or compact timeline header wrappers.
2. Continue splitting `apps/web/src/app/App.tsx`; next safer candidates are project lifecycle helper functions or project asset mutation helpers.
3. Continue smaller API cleanup only if needed around script generation prompt-context helpers.
4. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 Smart Edit Timeline Section Extraction

- Extracted the Smart Edit timeline wrapper and header from `apps/web/src/features/edit/SmartEditPanel.tsx` into `apps/web/src/features/edit/SmartEditTimelineSection.tsx`.
- Moved the `smart-edit-timeline` container, timeline aria label, header title, and delete hint into the presentational section component.
- Kept toolbar, SRT controls, batch toolbar, track stack, and all timeline behavior in their existing components and panel-owned callbacks.
- Current file sizes:
  - `SmartEditPanel.tsx`: 4221 lines.
  - `SmartEditTimelineSection.tsx`: 21 lines.
  - `SmartEditTimelineContextMenu.tsx`: 56 lines.
  - `App.tsx`: 3180 lines.
  - `router.ts`: 3212 lines.
- Fresh verification after this pass:
  - `corepack pnpm --filter @shopclip/web lint`: passed.
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`: passed, 161 tests.
  - Sequential `corepack pnpm lint`: passed.
  - Sequential `corepack pnpm typecheck`: passed.
  - Sequential `corepack pnpm test`: passed, 365 tests across shared/API/web.
  - Sequential `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Continue reducing `apps/web/src/features/edit/SmartEditPanel.tsx`; next safer candidates are selected material inspector subsections.
2. Continue splitting `apps/web/src/app/App.tsx`; next safer candidates are project lifecycle helper functions or project asset mutation helpers.
3. Continue smaller API cleanup only if needed around script generation prompt-context helpers.
4. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 Smart Edit Timeline Text Inspector Extraction

- Extracted text timeline element controls from `apps/web/src/features/edit/SmartEditPanel.tsx` into `apps/web/src/features/edit/SmartEditTimelineTextInspector.tsx`.
- Moved persistent text material editing, text style presets, split-by-lines button, text size, text vertical position, and text color controls into a focused inspector component.
- Kept selected element lookup, text line count derivation, split-by-lines mutation, and timeline element patching in `SmartEditPanel.tsx`.
- Preserved the original inspector ordering by rendering the text field at the existing top position and rendering style controls at the existing text-style position.
- Current file sizes:
  - `SmartEditPanel.tsx`: 4137 lines.
  - `SmartEditTimelineTextInspector.tsx`: 130 lines.
  - `SmartEditTimelineSection.tsx`: 21 lines.
  - `App.tsx`: 3180 lines.
  - `router.ts`: 3212 lines.
- Fresh verification after this pass:
  - `corepack pnpm --filter @shopclip/web lint`: passed.
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`: passed, 161 tests.
  - Sequential `corepack pnpm lint`: passed.
  - Sequential `corepack pnpm typecheck`: passed.
  - Sequential `corepack pnpm test`: passed, 365 tests across shared/API/web.
  - Sequential `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Continue reducing `apps/web/src/features/edit/SmartEditPanel.tsx`; next safer candidates are selected persistent audio element controls or linked material controls.
2. Continue splitting `apps/web/src/app/App.tsx`; next safer candidates are project lifecycle helper functions or project asset mutation helpers.
3. Continue smaller API cleanup only if needed around script generation prompt-context helpers.
4. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 Smart Edit Timeline Audio Inspector Extraction

- Extracted persistent audio timeline element controls from `apps/web/src/features/edit/SmartEditPanel.tsx` into `apps/web/src/features/edit/SmartEditTimelineAudioInspector.tsx`.
- Moved audio playback rate, volume, fade-in/out, audio volume keyframe list, keyframe delete buttons, add-keyframe button, and mute toggle into a focused inspector component.
- Kept selected element lookup, keyframe add/remove mutation, and timeline element patching in `SmartEditPanel.tsx`.
- Current file sizes:
  - `SmartEditPanel.tsx`: 4039 lines.
  - `SmartEditTimelineAudioInspector.tsx`: 128 lines.
  - `SmartEditTimelineTextInspector.tsx`: 130 lines.
  - `App.tsx`: 3180 lines.
  - `router.ts`: 3212 lines.
- Fresh verification after this pass:
  - `corepack pnpm --filter @shopclip/web lint`: passed.
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`: passed, 161 tests.
  - Sequential `corepack pnpm lint`: passed.
  - Sequential `corepack pnpm typecheck`: passed.
  - Sequential `corepack pnpm test`: passed, 365 tests across shared/API/web.
  - Sequential `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Continue reducing `apps/web/src/features/edit/SmartEditPanel.tsx`; next safer candidates are linked material controls or persistent video/audio source trim controls.
2. Continue splitting `apps/web/src/app/App.tsx`; next safer candidates are project lifecycle helper functions or project asset mutation helpers.
3. Continue smaller API cleanup only if needed around script generation prompt-context helpers.
4. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 Smart Edit Timeline Source Trim Inspector Extraction

- Extracted persistent video/audio source trim controls from `apps/web/src/features/edit/SmartEditPanel.tsx` into `apps/web/src/features/edit/SmartEditTimelineSourceTrimInspector.tsx`.
- Moved source in/out display, source-in slip input, and +/-0.1s source nudge buttons into a focused inspector component.
- Kept selected element lookup and source slip mutation in `SmartEditPanel.tsx`.
- Current file sizes:
  - `SmartEditPanel.tsx`: 3999 lines.
  - `SmartEditTimelineSourceTrimInspector.tsx`: 53 lines.
  - `SmartEditTimelineAudioInspector.tsx`: 128 lines.
  - `App.tsx`: 3180 lines.
  - `router.ts`: 3212 lines.
- Fresh verification after this pass:
  - `corepack pnpm --filter @shopclip/web lint`: passed.
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`: passed, 161 tests.
  - Sequential `corepack pnpm lint`: passed.
  - Sequential `corepack pnpm typecheck`: passed.
  - Sequential `corepack pnpm test`: passed, 365 tests across shared/API/web.
  - Sequential `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Continue reducing `apps/web/src/features/edit/SmartEditPanel.tsx`; next safer candidates are linked material controls or persistent element base field controls.
2. Continue splitting `apps/web/src/app/App.tsx`; next safer candidates are project lifecycle helper functions or project asset mutation helpers.
3. Continue smaller API cleanup only if needed around script generation prompt-context helpers.
4. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 Smart Edit Timeline Element Base Inspector Extraction

- Extracted persistent timeline element base fields from `apps/web/src/features/edit/SmartEditPanel.tsx` into `apps/web/src/features/edit/SmartEditTimelineElementBaseInspector.tsx`.
- Moved non-text material label, timeline start, and timeline duration controls into a focused inspector component.
- Kept text material editing in `SmartEditTimelineTextInspector.tsx` and kept selected element lookup, patch dispatch, source slip, audio keyframe mutations, and delete/hide behavior in `SmartEditPanel.tsx`.
- Preserved the existing inspector ordering: text material field first for text elements, shared start/duration fields next, then source/audio/text-style-specific controls.
- Current file sizes:
  - `SmartEditPanel.tsx`: 3858 lines.
  - `SmartEditTimelineElementBaseInspector.tsx`: 58 lines.
  - `SmartEditTimelineSourceTrimInspector.tsx`: 53 lines.
  - `SmartEditTimelineAudioInspector.tsx`: 128 lines.
  - `App.tsx`: 3010 lines.
  - `router.ts`: 2962 lines.
- Fresh verification after this pass:
  - `corepack pnpm --filter @shopclip/web lint`: passed.
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`: passed, 161 tests.
  - `corepack pnpm lint`: passed.
  - `corepack pnpm typecheck`: passed.
  - First `corepack pnpm test`: failed once in `apps/api/src/modules/media/realMediaProcessing.test.ts` with a 5000 ms timeout and Windows temp-file `EBUSY` unlink error.
  - Targeted `corepack pnpm --filter @shopclip/api test -- src/modules/media/realMediaProcessing.test.ts`: passed, 178 API tests in that filtered invocation.
  - Second `corepack pnpm test`: passed, 365 tests across shared/API/web.
  - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Continue reducing `apps/web/src/features/edit/SmartEditPanel.tsx`; next safer candidates are linked material group controls, selected track clip summary, or hide/delete footer controls.
2. Continue splitting `apps/web/src/app/App.tsx`; next safer candidates are project lifecycle helper functions or project asset mutation helpers.
3. Continue smaller API cleanup only if needed around remaining route orchestration in `apps/api/src/modules/projects/router.ts`.
4. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 Smart Edit Timeline Element Inspector Shell Extraction

- Extracted the persistent timeline element inspector shell from `apps/web/src/features/edit/SmartEditPanel.tsx` into `apps/web/src/features/edit/SmartEditTimelineElementInspector.tsx`.
- Moved the selected material summary, linked/unlinked status display, relink/unlink actions, base fields, source trim controls, audio inspector, text style inspector, hide toggle, and delete button composition into the shell component.
- Kept selected element lookup, linked element derivation, relink/unlink mutations, source slip mutation, audio keyframe mutations, text split mutation, hide/delete patching, and track clip removal callbacks owned by `SmartEditPanel.tsx`.
- Removed now-unused timeline element inspector imports and lucide icons from `SmartEditPanel.tsx`.
- Current file sizes:
  - `SmartEditPanel.tsx`: 3781 lines.
  - `SmartEditTimelineElementInspector.tsx`: 130 lines.
  - `SmartEditTimelineElementBaseInspector.tsx`: 58 lines.
  - `App.tsx`: 3010 lines.
  - `router.ts`: 2962 lines.
- Fresh verification after this pass:
  - `corepack pnpm --filter @shopclip/web lint`: passed.
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`: passed, 161 tests.
  - `corepack pnpm lint`: passed.
  - `corepack pnpm typecheck`: passed.
  - `corepack pnpm test`: passed, 365 tests across shared/API/web.
  - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Continue reducing `apps/web/src/features/edit/SmartEditPanel.tsx`; next safer candidates are selected segment inspector groups or remaining track clip segment inspector subsections.
2. Continue splitting `apps/web/src/app/App.tsx`; next safer candidates are project lifecycle helper functions or project asset mutation helpers.
3. Continue smaller API cleanup only if needed around remaining route orchestration in `apps/api/src/modules/projects/router.ts`.
4. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 Smart Edit Track Clip Segment Inspector Extraction

- Extracted the selected segment track clip inspector from `apps/web/src/features/edit/SmartEditPanel.tsx` into `apps/web/src/features/edit/SmartEditTrackClipSegmentInspector.tsx`.
- Moved source audio, caption, and voice track clip controls into the new component, including start/duration fields, volume/fade controls, mute/caption visibility toggles, detach source audio button, and source/voice audio volume keyframe lists.
- Kept `replaceSegment`, `commitPlanChange`, selected track clip ownership, source audio detach mutation, segment audio keyframe add/remove mutations, and command history labels in `SmartEditPanel.tsx`.
- Removed now-unused `Button`, `Volume2`, `clampAudioFade`, `clampClipDurationWithinSegment`, and `clampInSegmentOffset` imports from `SmartEditPanel.tsx`.
- Current file sizes:
  - `SmartEditPanel.tsx`: 3392 lines.
  - `SmartEditTrackClipSegmentInspector.tsx`: 426 lines.
  - `SmartEditTimelineElementInspector.tsx`: 130 lines.
  - `App.tsx`: 3010 lines.
  - `router.ts`: 2962 lines.
- Fresh verification after this pass:
  - `corepack pnpm --filter @shopclip/web lint`: passed.
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`: passed, 161 tests.
  - `corepack pnpm lint`: passed.
  - `corepack pnpm typecheck`: passed.
  - `corepack pnpm test`: passed, 365 tests across shared/API/web.
  - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Continue reducing `apps/web/src/features/edit/SmartEditPanel.tsx`; next safer candidates are property tab rendering or selected segment inspector group wrapper cleanup.
2. Review `SmartEditTrackClipSegmentInspector.tsx`; it is intentionally extracted but already 426 lines, so the next refinement should split repeated audio envelope/keyframe controls if needed.
3. Continue splitting `apps/web/src/app/App.tsx`; next safer candidates are project lifecycle helper functions or project asset mutation helpers.
4. Continue smaller API cleanup only if needed around remaining route orchestration in `apps/api/src/modules/projects/router.ts`.
5. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 Smart Edit Track Clip Audio Envelope Extraction

- Extracted repeated source/voice audio envelope and keyframe controls from `apps/web/src/features/edit/SmartEditTrackClipSegmentInspector.tsx` into `apps/web/src/features/edit/SmartEditTrackClipAudioEnvelopeInspector.tsx`.
- Consolidated volume, fade-in, fade-out, add-keyframe, keyframe list, keyframe delete, and empty-keyframe rendering for segment source audio and voiceover tracks.
- Kept source audio detach, source/voice timing fields, caption fields, mute/caption visibility toggles, segment patch callbacks, and all plan mutation ownership in `SmartEditTrackClipSegmentInspector.tsx` and `SmartEditPanel.tsx`.
- Current file sizes:
  - `SmartEditPanel.tsx`: 3392 lines.
  - `SmartEditTrackClipSegmentInspector.tsx`: 330 lines.
  - `SmartEditTrackClipAudioEnvelopeInspector.tsx`: 105 lines.
  - `App.tsx`: 3010 lines.
  - `router.ts`: 2962 lines.
- Fresh verification after this pass:
  - `corepack pnpm --filter @shopclip/web lint`: passed.
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`: passed, 161 tests.
  - `corepack pnpm lint`: passed.
  - `corepack pnpm typecheck`: passed.
  - `corepack pnpm test`: passed, 365 tests across shared/API/web.
  - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Continue reducing `apps/web/src/features/edit/SmartEditPanel.tsx`; next safer candidates are property tab rendering or selected segment inspector group wrapper cleanup.
2. Continue refining `SmartEditTrackClipSegmentInspector.tsx` only if repeated timing controls are worth extracting; it is now 330 lines and less duplicative.
3. Continue splitting `apps/web/src/app/App.tsx`; next safer candidates are project lifecycle helper functions or project asset mutation helpers.
4. Continue smaller API cleanup only if needed around remaining route orchestration in `apps/api/src/modules/projects/router.ts`.
5. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 Smart Edit Inspector Tabs Extraction

- Extracted Smart Edit inspector property tab rendering from `apps/web/src/features/edit/SmartEditPanel.tsx` into `apps/web/src/features/edit/SmartEditInspectorTabs.tsx`.
- Moved the derived active-state logic for clip/audio/text/effects/state tabs into a focused presentational component.
- Kept selected segment, selected track clip, selected batch count, and all inspector content ownership in `SmartEditPanel.tsx`.
- Current file sizes:
  - `SmartEditPanel.tsx`: 3357 lines.
  - `SmartEditInspectorTabs.tsx`: 59 lines.
  - `SmartEditTrackClipSegmentInspector.tsx`: 330 lines.
  - `App.tsx`: 3010 lines.
  - `router.ts`: 2962 lines.
- Fresh verification after this pass:
  - `corepack pnpm --filter @shopclip/web lint`: passed.
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`: passed, 161 tests.
  - `corepack pnpm lint`: passed.
  - `corepack pnpm typecheck`: passed.
  - `corepack pnpm test`: passed, 365 tests across shared/API/web.
  - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Continue reducing `apps/web/src/features/edit/SmartEditPanel.tsx`; next safer candidate is selected segment inspector group wrapper cleanup.
2. Continue refining `SmartEditTrackClipSegmentInspector.tsx` only if repeated timing controls are worth extracting; it is now 330 lines and less duplicative.
3. Continue splitting `apps/web/src/app/App.tsx`; next safer candidates are project lifecycle helper functions or project asset mutation helpers.
4. Continue smaller API cleanup only if needed around remaining route orchestration in `apps/api/src/modules/projects/router.ts`.
5. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 Smart Edit Selected Segment Inspector Group Extraction

- Extracted selected segment inspector composition from `apps/web/src/features/edit/SmartEditPanel.tsx` into `apps/web/src/features/edit/SmartEditSelectedSegmentInspectorGroup.tsx`.
- Moved the grouping of timing, transform, optional advanced visual effects, optional mask keyframes, audio envelope, and copy/state inspectors into the wrapper component.
- Kept reorder plan mutations, command history labels, segment update callbacks, visual effect mutations, audio keyframe mutations, and selected segment ownership in `SmartEditPanel.tsx`.
- Removed direct selected-segment child inspector imports from `SmartEditPanel.tsx`; it now imports only the group wrapper.
- Current file sizes:
  - `SmartEditPanel.tsx`: 3327 lines.
  - `SmartEditSelectedSegmentInspectorGroup.tsx`: 141 lines.
  - `SmartEditInspectorTabs.tsx`: 59 lines.
  - `App.tsx`: 3010 lines.
  - `router.ts`: 2962 lines.
- Fresh verification after this pass:
  - `corepack pnpm --filter @shopclip/web lint`: passed.
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`: passed, 161 tests.
  - `corepack pnpm lint`: passed.
  - `corepack pnpm typecheck`: passed.
  - `corepack pnpm test`: passed, 365 tests across shared/API/web.
  - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Continue reducing `apps/web/src/features/edit/SmartEditPanel.tsx`; next safer candidates are editor header/status strip extraction or timeline toolbar prop grouping.
2. Continue splitting `apps/web/src/app/App.tsx`; next safer candidates are project lifecycle helper functions or project asset mutation helpers.
3. Continue smaller API cleanup only if needed around remaining route orchestration in `apps/api/src/modules/projects/router.ts`.
4. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 Smart Edit Editor Chrome And Status Strip Extraction

- Extracted Smart Edit editor action chrome from `apps/web/src/features/edit/SmartEditPanel.tsx` into `apps/web/src/features/edit/SmartEditEditorChrome.tsx`.
- Extracted the Smart Edit status summary strip from `SmartEditPanel.tsx` into `apps/web/src/features/edit/SmartEditStatusStrip.tsx`.
- Moved render-ready display, shortcut/export chrome, enabled duration, timeline total, selected segment summary, selected source, and audio labels into focused presentational components.
- Kept asset tab state, render/export data derivation, selected segment derivation, and all editor keyboard/timeline behavior in `SmartEditPanel.tsx`.
- Removed now-unused lucide icon imports from `SmartEditPanel.tsx`.
- Current file sizes:
  - `SmartEditPanel.tsx`: 3284 lines.
  - `SmartEditEditorChrome.tsx`: 28 lines.
  - `SmartEditStatusStrip.tsx`: 56 lines.
  - `App.tsx`: 3010 lines.
  - `router.ts`: 2962 lines.
- Fresh verification after this pass:
  - `corepack pnpm --filter @shopclip/web lint`: passed.
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`: passed, 161 tests.
  - `corepack pnpm lint`: passed.
  - `corepack pnpm typecheck`: passed.
  - `corepack pnpm test`: passed, 365 tests across shared/API/web.
  - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Continue reducing `apps/web/src/features/edit/SmartEditPanel.tsx`; next safer candidate is timeline toolbar prop grouping or asset tab rail extraction.
2. Continue splitting `apps/web/src/app/App.tsx`; next safer candidates are project lifecycle helper functions or project asset mutation helpers.
3. Continue smaller API cleanup only if needed around remaining route orchestration in `apps/api/src/modules/projects/router.ts`.
4. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 Smart Edit Asset Tab Rail Extraction

- Extracted the Smart Edit asset tab rail from `apps/web/src/features/edit/SmartEditPanel.tsx` into `apps/web/src/features/edit/SmartEditAssetTabRail.tsx`.
- Moved the OpenCut rail mapping, tab icon rendering, active tab class, and tab click wiring into the focused rail component.
- Kept `activeAssetTab` state ownership, tab switching state update, and asset bin content ownership in `SmartEditPanel.tsx`.
- Removed direct `smartEditAssetTabs` usage from `SmartEditPanel.tsx`; the rail component now owns that rendering dependency.
- Current file sizes:
  - `SmartEditPanel.tsx`: 3272 lines.
  - `SmartEditAssetTabRail.tsx`: 29 lines.
  - `SmartEditEditorChrome.tsx`: 28 lines.
  - `App.tsx`: 3010 lines.
  - `router.ts`: 2962 lines.
- Fresh verification after this pass:
  - `corepack pnpm --filter @shopclip/web lint`: passed.
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`: passed, 161 tests.
  - `corepack pnpm lint`: passed.
  - `corepack pnpm typecheck`: passed.
  - First `corepack pnpm test`: failed once in `apps/api/src/modules/media/realMediaProcessing.test.ts` with a 5000 ms timeout and Windows temp-file `EBUSY` unlink error.
  - Targeted `corepack pnpm --filter @shopclip/api test -- src/modules/media/realMediaProcessing.test.ts`: passed, 178 API tests in that filtered invocation.
  - Second `corepack pnpm test`: passed, 365 tests across shared/API/web.
  - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Continue reducing `apps/web/src/features/edit/SmartEditPanel.tsx`; next safer candidate is timeline toolbar prop grouping, or switch focus to `App.tsx`.
2. Continue splitting `apps/web/src/app/App.tsx`; next safer candidates are project lifecycle helper functions or project asset mutation helpers.
3. Continue smaller API cleanup only if needed around remaining route orchestration in `apps/api/src/modules/projects/router.ts`.
4. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 App Asset Import Helper Extraction

- Extracted the imported file upload, storage upload, automatic structure processing, and asset-slice collection helper from `apps/web/src/app/App.tsx` into `apps/web/src/app/AppAssetImportUtils.ts`.
- Kept `App.tsx` as the public re-export point for `importAndStructureFiles`, so existing `App.test.tsx` imports and any external App-module helper imports remain unchanged.
- Removed direct `createAssetUploadIntent`, `uploadAssetFileToStorage`, `createAssetInputFromFile`, and `shouldAutoProcessImportedAsset` helper coupling from the main App component module where no longer needed.
- Kept project asset-library mutation, active project state updates, toast/error handling, and local project snapshot merge ownership in `App.tsx`.
- Current file sizes:
  - `App.tsx`: 3137 lines.
  - `AppAssetImportUtils.ts`: 55 lines.
  - `SmartEditPanel.tsx`: 3383 lines.
  - `router.ts`: 3212 lines.
- Fresh verification after this pass:
  - `corepack pnpm --filter @shopclip/web lint`: passed.
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`: passed, 161 tests.
  - `corepack pnpm lint`: passed.
  - `corepack pnpm typecheck`: passed.
  - `corepack pnpm test`: passed, 365 tests across shared/API/web.
  - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Continue splitting `apps/web/src/app/App.tsx`; next safer candidates are project lifecycle helpers, project asset mutation helpers, or moving `getGenerationTaskText` into a focused background-task text utility.
2. Continue reducing `apps/web/src/features/edit/SmartEditPanel.tsx`; next safer candidate is timeline toolbar prop grouping or another presentational wrapper extraction.
3. Continue smaller API cleanup around remaining orchestration in `apps/api/src/modules/projects/router.ts`; prefer route-service boundaries over broad rewrites.
4. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 App Background Task Text Extraction

- Extracted `getGenerationTaskText` from `apps/web/src/app/App.tsx` into `apps/web/src/app/AppBackgroundTaskText.ts`.
- Isolated bilingual background-task title/description mapping from the main App orchestration module.
- Kept background-task lifecycle, task target derivation, render-task merge behavior, and task click navigation ownership in `App.tsx` and `useBackgroundTaskTracker.ts`.
- Current file sizes:
  - `App.tsx`: 3067 lines.
  - `AppBackgroundTaskText.ts`: 107 lines.
  - `AppAssetImportUtils.ts`: 55 lines.
  - `SmartEditPanel.tsx`: 3383 lines.
  - `router.ts`: 3212 lines.
- Fresh verification after this pass:
  - `corepack pnpm --filter @shopclip/web lint`: passed.
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`: passed, 161 tests.
  - `corepack pnpm lint`: passed.
  - `corepack pnpm typecheck`: passed.
  - `corepack pnpm test`: passed, 365 tests across shared/API/web.
  - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Continue splitting `apps/web/src/app/App.tsx`; next safer candidates are project lifecycle helpers, project asset mutation helpers, or moving asset-prep snapshot helpers into a focused project asset utility.
2. Continue reducing `apps/web/src/features/edit/SmartEditPanel.tsx`; next safer candidate is timeline toolbar prop grouping or another presentational wrapper extraction.
3. Continue smaller API cleanup around remaining orchestration in `apps/api/src/modules/projects/router.ts`; prefer route-service boundaries over broad rewrites.
4. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 App Project Asset Utils Extraction

- Extracted project asset filtering, reference script asset filtering, prepared asset bucket grouping, project asset-prep snapshot creation, and deleted-asset pruning from `apps/web/src/app/App.tsx` into `apps/web/src/app/AppProjectAssetUtils.ts`.
- Kept `App.tsx` as the public re-export point for these helpers, so existing `App.test.tsx` imports remain unchanged.
- Kept project state mutation, asset library refresh, loaded project hydration, and delete-flow state updates in `App.tsx`.
- Current file sizes:
  - `App.tsx`: 2973 lines.
  - `AppProjectAssetUtils.ts`: 110 lines.
  - `AppBackgroundTaskText.ts`: 107 lines.
  - `AppAssetImportUtils.ts`: 55 lines.
  - `SmartEditPanel.tsx`: 3383 lines.
  - `router.ts`: 3212 lines.
- Fresh verification after this pass:
  - `corepack pnpm --filter @shopclip/web lint`: passed.
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`: passed, 161 tests.
  - `corepack pnpm lint`: passed.
  - `corepack pnpm typecheck`: passed.
  - `corepack pnpm test`: passed, 365 tests across shared/API/web.
  - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Continue splitting `apps/web/src/app/App.tsx`; next safer candidates are project lifecycle helpers or project asset mutation helpers, but keep stateful orchestration inside App until a cleaner hook boundary is obvious.
2. Continue reducing `apps/web/src/features/edit/SmartEditPanel.tsx`; next safer candidate is timeline toolbar prop grouping or another presentational wrapper extraction.
3. Continue smaller API cleanup around remaining orchestration in `apps/api/src/modules/projects/router.ts`; prefer route-service boundaries over broad rewrites.
4. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 App Project Mutation Utils Extraction

- Extracted pure `ProjectSnapshot` update helpers from repeated inline App state mutations into `apps/web/src/app/AppProjectMutationUtils.ts`.
- Consolidated script replace/delete, render-task replace/delete, single-scene replacement, and simple project scene replacement helpers.
- Updated `App.tsx` to use these helpers for project video refresh, loading a script into the studio, scene replacement, project script delete/rename, and project render-task delete/rename.
- Kept stateful project lifecycle orchestration, project deletion reset flow, render polling status updates, generated storyboard status updates, and script-scene membership filtering in `App.tsx` where behavior is more contextual.
- Current file sizes:
  - `App.tsx`: 2924 lines.
  - `AppProjectMutationUtils.ts`: 79 lines.
  - `AppProjectAssetUtils.ts`: 110 lines.
  - `SmartEditPanel.tsx`: 3383 lines.
  - `router.ts`: 3212 lines.
- Fresh verification after this pass:
  - `corepack pnpm --filter @shopclip/web lint`: passed.
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`: passed, 161 tests.
  - `corepack pnpm lint`: passed.
  - `corepack pnpm typecheck`: passed.
  - `corepack pnpm test`: passed, 365 tests across shared/API/web.
  - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Continue splitting `apps/web/src/app/App.tsx`; next safer candidates are localized project lifecycle reset helpers or a narrowly scoped hook only if it can preserve current orchestration clearly.
2. Continue reducing `apps/web/src/features/edit/SmartEditPanel.tsx`; next safer candidate is timeline toolbar prop grouping or another presentational wrapper extraction.
3. Continue smaller API cleanup around remaining orchestration in `apps/api/src/modules/projects/router.ts`; prefer route-service boundaries over broad rewrites.
4. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 Smart Edit Timeline Toolbar Props Grouping

- Grouped `SmartEditTimelineToolbar` inputs into explicit `state` and `actions` objects instead of 30+ flat props.
- Exported `SmartEditTimelineToolbarState` and `SmartEditTimelineToolbarActions` types to make the boundary between toolbar display state and command callbacks explicit.
- Updated `SmartEditPanel.tsx` to build typed toolbar config objects before render and pass only `copy`, `state`, and `actions` into the toolbar JSX.
- Kept timeline state ownership, command history, selection helpers, preview-range mutations, clipboard commands, and timeline edit commands in `SmartEditPanel.tsx`.
- This pass improved interface shape and render readability, but did not reduce line count; the typed grouping added a small number of lines.
- Current file sizes:
  - `SmartEditPanel.tsx`: 3393 lines.
  - `SmartEditTimelineToolbar.tsx`: 263 lines.
  - `App.tsx`: 2924 lines.
  - `router.ts`: 3212 lines.
- Fresh verification after this pass:
  - `corepack pnpm --filter @shopclip/web lint`: passed.
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`: passed, 161 tests.
  - `corepack pnpm lint`: passed.
  - `corepack pnpm typecheck`: passed.
  - `corepack pnpm test`: passed, 365 tests across shared/API/web.
  - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Continue reducing `apps/web/src/features/edit/SmartEditPanel.tsx`; next safer target should be an actual presentational extraction or moving config construction out of the panel, not another props-only grouping.
2. Continue splitting `apps/web/src/app/App.tsx`; next safer candidates are localized project lifecycle reset helpers or a narrowly scoped hook only if it can preserve current orchestration clearly.
3. Continue smaller API cleanup around remaining orchestration in `apps/api/src/modules/projects/router.ts`; prefer route-service boundaries over broad rewrites.
4. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 Smart Edit Inspector Panel Extraction

- Extracted the Smart Edit inspector composition from `apps/web/src/features/edit/SmartEditPanel.tsx` into `apps/web/src/features/edit/SmartEditInspectorPanel.tsx`.
- Moved inspector tabs, selected track-clip segment inspector, selected timeline element inspector, selected segment inspector group, and the compact empty state into the new presentational wrapper.
- Kept selected segment/track/timeline-element derivation, relink/slip/update handlers, keyframe mutations, reorder operations, and all plan mutation ownership in `SmartEditPanel.tsx`.
- Removed direct child inspector imports from `SmartEditPanel.tsx`; the panel now imports only the wrapper.
- Current file sizes:
  - `SmartEditPanel.tsx`: 3365 lines.
  - `SmartEditInspectorPanel.tsx`: 199 lines.
  - `SmartEditTimelineToolbar.tsx`: 263 lines.
  - `App.tsx`: 2924 lines.
  - `router.ts`: 3212 lines.
- Fresh verification after this pass:
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web lint`: passed.
  - `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`: passed, 161 tests.
  - `corepack pnpm lint`: passed.
  - `corepack pnpm typecheck`: passed.
  - `corepack pnpm test`: passed, 365 tests across shared/API/web.
  - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Continue reducing `apps/web/src/features/edit/SmartEditPanel.tsx`; next candidates should be actual render/interaction sections, such as track stack wrapper composition, not props-only grouping.
2. Continue smaller API cleanup around remaining orchestration in `apps/api/src/modules/projects/router.ts`; prefer route-service boundaries over broad rewrites.
3. Continue splitting `apps/web/src/app/App.tsx` only for clear lifecycle/reset helper boundaries.
4. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 API Script Prompt Context Extraction

- Extracted script-generation prompt construction from `apps/api/src/modules/projects/router.ts` into `apps/api/src/modules/projects/scriptPromptContext.ts`.
- Moved prompt-only concerns into the new module:
  - `ScriptPromptContext`.
  - `buildScriptAssetPromptLines`.
  - `scriptGenerationPrompt`.
  - internal prompt helpers for brand documents, structured assets, reference breakdowns, and viral templates.
- Kept route-level orchestration in `router.ts`, including prompt-context resolution, request parsing, store access, provider fallback, response shaping, and route registration.
- Re-exported `buildScriptAssetPromptLines` and `scriptGenerationPrompt` from `router.ts` to preserve existing test imports while the implementation now lives in the focused prompt module.
- Current file sizes:
  - `router.ts`: 3002 lines.
  - `scriptPromptContext.ts`: 222 lines.
  - `App.tsx`: 2924 lines.
  - `SmartEditPanel.tsx`: 3365 lines.
- Fresh verification after this pass:
  - `corepack pnpm --filter @shopclip/api lint`: passed.
  - `.\node_modules\.bin\vitest.CMD run src/modules/projects/scriptPromptContext.test.ts` from `apps/api`: passed, 4 tests.
  - `corepack pnpm lint`: passed.
  - `corepack pnpm typecheck`: passed.
  - `corepack pnpm test`: passed, 367 tests across shared/API/web. The previously flaky Windows media-processing tests passed in this run.
  - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-C789zVwk.js` at 599.54 kB minified.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Continue reducing `apps/web/src/features/edit/SmartEditPanel.tsx`; next candidates should be actual render/interaction sections, such as track stack wrapper composition, timeline section composition, or moving stable derived config into focused helpers.
2. Continue splitting `apps/web/src/app/App.tsx` only for clear lifecycle/reset helper boundaries; avoid extracting stateful orchestration until a hook boundary is clear.
3. Continue smaller API cleanup around remaining orchestration in `apps/api/src/modules/projects/router.ts`; prefer route-service boundaries over broad rewrites.
4. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 Smart Edit Track Stack Extraction

- Extracted the Smart Edit track stack composition from `apps/web/src/features/edit/SmartEditPanel.tsx` into `apps/web/src/features/edit/SmartEditTrackStack.tsx`.
- Moved the track stack container, drag/drop target wiring, `SmartEditTrackStackHeader`, per-track `SmartEditTrackRow` rendering, and `SmartEditTimelineContextMenu` composition into the new wrapper.
- Kept timeline ownership in `SmartEditPanel.tsx`: selected segment/clip state, drag state, playback/playhead state, track mutations, timeline context menu state, and all command handlers remain in the main panel.
- Added `trackPresentationState` in `SmartEditPanel.tsx` so muted/hidden/locked/selectable-count derivation is explicit at the orchestration boundary instead of embedded in JSX mapping.
- Current file sizes:
  - `SmartEditPanel.tsx`: 3317 lines.
  - `SmartEditTrackStack.tsx`: 327 lines.
  - `SmartEditInspectorPanel.tsx`: 199 lines.
  - `router.ts`: 3002 lines.
- Fresh verification after this pass:
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web lint`: passed.
  - `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`: passed, 161 tests.
  - `corepack pnpm lint`: passed.
  - `corepack pnpm typecheck`: passed.
  - `corepack pnpm test`: passed, 367 tests across shared/API/web. The previously flaky Windows media-processing tests passed in this run.
  - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-BHpmq4-R.js` at 602.81 kB minified.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Continue reducing `apps/web/src/features/edit/SmartEditPanel.tsx`; next candidates are stable derived config/helper extraction or another render section with clear state boundaries.
2. Continue splitting `apps/web/src/app/App.tsx` only for clear lifecycle/reset helper boundaries; avoid extracting stateful orchestration until a hook boundary is clear.
3. Continue smaller API cleanup around remaining orchestration in `apps/api/src/modules/projects/router.ts`; prefer route-service boundaries over broad rewrites.
4. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 Smart Edit Track Derived State Extraction

- Extracted track-derived calculation helpers from `apps/web/src/features/edit/SmartEditPanel.tsx` into `apps/web/src/features/edit/SmartEditTrackDerivedState.ts`.
- Moved pure calculations for:
  - flattened track clips.
  - track edit points.
  - selected track clip lookup.
  - selected batch track clip filtering.
  - text timeline material detection.
  - track clip drag preview construction.
  - track clip trim preview construction.
- Removed the empty `export type {}` block left in `SmartEditPanel.tsx`.
- Kept UI state ownership and mutation commands in `SmartEditPanel.tsx`; the new file contains pure derived-state helpers only.
- Current file sizes:
  - `SmartEditPanel.tsx`: 3262 lines.
  - `SmartEditTrackDerivedState.ts`: 145 lines.
  - `SmartEditTrackStack.tsx`: 327 lines.
  - `router.ts`: 3002 lines.
- Fresh verification after this pass:
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web lint`: passed.
  - `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`: passed, 161 tests.
  - `corepack pnpm lint`: passed.
  - `corepack pnpm typecheck`: passed.
  - `corepack pnpm test`: passed, 367 tests across shared/API/web. The previously flaky Windows media-processing tests passed in this run.
  - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-MPWiuXU-.js` at 603.35 kB minified.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Continue reducing `apps/web/src/features/edit/SmartEditPanel.tsx`; next candidates are command-handler grouping, stable toolbar/config helpers, or another render section with clear state boundaries.
2. Continue splitting `apps/web/src/app/App.tsx` only for clear lifecycle/reset helper boundaries; avoid extracting stateful orchestration until a hook boundary is clear.
3. Continue smaller API cleanup around remaining orchestration in `apps/api/src/modules/projects/router.ts`; prefer route-service boundaries over broad rewrites.
4. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 App Workspace Derived State Extraction

- Extracted App-level workspace derived selectors from `apps/web/src/app/App.tsx` into `apps/web/src/app/AppWorkspaceDerivedState.ts`.
- Moved pure App data selection for:
  - active asset-category filtering.
  - creation-usable asset selection.
  - studio asset de-duplication.
  - Smart Edit asset slice merging.
  - prepared project asset buckets.
  - script reference library merging.
  - script reference asset selection.
  - pending reference status detection.
  - script template library merging.
- Kept App state ownership, effects, network operations, navigation, and project/studio lifecycle orchestration inside `App.tsx`.
- Preserved existing `App.tsx` re-exports used by tests, including `hasActivePendingReferenceAnalysis`.
- Current file sizes:
  - `App.tsx`: 2927 lines.
  - `AppWorkspaceDerivedState.ts`: 68 lines.
  - `SmartEditPanel.tsx`: 3262 lines.
  - `router.ts`: 3002 lines.
- Fresh verification after this pass:
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web lint`: passed.
  - `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`: passed, 161 tests.
  - `corepack pnpm lint`: passed.
  - `corepack pnpm typecheck`: passed.
  - `corepack pnpm test`: passed, 367 tests across shared/API/web. The previously flaky Windows media-processing tests passed in this run.
  - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-DGNCg2xk.js` at 603.39 kB minified.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Continue reducing `apps/web/src/app/App.tsx`; next candidates are narrow lifecycle/reset helpers or grouping project/reference refresh orchestration if a clean boundary is clear.
2. Continue reducing `apps/web/src/features/edit/SmartEditPanel.tsx`; next candidates are command-handler grouping, stable toolbar/config helpers, or another render section with clear state boundaries.
3. Continue smaller API cleanup around remaining orchestration in `apps/api/src/modules/projects/router.ts`; prefer route-service boundaries over broad rewrites.
4. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 App Project Lifecycle Utils Extraction

- Extracted small project lifecycle helpers from `apps/web/src/app/App.tsx` into `apps/web/src/app/AppProjectLifecycleUtils.ts`.
- Moved pure helper logic for:
  - mapping a `ProjectSnapshot` into a `ProjectBrief` via `createBriefFromProject`.
  - replacing one asset category in the current asset library via `replaceAssetCategoryInLibrary`.
- Updated `App.tsx` call sites for project sync, project load, project brief update, and asset-library refresh to use these helpers.
- Kept network calls, loading flags, error handling, state setters, and project/reference refresh orchestration inside `App.tsx`.
- Re-exported the helpers from `App.tsx` to preserve the current test-facing utility surface.
- Current file sizes:
  - `App.tsx`: 2879 lines.
  - `AppProjectLifecycleUtils.ts`: 50 lines.
  - `AppWorkspaceDerivedState.ts`: 68 lines.
  - `SmartEditPanel.tsx`: 3262 lines.
  - `router.ts`: 3002 lines.
- Fresh verification after this pass:
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web lint`: passed.
  - `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`: passed, 161 tests.
  - `corepack pnpm lint`: passed.
  - `corepack pnpm typecheck`: passed.
  - `corepack pnpm test`: passed, 367 tests across shared/API/web. The previously flaky Windows media-processing tests passed in this run.
  - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-1i0L0r37.js` at 603.07 kB minified.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Continue reducing `apps/web/src/app/App.tsx`; next candidates are project/reference refresh orchestration only if a clean hook or service boundary is clear.
2. Continue reducing `apps/web/src/features/edit/SmartEditPanel.tsx`; next candidates are command-handler grouping, stable toolbar/config helpers, or another render section with clear state boundaries.
3. Continue smaller API cleanup around remaining orchestration in `apps/api/src/modules/projects/router.ts`; prefer route-service boundaries over broad rewrites.
4. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 API HTTP Response Utils Extraction

- Extracted shared project-route HTTP error response helpers from `apps/api/src/modules/projects/router.ts` into `apps/api/src/modules/projects/httpResponseUtils.ts`.
- Moved:
  - `sendNotFound`.
  - `sendInvalidRequest`.
  - `sendScriptGenerationFailure`.
- Removed the now-unneeded Express `Response` type import from `router.ts`.
- Kept route registration, store operations, provider calls, request validation, and response call sites inside `router.ts`; this pass only moved repeated response formatting helpers.
- Current file sizes:
  - `router.ts`: 2976 lines.
  - `httpResponseUtils.ts`: 31 lines.
  - `App.tsx`: 2879 lines.
  - `SmartEditPanel.tsx`: 3262 lines.
- Fresh verification after this pass:
  - `corepack pnpm --filter @shopclip/api typecheck`: passed.
  - `corepack pnpm --filter @shopclip/api lint`: passed.
  - `corepack pnpm --filter @shopclip/api test -- src/modules/projects/scriptPromptContext.test.ts src/p0-flow.test.ts`: passed; because of the package script argument behavior this ran the full API suite, 33 test files and 178 tests.
  - `corepack pnpm lint`: passed.
  - `corepack pnpm typecheck`: passed.
  - `corepack pnpm test`: passed, 367 tests across shared/API/web. The previously flaky Windows media-processing tests passed in this run.
  - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-1i0L0r37.js` at 603.07 kB minified.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Continue smaller API cleanup around remaining orchestration in `apps/api/src/modules/projects/router.ts`; next candidates are storyboard image prompt/render helpers or narrow route-service extraction if dependencies stay contained.
2. Continue reducing `apps/web/src/app/App.tsx`; next candidates are project/reference refresh orchestration only if a clean hook or service boundary is clear.
3. Continue reducing `apps/web/src/features/edit/SmartEditPanel.tsx`; next candidates are command-handler grouping, stable toolbar/config helpers, or another render section with clear state boundaries.
4. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 API Storyboard Image Service Extraction

- Extracted storyboard image generation helpers from `apps/api/src/modules/projects/router.ts` into `apps/api/src/modules/projects/storyboardImageService.ts`.
- Moved:
  - `buildStoryboardImagePrompt`.
  - `generateStoryboardSceneImageUrl`.
  - `renderStoryboardSceneImages`.
- The new service owns storyboard image prompt construction, reference-image resolution, text-only retry behavior, deterministic fallback usage, and per-scene image URL materialization.
- Kept route registration, request validation, project/script persistence, and route response shaping inside `router.ts`.
- Removed the now-unused `ScriptResult` type import from `router.ts`.
- Current file sizes:
  - `router.ts`: 2786 lines.
  - `storyboardImageService.ts`: 207 lines.
  - `httpResponseUtils.ts`: 31 lines.
  - `App.tsx`: 2879 lines.
  - `SmartEditPanel.tsx`: 3262 lines.
- Fresh verification after this pass:
  - `corepack pnpm --filter @shopclip/api typecheck`: passed.
  - `corepack pnpm --filter @shopclip/api lint`: passed.
  - `corepack pnpm --filter @shopclip/api test -- src/p0-flow.test.ts src/part015-processing-flow.test.ts`: passed; because of the package script argument behavior this ran the full API suite, 33 test files and 178 tests.
  - `corepack pnpm lint`: passed.
  - `corepack pnpm typecheck`: passed.
  - `corepack pnpm test`: passed, 367 tests across shared/API/web. The previously flaky Windows media-processing tests passed in this run.
  - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-1i0L0r37.js` at 603.07 kB minified.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Continue smaller API cleanup around remaining orchestration in `apps/api/src/modules/projects/router.ts`; next candidates are Smart Edit job service extraction or script/reference route helpers if dependencies stay contained.
2. Continue reducing `apps/web/src/app/App.tsx`; next candidates are project/reference refresh orchestration only if a clean hook or service boundary is clear.
3. Continue reducing `apps/web/src/features/edit/SmartEditPanel.tsx`; next candidates are command-handler grouping, stable toolbar/config helpers, or another render section with clear state boundaries.
4. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 API Smart Edit Refresh Plan Utils Extraction

- Extracted pure Smart Edit refresh-plan construction from `apps/api/src/modules/projects/router.ts` into `apps/api/src/modules/projects/smartEditPlanUtils.ts`.
- Moved:
  - `buildSmartEditRefreshPlan`.
  - `smartEditFailureMessage`.
- Updated `buildSmartEditRefreshPlan` to receive `createId` and `nowIso` explicitly, keeping ID/time side effects in the route layer and the helper deterministic.
- Kept request validation, target scene lookup, provider calls, project persistence, task lifecycle, and HTTP response shaping inside `router.ts`.
- Current file sizes:
  - `router.ts`: 2721 lines.
  - `smartEditPlanUtils.ts`: 431 lines.
  - `storyboardImageService.ts`: 207 lines.
  - `httpResponseUtils.ts`: 31 lines.
  - `App.tsx`: 2879 lines.
  - `SmartEditPanel.tsx`: 3262 lines.
- Fresh verification after this pass:
  - `corepack pnpm lint`: passed.
  - `corepack pnpm typecheck`: passed.
  - `corepack pnpm test`: passed, 365 tests across shared/API/web. The previously flaky Windows media-processing tests passed in this run.
  - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-1i0L0r37.js` at 603.07 kB minified.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Continue smaller API cleanup around remaining orchestration in `apps/api/src/modules/projects/router.ts`; next candidates are a narrow Smart Edit route-service boundary or reference/script route helpers if dependencies stay contained.
2. Continue reducing `apps/web/src/app/App.tsx`; next candidates are project/reference refresh orchestration only if a clean hook or service boundary is clear.
3. Continue reducing `apps/web/src/features/edit/SmartEditPanel.tsx`; next candidates are command-handler grouping, stable toolbar/config helpers, or another render section with clear state boundaries.
4. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 API Smart Edit Job Service Extraction

- Extracted Smart Edit background task orchestration from `apps/api/src/modules/projects/router.ts` into `apps/api/src/modules/projects/smartEditJobService.ts`.
- Moved:
  - `runSmartEditJob`.
  - `runSmartEditSegmentRefreshJob`.
  - `SmartEditPlanner` / `SmartEditComposer` service-facing types.
- `router.ts` now keeps Smart Edit route validation, render-task queue creation, response shaping, and background task dispatch; the new service owns planning/composition progress updates, fallback handling, segment refresh reuse, material backfill, and final render-task completion updates.
- Current file sizes:
  - `router.ts`: 2325 lines.
  - `smartEditJobService.ts`: 411 lines.
  - `smartEditPlanUtils.ts`: 431 lines.
  - `App.tsx`: 2879 lines.
  - `SmartEditPanel.tsx`: 3262 lines.
- Fresh verification after this pass:
  - `corepack pnpm --filter @shopclip/api typecheck`: passed.
  - `corepack pnpm --filter @shopclip/api lint`: passed.
  - `corepack pnpm --filter @shopclip/api test -- src/smart-edit-flow.test.ts src/modules/projects/scriptPromptContext.test.ts`: passed; because of the package script argument behavior this ran the full API suite, 33 test files and 178 tests.
  - `corepack pnpm lint`: passed.
  - `corepack pnpm typecheck`: passed.
  - `corepack pnpm test`: passed, 365 tests across shared/API/web. The previously flaky Windows media-processing tests passed in this run.
  - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-1i0L0r37.js` at 603.07 kB minified.
  - `git diff --check`: passed; Git still reports existing CRLF-to-LF normalization warnings for a few touched files.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Continue smaller API cleanup only where route-service boundaries are clear; `router.ts` is now much smaller, so avoid broad API rewrites unless a handler cluster has an obvious ownership boundary.
2. Continue reducing `apps/web/src/app/App.tsx`; next candidates are project/reference refresh orchestration only if a clean hook or service boundary is clear.
3. Continue reducing `apps/web/src/features/edit/SmartEditPanel.tsx`; next candidates are command-handler grouping, stable toolbar/config helpers, or another render section with clear state boundaries.
4. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 Smart Edit Track Derived State Follow-Up

- Extended `apps/web/src/features/edit/SmartEditTrackDerivedState.ts` with pure timeline/track selection helpers.
- Moved these calculations out of `apps/web/src/features/edit/SmartEditPanel.tsx`:
  - selected timeline-element lookup.
  - selected text timeline line counting.
  - linked timeline-element lookup.
  - relink eligibility checks.
  - Smart Edit track-to-timeline-track ID mapping.
  - track presentation state and locked-track lookup.
- Kept React state ownership, command handlers, drag handlers, and mutation callbacks in `SmartEditPanel.tsx`.
- Current file sizes:
  - `SmartEditPanel.tsx`: 3221 lines.
  - `SmartEditTrackDerivedState.ts`: 243 lines.
  - `App.tsx`: 2879 lines.
  - `router.ts`: 2325 lines.
- Fresh verification after this pass:
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web lint`: passed.
  - `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`: passed, 161 tests.
  - `corepack pnpm lint`: passed.
  - `corepack pnpm typecheck`: passed.
  - `corepack pnpm test`: passed, 365 tests across shared/API/web. The previously flaky Windows media-processing tests passed in this run.
  - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-Bt6Ziqvd.js` at 603.18 kB minified.
  - `git diff --check`: passed; Git still reports existing CRLF-to-LF normalization warnings for a few touched files.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Continue reducing `apps/web/src/features/edit/SmartEditPanel.tsx`; next candidates are command-handler grouping or another render/interaction section with a clearer ownership boundary.
2. Continue reducing `apps/web/src/app/App.tsx`; next candidates are project/reference refresh orchestration only if a clean hook or service boundary is clear.
3. Continue smaller API cleanup only where route-service boundaries are clear; avoid broad API rewrites after the router reduction unless a handler cluster has obvious ownership.
4. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-09 API Smart Edit Timeline Plan Extraction

- Extracted Smart Edit renderer timeline-plan construction from `apps/api/src/providers/renderer/smartEditComposer.ts` into `apps/api/src/providers/renderer/smartEditTimelinePlan.ts`.
- Moved selected helper ownership for:
  - timeline duration normalization.
  - scene clip, trim, text, voice, BGM, and source-audio clip plan construction.
  - empty timeline fallback scene insertion.
  - timeline render-plan assembly and filter ordering.
- Kept ffmpeg execution, material download, subtitle rendering, upload publishing, and composer dependency orchestration inside `smartEditComposer.ts`.
- Current file sizes:
  - `smartEditComposer.ts`: 1844 lines.
  - `smartEditTimelinePlan.ts`: 316 lines.
  - `smartEditTimelinePlan.test.ts`: 269 lines.
  - `SmartEditPanel.tsx`: 2854 lines.
  - `App.tsx`: 2385 lines.
  - `router.ts`: 1935 lines.
- Fresh verification after this pass:
  - `D:\DemoV2\apps\api\node_modules\.bin\vitest.CMD run src/providers/renderer/smartEditTimelinePlan.test.ts src/providers/renderer/smartEditComposer.test.ts`: passed, 38 tests.
  - `corepack pnpm install --offline --frozen-lockfile`: completed in the isolated worktree to rebuild package links.
  - `corepack pnpm --filter @shopclip/api db:generate`: passed after network-enabled Prisma engine access; this regenerated Prisma Client types for the isolated worktree.
  - `corepack pnpm lint`: passed.
  - `corepack pnpm typecheck`: passed.
  - `corepack pnpm test`: passed, 551 tests total: shared 26, API 210, web 315.
  - `corepack pnpm build`: passed; Vite still reports the existing large chunk warning for `assets/index-De5NHyT2.js` at 607.03 kB minified.
- Branch/workspace note:
  - This optimization was moved back onto `codex/shopclip-optimization-cleanup` in the isolated worktree `D:\DemoV2\.worktrees\shopclip-optimization-cleanup`.
  - The main `D:\DemoV2` workspace remains on `codex/asset-preview-modal-ui` and still contains user frontend edits that were not staged, committed, or overwritten.

## 2026-06-09 API Smart Edit Subtitle Overlay Extraction

- Extracted Smart Edit renderer subtitle readability, segment ASS burn-in, and global timeline text overlay logic from `apps/api/src/providers/renderer/smartEditComposer.ts` into `apps/api/src/providers/renderer/smartEditSubtitleOverlay.ts`.
- Added focused tests in `apps/api/src/providers/renderer/smartEditSubtitleOverlay.test.ts` for readable subtitle selection, voiceover fallback for replacement-symbol captions, empty output for unreadable copy, and styled ASS global timeline text generation.
- Replaced a fragile mojibake regex with explicit marker/replacement character counting after the first targeted test run caught an esbuild regex parse failure.
- Kept segment video creation, audio track construction, ffmpeg concat/transition orchestration, upload publishing, and object-key construction inside `smartEditComposer.ts`.
- Current file sizes:
  - `smartEditComposer.ts`: 1602 lines.
  - `smartEditSubtitleOverlay.ts`: 300 lines.
  - `smartEditSubtitleOverlay.test.ts`: 77 lines.
  - `smartEditTimelinePlan.ts`: 316 lines.
  - `SmartEditPanel.tsx`: 2854 lines.
  - `App.tsx`: 2385 lines.
  - `router.ts`: 1935 lines.
- Fresh verification after this pass:
  - First targeted run failed because the migrated mojibake regex was invalid in esbuild; fixed by replacing it with explicit marker counting.
  - Second targeted run passed: `smartEditSubtitleOverlay.test.ts` and `smartEditComposer.test.ts`, 38 tests.
  - `corepack pnpm --filter @shopclip/api typecheck`: passed.
  - `corepack pnpm --filter @shopclip/api lint`: passed.
  - `corepack pnpm --filter @shopclip/api test`: passed, 214 API tests.
  - `corepack pnpm typecheck`: passed.
  - `corepack pnpm lint`: passed.
  - `corepack pnpm test`: passed, 555 tests total: shared 26, API 214, web 315.
  - `corepack pnpm build`: passed; Vite still reports the existing large chunk warning for `assets/index-De5NHyT2.js` at 607.03 kB minified.

## Current Optimization Queue

1. If deployment is still desired, push `codex/shopclip-optimization-cleanup`, deploy the branch to `/www/wwwroot/shopclip-ai`, and verify `https://shopclip.site/health`, `#project`, and `#studio`.
2. Continue reducing `apps/web/src/features/edit/SmartEditPanel.tsx`; next candidates are command-handler grouping or another render/interaction section with a clearer ownership boundary.
3. Continue reducing `apps/web/src/app/App.tsx`; next candidates are project/reference refresh orchestration only if a clean hook or service boundary is clear.
4. Continue smaller API cleanup only where route-service boundaries are clear; after the composer subtitle extraction, avoid broad render rewrites unless a helper cluster has obvious ownership.
5. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit its damaged legacy body.

## 2026-06-08 Smart Edit Selection Helpers Follow-Up

- Extracted repeated Smart Edit timeline-material selection state updates into local helpers inside `apps/web/src/features/edit/SmartEditPanel.tsx`.
- Added:
  - `clearSelectedTrackClips`.
  - `selectTimelineMaterialIds`.
- Replaced repeated selection blocks in media drop, source-audio detach, scene-video detach, rendered-scene materialization, range selection, all-material selection, track material selection, box selection, preview-range selection, cut operations, split text-by-lines, merge selected text, and pasted timeline material selection.
- Preserved Smart Edit state ownership inside `SmartEditPanel.tsx`; no new hook boundary was introduced because the state updates still depend on local component selection and callback ownership.
- Current file sizes:
  - `SmartEditPanel.tsx`: 3103 lines.
  - `SmartEditSegmentDerivedState.ts`: 65 lines.
  - `SmartEditTrackDerivedState.ts`: 293 lines.
  - `SmartEditKeyboardShortcuts.ts`: 157 lines.
  - `App.tsx`: 2871 lines.
  - `router.ts`: 2325 lines.
- Verification completed before full release gate:
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web lint`: passed.
  - `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`: passed, 161 tests.
- Localhost validation notes:
  - `corepack pnpm --filter @shopclip/web dev` starts Vite successfully at `http://localhost:5173/`.
  - `PROJECT_STORE_MODE=memory; corepack pnpm --filter @shopclip/api dev` starts the API successfully in foreground mode at `http://localhost:4000`.
  - Background process startup in this Windows Codex shell was unreliable, so persistent localhost browser validation was limited. A Playwright page check against Web + default local API showed the page loaded but API project listing returned 500 because the default local Prisma store could not reach PostgreSQL at `127.0.0.1:5432`; this is an environment setup issue, not a Smart Edit code regression.

## Current Optimization Queue

1. Run the full release gate (`lint`, `typecheck`, `test`, `build`, `git diff --check`, memory tracking check) before deciding whether production deployment risk is acceptable.
2. If full verification passes, move the current work to a dedicated branch before committing, pushing, and deploying.
3. Keep `.codex` local verification logs/scripts and `.agents/memory` out of any commit.
4. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 Full Release Gate Before Deployment Decision

- Risk decision: deployment risk is acceptable only after a branch commit and post-deploy production checks, because the refactor is broad but covered by current full verification.
- Verification:
  - `corepack pnpm lint`: passed.
  - `corepack pnpm typecheck`: passed.
  - `corepack pnpm test`: passed, 365 tests across shared/API/web; the Windows real media processing tests passed in this run.
  - `corepack pnpm build`: passed; Vite reports the existing chunk-size warning for `assets/index-SPfbYdL_.js` at 604.10 kB minified.
  - `git diff --check`: passed; Git still reports CRLF-to-LF normalization warnings for `router.ts`, `App.tsx`, and `SmartEditPanel.tsx`.
  - `git ls-files .agents/memory`: empty.
- Commit/deploy guardrails:
  - Use a dedicated `codex/` branch before committing.
  - Exclude `.codex` local verification scripts/logs.
  - Exclude `.agents/memory`.
  - Verify `shopclip.site` after deployment before considering the optimization pass complete.

## 2026-06-08 Smart Edit Selection Derived Helpers Follow-Up

- Extended Smart Edit derived-state helpers to remove repeated selection filtering from `apps/web/src/features/edit/SmartEditPanel.tsx`.
- Added to `apps/web/src/features/edit/SmartEditTrackDerivedState.ts`:
  - editable timeline material ID selection.
  - track clip selection at the playhead.
  - selected text timeline material ID selection.
  - timeline element ID selection by generated token.
  - split text element ID selection.
- Added to `apps/web/src/features/edit/SmartEditSegmentDerivedState.ts`:
  - segment ID selection by generated token.
- Replaced repeated `filter/map/startsWith` blocks in `SmartEditPanel.tsx`; command implementations and state mutation remain in the panel.
- Current file sizes:
  - `SmartEditPanel.tsx`: 3134 lines.
  - `SmartEditTrackDerivedState.ts`: 293 lines.
  - `SmartEditSegmentDerivedState.ts`: 65 lines.
  - `SmartEditKeyboardShortcuts.ts`: 157 lines.
  - `App.tsx`: 2871 lines.
  - `router.ts`: 2325 lines.
- Fresh verification after this pass:
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web lint`: passed.
  - `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`: passed, 161 tests.
  - `corepack pnpm lint`: passed.
  - `corepack pnpm typecheck`: passed.
  - `corepack pnpm test`: passed, 365 tests across shared/API/web. The previously flaky Windows media-processing tests passed in this run.
  - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-eSc6CpYB.js` at 604.48 kB minified.
  - `git diff --check`: passed; Git still reports existing CRLF-to-LF normalization warnings for a few touched files.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Continue reducing `apps/web/src/features/edit/SmartEditPanel.tsx`; next candidates are command-handler grouping or another render/interaction section with a clearer ownership boundary.
2. Continue reducing `apps/web/src/app/App.tsx`; next candidates are project/reference refresh orchestration only if a clean hook or service boundary is clear.
3. Continue smaller API cleanup only where route-service boundaries are clear; avoid broad API rewrites after the router reduction unless a handler cluster has obvious ownership.
4. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 Smart Edit Keyboard Shortcut Extraction

- Extracted Smart Edit panel keyboard shortcut routing from `apps/web/src/features/edit/SmartEditPanel.tsx` into `apps/web/src/features/edit/SmartEditKeyboardShortcuts.ts`.
- Moved the panel-level keyboard command dispatch for:
  - playback toggle.
  - copy/cut/paste.
  - undo/redo.
  - select all.
  - split/trim/jump/preview range commands.
  - keyboard nudge.
  - offset selection.
  - delete/backspace removal.
- Kept command implementations, state ownership, selected segment/track state, and mutation logic in `SmartEditPanel.tsx`; the new module only routes a key event to provided actions.
- Current file sizes:
  - `SmartEditPanel.tsx`: 3133 lines.
  - `SmartEditKeyboardShortcuts.ts`: 157 lines.
  - `SmartEditSegmentDerivedState.ts`: 56 lines.
  - `SmartEditTrackDerivedState.ts`: 243 lines.
  - `App.tsx`: 2871 lines.
  - `router.ts`: 2325 lines.
- Fresh verification after this pass:
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web lint`: passed.
  - `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`: passed, 161 tests.
  - `corepack pnpm lint`: passed.
  - `corepack pnpm typecheck`: passed.
  - `corepack pnpm test`: passed, 365 tests across shared/API/web. The previously flaky Windows media-processing tests passed in this run.
  - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-COx08CTO.js` at 604.51 kB minified.
  - `git diff --check`: passed; Git still reports existing CRLF-to-LF normalization warnings for a few touched files.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Continue reducing `apps/web/src/features/edit/SmartEditPanel.tsx`; next candidates are command-handler grouping or another render/interaction section with a clearer ownership boundary.
2. Continue reducing `apps/web/src/app/App.tsx`; next candidates are project/reference refresh orchestration only if a clean hook or service boundary is clear.
3. Continue smaller API cleanup only where route-service boundaries are clear; avoid broad API rewrites after the router reduction unless a handler cluster has obvious ownership.
4. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 Smart Edit Segment Derived State Extraction

- Extracted Smart Edit segment-derived calculations from `apps/web/src/features/edit/SmartEditPanel.tsx` into `apps/web/src/features/edit/SmartEditSegmentDerivedState.ts`.
- Moved pure helpers for:
  - sorted segment ordering.
  - selected segment fallback lookup.
  - materializable segment filtering.
  - selected segment index.
  - batch selected segment filtering.
  - enabled duration aggregation.
  - timeline duration fallback.
  - selected source label fallback.
- Kept React state ownership, selection updates, command handlers, timeline mutations, and render composition in `SmartEditPanel.tsx`.
- Current file sizes:
  - `SmartEditPanel.tsx`: 3221 lines.
  - `SmartEditSegmentDerivedState.ts`: 56 lines.
  - `SmartEditTrackDerivedState.ts`: 243 lines.
  - `App.tsx`: 2871 lines.
  - `router.ts`: 2325 lines.
- Fresh verification after this pass:
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web lint`: passed.
  - `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`: passed, 161 tests.
  - `corepack pnpm lint`: passed.
  - `corepack pnpm typecheck`: passed.
  - `corepack pnpm test`: passed, 365 tests across shared/API/web. The previously flaky Windows media-processing tests passed in this run.
  - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-C2nUp_Uk.js` at 603.48 kB minified.
  - `git diff --check`: passed; Git still reports existing CRLF-to-LF normalization warnings for a few touched files.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Continue reducing `apps/web/src/features/edit/SmartEditPanel.tsx`; next candidates are command-handler grouping or another render/interaction section with a clearer ownership boundary.
2. Continue reducing `apps/web/src/app/App.tsx`; next candidates are project/reference refresh orchestration only if a clean hook or service boundary is clear.
3. Continue smaller API cleanup only where route-service boundaries are clear; avoid broad API rewrites after the router reduction unless a handler cluster has obvious ownership.
4. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.

## 2026-06-08 App Asset Draft Setup Utils Follow-Up

- Extracted asset-draft setup helpers from `apps/web/src/app/App.tsx` into `apps/web/src/app/AppSetupUtils.ts`.
- Moved:
  - `createAssetDraftForCategory`.
  - `localizeDefaultAssetDraft`.
- `App.tsx` now keeps language-change and category-change state updates, while `AppSetupUtils.ts` owns the pure default-draft preservation logic.
- Current file sizes:
  - `App.tsx`: 2871 lines.
  - `AppSetupUtils.ts`: 335 lines.
  - `SmartEditPanel.tsx`: 3221 lines.
  - `router.ts`: 2325 lines.
- Fresh verification after this pass:
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web lint`: passed.
  - `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`: passed, 161 tests.
  - `corepack pnpm lint`: passed.
  - `corepack pnpm typecheck`: passed.
  - `corepack pnpm test`: passed, 365 tests across shared/API/web. The previously flaky Windows media-processing tests passed in this run.
  - `corepack pnpm build`: passed; Vite still reports the existing web bundle chunk-size warning for `assets/index-Fx-sZJJ2.js` at 603.38 kB minified.
  - `git diff --check`: passed; Git still reports existing CRLF-to-LF normalization warnings for a few touched files.
  - `git ls-files .agents/memory`: empty.

## Current Optimization Queue

1. Continue reducing `apps/web/src/features/edit/SmartEditPanel.tsx`; next candidates are command-handler grouping or another render/interaction section with a clearer ownership boundary.
2. Continue reducing `apps/web/src/app/App.tsx`; next candidates are project/reference refresh orchestration only if a clean hook or service boundary is clear.
3. Continue smaller API cleanup only where route-service boundaries are clear; avoid broad API rewrites after the router reduction unless a handler cluster has obvious ownership.
4. Plan a byte-safe recovery or rewrite for corrupted `02-development-plan.md`; do not mechanically edit it further.
