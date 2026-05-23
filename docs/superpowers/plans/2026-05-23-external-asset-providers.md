# External Asset Providers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add configurable third-party asset provider search for Pexels and Pixabay without weakening the deterministic local asset library.

**Architecture:** Keep the existing `/api/assets/search` endpoint as the single search surface. It will search local project assets first, then optionally call enabled external providers and return normalized external results alongside local results. Provider API keys remain server-only environment variables.

**Tech Stack:** Express, TypeScript, Zod shared contracts, Vitest, native `fetch`.

---

### Task 1: Shared External Asset Contract

**Files:**
- Modify: `packages/shared/src/schemas.ts`
- Modify: `packages/shared/src/types.ts`
- Test: `packages/shared/src/schemas.test.ts`

- [ ] Add `ExternalAssetProviderSchema`, `ExternalAssetResultSchema`, and extend `AssetSearchResponseSchema` with `externalResults`.
- [ ] Write schema tests proving an external result parses and missing attribution/source fields fail.
- [ ] Run `corepack pnpm --filter @shopclip/shared test` and verify the new test fails before implementation, then passes after implementation.

### Task 2: Provider Normalization

**Files:**
- Create: `apps/api/src/providers/assets/externalAssetProviders.ts`
- Test: `apps/api/src/providers/assets/externalAssetProviders.test.ts`

- [ ] Define `ExternalAssetSearchInput`, `ExternalAssetProvider`, and provider-specific Pexels/Pixabay normalizers.
- [ ] Add tests for Pexels photo/video payloads and Pixabay image/video payloads.
- [ ] Ensure no provider API key is returned in normalized results.

### Task 3: API Aggregation

**Files:**
- Modify: `apps/api/src/modules/projects/router.ts`
- Test: `apps/api/src/p1-flow.test.ts`

- [ ] Let `createP0Router` accept an optional `externalAssetSearch` dependency for tests.
- [ ] Make `GET /api/assets/search` return `{ results, externalResults }`.
- [ ] Add an API test proving local results and external provider results are merged without requiring real network access.

### Task 4: Configuration And Handoff

**Files:**
- Modify: `.env.example`
- Add: `projects/shopclip-ai/parts/part-013-external-asset-providers.md`
- Add: `projects/shopclip-ai/evidence/part-013-verification.md`

- [ ] Document `EXTERNAL_ASSET_PROVIDERS`, `PEXELS_API_KEY`, and `PIXABAY_API_KEY`.
- [ ] Record scope, verification, risks, and follow-ups in the Part document.
- [ ] Run `corepack pnpm test`, `corepack pnpm typecheck`, and targeted build if needed.
