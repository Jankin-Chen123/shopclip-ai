# Part 006: P1 Asset Tagging And Retrieval

## Status

- Project slug: shopclip-ai
- Part number: 006
- Owner role: `implementation-engineer`
- Status: Done
- Created: 2026-05-21
- Last updated: 2026-05-26

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
- Added category-scoped global asset library refresh:
  - `GET /api/assets?category=image|video|audio|script|all`
  - entering the left-sidebar asset library page now refreshes the selected category from the backend without requiring a project;
  - uploading or importing from the asset library writes to the global library by default;
  - switching asset categories refreshes the matching resource type and replaces only that category in local library state.
- Added global asset persistence support:
  - `Asset.projectId` and `AssetProcessingJob.projectId` are nullable;
  - project-level asset endpoints remain as compatibility paths, but the asset library entry point is global.
- Added front-end local asset preview and detail viewing:
  - asset cards now render image/video/audio/script previews from the stored asset URL instead of icon-only placeholders;
  - clicking a local asset opens a detail dialog with type, size, status, source, storage, tags, retrieval text, created time, and file link;
  - when a scene is selected, the detail dialog can assign the asset to the selected scene.
- Fixed cloud-server COS preview behavior:
  - local asset card and detail previews now use `GET /api/assets/:assetId/content` instead of directly embedding the stored COS public URL;
  - the API redirects to a storage read URL, generating a signed read URL for `tencent-cos` assets so private buckets can still preview through the app;
  - added storage tests to verify Tencent COS read signatures do not expose the secret key.
- Added asset deletion and upload-state preview behavior:
  - asset cards no longer render status pills;
  - uploading assets show a rotating placeholder and do not request the preview content URL until `status` is `ready`;
  - ready image/video assets continue previewing through `GET /api/assets/:assetId/content`;
  - local asset cards support single deletion and selected batch deletion;
  - `DELETE /api/assets` removes COS objects by `objectKey`/`thumbnailKey` and then removes asset, slice, processing-job, and scene references from the store.
- Added browser evidence screenshots:
  - `projects/shopclip-ai/evidence/p1-06-asset-search.png`
  - `projects/shopclip-ai/evidence/part-006-verification.md`

## Verification Evidence

- `corepack pnpm --filter @shopclip/api test` on 2026-05-26: 11 files / 36 tests passed.
- `corepack pnpm --filter @shopclip/web test` on 2026-05-26: 1 file / 24 tests passed.
- `corepack pnpm --filter @shopclip/web test` on 2026-05-26: 1 file / 25 tests passed after adding local asset preview/detail coverage.
- `corepack pnpm --filter @shopclip/web typecheck` on 2026-05-26: passed.
- `corepack pnpm --filter @shopclip/web lint` on 2026-05-26: passed.
- `corepack pnpm --filter @shopclip/web build` on 2026-05-26: passed.
- `corepack pnpm --filter @shopclip/api test` on 2026-05-26: 12 files / 37 tests passed after adding asset content redirect and COS read URL coverage.
- `corepack pnpm --filter @shopclip/api typecheck` on 2026-05-26: passed.
- `corepack pnpm --filter @shopclip/api lint` on 2026-05-26: passed.
- `corepack pnpm --filter @shopclip/api build` on 2026-05-26: passed.
- `corepack pnpm --filter @shopclip/api lint` on 2026-05-26: passed.
- `corepack pnpm --filter @shopclip/web lint` on 2026-05-26: passed.
- `corepack pnpm --filter @shopclip/api build` on 2026-05-26: passed.
- `corepack pnpm --filter @shopclip/web build` on 2026-05-26: passed.
- `corepack pnpm --filter @shopclip/api test -- src/asset-cos-flow.test.ts src/providers/storage/cosStorageProvider.test.ts` on 2026-05-26: 12 files / 38 tests passed.
- `corepack pnpm --filter @shopclip/web test` on 2026-05-26: 1 file / 28 tests passed.
- `corepack pnpm --filter @shopclip/api typecheck` on 2026-05-26: passed.
- `corepack pnpm --filter @shopclip/web typecheck` on 2026-05-26: passed.
- `corepack pnpm --filter @shopclip/api lint` on 2026-05-26: passed.
- `corepack pnpm --filter @shopclip/web lint` on 2026-05-26: passed.
- `corepack pnpm --filter @shopclip/api build` on 2026-05-26: passed.
- `corepack pnpm --filter @shopclip/web build` on 2026-05-26: passed.
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
