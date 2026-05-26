# Part 013: External Asset Providers

## Status

- Project slug: shopclip-ai
- Part number: 013
- Owner role: `implementation-engineer`
- Status: Done
- Created: 2026-05-23
- Last updated: 2026-05-26

## Source Of Truth

Before starting, read `../00-requirements.md`, `../01-design-spec.md`, `../02-development-plan.md`, and `AGENTS.md`.

## Objective

Add a safe third-party asset source layer so ShopClip AI can search external stock media APIs while preserving the existing local project asset library and deterministic demo behavior.

## Scope

### In Scope

- Shared contract for normalized external asset search results.
- Pexels, Pixabay, and Freesound provider adapters behind server-side environment keys or user-supplied request keys.
- `/api/assets/search` aggregation of local project assets plus optional external results.
- Settings UI for adding third-party stock libraries and browser-local API keys.
- Dedicated external stock search modal with responsive selectable result cards and one-click bulk import.
- `POST /api/assets/external-search` for searching configured third-party stock libraries without exposing keys in responses.
- `POST /api/projects/:projectId/assets/import-external` for persisting selected external asset metadata into the project library.
- Tests using injected providers and mocked payloads, not live API calls.
- Environment variable documentation.

### Out Of Scope

- Paid stock licensing flows.
- Paid provider original-file entitlement checks beyond provider preview/download URLs.
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
- [x] Demo Stock/mock provider code has been removed from shared contracts, backend providers, Settings, and the search modal.
- [x] When no third-party stock library is configured, the modal shows a reminder and disables search instead of using mock results.
- [x] Users can click external result cards to quickly select multiple assets and use "Import selected"/"一键导入" to import selected third-party assets into Tencent COS and persist normalized metadata.
- [x] Scrolling the modal result list to the bottom loads the next page of third-party results and appends them without replacing selected items.
- [x] Users can open a preview from each external result card to inspect the full image/video and complete provider metadata before selecting it.
- [x] Image preview uses the highest-quality provider URL available (`downloadUrl`, falling back to `previewUrl`) instead of the compressed card/preview thumbnail.
- [x] External result cards in the material modal also use the highest-quality provider image URL available instead of low-resolution thumbnails.
- [x] Video result cards use the provider-supplied cover image (`thumbnailUrl`, e.g. Pexels `video.image`) instead of a generic video icon.
- [x] Videos without a provider cover, or with a broken cover URL, show a designed "No video cover" fallback image instead of a broken image icon.
- [x] Search inputs render as a single styled field with an embedded search icon and no nested native input border.
- [x] Asset library page exposes a visible third-party stock entry even before a project is loaded.
- [x] Search attempts show visible no-result feedback instead of appearing inert.
- [x] Chinese UI copy in the external stock result flow renders without mojibake.
- [x] Browser E2E captures the external search/import flow.
- [x] Settings includes Freesound as an audio stock provider option.
- [x] Audio tabs can search Freesound, show audio-specific cards, open a playable audio preview, and import selected audio into COS.
- [x] Backend external import accepts normalized audio results, stores the downloaded file in COS, and persists it as a `reference` asset with audio metadata until a first-class audio asset type is introduced.
- [x] Backend external import distinguishes image, video, audio, and text results when choosing asset type, MIME type, storage metadata, and category tags.
- [x] Third-party stock libraries support `Custom` and `Use official config` API key sources.
- [x] In `Use official config` mode, the browser omits provider API keys and the backend resolves the selected provider key from `.env`.

## Completion Notes

- Added external search result schemas in `packages/shared/src/schemas.ts`.
- Added Pexels, Pixabay, and Freesound provider adapters in `apps/api/src/providers/assets/externalAssetProviders.ts`.
- Extended `/api/assets/search` to include `externalResults`.
- Added `POST /api/projects/:projectId/assets/import-external` to create a project asset from a selected external result while preserving source/license tags.
- Added `POST /api/assets/external-search` so the front end can send selected provider configs and browser-local user API keys in the request body.
- Added Settings controls for adding Pexels, Pixabay, and Freesound provider configs.
- Added stock provider API key source controls for Pexels, Pixabay, and Freesound. `Custom` keeps using the browser-local API key; `Use official config` clears the browser key and sends an official-config marker.
- Updated backend user-configured external provider creation so official stock configs resolve `PEXELS_API_KEY`, `PIXABAY_API_KEY`, or `FREESOUND_API_KEY` from `.env`.
- Fixed the external search modal provider readiness check so official stock provider configs are searchable without browser API keys and no longer display `missing key`.
- Added Freesound audio normalization from API v2 search results using high-quality preview MP3/OGG URLs for browser playback; OAuth-only original file download is left as a later production enhancement.
- Removed the top-right create/load project status CTA from the asset, inspiration, and creation workspaces.
- Moved the asset type tabs below the asset search/import toolbar. After a search has run, switching asset type tabs keeps the current search text and re-runs the material search.
- Unified local import entry copy to "Import assets"/"导入素材" and allowed one file picker to accept image, video, audio, and text files. Local uploads are now classified from MIME type and file extension before being saved.
- Added image/video/audio/script type switches inside the third-party stock search modal. Switching type keeps the same query text and immediately re-searches with the selected resource type.
- Removed Demo Stock/mock provider support from `ExternalAssetProviderSchema`, backend provider creation, default Settings state, and browser E2E.
- Replaced inline external stock results with a dedicated search modal and responsive selectable result cards. Cards now use larger 16:9 previews, wrap/clamp long title/license text inside the card, and no longer show per-card import buttons.
- Added a sticky modal action area for selected-count feedback and one-click bulk import. Bulk import now calls the backend import endpoint for each selected result and confirms COS/database persistence.
- Added server-side external asset downloading and COS upload during external import. Imported records now persist `source`, `storageProvider`, `objectKey`, COS `url`, MIME type, provider/license metadata, and type-specific tags in the asset store/database.
- Added internal scrolling to the external-search modal so large provider result sets can be browsed without overflowing the viewport.
- Added paged external search (`page`, `perPage`, `hasMore`) and infinite-scroll loading in the modal result pane. Pexels/Pixabay provider requests now pass the requested page to the upstream API.
- Added a themed scrollbar for the external result pane and a clear loading/end-of-results state at the bottom of the modal.
- Added an external asset preview dialog with a large contained image/video preview, title, author, license, dimensions, tags, source link, and a select/deselect action.
- Extended the preview dialog with playable audio controls, duration metadata, and an audio waveform-style preview surface for Freesound results.
- Updated the preview dialog to load provider original/large image URLs when available: Pexels uses `src.original`; Pixabay uses `largeImageURL`.
- Updated external result cards to use the same high-quality image URL helper as the preview dialog.
- Updated video result card rendering to show the third-party provider's original cover image and only fall back to the video icon when no cover URL is available.
- Added a generated SVG fallback cover for video results with missing/failed provider thumbnails, and allowed video provider results to remain visible even when `thumbnailUrl` is empty.
- Simplified search field CSS so the icon and input live inside one visible input shell; the inner input no longer draws its own background/border.
- Added a first-screen external stock entry on the asset library page so users can start from `/#assets` without visiting the project setup page first.
- Added an explicit no-provider reminder inside the external stock modal when no enabled provider has an API key.
- Added no-result feedback inside the external stock modal for configured providers that return no matches.
- Rewrote the `AssetsPanel` and Settings localized copy to avoid mojibake and keep the search flow readable.
- Added server-only provider configuration, including `FREESOUND_API_KEY`, to `.env.example`.
- Wrote verification evidence in `projects/shopclip-ai/evidence/part-013-verification.md`.

## Verification Evidence

- `corepack pnpm --filter @shopclip/shared test`
- `corepack pnpm --filter @shopclip/api test -- externalAssetProviders p1-flow`
- `corepack pnpm --filter @shopclip/shared build`
- `corepack pnpm --filter @shopclip/shared test`
- `corepack pnpm --filter @shopclip/web test -- App.test.tsx`
- `corepack pnpm --filter @shopclip/web typecheck`
- `corepack pnpm --filter @shopclip/web build`
- `corepack pnpm test`
- `corepack pnpm typecheck`
- `corepack pnpm lint`
- `corepack pnpm build`
- `corepack pnpm --filter @shopclip/shared test -- schemas.test.ts`
- `corepack pnpm --filter @shopclip/api test -- externalAssetProviders.test.ts`
- `corepack pnpm --filter @shopclip/web test -- App.test.tsx`
- `corepack pnpm typecheck`
- `corepack pnpm test`
- `corepack pnpm lint`
- `corepack pnpm build`
- Evidence note: `projects/shopclip-ai/evidence/2026-05-26-stock-provider-official-config-toggle.md`
- `corepack pnpm --filter @shopclip/web test:e2e -- e2e/p1-external-assets.spec.ts`
  - Starts from Settings, verifies provider configuration UI, opens the asset-page modal, searches mocked Pexels results through routed paged API responses, opens preview details, verifies the modal result area scrolls and loads the next page at the bottom, selects result cards, and verifies one-click COS import feedback.
  - Verifies the no-provider reminder state and disabled modal search button.
- `corepack pnpm --filter @shopclip/api test -- asset-cos-flow.test.ts p1-flow.test.ts`
- `corepack pnpm --filter @shopclip/web test:e2e -- p1-external-assets.spec.ts`
- Screenshot: `projects/shopclip-ai/evidence/p1-13-external-provider-settings.png`
- Screenshot: `projects/shopclip-ai/evidence/p1-13-external-search-modal.png`
- Screenshot: `projects/shopclip-ai/evidence/p1-13-external-no-provider.png`
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
- External imports now download and cache selected provider files in COS. Production rollout should still review provider license terms, rate limits, and whether to store original files or provider-approved previews per source.
- User-supplied stock API keys are stored in browser localStorage for this deliverable demo; production should move this to encrypted per-user secret storage before multi-user rollout.
