# Part 012: User API Settings

## Status

- Project slug: shopclip-ai
- Part number: 012
- Owner role: `implementation-engineer`
- Status: Done
- Created: 2026-05-23
- Last updated: 2026-05-26

## Source Of Truth

Before starting, read `../00-requirements.md`, `../01-design-spec.md`, `../02-development-plan.md`, `../parts/part-011-inspiration-generation.md`, and `AGENTS.md`.

## Objective

Replace the left sidebar footer with a Settings entry and let users configure the API provider, service address, model, and API key used by inspiration generation.

## Scope

### In Scope

- Settings page reachable from the left sidebar footer.
- Language switching inside Settings.
- Separate API configuration sections for General model, Image generation model, and Video generation model.
- Provider/model dropdown presets with editable API service address.
- Model fields must also accept manual model ID entry.
- Browser-local persistence for user API configuration.
- Inspiration generation requests include the user configuration for the selected material type.
- Backend provider calls use the API key, API service address, and model supplied by the user when present.

### Out Of Scope

- Server-side storage of user API keys.
- Team/user account settings.
- Validating external provider credentials before generation.
- Adding generated inspiration materials into the asset library.

## Acceptance Criteria

- [x] Left sidebar footer opens Settings instead of showing the old P1 page-count label.
- [x] Settings contains language controls.
- [x] Settings contains General, Image, and Video API configuration areas.
- [x] Each API configuration area has provider, API service address, model, and API key fields.
- [x] Provider/model fields offer preset dropdown options.
- [x] Model fields allow manual model ID entry.
- [x] API key remains user-entered and is not hardcoded.
- [x] Inspiration generation sends the relevant saved user configuration on each request.
- [x] Backend uses the user-supplied API key/model/base URL when present.

## Verification Plan

- Automated: full workspace typecheck, unit/integration tests, lint, and production build.
- Browser: capture Settings page screenshot through Playwright CLI.
- Security: confirm no API key is written into source, `.env.example`, project docs, or committed files.

## Risks And Follow-Ups

- API keys are stored in browser localStorage because the user explicitly requested UI-entered keys. This is acceptable for the demo but should be replaced with account-scoped encrypted storage for production.
- Provider-specific video task polling is still a follow-up from Part 011.
- The preset model lists are starter presets; production should fetch supported model lists from provider metadata when available.

## Change Summary

- Added user API configuration to the shared inspiration request contract.
- Added a Settings page with language and model provider configuration.
- Removed the sidebar language switcher and kept language switching inside Settings.
- Refreshed model presets and changed model controls to editable preset-backed fields.
- Added browser-local API configuration persistence.
- Updated inspiration generation to require and send the relevant user API key.
- Updated the backend Ark/OpenAI-compatible provider adapter to call with user-supplied API settings before falling back to environment/mock behavior.

## Verification Evidence

- Evidence file: `../evidence/2026-05-23-user-api-settings.md`.

## Maintenance Notes

- 2026-05-24: Fixed Ark 404 fallback caused by Settings sending display-name model presets as API `model` values. Settings now stores and displays user-provided versioned Ark model IDs such as `doubao-seed-2-0-pro-260215`, `doubao-seedream-5-0-260128`, and `doubao-seedance-1-5-pro-251215`; the frontend migrates legacy browser-stored display names into those IDs, and the backend keeps alias compatibility before provider calls. The model field is now one editable dropdown-backed input instead of a separate input plus preset select. Evidence: `../evidence/2026-05-24-ark-inspiration-model-routing-fix.md`.
- 2026-05-26: Added per-model API key source switching in Settings. Each General/Image/Video model card now supports `custom` and `official` credential modes. `custom` keeps the previous behavior and sends the browser-entered API key with generation requests. `official` clears the browser-entered key from saved request config and sends a `credentialSource: "official"` marker; the backend then uses the server-side `.env` API key while keeping the selected provider, base URL, and model. Evidence: `../evidence/2026-05-26-official-api-config-toggle.md`.
