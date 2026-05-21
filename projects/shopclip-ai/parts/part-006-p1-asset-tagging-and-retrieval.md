# Part 006: P1 Asset Tagging And Retrieval

## Status

- Project slug: shopclip-ai
- Part number: 006
- Owner role: `implementation-engineer`
- Status: Planned
- Created: 2026-05-21
- Last updated: 2026-05-21

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

- [ ] Uploaded/seeded assets receive tags and slice metadata.
- [ ] Search supports keyword, tag, and vector-like scoring.
- [ ] Scene editor can select recalled assets.
- [ ] Tests cover retrieval ranking for at least three queries.

## Verification Plan

- Automated: retrieval unit tests and API endpoint tests.
- Manual: search from asset library and assign result to scene.
- Browser/screenshot: capture asset retrieval UI.
- Security: do not send private asset data to third-party providers unless explicitly configured.

## Risks And Follow-Ups

- Mock embedding must be clearly labeled in settings/demo notes.

