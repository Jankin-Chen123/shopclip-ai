# Seedance Reference Image Toggle Evidence

## Context

Ark returned HTTP 400 with:

`The parameter task_type specified in the request is not valid: the specified task_type r2v does not support model doubao-seedance-1-5-pro.`

The deployed video endpoint is configured through `AI_VIDEO_MODEL_ID=ep-...`, but Ark reports the underlying model capability. The renderer was adding `image_url` reference images to the Seedance request body, which turns the task into `r2v`. The current endpoint appears to support text-to-video, not reference/image-to-video.

## Change

- Seedance render requests first avoided `reference_image` by default so text-to-video could submit successfully.
- Follow-up: the renderer now sends one public product image by default as `role=first_frame`, which matches the first-frame image-to-video path better than generic `reference_image` for the current Seedance 1.5 endpoint.
- Added `AI_VIDEO_IMAGE_INPUT_MODE=none|first_frame|reference_image`; `none` keeps text-only behavior, and `reference_image` is reserved for endpoints/models that explicitly support reference images.
- Updated `.env.example`, `README.md`, and provider tests.

## Verification

- RED: `corepack pnpm --filter @shopclip/api test -- seedanceRenderer.test.ts` failed because the default request still included a reference image.
- GREEN: after adding the env toggle, `corepack pnpm --filter @shopclip/api test -- seedanceRenderer.test.ts` passed with default text-only content and explicit reference-image opt-in coverage.
- Follow-up RED: `corepack pnpm --filter @shopclip/api test -- seedanceRenderer.test.ts` failed because the Seedance request still sent only text content by default.
- Follow-up GREEN: after adding `first_frame` image content by default and a text-only override, the same test command passed.
