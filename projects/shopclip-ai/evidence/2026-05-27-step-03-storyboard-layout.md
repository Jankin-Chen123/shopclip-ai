# 2026-05-27 Step 03 Storyboard Layout Verification

## Scope

- Move the Step 03 storyboard scene list to the left side of the studio workspace.
- Keep the 9:16 preview centered and visually dominant.
- Keep the scene inspector on the right side.
- Preserve responsive behavior for tablet and mobile breakpoints.

## Files Changed

- `apps/web/src/features/studio/StudioWorkspace.tsx`
- `apps/web/src/styles.css`
- `apps/web/src/app/App.test.tsx`

## Verification

- `corepack pnpm --filter @shopclip/web test -- App.test.tsx`: passed.
- `corepack pnpm typecheck`: passed.
- `corepack pnpm lint`: passed.
- `corepack pnpm build`: passed.

## Browser Evidence

- Screenshot: `output/playwright/step03-storyboard-left-list-centered-preview.png`

## Notes

- The captured browser state has no generated scenes, so the left column shows the empty storyboard state.
- The CSS now forces Step 03 scene cards into a single vertical column when scenes exist.
- The mobile breakpoint keeps the preview first visually while preserving the desktop left-list layout.
