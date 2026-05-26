# Part 004: P0 Frontend Flow

## Status

- Project slug: shopclip-ai
- Part number: 004
- Owner role: `implementation-engineer`
- Status: Implementation Complete
- Created: 2026-05-21
- Last updated: 2026-05-26

## Source Of Truth

Before starting, read `../00-requirements.md`, `../01-design-spec.md`, `../02-development-plan.md`, and `AGENTS.md`.

## Objective

Build the user-facing P0 flow from project setup through preview/export using the approved dark editor workspace design.

## Scope

### In Scope

- App shell and navigation.
- Product setup and asset upload UI.
- Script/storyboard generation UI.
- Studio editor first version.
- Render trace panel.
- Preview/export screen.

### Out Of Scope

- P1 retrieval, Agent suggestions, dashboard, and full media controls.

## Dependencies

- Prior Parts: Part 001 and shared contracts from Part 002; backend contract from Part 003.

## Expected Files Or Modules

- `apps/web/src/app/`
- `apps/web/src/components/`
- `apps/web/src/features/projects/`
- `apps/web/src/features/assets/`
- `apps/web/src/features/script/`
- `apps/web/src/features/studio/`
- `apps/web/src/features/render/`

## Implementation Notes

- Use lucide icons, not emoji icons.
- Preserve stable preview and scene card dimensions.
- Implement loading, empty, error, disabled, and success states for all P0 pages.

## Acceptance Criteria

- [x] User can create/load a project.
- [x] User can upload/list assets.
- [x] User can generate and view script/storyboard.
- [x] User can see and edit basic scene fields needed for P0.
- [x] User can start render, watch trace progress, preview, and export.
- [x] Layout has responsive CSS coverage for 375px, 768px, 1024px, and 1440px.

## Verification Plan

- Automated: component tests where useful, typecheck/build.
- Manual: local browser walkthrough.
- Browser/screenshot: capture P0 screens in Part 005.
- Accessibility: keyboard reachable primary controls and visible focus states.

## Risks And Follow-Ups

- Timeline drag can wait for P1; P0 scene cards should still be editable through explicit controls.
- Durable scene edit persistence is not available yet because Part 003 did not implement `PATCH /api/scenes/:id`; current P0 scene edits are local UI state.
- Browser screenshot verification remains assigned to Part 005.

## Change Summary

- Replaced the scaffold landing page with the P0 dark editor workspace shell.
- Added API client helpers for project create/load, asset intake, script generation, render task polling, and export.
- Added project setup, asset library, script/storyboard, Studio editor, render trace, and preview/export UI modules.
- Added stable 9:16 preview, scene cards, scene inspector controls, loading/empty/error/disabled/success states, visible focus styles, and responsive breakpoints.
- Added a frontend rendering test for the P0 workspace landmarks.
- Added a persistent interface language setting with English and Chinese copy for the P0 workspace shell, navigation, page cards, form labels, buttons, and empty states.
- 2026-05-23 navigation update: simplified the sidebar to Asset library/Inspiration/Create, removed the large hero and five page cards, and moved creation workflow pages into compact top tabs.
- 2026-05-23 asset inspiration update: added Inspiration as an independent section for text ideas, reference uploads, Agent mode, inspiration search, creative design, and image generation entry; kept Asset library focused on asset metadata and retrieval.
- 2026-05-23 asset library category update: limited Asset library tabs to Images/Video/Audio/Scripts, added Chinese labels 图片/视频/音频/剧本, and wired each category to matching upload defaults plus asset/search-result filtering.
- 2026-05-23 asset library concept update: replaced the visible metadata upload form with the concept-style import/search/grid surface. Import opens a floating dialog with a local file picker, and all four categories share the same layout with category-specific labels and file accept rules.
- 2026-05-23 asset library visual polish: upgraded the rough sketch-style surface into a production-style dark workspace with a hero header, import card, search panel, refined material cards, softer empty state, and cleaner import dialog.
- 2026-05-23 asset library header removal: removed the hero/header band from the Asset library so the page starts directly with import, search, and asset grid controls.
- 2026-05-23 creation concept update: aligned the Create section with the provided concept images by adding a horizontal stepper, a main content plus AI co-pilot layout, a quality radar side panel, stronger neon glass styling, and Studio responsive safeguards.
- 2026-05-23 creation reference pass: tightened the Product setup screen against the provided reference by adding a top-right primary CTA, dotted wave header, icon-led input cards, stronger neon borders, and a split create/load action row. Per user direction, no sidebar language selector was added.
- 2026-05-23 creation right-side removal: removed the right-side AI co-pilot, quality radar, timing cards, and the project panel dotted wave texture from all Create workflow steps; the workflow content now occupies a single main column while preserving the top stepper and top-right CTA.
- 2026-05-26 creation flow update: replaced the direct Step 03 script entry in the Create section with Step 02 asset prep, added a bottom-right "Generate storyboard" action that runs storyboard generation and navigates to Step 03, and updated Step 03 to combine Script & storyboard with storyboard re-edit.
- 2026-05-26 asset prep source update: stopped preloading global asset library/project assets into Step 02; the page now only shows files manually selected in the current asset prep upload cards.
- 2026-05-26 asset prep import/keyword update: added explicit "Import from asset library" selectors for each Step 02 bucket and changed product keywords from static pills to editable inputs with delete and add controls.
- 2026-05-26 searchable asset prep library update: changed the Step 02 asset-library selector into a searchable media picker with reusable asset-library card previews, selected-asset import, inline image/video thumbnails after import, and post-import preview actions.
- 2026-05-26 video prep update: Step 02 now refreshes the full asset library for creation prep so the demo video bucket can import videos without requiring a prior visit to the Asset library video tab; local demo uploads are constrained to MP4/MOV inputs.

## Verification Evidence

- Evidence file: `../evidence/part-004-verification.md`
- `corepack pnpm --filter @shopclip/web test`: passed on 2026-05-21 after adding the language selection test.
- `corepack pnpm --filter @shopclip/web typecheck`: passed on 2026-05-21.
- `corepack pnpm --filter @shopclip/web build`: passed on 2026-05-21.
- `corepack pnpm --filter @shopclip/web lint`: passed.
- `corepack pnpm --filter @shopclip/web test`: passed.
- `corepack pnpm --filter @shopclip/web typecheck`: passed.
- `corepack pnpm --filter @shopclip/web build`: passed.
- `corepack pnpm test`: passed.
- `corepack pnpm typecheck`: passed.
- `corepack pnpm build`: passed.
- 2026-05-23 navigation update evidence: `../evidence/2026-05-23-navigation-simplification.md`.
- 2026-05-23 asset category verification: `corepack pnpm --filter @shopclip/web test -- App.test.tsx`, `test`, `typecheck`, `lint`, and `build` passed; browser screenshots captured at `../../output/playwright/asset-library-categories-en.png` and `../../output/playwright/asset-library-categories-zh.png`.
- 2026-05-23 asset concept verification: `corepack pnpm --filter @shopclip/web test -- App.test.tsx`, `test`, `typecheck`, `lint`, and `build` passed; browser screenshots captured at `../../output/playwright/asset-library-concept-image.png`, `../../output/playwright/asset-library-concept-import-modal.png`, and `../../output/playwright/asset-library-concept-zh-script.png`.
- 2026-05-23 asset visual polish verification: `corepack pnpm --filter @shopclip/web test -- App.test.tsx`, `test`, `typecheck`, `lint`, and `build` passed; browser screenshots captured at `../../output/playwright/asset-library-polished-image.png` and `../../output/playwright/asset-library-polished-import-modal.png`.
- 2026-05-23 asset header removal verification: `corepack pnpm --filter @shopclip/web test -- App.test.tsx`, `test`, `typecheck`, `lint`, and `build` passed; browser screenshot captured at `../../output/playwright/asset-library-no-hero.png`.
- 2026-05-23 creation concept verification: `corepack pnpm --filter @shopclip/web test -- App.test.tsx`, `typecheck`, `lint`, and `build` passed; browser screenshots captured at `../../output/playwright/creation-project-desktop.png`, `../../output/playwright/creation-project-mobile.png`, and `../../output/playwright/creation-studio-desktop.png`.
- 2026-05-23 creation reference pass verification: `corepack pnpm --filter @shopclip/web test -- App.test.tsx`, `typecheck`, `lint`, and `build` passed; browser screenshots captured at `../../output/playwright/creation-reference-project-desktop.png`, `../../output/playwright/creation-reference-project-mobile.png`, and `../../output/playwright/creation-reference-studio-desktop.png`.
- 2026-05-23 creation right-side removal verification: `corepack pnpm --filter @shopclip/web test -- App.test.tsx`, `typecheck`, `lint`, and `build` passed; browser screenshots captured at `../../output/playwright/creation-no-right-project-desktop.png`, `../../output/playwright/creation-no-right-project-mobile.png`, and `../../output/playwright/creation-no-right-studio-desktop.png`.
- 2026-05-26 creation asset prep/storyboard verification: `corepack pnpm --filter @shopclip/web test -- App.test.tsx`, `typecheck`, `lint`, and `build` passed; browser screenshots captured at `../../output/playwright/creation-asset-prep-zh.png` and `../../output/playwright/creation-script-storyboard-zh.png`; evidence recorded in `../evidence/2026-05-26-creation-asset-prep-storyboard-flow.md`.
- 2026-05-26 asset prep source verification: `corepack pnpm --filter @shopclip/web test -- App.test.tsx`, `typecheck`, `lint`, and `build` passed; regression test confirms existing library assets are not rendered in Step 02.
- 2026-05-26 asset prep import/keyword verification: `corepack pnpm --filter @shopclip/web test -- App.test.tsx`, `typecheck`, `lint`, and `build` passed; browser screenshot captured at `../../output/playwright/creation-asset-prep-library-keywords-zh.png`.
- 2026-05-26 searchable asset prep library verification: `corepack pnpm --filter @shopclip/web test -- App.test.tsx`, `typecheck`, `lint`, and `build` passed; browser screenshots captured at `../../output/playwright/creation-asset-prep-library-search-preview-zh.png`, `../../output/playwright/creation-asset-prep-imported-inline-thumbnail-zh.png`, and `../../output/playwright/creation-asset-prep-imported-preview-zh.png`.
- 2026-05-26 video prep verification: `corepack pnpm --filter @shopclip/web test -- App.test.tsx`, `typecheck`, `lint`, and `build` passed; browser screenshots captured at `../../output/playwright/creation-asset-prep-video-library-import-zh.png` and `../../output/playwright/creation-asset-prep-video-preview-zh.png`.
