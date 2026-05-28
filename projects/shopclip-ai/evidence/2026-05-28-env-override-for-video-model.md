# Env Override For Video Model Evidence

## Context

The render response showed Ark rejecting model `doubao-seedance-1-5-pro` even though the server `.env` was configured with an Ark video endpoint id through `AI_VIDEO_MODEL_ID`.

The root cause is that `loadLocalEnvFile()` skipped keys that already existed in `process.env`. If a process manager or shell exported a stale `AI_VIDEO_MODEL_ID`, the local `.env` value did not take effect.

## Change

- Added an `override` option to `apps/api/src/env.ts`.
- Updated `apps/api/src/server.ts` to load the API `.env` with `{ override: true }`.
- Added regression coverage proving `.env` can replace a stale process-level `AI_VIDEO_MODEL_ID`.
- Added upward `.env` discovery so API startup can find the workspace root `.env` even when the process starts from `apps/api`.

## Verification

- RED: `corepack pnpm --filter @shopclip/api test -- env.test.ts` failed because `AI_VIDEO_MODEL_ID` stayed at the stale process value.
- GREEN: after enabling override support and using it at API startup, `corepack pnpm --filter @shopclip/api test -- env.test.ts` passed.
- `corepack pnpm --filter @shopclip/api test -- seedanceRenderer.test.ts` also passed, confirming the renderer still submits the configured model id verbatim.
- Follow-up RED: `corepack pnpm --filter @shopclip/api test -- env.test.ts` failed when simulating API startup from `apps/api` with `.env` in the workspace root.
- Follow-up GREEN: after upward `.env` discovery, the same command passed with 16 test files and 72 tests.
