# Public Reference Video Ingest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Support active public reference video ingest for analysis: download/register a public URL as a `public_reference` asset, slice and structure it, then store breakdown and templates for the creation flow.

**Architecture:** Keep the compliance boundary explicit: downloaded public videos are analysis-only assets and remain excluded from Studio remix candidates. The reference analysis service owns the ingest orchestration, reuses `processAssetStructure()`, and passes structured asset/slice context into the viral breakdown provider.

**Tech Stack:** Node.js, TypeScript, Express, Zod, existing memory/Prisma stores, Ark Responses provider boundary, Vitest.

---

## Files

- Modify: `apps/api/src/part015-processing-flow.test.ts`
- Create: `apps/api/src/providers/references/referenceDownloadProvider.ts`
- Create: `apps/api/src/providers/references/mockReferenceDownloadProvider.ts`
- Modify: `apps/api/src/providers/references/viralBreakdownProvider.ts`
- Modify: `apps/api/src/providers/references/mockViralBreakdownProvider.ts`
- Modify: `apps/api/src/providers/references/arkViralBreakdownProvider.ts`
- Modify: `apps/api/src/modules/references/referenceAnalysisService.ts`
- Modify: `apps/api/src/modules/projects/router.ts`
- Modify: `projects/shopclip-ai/parts/part-015-multigranularity-asset-and-viral-analysis.md`
- Modify: `projects/shopclip-ai/evidence/part-015-multigranularity-asset-and-viral-analysis-2026-05-29.md`
- Modify: `README.md`

## Task 1: Failing Integration Test

- [x] Add assertions to `apps/api/src/part015-processing-flow.test.ts` after the public URL reference analysis call:
  - returned `reference.sourceAssetId` exists
  - the generated asset search result has `asset.source === "public_reference"`
  - the result contains structured slices
  - the later Studio recall response does not include the public reference asset
- [x] Run `corepack pnpm --filter @shopclip/api test -- src/part015-processing-flow.test.ts`.
- [x] Expected RED: the public URL reference currently has no `sourceAssetId` and no downloaded/structured asset.

## Task 2: Reference Download Provider

- [x] Create `ReferenceDownloadProvider` with `downloadReference(input)` returning title-derived file name, content type, source URL, public analysis URL, byte size, and metadata.
- [x] Create deterministic mock provider for local tests and demos. It should not fetch the internet; it declares an analysis-only URL and duration metadata.
- [x] Keep real downloader extensible by isolating the interface; add env docs for future `yt-dlp` or managed downloader integration.

## Task 3: Reference Analysis Orchestration

- [x] Extend `analyzeReferenceVideo()` to accept `referenceDownloader` and `visionProvider`.
- [x] If `sourceAssetId` is present, keep current owned-video behavior and process that asset before breakdown.
- [x] If only `sourceUrl` is present, call the downloader, add a `public_reference` video asset to the project, process it, and attach its `asset.id` as `sourceAssetId`.
- [x] Build structured context from `asset.metadata.structuredAsset` and all slices for that asset.
- [x] Pass that context to `viralProvider.analyzeReference(reference, context)`.

## Task 4: Provider Context Consumption

- [x] Update `ViralBreakdownProvider` signature to accept optional structured context.
- [x] Update mock breakdown to vary output using slice summaries and roles when context exists.
- [x] Update Ark prompt to include structured asset summary, ASR/OCR, and compact slice metadata, while preserving source identity overrides.

## Task 5: Docs And Verification

- [x] Update Part 015 and README: public URLs are downloaded for analysis-only structure, not mixed into generated videos.
- [x] Run:
  - `corepack pnpm --filter @shopclip/api test -- src/part015-processing-flow.test.ts src/providers/references/arkViralBreakdownProvider.test.ts`
  - `corepack pnpm --filter @shopclip/api typecheck`
  - `corepack pnpm --filter @shopclip/shared test`
  - `git diff --check`
