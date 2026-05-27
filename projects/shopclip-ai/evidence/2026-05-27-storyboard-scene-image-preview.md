# 2026-05-27 Storyboard Scene Image Preview Verification

## Scope

- Step 02 "Generate storyboard" now enriches each generated storyboard scene with an `imageUrl`.
- The backend calls the image-generation provider through `generateInspiration({ assetType: "image" })` for every scene.
- When mock mode is active or the provider returns no renderable URL, the backend stores a deterministic SVG data URL so the demo preview never stays blank.
- Step 03 Studio renders the selected scene image inside the 9:16 preview frame.
- Single-scene regeneration also refreshes that scene's `imageUrl`.

## Verification

- 2026-05-27 follow-up: Added regression coverage for browser-supplied Image API settings during `POST /api/projects/:id/generate-script`. Before the fix, the new test returned an SVG fallback data URL instead of the configured provider URL. After passing `request.apiConfig` into storyboard scene image generation, the test verifies the custom image base URL, model, API key, reference image, and returned scene image URL.
- `corepack pnpm --filter @shopclip/api test -- p0-flow.test.ts` (2026-05-27 follow-up: 14 API test files passed, 62 tests passed)
- `corepack pnpm --filter @shopclip/shared build`
- `corepack pnpm --filter @shopclip/shared test -- schemas.test.ts`
- `corepack pnpm --filter @shopclip/api db:generate`
- `corepack pnpm --filter @shopclip/api test -- p0-flow.test.ts`
- `corepack pnpm --filter @shopclip/web test -- App.test.tsx`
- `corepack pnpm test`
- `corepack pnpm typecheck`
- `corepack pnpm lint`
- `corepack pnpm build`
- `corepack pnpm --filter @shopclip/web test:e2e`

## Browser Evidence

- `projects/shopclip-ai/evidence/p0-02-assets-and-storyboard.png`
- `projects/shopclip-ai/evidence/p0-03-studio-edit.png`
- `projects/shopclip-ai/evidence/p1-07-scene-agent-regeneration.png`
