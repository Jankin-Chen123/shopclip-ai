# 2026-05-27 Full Chain And Single-Scene Regeneration Verification

## Scope

- Project setup.
- Asset prep using a prepared library asset.
- Script rewrite through the Step 02 script-generation panel.
- Storyboard generation from the rewritten script and prepared asset IDs.
- Single-scene edit and save.
- Single-scene regeneration while other scenes remain unchanged.

## Files Changed

- `apps/api/src/modules/projects/router.ts`
- `apps/api/src/providers/ai/mockScriptProvider.ts`
- `apps/api/src/p0-flow.test.ts`
- `apps/api/src/p1-flow.test.ts`
- `apps/web/src/app/App.test.tsx`
- `apps/web/src/app/App.tsx`
- `apps/web/src/features/studio/StudioWorkspace.tsx`
- `apps/web/src/lib/api.ts`
- `packages/shared/src/schemas.ts`
- `packages/shared/src/types.ts`

## Regression Fixed

The storyboard generation endpoint previously relied on `project.assets[0]` when assigning scene assets. Step 02 can prepare assets from the global asset library, so generated scenes could lose the prepared asset reference. The backend now resolves requested `assetIds` through the shared store and passes those assets into the script provider.

2026-05-28 follow-up: Single-scene regeneration previously called the editing fallback provider, which rewrote subtitle, voiceover, and visual prompt text before refreshing the image. The flow now accepts the current inspector scene fields from the frontend and calls the image-generation path directly. Regeneration stores the current duration, subtitle, voiceover, visual prompt, and asset slot, refreshes only `imageUrl`, and leaves other scenes unchanged.

## Automated Verification

- `corepack pnpm --filter @shopclip/api test -- p0-flow.test.ts`: red before implementation, then passed.
- `corepack pnpm test`: passed.
- `corepack pnpm typecheck`: passed.
- `corepack pnpm lint`: passed.
- `corepack pnpm build`: passed.
- `corepack pnpm --filter @shopclip/web test:e2e`: passed after updating the browser specs to the current Step 02 script-generation and Step 03 storyboard-editing UI.
- `corepack pnpm --filter @shopclip/shared build`: passed.
- `corepack pnpm --filter @shopclip/api test -- p0-flow.test.ts -t "uses prepared assets for storyboard generation and regenerates only the selected scene"`: passed, including the regression that current scene fields are preserved after regeneration.
- `corepack pnpm --filter @shopclip/api test -- p1-flow.test.ts -t "updates, reorders, deletes, regenerates scenes"`: passed.
- `corepack pnpm --filter @shopclip/web test -- App.test.tsx -t "sends current scene fields and API settings when regenerating one scene image"`: passed.
- `corepack pnpm typecheck`: passed.
- `corepack pnpm lint`: passed.
- `corepack pnpm build`: passed.

## Browser Verification

Browser flow executed against local dev services:

1. Opened `http://localhost:5173/#project`.
2. Created a project.
3. Created a prepared library asset through the API and imported it in Step 02 Asset prep.
4. Wrote a draft script, clicked One-click generate, then clicked Generate storyboard.
5. Edited Scene 1 subtitle and voiceover, saved the edit.
6. Regenerated Scene 2.
7. Verified Scene 1 still showed the saved edit and Scene 2 showed the regenerated subtitle.

The current Step 03 navigation label is Storyboard editor / 分镜编辑; the old Script and storyboard / 脚本与分镜 label is not used for the Step 03 panel.

Screenshot:

- `output/playwright/full-chain-studio-regenerated-scene.png`

## Notes

- The browser verification uses `localhost` because the API CORS default allows `http://localhost:5173`.
- Dev services were stopped after the browser verification; no node process remained.
