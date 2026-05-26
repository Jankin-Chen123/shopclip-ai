# Official API Config Toggle

## Context

- Date: 2026-05-26
- Owner role: `implementation-engineer`
- User request: Settings must switch between user-provided API keys and official backend configuration. In custom mode requests use the API key entered on the website. In official mode requests tell the backend to use the API key from `.env`.

## Changes

- Added `credentialSource: "custom" | "official"` to the shared inspiration API config contract.
- Added a per-card Settings switch for General, Image, and Video model configuration.
- Kept `custom` as the default and preserved existing provider, base URL, model, and API key behavior.
- In `official` mode, the Settings page disables the API key input and clears the browser-saved key for that role.
- Updated inspiration generation so official mode does not block on a missing browser-entered key.
- Updated the backend Ark/OpenAI-compatible provider resolver so official mode uses the server-side `.env` API key and the selected provider/base URL/model.
- Added regression tests for backend credential resolution and Settings rendering/sanitization.

## Verification

- `corepack pnpm --filter @shopclip/shared build`
  - Result: passed.
- `corepack pnpm --filter @shopclip/api test src/providers/ai/arkInspirationProvider.test.ts`
  - Result: passed, 1 file / 8 tests.
- `corepack pnpm --filter @shopclip/api typecheck`
  - Result: passed.
- `corepack pnpm --filter @shopclip/web test src/app/App.test.tsx -t "user API settings|credential source"`
  - Result: passed, 2 tests.
- `corepack pnpm --filter @shopclip/web typecheck`
  - Result: passed after tightening the normalized Settings config type.
- `corepack pnpm --filter @shopclip/web test src/app/App.test.tsx`
  - Result: passed, 1 file / 28 tests.
- `corepack pnpm typecheck`
  - Result: passed across shared, API, and web.
- `corepack pnpm test`
  - Result: passed, shared 11 tests, API 38 tests, web 28 tests.
- `corepack pnpm lint`
  - Result: passed across shared, API, and web.
- `corepack pnpm build`
  - Result: passed across shared, API, and web.

## Residual Risk

- Official mode still requires the backend deployment environment to define the relevant API key. If the key is absent, generation falls back with a configuration error.
- Provider/model access still depends on the backend account permissions and the selected model ID.

## Follow-Up Fix

- 2026-05-26: Fixed official mode so model generation uses the complete backend `.env` configuration for provider, base URL, endpoint/model, and API key. Browser-selected custom base/model fields are no longer mixed into official requests.
- Added support for role-specific backend API keys:
  - `AI_TEXT_API_KEY`
  - `AI_IMAGE_API_KEY`
  - `AI_VIDEO_API_KEY`
  - `ARK_API_KEY` as a shared fallback after `AI_API_KEY`
- Settings now hides custom model fields below the source switch when `Use official config` is selected.
- Seedream image generation now avoids invalid small image requests by falling back to sizes at or above the provider-reported minimum pixel count when `ARK_IMAGE_SIZE` is absent or too small.
- Verification:
  - `corepack pnpm --filter @shopclip/api test -- arkInspirationProvider.test.ts`
  - `corepack pnpm --filter @shopclip/web test -- App.test.tsx`
  - `corepack pnpm test`
  - `corepack pnpm typecheck`
  - `corepack pnpm lint`
  - `corepack pnpm build`
