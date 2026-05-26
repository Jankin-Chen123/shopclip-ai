# Part 013 Verification: External Asset Providers

## Summary

Part 013 adds third-party stock asset provider support for Pexels, Pixabay, and Freesound. The latest iteration removes the Demo Stock/mock provider, adds Settings-based provider configuration, keeps third-party results in a dedicated external-search modal, changes provider results to card-based multi-select with one-click background COS import plus database metadata persistence, and adds infinite scroll plus full image/video/audio preview.

## Implementation Notes

- Added shared normalized external asset contracts:
  - `ExternalAssetProviderSchema`
  - `ExternalAssetResultSchema`
  - `ExternalAssetProviderConfigSchema`
  - `ExternalAssetSearchRequestSchema`
  - `ExternalAssetSearchResponseSchema`
  - `AssetSearchResponseSchema.externalResults`
- Added provider adapters in `apps/api/src/providers/assets/externalAssetProviders.ts`.
- Added Pexels, Pixabay, and Freesound normalization tests with fixed payloads.
- Added API aggregation test using an injected external provider, avoiding live network calls.
- Added `POST /api/projects/:projectId/assets/import-external` and `POST /api/assets/import-external` to enqueue selected third-party media imports. The endpoints return `202 Accepted` with a `processing` asset placeholder and `AssetProcessingJob`, then the background task downloads the provider media, uploads it through the configured Tencent COS storage provider, and persists normalized metadata in the asset database/store.
- Added `POST /api/assets/external-search` to search user-selected provider configs sent from the browser.
- Added Settings UI for Pexels, Pixabay, and Freesound provider configs. User-entered provider API keys are stored in browser localStorage for this deliverable demo.
- Added Freesound API v2 audio search normalization using high-quality preview URLs for browser playback; original file download remains a future OAuth-enabled enhancement.
- Removed Demo Stock/mock provider support from shared schemas, backend provider creation, Settings defaults, and E2E flows.
- Replaced inline external results with a dedicated modal that has its own search field, provider chips, loading/error/empty states, responsive cards, and bulk import actions.
- Result cards now use larger 16:9 image previews, remove per-card import buttons, support click-to-select, and clamp long title/license text inside the card bounds.
- The modal result area now scrolls internally for larger provider result sets, with a bottom action row showing selected count and one-click import.
- External search now supports `page`, `perPage`, and `hasMore`; Pexels/Pixabay requests pass the page to their upstream APIs, and the modal appends the next page when the user scrolls near the bottom.
- Styled the modal result scrollbar to match the app's cyan/pink dark UI treatment.
- Added a preview dialog with full image/video display, complete title/author/license/dimension/tag metadata, source link, and select/deselect action.
- Added audio-specific result cards and preview dialog playback controls with duration metadata for Freesound results.
- The preview dialog now prefers the highest-quality provider media URL available (`downloadUrl`) over compressed preview/card URLs; Pexels maps this to `src.original` and Pixabay maps it to `largeImageURL`.
- External result cards now use the same high-quality provider image URL helper, so grid images are no longer sourced from compressed thumbnails when a larger URL is available.
- Video result cards now render provider cover images from `thumbnailUrl` and only fall back to the generic video icon if the provider did not return a cover image.
- Video results with no provider cover, or a cover image that fails to load, now show a generated "No video cover" fallback image and remain selectable/searchable.
- Search fields now render as one styled input shell with an embedded icon; the nested native input has no separate border/background.
- One-click import now calls the backend import endpoint for each selected result and only waits for queue acknowledgement, so the user can keep working. The backend distinguishes image, video, audio, and text results, uploads the downloaded binary/text to COS in the background, and stores `source`, `storageProvider`, `objectKey`, `url`, `mimeType`, tags, and original provider/license metadata.
- COS intelligent image query threshold is now `>= 70` in the provider request, response normalization, and local asset result mapping.
- Added a visible "Third-party stock" entry on the asset library page and enabled search from `/#assets` before a project is loaded.
- If no user provider is configured, the modal now shows an explicit reminder and disables search instead of using mock results.
- The front end now renders explicit no-result feedback inside the stock-search modal for configured providers that return no matches.
- Rewrote the asset-library and Settings Chinese copy to remove mojibake in the third-party provider/search flow.
- Added server-only environment variables, including `FREESOUND_API_KEY`, to `.env.example`.

## Verification Commands

- `corepack pnpm --filter @shopclip/shared test`
  - Result after COS import enhancement: passed, 13 tests.
- `corepack pnpm --filter @shopclip/api test -- externalAssetProviders p1-flow`
  - Result before implementation: failed because provider module and `externalResults` did not exist.
  - Result after implementation: passed, 28 tests.
- `corepack pnpm --filter @shopclip/api test -- asset-cos-flow.test.ts p1-flow.test.ts`
  - Result after COS import enhancement: passed, 49 tests.
- `corepack pnpm --filter @shopclip/api test -- asset-cos-flow.test.ts p1-flow.test.ts cosIntelligentSearchProvider.test.ts`
  - Result after background queue and threshold update: passed, 49 tests.
- `corepack pnpm --filter @shopclip/web test -- App.test.tsx`
  - Result after COS import enhancement: passed, 38 tests.
- `corepack pnpm test`
  - Result after background queue update: passed. Shared 13 tests, API 49 tests, Web 38 tests.
- `corepack pnpm typecheck`
  - Result after background queue update: passed.
- `corepack pnpm lint`
  - Result after background queue update: passed.
- `corepack pnpm build`
  - Result after background queue update: passed.
- Browser E2E with local API/Web dev servers and routed Pexels search response
  - Command body: `corepack pnpm --filter @shopclip/web test:e2e -- e2e/p1-external-assets.spec.ts`
  - Result after background queue update: passed, 6 tests.
  - Flow: open Settings, verify "Add third-party library", add a Pexels key, open `/#assets`, search routed Pexels stock in the modal, verify card images use the high-resolution URL, open the preview dialog, verify metadata and high-resolution image URL usage, scroll to the bottom to load the next page, select two result cards, click "Import selected", and verify background queue confirmation plus queued card labels.
  - Video flow: switch to the Video tab, search routed video results, verify one result uses the provider cover image, verify another result without a provider cover uses the generated fallback image, and confirm the generic video placeholder is not shown for these cases.
  - Audio flow: switch to the Audio tab, search routed Freesound results, verify the request type is `audio`, open a playable preview dialog, verify duration metadata, select the result card, and confirm COS import feedback.
  - No-provider flow: open `/#assets` with no stock provider config, open the modal, verify the reminder and disabled search button.
  - Screenshot evidence:
    - `projects/shopclip-ai/evidence/p1-13-external-provider-settings.png`
    - `projects/shopclip-ai/evidence/p1-13-external-search-modal.png`
    - `projects/shopclip-ai/evidence/p1-13-external-no-provider.png`
    - `projects/shopclip-ai/evidence/p1-13-external-search-modal-zh.png`
    - `projects/shopclip-ai/evidence/p1-13-external-asset-import.png`

## Security Notes

- Provider API keys can be read from server-side environment variables or sent in a user-scoped search request from browser-local Settings.
- Normalized provider results do not include API keys.
- Front-end code stores user-entered stock provider keys in localStorage for this demo; production should use encrypted per-user secret storage.
- Imported assets store source/license tags such as `source-pexels`/`source-freesound` and normalized license labels. Image and video imports keep first-class asset types; audio imports are stored as reference assets with audio MIME metadata; text imports are stored as reference assets with `text/plain` metadata and a `script` tag for this schema version.
- Background import failure marks both the asset and processing job as `failed` with a stored error message instead of leaving the user-facing record in an indefinite processing state.

## Follow-Ups

- Real provider rollout should review current Pexels/Pixabay/Freesound license terms and API rate limits before enabling keys.
- The current import runner is in-process. Production should move queued imports to a durable queue/worker so pending imports survive API restarts.
