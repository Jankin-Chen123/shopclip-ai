# 2026-05-28 Seedance Render Provider Evidence

## Scope

- Implemented real video generation for the existing render flow.
- TTS, subtitle, and BGM settings remain post-processing/mock media metadata for now.
- Real video generation is opt-in with `VIDEO_RENDER_PROVIDER_MODE=seedance`.

## Behavior

- `POST /api/projects/:projectId/render` submits a Seedance task when the video render provider is enabled.
- The provider sends storyboard-derived prompt text, public reference image URLs, `duration`, and frontend-submitted video settings: `ratio`, `resolution`, `generate_audio`, `watermark`, and optional `seed`.
- The returned Seedance task id is stored on `renderTask.providerTaskId`.
- `GET /api/render-tasks/:renderTaskId` polls Seedance when the stored render task is still running, then writes `previewUrl` and `exportUrl` when the provider returns a video URL.
- Missing config or provider failure falls back to deterministic mock render output.

## Verification

- RED: `corepack pnpm --filter @shopclip/api test -- seedance-render-flow.test.ts` failed while the route still returned `provider: mock-renderer`.
- GREEN: `corepack pnpm --filter @shopclip/api test -- seedance-render-flow.test.ts` passed after routing through the Seedance provider.
- RED: `corepack pnpm --filter @shopclip/api test -- seedanceRenderer.test.ts seedance-render-flow.test.ts` failed while request-level `videoSettings` were still ignored in favor of environment defaults.
- GREEN: `corepack pnpm --filter @shopclip/api test -- seedanceRenderer.test.ts seedance-render-flow.test.ts` passed after mapping render request `videoSettings` into the Seedance request body.
- GREEN: `corepack pnpm --filter @shopclip/web test -- App.test.tsx` passed after adding frontend video generation controls.
- Provider unit coverage: `apps/api/src/providers/renderer/seedanceRenderer.test.ts`.
- API lifecycle coverage: `apps/api/src/seedance-render-flow.test.ts`.

## Configuration

```text
VIDEO_RENDER_PROVIDER_MODE=seedance
AI_VIDEO_API_KEY=<server-side key>
AI_VIDEO_MODEL_ID=<Seedance model or endpoint id>
ARK_API_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
ARK_VIDEO_GENERATION_PATH=/contents/generations/tasks
```

`ratio`, `resolution`, `generate_audio`, `watermark`, and `seed` now come from the frontend render panel instead of required `.env` values.
