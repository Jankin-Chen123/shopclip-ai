# Part 004 Verification Evidence

## Scope

P0 frontend flow for ShopClip AI web app.

## Automated Verification

- `corepack pnpm --filter @shopclip/web lint`: passed.
- `corepack pnpm --filter @shopclip/web test`: passed, 1 file / 2 tests.
- `corepack pnpm --filter @shopclip/web typecheck`: passed.
- `corepack pnpm --filter @shopclip/web build`: passed.
- `corepack pnpm test`: passed across shared, api, and web.
- `corepack pnpm typecheck`: passed across shared, api, and web.
- `corepack pnpm build`: passed across shared, api, and web.
- 2026-05-23 creation concept update:
  - `corepack pnpm --filter @shopclip/web test -- App.test.tsx`: passed, 13 tests.
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web lint`: passed.
  - `corepack pnpm --filter @shopclip/web build`: passed.
- 2026-05-23 creation reference pass:
  - `corepack pnpm --filter @shopclip/web test -- App.test.tsx`: passed, 13 tests.
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web lint`: passed.
  - `corepack pnpm --filter @shopclip/web build`: passed.
- 2026-05-23 creation right-side removal:
  - `corepack pnpm --filter @shopclip/web test -- App.test.tsx`: passed, 13 tests.
  - `corepack pnpm --filter @shopclip/web typecheck`: passed.
  - `corepack pnpm --filter @shopclip/web lint`: passed.
  - `corepack pnpm --filter @shopclip/web build`: passed.

## TDD Evidence

- Added `App` static rendering test for P0 workspace landmarks.
- First run of `corepack pnpm --filter @shopclip/web test` failed because the old scaffold did not render `Product setup`.
- Implemented the P0 frontend flow.
- Re-ran tests and the new test passed.
- 2026-05-23 creation concept update:
  - Added a static rendering test for `creation-stepper`, `creation-shell`, `AI co-pilot`, `Step 01`, `Step 05`, and `Quality radar`.
  - First run of `corepack pnpm --filter @shopclip/web test -- App.test.tsx` failed because the old Create section did not render `creation-stepper`.
  - Implemented the concept-aligned Create section chrome and re-ran the test successfully.
- 2026-05-23 creation right-side removal:
  - Updated the static rendering test to require `creation-stepper`, `creation-shell`, `concept-project-panel`, `concept-top-cta`, `Step 01`, and `Step 05`.
  - Added negative assertions for `language-switcher`, `AI co-pilot`, `Quality radar`, `concept-wave`, and `creation-assistant`.
  - First run failed while the right-side assistant was still rendered, then passed after removing the assistant region and dotted wave texture.

## Manual / Browser Notes

- 2026-05-23 creation concept update:
  - Started the Vite web app locally and verified the concept-aligned Create section in Chromium with Playwright CLI.
  - Captured desktop project setup screenshot: `../../output/playwright/creation-project-desktop.png`.
  - Captured mobile project setup screenshot: `../../output/playwright/creation-project-mobile.png`.
  - Captured desktop Studio screenshot after fixing an empty-state overlap: `../../output/playwright/creation-studio-desktop.png`.
- 2026-05-23 creation reference pass:
  - Captured desktop project setup screenshot: `../../output/playwright/creation-reference-project-desktop.png`.
  - Captured mobile project setup screenshot: `../../output/playwright/creation-reference-project-mobile.png`.
  - Captured desktop Studio screenshot: `../../output/playwright/creation-reference-studio-desktop.png`.
  - Confirmed the sidebar language selector is not rendered, per latest user direction.
- 2026-05-23 creation right-side removal:
  - Captured desktop project setup screenshot: `../../output/playwright/creation-no-right-project-desktop.png`.
  - Captured mobile project setup screenshot: `../../output/playwright/creation-no-right-project-mobile.png`.
  - Captured desktop Studio screenshot: `../../output/playwright/creation-no-right-studio-desktop.png`.
  - Confirmed the project setup screen no longer renders the right-side assistant cards or the dotted wave texture.

## Responsive Coverage

- CSS includes breakpoints for desktop, tablet, and mobile ranges covering 1440px, 1024px, 768px, and 375px targets.
- Stable dimensions are defined for preview frame, scene cards, asset rows, buttons, and progress/trace elements.

## Residual Risks

- P0 scene edits are local frontend edits because Part 003 did not include `PATCH /api/scenes/:id`; durable scene edit persistence remains a backend follow-up for Part 007.
- Visual browser verification is still required in Part 005.
