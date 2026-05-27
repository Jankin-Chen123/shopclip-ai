# Part 014 - Project History

## Status

Done

## Owner

`implementation-engineer`

## Goal

Support browsing historical creation projects from the creation/project setup area and loading a selected project's settings, assets, scripts, storyboard, and render context.

## Scope

- Add a lightweight project summary contract.
- Add a backend `GET /api/projects` endpoint sorted by latest update.
- Implement project listing in both memory and Prisma project stores.
- Add a front-end history panel in the creation project setup page.
- Keep manual project ID loading for compatibility and debugging.

## Inputs

- `projects/shopclip-ai/00-requirements.md`
- `projects/shopclip-ai/01-design-spec.md`
- `projects/shopclip-ai/02-development-plan.md`
- User-confirmed recommendation in this conversation on 2026-05-27.

## Acceptance Criteria

- Historical projects can be listed without knowing project IDs.
- Each history row shows project name, product name, status, asset count, scene count, and last update time.
- Selecting a history row loads the full existing project snapshot.
- Project settings, assets, script/storyboard, and render task state are restored through the existing workspace state.
- Existing manual project ID loading remains available.

## Verification

- RED: `corepack pnpm --filter @shopclip/shared test -- schemas.test.ts` failed because `ProjectSummarySchema` was undefined.
- RED: `corepack pnpm --filter @shopclip/api test -- p0-flow.test.ts` failed because `GET /api/projects` returned 404.
- RED: `corepack pnpm --filter @shopclip/web test -- App.test.tsx` failed because the project setup panel did not render historical projects.
- RED: `corepack pnpm --filter @shopclip/api test -- prisma-migrations.test.ts` failed because no migration created the `StoryboardScene.imageUrl` column required by Prisma project loading.
- GREEN: `corepack pnpm --filter @shopclip/shared test -- schemas.test.ts` passed: 2 files, 15 tests.
- GREEN: `corepack pnpm --filter @shopclip/api test -- p0-flow.test.ts` passed: 13 files, 51 tests.
- GREEN: `corepack pnpm --filter @shopclip/web test -- App.test.tsx` passed: 1 file, 52 tests.
- GREEN: `corepack pnpm --filter @shopclip/api test -- prisma-migrations.test.ts` passed: 14 files, 52 tests.
- Typecheck: `corepack pnpm typecheck` passed for shared, API, and web.
- Lint: `corepack pnpm --filter @shopclip/shared lint`, `corepack pnpm --filter @shopclip/api lint`, and `corepack pnpm --filter @shopclip/web lint` passed.
- Prisma schema: `apps/api/node_modules/.bin/prisma.CMD validate --schema apps/api/prisma/schema.prisma` passed locally.
- Diff hygiene: `git diff --check` passed.
- Memory safety: `git ls-files .agents/memory` returned no tracked files.

## Change Summary

- Added `ProjectSummarySchema` and `ProjectSummary` for compact project history rows.
- Added `ProjectStore.listProjects()` and implementations for memory and Prisma stores.
- Added `GET /api/projects`, returning summaries sorted by `updatedAt` descending.
- Added a Prisma migration for nullable `StoryboardScene.imageUrl`, which is required when loading full historical project snapshots.
- Added `listProjects()` to the web API client.
- Added a historical projects panel to the creation/project setup page.
- Selecting a historical project uses the existing full project snapshot loader and restores settings, assets, scripts, scenes, render state, and workspace selection.
- Kept manual project ID loading available.

## Risks And Follow-Up

- Memory store history is process-local and disappears after service restart.
- Prisma history is persistent when `DATABASE_URL` is configured and `PROJECT_STORE_MODE` is not `memory`.
- Current history rows are scoped to all demo projects because the product still runs without user accounts or permissions.
