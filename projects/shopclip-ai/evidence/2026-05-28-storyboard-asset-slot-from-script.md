# Storyboard Asset Slot From Script Evidence

## Context

Step 02 scripts can explicitly call a prepared image in the visual column, for example `调用 [生成水杯多角度细节图 (2).png] 素材展示`.

The generated Step 03 storyboard kept that file name only inside `visualPrompt`, while the scene `assetId` still defaulted to the first prepared asset. As a result, the Studio asset slot dropdown did not match the script's requested material.

## Change

- Draft-script parsing now scans each visual prompt for prepared asset names.
- Exact filename matches are normalized for brackets, quotes, and whitespace.
- Longer asset names are preferred before shorter names so `生成水杯多角度细节图 (2).png` does not accidentally match `生成水杯多角度细节图.png`.
- If no explicit asset name is found, the previous primary-asset fallback is preserved.

## Verification

- RED: `corepack pnpm --filter @shopclip/api test -- p0-flow.test.ts` failed because all structured scenes used the first prepared asset id.
- GREEN: after mapping visual-column asset mentions to scene `assetId`, the same command passed with 16 API test files and 76 tests.
