# Part 011: Inspiration Generation

## Status

- Project slug: shopclip-ai
- Part number: 011
- Owner role: `implementation-engineer`
- Status: Done
- Created: 2026-05-23
- Last updated: 2026-05-23

## Source Of Truth

Before starting, read `../00-requirements.md`, `../01-design-spec.md`, `../02-development-plan.md`, and `AGENTS.md`.

## Objective

Complete the standalone Inspiration section so a user can enter one text prompt and generate text, image, or video material through a backend provider adapter.

## Scope

### In Scope

- Shared request/response contracts for inspiration generation.
- API endpoint for inspiration material generation.
- Volcengine Ark provider adapter with service-side environment variables.
- Deterministic fallback output when provider mode is mock, misconfigured, or unavailable.
- Frontend controls for text/image/video target selection, loading/error states, and result display.
- Environment variable placeholders and handoff evidence.

### Out Of Scope

- Persisting generated inspiration materials into project assets.
- Polling video task completion until final rendered video URL.
- Storing or documenting real API keys, endpoint IDs, or account resource details.

## Implementation Notes

- Text routes through the Seed model contract: `doubao-seed2.0-pro`.
- Image routes through the Ark image-generation endpoint configured by `AI_IMAGE_ENDPOINT_ID`; successful image results must include a renderable URL or base64 data URL.
- Video routes through the Seedance model contract: `doubao-seedance1.5-pro`.
- The browser never sees provider credentials or endpoint IDs.
- Mock fallback keeps the demo deterministic while preserving the intended model routing in the response.

## Acceptance Criteria

- [x] User can select Text, Image, or Video in the Inspiration section.
- [x] User can submit one prompt and receive a generated material card.
- [x] Text responses identify the Seed model contract.
- [x] Image responses require a renderable generated image artifact when a real image endpoint is configured.
- [x] Video responses identify the Seedance model contract.
- [x] API validates prompt length and asset type before provider calls.
- [x] Provider secrets remain server-only and absent from committed files.

## Verification Plan

- Automated: shared schema tests, API endpoint tests, web rendering tests.
- Automated: full workspace typecheck, lint, test, and build before final handoff.
- Manual: inspect `.env.example`, `.gitignore`, and `git ls-files` for secret hygiene.

## Risks And Follow-Ups

- Fire-and-forget video task submission returns a processing material; production UX should add polling and retrieval once the final provider response shape is locked.
- The provider path can be overridden with `ARK_VIDEO_GENERATION_PATH` if the Ark video API path changes.
- Direct image file generation requires a dedicated image-generation endpoint/model; the provided Seed 2.0 Pro text endpoint cannot be used as the final image artifact generator.
- Generated materials are not yet added to the Asset library; that can be a follow-up if users need to reuse output in Studio.

## Change Summary

- Added `InspirationGenerateRequestSchema` and `InspirationGenerateResponseSchema` in shared contracts.
- Added `POST /api/inspiration/generate`.
- Added `arkInspirationProvider` with Ark real-provider calls and deterministic fallback.
- Completed `InspirationPanel` with prompt entry, text/image/video selection, loading state, error state, and material result cards.
- Added placeholder-only Ark environment variables to `.env.example` and README.

## Verification Evidence

- Evidence file: `../evidence/2026-05-23-inspiration-generation.md`.
