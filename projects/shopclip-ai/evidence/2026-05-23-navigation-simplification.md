# Navigation Simplification Evidence

## Scope

- Simplified the left sidebar to three primary sections: Asset library, Inspiration, and Create.
- Removed the large page hero from the main content header.
- Removed the five large workspace page cards from the top of the page.
- Moved creation workflow navigation into compact top tabs.
- Added asset-type tabs to the Asset library section.
- Reduced Asset library tabs to the supported front-end categories only: Images, Video, Audio, and Scripts.
- Localized the Asset library category labels and category-specific draft defaults when the interface language is Chinese: 图片、视频、音频、剧本.
- Reworked the Asset library surface to match the concept sketch: import button on the left, search box on the right, and material grid below. The same surface is used for Images, Video, Audio, and Scripts.
- The import button now opens a floating import dialog with a local file picker; selected local files are converted to asset metadata records through the current front-end API path.
- Polished the Asset library from the rough sketch style into a production-style dark workspace with a hero header, import card, search panel, refined material cards, softer empty state, and cleaner import dialog.
- Removed the Asset library hero/header band so the page starts directly with the import card, search panel, and asset grid.
- Added Inspiration as an independent section with prompt input, reference upload entry, Agent mode controls, inspiration search, creative design, and generate image action.
- Kept the Asset library page focused on asset metadata upload, asset list, and asset search.

## Verification

- `corepack pnpm --filter @shopclip/web test`: passed.
- `corepack pnpm --filter @shopclip/web typecheck`: passed.
- `corepack pnpm --filter @shopclip/web lint`: passed.
- `corepack pnpm --filter @shopclip/web build`: passed.
- Playwright browser assertion: passed for English and Chinese Asset library pages; verified absence of Canvas, Image editor, Documents, and English labels in Chinese mode.
- Playwright browser assertion: passed for the concept-style Asset library surface; verified import button, import dialog, local file selection, category-specific search placeholders, and same layout across Images, Video, Audio, and Scripts.
- Playwright browser assertion: passed for the polished Asset library surface; verified the hero, import card, search panel, material grid, import dialog, and selected local file visibility.
- Playwright browser assertion: passed for the no-hero Asset library surface; verified `.asset-library-hero` and the removed description text are absent while import/search remain visible.
- Playwright screenshots captured:
  - `output/playwright/nav-project.png`
  - `output/playwright/nav-assets.png`
  - `output/playwright/asset-inspiration.png`
  - `output/playwright/inspiration-section.png`
  - `output/playwright/asset-library-separated.png`
  - `output/playwright/asset-library-categories-en.png`
  - `output/playwright/asset-library-categories-zh.png`
  - `output/playwright/asset-library-concept-image.png`
  - `output/playwright/asset-library-concept-import-modal.png`
  - `output/playwright/asset-library-concept-zh-script.png`
  - `output/playwright/asset-library-polished-image.png`
  - `output/playwright/asset-library-polished-import-modal.png`
  - `output/playwright/asset-library-no-hero.png`

## Notes

- Playwright Chromium was missing locally and was installed before screenshot capture.
- Existing unrelated working tree changes were not modified: `package.json` and `.agents/skills/cloudflare-deploy/references/static-assets/configuration.md`.
