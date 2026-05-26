# 2026-05-26 Stock Provider Official Config Toggle

## Scope

Implemented `Custom` / `Use official config` API key source switching for third-party stock libraries.

## Behavior

- `Custom`: Settings keeps the provider API key in browser-local config and sends it with external stock search requests.
- `Use official config`: Settings disables and clears the provider API key field. Search requests carry `credentialSource: "official"` for the selected provider, and the backend resolves the provider key from `.env`.
- Backend `.env` keys used by official mode:
  - `PEXELS_API_KEY`
  - `PIXABAY_API_KEY`
  - `FREESOUND_API_KEY`

## Verification

- RED checks were observed first:
  - `corepack pnpm --filter @shopclip/shared test -- schemas.test.ts` failed because official stock credential source was stripped from the parsed request.
  - `corepack pnpm --filter @shopclip/api test -- externalAssetProviders.test.ts` failed because official stock provider configs without browser keys were not created from environment keys.
  - `corepack pnpm --filter @shopclip/web test -- App.test.tsx` failed because Settings lacked stock API key source controls and stock config sanitization kept browser keys in official mode.
  - A follow-up Web test failed because `hasUsableStockProviderCredential` did not exist yet, locking search eligibility for official configs without browser keys.
- GREEN targeted verification:
  - `corepack pnpm --filter @shopclip/shared test -- schemas.test.ts`
  - `corepack pnpm --filter @shopclip/api test -- externalAssetProviders.test.ts`
  - `corepack pnpm --filter @shopclip/web test -- App.test.tsx`
- Full verification:
  - `corepack pnpm typecheck`
  - `corepack pnpm test`
  - `corepack pnpm lint`
  - `corepack pnpm build`

## Notes

Provider API keys remain absent from normalized external asset results and API responses. Official mode still depends on the deployment environment having the corresponding provider key configured.

## Follow-Up Fix

- 2026-05-26: Fixed the asset search modal's provider readiness check. The modal now uses the same official/custom credential rule as the app search handler, so an enabled provider with `credentialSource: "official"` is not shown as `missing key` and can submit searches without a browser API key.
- Verification: `corepack pnpm --filter @shopclip/web test -- App.test.tsx`.
