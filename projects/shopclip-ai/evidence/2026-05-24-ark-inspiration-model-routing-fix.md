# Ark Inspiration Model Routing Fix

## Context

- Date: 2026-05-24
- Owner role: `implementation-engineer`
- User reported: Inspiration text, image, and video generation all returned `Ark request failed with HTTP 404. Deterministic fallback used.`

## Root Cause

The Settings page shipped Ark model presets as display names such as `Doubao-Seedream-4.0`. When users entered API keys in Settings, the browser-saved API config overrode the service-side `.env` model IDs. The backend then sent those display names directly as the Ark `model` field, which can produce 404 responses from Ark generation endpoints.

## Changes

- Updated the Settings Ark presets to use callable model IDs instead of display names.
- Added backend normalization for legacy browser-stored Ark display names, so existing localStorage values are mapped before provider calls.
- Added service-side Ark endpoint/model resolution for legacy Settings presets, so saved display names prefer the configured server endpoint IDs instead of being sent directly to Ark.
- Replaced the Settings model input plus native preset `select` with one editable `input[list]` combobox, so the red-boxed model field is both manually editable and dropdown-backed.
- Added frontend migration for browser-stored legacy Ark display-name models.
- Corrected the Ark alias contract: frontend dropdowns now store and display the user-provided versioned IDs such as `doubao-seed-2-0-pro-260215`, `doubao-seedream-5-0-260128`, and `doubao-seedance-1-5-pro-251215`; backend provider calls still translate older short/display aliases for compatibility.
- Added an API regression test proving `Doubao-Seedream-4.0` is submitted as `doubao-seedream-4-0-250828`.
- Updated the app rendering tests to assert the new model IDs in the Inspiration and Settings UI.

## Verification

- `corepack pnpm --filter @shopclip/api test -- src/providers/ai/arkInspirationProvider.test.ts`
  - Result: passed, 9 files / 30 tests.
- `corepack pnpm --filter @shopclip/web test -- src/app/App.test.tsx`
  - Result: passed, 1 file / 23 tests.
- Browser verification:
  - `.\apps\web\node_modules\.bin\playwright.CMD screenshot --full-page http://127.0.0.1:5173/#settings output\playwright\settings-model-versioned-combobox.png`
  - Result: captured Settings page showing one editable model field per role with versioned Ark IDs: `doubao-seed-2-0-pro-260215`, `doubao-seedream-5-0-260128`, and `doubao-seedance-1-5-pro-251215`.
- `corepack pnpm test`
  - Result: passed, shared 11 tests, API 30 tests, web 23 tests.
- `corepack pnpm typecheck`
  - Result: passed across shared, API, and web.
- `corepack pnpm lint`
  - Result: passed across shared, API, and web.
- `corepack pnpm build`
  - Result: passed across shared, API, and web.

## Residual Risk

- Ark text and video model availability still depends on the user's account, region, and enabled models/endpoints.
- If a user has manually entered a custom non-Ark model ID, the backend preserves it unless it matches a known legacy Ark display-name alias.
