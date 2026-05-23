# Part 013: External Asset Providers

## Status

- Project slug: shopclip-ai
- Part number: 013
- Owner role: `implementation-engineer`
- Status: Done
- Created: 2026-05-23
- Last updated: 2026-05-24

## Source Of Truth

Before starting, read `../00-requirements.md`, `../01-design-spec.md`, `../02-development-plan.md`, and `AGENTS.md`.

## Objective

Add a safe third-party asset source layer so ShopClip AI can search external stock media APIs while preserving the existing local project asset library and deterministic demo behavior.

## Scope

### In Scope

- Shared contract for normalized external asset search results.
- Pexels and Pixabay provider adapters behind server-side environment keys or user-supplied request keys.
- `/api/assets/search` aggregation of local project assets plus optional external results.
- Settings UI for adding third-party stock libraries and browser-local API keys.
- Dedicated external stock search modal with responsive result cards and import-to-project actions.
- `POST /api/assets/external-search` for searching configured third-party stock libraries without exposing keys in responses.
- `POST /api/projects/:projectId/assets/import-external` for persisting selected external asset metadata into the project library.
- Tests using injected providers and mocked payloads, not live API calls.
- Environment variable documentation.

### Out Of Scope

- Paid stock licensing flows.
- Downloading third-party file binaries into object storage.
- Paid provider account setup or production license checkout flows.
- Production vector search over third-party content.

## Dependencies

- Prior Parts: Part 006 asset tagging and retrieval.
- Server-only provider API keys when real external search is enabled.

## Expected Files Or Modules

- `packages/shared/src/schemas.ts`
- `packages/shared/src/types.ts`
- `apps/api/src/providers/assets/externalAssetProviders.ts`
- `apps/api/src/modules/projects/router.ts`
- `apps/web/src/features/assets/AssetsPanel.tsx`
- `apps/web/src/features/settings/SettingsPanel.tsx`
- `apps/web/src/app/App.tsx`
- `apps/web/e2e/p1-external-assets.spec.ts`
- `.env.example`

## Acceptance Criteria

- [x] External provider results have a stable normalized contract with source, title, media type, preview URLs, author, license, and external URL.
- [x] Search works with no external API keys and returns local results as before.
- [x] Tests cover Pexels and Pixabay normalization without live network calls.
- [x] API tests cover aggregation with an injected external provider.
- [x] Provider API keys are never exposed in API responses or normalized asset results.
- [x] Users can add a third-party stock library in Settings and store that API key locally in the browser.
- [x] Clicking "Search stock" opens a dedicated modal instead of rendering third-party results inline in the asset grid.
- [x] The modal searches with the user's configured providers and adapts the result grid across desktop/mobile widths.
- [x] Demo provider gives a no-key local experience for search and import.
- [x] Users can search external stock results and import one into the project asset grid.
- [x] Asset library page exposes a visible third-party stock entry even before a project is loaded.
- [x] Importing external stock from `/#assets` automatically creates a demo project when needed.
- [x] No-key local setups fall back to the demo provider when real stock provider keys are absent.
- [x] Search attempts show visible no-result feedback instead of appearing inert.
- [x] Chinese UI copy in the external stock result flow renders without mojibake.
- [x] Browser E2E captures the external search/import flow.

## Completion Notes

- Added external search result schemas in `packages/shared/src/schemas.ts`.
- Added Pexels and Pixabay provider adapters in `apps/api/src/providers/assets/externalAssetProviders.ts`.
- Extended `/api/assets/search` to include `externalResults`.
- Added a deterministic `demo` provider so the experience works without Pexels/Pixabay keys.
- Added `POST /api/projects/:projectId/assets/import-external` to create a project asset from a selected external result while preserving source/license tags.
- Added `POST /api/assets/external-search` so the front end can send selected provider configs and browser-local user API keys in the request body.
- Added Settings controls for adding Demo Stock, Pexels, and Pixabay provider configs.
- Replaced inline external stock results with a dedicated search modal and responsive result cards.
- Added a first-screen external stock entry on the asset library page so users can start from `/#assets` without visiting the project setup page first.
- Added demo-provider fallback when no external stock provider keys or provider list are configured.
- Added no-result feedback inside the external stock modal.
- Rewrote the `AssetsPanel` and Settings localized copy to avoid mojibake and keep the search flow readable.
- Added server-only provider configuration to `.env.example`.
- Wrote verification evidence in `projects/shopclip-ai/evidence/part-013-verification.md`.

## Verification Evidence

- `corepack pnpm --filter @shopclip/shared test`
- `corepack pnpm --filter @shopclip/api test -- externalAssetProviders p1-flow`
- `corepack pnpm test`
- `corepack pnpm typecheck`
- `corepack pnpm lint`
- `corepack pnpm build`
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:5180 playwright test --config e2e/playwright.config.ts p1-external-assets.spec.ts`
  - Starts from Settings, verifies provider configuration UI, opens the asset-page modal, searches demo external stock, imports the selected result, and verifies it appears in the asset grid.
  - Latest local run produced both `ok` test lines and screenshot evidence, but the Windows dev-server teardown did not exit before the command timeout.
- Screenshot: `projects/shopclip-ai/evidence/p1-13-external-provider-settings.png`
- Screenshot: `projects/shopclip-ai/evidence/p1-13-external-search-modal.png`
- Chinese screenshot: `projects/shopclip-ai/evidence/p1-13-external-search-modal-zh.png`
- Chinese screenshot: `projects/shopclip-ai/evidence/p1-13-external-asset-import-zh.png`
- Screenshot: `projects/shopclip-ai/evidence/p1-13-external-asset-import.png`

## Verification Plan

- `corepack pnpm --filter @shopclip/shared test`
- `corepack pnpm --filter @shopclip/api test`
- `corepack pnpm test`
- `corepack pnpm typecheck`
- `corepack pnpm lint`
- `corepack pnpm build`
- Browser E2E for `apps/web/e2e/p1-external-assets.spec.ts`

## Risks And Follow-Ups

- External API rate limits and license terms differ by provider; production import should record license and source at time of use.
- Current import stores normalized metadata and remote URLs, not copied binaries; production storage should download/cache the selected file in object storage if license and product needs require it.
- User-supplied stock API keys are stored in browser localStorage for this deliverable demo; production should move this to encrypted per-user secret storage before multi-user rollout.
