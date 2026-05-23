# Part 013 Verification: External Asset Providers

## Summary

Part 013 adds third-party stock asset provider support for Pexels and Pixabay, plus a no-key `demo` provider for local delivery. The latest iteration adds Settings-based provider configuration and a dedicated external-search modal, so third-party results no longer distort the main asset grid layout.

## Implementation Notes

- Added shared normalized external asset contracts:
  - `ExternalAssetProviderSchema`
  - `ExternalAssetResultSchema`
  - `ExternalAssetProviderConfigSchema`
  - `ExternalAssetSearchRequestSchema`
  - `ExternalAssetSearchResponseSchema`
  - `AssetSearchResponseSchema.externalResults`
- Added provider adapters in `apps/api/src/providers/assets/externalAssetProviders.ts`.
- Added Pexels and Pixabay normalization tests with fixed payloads.
- Added API aggregation test using an injected external provider, avoiding live network calls.
- Added deterministic demo stock results through `EXTERNAL_ASSET_PROVIDERS=demo`.
- Added `POST /api/projects/:projectId/assets/import-external` to persist an external result as a project asset reference.
- Added `POST /api/assets/external-search` to search user-selected provider configs sent from the browser.
- Added Settings UI for Demo Stock, Pexels, and Pixabay provider configs. User-entered provider API keys are stored in browser localStorage for this deliverable demo.
- Replaced inline external results with a dedicated modal that has its own search field, provider chips, loading/error/empty states, responsive cards, and import actions.
- Added a visible "Third-party stock" entry on the asset library page and enabled search from `/#assets` before a project is loaded.
- Importing an external result now creates a default demo project automatically when the user starts from the asset page.
- If no Pexels/Pixabay keys or `EXTERNAL_ASSET_PROVIDERS` are configured, the API now falls back to the demo stock provider instead of returning silent empty external results.
- The front end now renders explicit no-result feedback inside the stock-search modal, so a provider/configuration issue is visible to the user.
- Rewrote the asset-library and Settings Chinese copy to remove mojibake in the third-party provider/search flow.
- Added server-only environment variables to `.env.example`.

## Verification Commands

- `corepack pnpm --filter @shopclip/shared test`
  - Result before implementation: failed because `ExternalAssetResultSchema` did not exist.
  - Result after implementation: passed, 9 tests.
- `corepack pnpm --filter @shopclip/api test -- externalAssetProviders p1-flow`
  - Result before implementation: failed because provider module and `externalResults` did not exist.
  - Result after implementation: passed, 24 tests.
- `corepack pnpm test`
  - Result: passed. Shared 10 tests, API 27 tests, Web 16 tests.
- `corepack pnpm typecheck`
  - Result: passed.
- `corepack pnpm lint`
  - Result: passed.
- `corepack pnpm build`
  - Result: passed.
- Browser E2E with API on `127.0.0.1:4301`, Web on `127.0.0.1:5179`, and default Demo Stock provider
  - Command body: `playwright.cmd test --config apps/web/e2e/playwright.config.ts p1-external-assets.spec.ts --reporter=list --workers=1`
  - Observed result: both tests printed `ok`; the command timed out during Windows dev-server teardown, so it did not return a clean zero exit in this environment.
  - Flow: open Settings, verify "Add third-party library", open `/#assets`, search demo stock in the modal, import the selected result, and verify it appears in the asset grid.
  - Screenshot evidence:
    - `projects/shopclip-ai/evidence/p1-13-external-provider-settings.png`
    - `projects/shopclip-ai/evidence/p1-13-external-search-modal.png`
    - `projects/shopclip-ai/evidence/p1-13-external-search-modal-zh.png`
    - `projects/shopclip-ai/evidence/p1-13-external-asset-import.png`
- Browser E2E with API on `127.0.0.1:4100`, Web on `127.0.0.1:5180`, and `EXTERNAL_ASSET_PROVIDERS=demo`
  - Command body: `node_modules/.bin/playwright.CMD test --config e2e/playwright.config.ts p1-external-assets.spec.ts`
  - Flow: open `/#assets`, verify "Search external stock assets", search demo stock, import the selected result, and verify it appears in the asset grid.
  - Result: passed, 1 test.
  - Screenshot evidence: `projects/shopclip-ai/evidence/p1-13-external-asset-import.png`.
- Browser E2E with API on `127.0.0.1:4100`, Web on `127.0.0.1:5180`, and no `EXTERNAL_ASSET_PROVIDERS` override
  - Command body: `node_modules/.bin/playwright.CMD test --config e2e/playwright.config.ts p1-external-assets.spec.ts`
  - Result: passed, 1 test; verified the default demo provider covers local setups without stock API keys.
- Browser E2E Chinese copy/layout check
  - Command body: `node_modules/.bin/playwright.CMD test --config e2e/playwright.config.ts p1-external-assets.spec.ts`
  - Result: passed, 2 tests total; verified Chinese third-party result copy has no mojibake and results appear before the empty local asset state.
  - Screenshot evidence: `projects/shopclip-ai/evidence/p1-13-external-asset-import-zh.png`.

## Security Notes

- Provider API keys can be read from server-side environment variables or sent in a user-scoped search request from browser-local Settings.
- Normalized provider results do not include API keys.
- Front-end code stores user-entered stock provider keys in localStorage for this demo; production should use encrypted per-user secret storage.
- Imported assets store source/license tags such as `source-demo` and normalized license labels.

## Follow-Ups

- Production storage can optionally download/cache selected third-party binaries into object storage instead of keeping only remote URLs.
- Real provider rollout should review current Pexels/Pixabay license terms and API rate limits before enabling keys.
