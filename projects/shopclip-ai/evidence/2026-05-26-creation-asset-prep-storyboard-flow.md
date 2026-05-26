# Creation Asset Prep And Storyboard Flow Verification

## Scope

- Replaced the creation section's old direct Step 03 script entry with Step 02 asset prep.
- Added a right-aligned "Generate storyboard" action on asset prep that runs storyboard generation and navigates to Step 03.
- Updated Step 03 to show "Script & storyboard" plus the storyboard re-edit workspace.

## Verification

- `corepack pnpm --filter @shopclip/web test -- App.test.tsx`: passed.
- `corepack pnpm --filter @shopclip/web typecheck`: passed.
- `corepack pnpm --filter @shopclip/web lint`: passed.
- `corepack pnpm --filter @shopclip/web build`: passed.

## 2026-05-26 Follow-Up

- Updated Step 02 so it does not preload assets from the global asset library or loaded project.
- Step 02 now only displays files manually selected in the asset prep upload cards during the current prep session.
- Added regression coverage: `does not preload existing library assets into asset prep`.
- Fresh verification passed: `corepack pnpm --filter @shopclip/web test -- App.test.tsx`, `typecheck`, `lint`, and `build`.

## 2026-05-26 Asset Library Import And Keyword Editing

- Added explicit "Import from asset library" actions to each Step 02 material bucket.
- Existing asset library items remain hidden until the user opens the library selector and chooses an asset.
- Replaced static product keyword pills with editable keyword inputs, delete controls, and an add-keyword field.
- Added regression coverage for the library import entry and free-editable keyword controls.
- Fresh verification passed: `corepack pnpm --filter @shopclip/web test -- App.test.tsx`, `typecheck`, `lint`, and `build`.
- Browser evidence: `output/playwright/creation-asset-prep-library-keywords-zh.png`.

## 2026-05-26 Searchable Library Import And Preview

- Reworked "Import from asset library" into a searchable asset-library picker inside Step 02.
- The picker now filters by asset name, MIME type, type, and tags, shows media preview cards, supports selecting assets, and imports selected assets into the current material bucket.
- Imported library assets now retain their source metadata, show image/video thumbnails inline inside the Step 02 material bucket, and expose a preview action for larger review.
- The creation asset-prep page now refreshes the full asset library (`category=all`) so the demo video bucket can import videos even if the user did not previously open the video tab in Asset library.
- Local files selected from the demo video bucket are restricted to MP4/MOV-compatible input types.
- Added regression coverage for searchable library import controls, asset content preview URL rendering, and library filtering.
- Fresh verification passed: `corepack pnpm --filter @shopclip/web test -- App.test.tsx`, `typecheck`, `lint`, and `build`.
- Browser evidence: `output/playwright/creation-asset-prep-library-search-preview-zh.png`, `output/playwright/creation-asset-prep-imported-inline-thumbnail-zh.png`, and `output/playwright/creation-asset-prep-imported-preview-zh.png`.

## 2026-05-26 Video Import And Preview

- Fixed the empty "Demo videos" library picker by loading all asset categories when entering Step 02 asset prep.
- Verified that video assets appear in the demo video picker, can be selected/imported, and open in the post-import preview dialog with native video controls.
- Added regression coverage: `requests all asset library categories for creation asset prep`.
- Fresh verification passed: `corepack pnpm --filter @shopclip/web test -- App.test.tsx`, `typecheck`, `lint`, and `build`.
- Browser evidence: `output/playwright/creation-asset-prep-video-library-import-zh.png` and `output/playwright/creation-asset-prep-video-preview-zh.png`.

## 2026-05-26 Asset Prep Library Category Alignment

- Root cause: `Reference mood board` is seeded as `type=reference` with `mimeType=image/png`, so it is not visible in the Asset library image/script/video/audio tabs, while the Step 02 import picker previously classified it as an image by MIME type.
- Updated Step 02 import filtering to reuse the same `assetMatchesCategory` rules as the Asset library section.
- Added regression coverage: `keeps prep library filtering aligned with visible asset library categories`.
- Fresh verification passed: `corepack pnpm --filter @shopclip/web test -- App.test.tsx`, `typecheck`, `lint`, and `build`.

## Browser Evidence

- `output/playwright/creation-asset-prep-zh.png`
- `output/playwright/creation-script-storyboard-zh.png`
- `output/playwright/creation-asset-prep.png`
- `output/playwright/creation-script-storyboard.png`
- `output/playwright/creation-asset-prep-library-search-preview-zh.png`
- `output/playwright/creation-asset-prep-imported-inline-thumbnail-zh.png`
- `output/playwright/creation-asset-prep-imported-preview-zh.png`
- `output/playwright/creation-asset-prep-video-library-import-zh.png`
- `output/playwright/creation-asset-prep-video-preview-zh.png`

## Notes

- The change reuses existing project creation, asset import, and script generation contracts.
- No backend API changes were required.
