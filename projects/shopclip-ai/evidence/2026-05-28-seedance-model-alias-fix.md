# Seedance Model Alias Fix Evidence

## Context

Runtime trace showed `seedance-task-submit-failed` with Ark HTTP 400:

`The parameter task_type specified in the request is not valid: the specified task_type r2v does not support model doubao-seedance-1-5-pro.`

The renderer was sending `AI_VIDEO_MODEL_ID` literally. When the server was configured with the common short alias `doubao-seedance-1-5-pro`, Ark rejected the render task. The inspiration provider already had model alias normalization, but the render provider did not.

## Change

- Added Seedance render model alias normalization in `apps/api/src/providers/renderer/seedanceRenderer.ts`.
- Added regression coverage in `apps/api/src/providers/renderer/seedanceRenderer.test.ts`.
- Updated `README.md` to document that common Seedance aliases are accepted for `AI_VIDEO_MODEL_ID`.

## Verification

- RED: `corepack pnpm --filter @shopclip/api test -- seedanceRenderer.test.ts` failed because the request body still sent `doubao-seedance-1-5-pro`.
- GREEN: after the provider fix, `corepack pnpm --filter @shopclip/api test -- seedanceRenderer.test.ts` passed with 16 test files and 70 tests.

