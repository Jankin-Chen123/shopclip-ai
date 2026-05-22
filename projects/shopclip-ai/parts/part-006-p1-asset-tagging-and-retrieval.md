# Part 006: P1 Asset Tagging And Retrieval

## Status

- Project slug: shopclip-ai
- Part number: 006
- Owner role: `implementation-engineer`
- Status: Done
- Created: 2026-05-21
- Last updated: 2026-05-22

## Source Of Truth

Before starting, read `../00-requirements.md`, `../01-design-spec.md`, `../02-development-plan.md`, and `AGENTS.md`.

## Objective

Add asset tags, slice metadata, and keyword/tag/vector-like retrieval for storyboard and scene asset recall.

## Scope

### In Scope

- Deterministic asset tagging.
- AssetSlice metadata.
- Search endpoint.
- Asset library search/filter UI.
- Auto-recall into scene asset slots.

### Out Of Scope

- Production vector database.
- Real multimodal embedding model unless available through a safe provider adapter.

## Dependencies

- Prior Parts: Part 005.

## Expected Files Or Modules

- `apps/api/src/modules/assets/`
- `apps/api/src/modules/retrieval/`
- `apps/web/src/features/assets/`
- `apps/web/src/features/studio/`

## Acceptance Criteria

- [x] Uploaded/seeded assets receive tags and slice metadata.
- [x] Search supports keyword, tag, and vector-like scoring.
- [x] Scene editor can select recalled assets.
- [x] Tests cover retrieval ranking for at least three queries.

## Completion Notes

- Added deterministic asset tagging in `apps/api/src/modules/assets/tagging.ts`.
- Added one slice per uploaded asset and returned slice metadata on project snapshots.
- Added `/api/assets/search` with keyword, tag, and deterministic vector-like concept scoring.
- Added front-end asset retrieval UI and "Use in selected scene" recall action.
- Added browser evidence screenshots:
  - `projects/shopclip-ai/evidence/p1-06-asset-search.png`
  - `projects/shopclip-ai/evidence/part-006-verification.md`

## Verification Evidence

- `corepack pnpm test`
- `corepack pnpm typecheck`
- `corepack pnpm lint`
- `corepack pnpm build`
- `corepack pnpm --filter @shopclip/web test:e2e`

## Verification Plan

- Automated: retrieval unit tests and API endpoint tests.
- Manual: search from asset library and assign result to scene.
- Browser/screenshot: capture asset retrieval UI.
- Security: do not send private asset data to third-party providers unless explicitly configured.

## Risks And Follow-Ups

- Mock embedding must be clearly labeled in settings/demo notes.
