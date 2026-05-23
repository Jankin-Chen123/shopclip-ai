# 2026-05-23 Inspiration Generation Evidence

## Scope

- Completed the standalone Inspiration section for text, image, and video material generation.
- Added service-side Ark provider routing:
  - Text: `doubao-seed2.0-pro` contract.
  - Image: dedicated Ark image-generation endpoint from `AI_IMAGE_ENDPOINT_ID`.
  - Video: `doubao-seedance1.5-pro` contract.
- Kept provider API key and endpoint IDs out of committed source, docs, and frontend code.

## Files Updated

- `packages/shared/src/schemas.ts`
- `packages/shared/src/types.ts`
- `apps/api/src/modules/inspiration/router.ts`
- `apps/api/src/providers/ai/arkInspirationProvider.ts`
- `apps/api/src/app.ts`
- `apps/web/src/lib/api.ts`
- `apps/web/src/features/inspiration/InspirationPanel.tsx`
- `apps/web/src/styles.css`
- `apps/web/e2e/*.spec.ts`
- `.env.example`
- `README.md`
- `projects/shopclip-ai/02-development-plan.md`
- `projects/shopclip-ai/parts/part-011-inspiration-generation.md`

## Verification

- `corepack pnpm typecheck`: passed.
- `corepack pnpm lint`: passed.
- `corepack pnpm test`: passed.
  - Shared: 2 files, 7 tests.
  - API: 8 files, 17 tests.
  - Web: 1 file, 10 tests.
- `corepack pnpm build`: passed.
- `corepack pnpm --filter @shopclip/web test:e2e`: passed, 4 browser tests.
- `git ls-files .agents/memory`: no tracked memory files.
- Tracked-file credential marker check: no Ark key or endpoint-id pattern found.
- Local Ark smoke test on `http://localhost:4001/api/inspiration/generate`:
  - Text request returned `provider=volcengine-ark`, `fallback.used=false`.
  - Video request returned `provider=volcengine-ark`, `fallback.used=false`, `model=doubao-seedance1.5-pro`, and a processing task id.
- Local image-generation smoke tests with the provided image API key reached Ark successfully, but the tested Seedream model returned `ModelNotOpen` or no-access errors. The API now supports an image-specific key and returns a failed image material instead of treating generated text as a ready image artifact.

## Notes

- The video path submits/represents a processing material. Production completion polling remains a follow-up after the final provider response shape is locked.
- The configured Seed 2.0 Pro endpoint is used for text. Direct hosted image generation must be wired to a dedicated image-generation endpoint/model.
- The deterministic fallback remains available for demos when `AI_PROVIDER_MODE=mock` or provider configuration is incomplete.
