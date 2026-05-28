# Seedance Environment Model Configuration Evidence

## Context

Production Seedance rendering should use the model or endpoint configured by server environment variables. The deployment `.env` should provide the video endpoint through `AI_VIDEO_MODEL_ID` or `AI_VIDEO_ENDPOINT_ID`, for example an Ark endpoint id in the `ep-...` form.

The renderer must not maintain a hardcoded alias table because the deployer owns the provider model configuration.

## Change

- Removed backend Seedance model alias normalization from `apps/api/src/providers/renderer/seedanceRenderer.ts`.
- Updated regression coverage in `apps/api/src/providers/renderer/seedanceRenderer.test.ts` so the configured `AI_VIDEO_MODEL_ID` is submitted verbatim.
- Updated `README.md` to document that production should configure the Ark video endpoint id in `.env`.

## Verification

- RED: `corepack pnpm --filter @shopclip/api test -- seedanceRenderer.test.ts` failed while the backend still rewrote `AI_VIDEO_MODEL_ID`.
- GREEN: after removing the rewrite, the same test passed.

