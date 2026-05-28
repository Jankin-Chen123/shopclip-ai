# Seedance Reference Image Toggle Evidence

## Context

Ark returned HTTP 400 with:

`The parameter task_type specified in the request is not valid: the specified task_type r2v does not support model doubao-seedance-1-5-pro.`

The deployed video endpoint is configured through `AI_VIDEO_MODEL_ID=ep-...`, but Ark reports the underlying model capability. The renderer was adding `image_url` reference images to the Seedance request body, which turns the task into `r2v`. The current endpoint appears to support text-to-video, not reference/image-to-video.

## Change

- Seedance render requests now send only text content by default.
- Added `AI_VIDEO_REFERENCE_IMAGES=true` as an opt-in for endpoints that support reference images / r2v.
- Updated `.env.example`, `README.md`, and Part 008 notes.

## Verification

- RED: `corepack pnpm --filter @shopclip/api test -- seedanceRenderer.test.ts` failed because the default request still included a reference image.
- GREEN: after adding the env toggle, `corepack pnpm --filter @shopclip/api test -- seedanceRenderer.test.ts` passed with default text-only content and explicit reference-image opt-in coverage.

