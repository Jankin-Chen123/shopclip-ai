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

## Browser Evidence

- `output/playwright/creation-asset-prep-zh.png`
- `output/playwright/creation-script-storyboard-zh.png`
- `output/playwright/creation-asset-prep.png`
- `output/playwright/creation-script-storyboard.png`

## Notes

- The change reuses existing project creation, asset import, and script generation contracts.
- No backend API changes were required.
