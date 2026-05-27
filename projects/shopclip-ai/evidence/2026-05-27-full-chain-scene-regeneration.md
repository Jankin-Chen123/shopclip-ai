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
- `apps/web/src/app/App.tsx`

## Regression Fixed

The storyboard generation endpoint previously relied on `project.assets[0]` when assigning scene assets. Step 02 can prepare assets from the global asset library, so generated scenes could lose the prepared asset reference. The backend now resolves requested `assetIds` through the shared store and passes those assets into the script provider.

## Automated Verification

- `corepack pnpm --filter @shopclip/api test -- p0-flow.test.ts`: red before implementation, then passed.
- `corepack pnpm test`: passed.
- `corepack pnpm typecheck`: passed.
- `corepack pnpm lint`: passed.
- `corepack pnpm build`: passed.
- `corepack pnpm --filter @shopclip/web test:e2e`: passed after updating the browser specs to the current Step 02 script-generation and Step 03 storyboard-editing UI.

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
