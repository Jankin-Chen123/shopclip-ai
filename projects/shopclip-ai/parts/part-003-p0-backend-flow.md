# Part 003: P0 Backend Flow

## Status

- Project slug: shopclip-ai
- Part number: 003
- Owner role: `implementation-engineer`
- Status: Implementation Complete
- Created: 2026-05-21
- Last updated: 2026-05-28

## Source Of Truth

Before starting, read `../00-requirements.md`, `../01-design-spec.md`, `../02-development-plan.md`, and `AGENTS.md`.

## Objective

Implement the backend APIs for the P0 end-to-end flow: project creation, asset intake, script/storyboard generation, render task trace, preview, and export fallback.

## Scope

### In Scope

- Project create/load endpoints.
- Asset upload with validation and storage abstraction.
- Script/storyboard provider adapter with deterministic fallback.
- Render task lifecycle with trace events and preview artifact.

### Out Of Scope

- P1 retrieval, editing Agent, dashboard, and advanced media controls.

## Dependencies

- Prior Parts: Part 001 and Part 002.
- External services: optional AI provider; fallback must work without provider config.

## Expected Files Or Modules

- `apps/api/src/modules/projects/`
- `apps/api/src/modules/assets/`
- `apps/api/src/modules/generation/`
- `apps/api/src/modules/render/`
- `apps/api/src/providers/ai/`
- `apps/api/src/providers/renderer/`

## Implementation Notes

- Every generation and render step writes a TraceEvent.
- Frontend must receive clear fallback markers when mock mode is used.
- Provider credentials stay in server environment variables only.

## Acceptance Criteria

- [x] API can create and load a project.
- [x] API can accept at least image assets and persist metadata in the current repository layer.
- [x] API can generate a script and storyboard with no external provider configured.
- [x] API can create a render task and return progress plus a preview URL.
- [x] API can expose an export/download path for the demo artifact.

## Verification Plan

- Automated: API integration tests for full P0 backend lifecycle.
- Manual: call endpoints with REST client or curl.
- Security: upload validation and no secret exposure in responses.

## Risks And Follow-Ups

- Video artifact generation may need to be a static demo file first; record the chosen fallback in `../decisions/`.
- Current repository implementation is in-memory because local PostgreSQL is unavailable. Decision recorded in `../decisions/part-003-p0-backend-fallbacks.md`.
- Replace the in-memory repository with Prisma-backed persistence once `DATABASE_URL` is available; keep API response shapes stable for Part 004.

## Change Summary

- Added P0 API routes under `/api` for projects, assets, script generation, render tasks, render task polling, and export fallback.
- Added in-memory project repository to support API lifecycle tests without external services.
- Added deterministic mock script provider and mock renderer provider.
- Added opt-in Seedance render provider for real video generation. When `VIDEO_RENDER_PROVIDER_MODE=seedance`, render requests submit `/contents/generations/tasks`, pass frontend `videoSettings`, store the provider task id, and poll the task from `GET /api/render-tasks/:renderTaskId` until a video URL is available.
- Added P0 asset metadata validation for image type, MIME type, and size.
- Added API integration tests covering the full backend P0 lifecycle and invalid asset rejection.
- Updated script/storyboard generation so Step 02 prepared `assetIds` are resolved through the shared asset store before provider execution. This keeps globally prepared or library-imported assets attached to generated storyboard scenes instead of falling back to `project.assets[0]`.
- 2026-05-27 storyboard image update: every generated storyboard scene now receives an `imageUrl` from the image-generation provider path, with a deterministic SVG data URL fallback when mock mode or provider failure cannot return a renderable image.

## Verification Evidence

- Evidence file: `../evidence/part-003-verification.md`
- Full-chain regression evidence: `../evidence/2026-05-27-full-chain-scene-regeneration.md`
- Storyboard image preview evidence: `../evidence/2026-05-27-storyboard-scene-image-preview.md`
- Seedance real render evidence: `../evidence/2026-05-28-seedance-render-provider.md`
- `corepack pnpm --filter @shopclip/api test`: passed.
- `corepack pnpm --filter @shopclip/api test -- p0-flow.test.ts`: passed after the regression failed before the fix.
- `corepack pnpm --filter @shopclip/api test -- seedance-render-flow.test.ts`: passed after the route-level RED failure confirmed render still used mock.
- `corepack pnpm --filter @shopclip/api test -- seedanceRenderer.test.ts seedance-render-flow.test.ts`: passed after request-level video settings replaced env-only Seedance parameter defaults.
- `corepack pnpm --filter @shopclip/api typecheck`: passed.
- `corepack pnpm --filter @shopclip/api build`: passed.
