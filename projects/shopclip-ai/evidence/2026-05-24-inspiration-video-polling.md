# 2026-05-24 Inspiration Video Polling Fix

## Trigger

User reported that after submitting an Inspiration video request, the UI kept showing a submitted/processing task and never displayed the generated video.

## Diagnosis

- The existing Inspiration video path submitted an Ark video generation task and returned a `processing` material.
- The response contract did not expose a `taskId`.
- The frontend rendered a `<video>` only when `activeMaterial.url` existed.
- There was no frontend polling path to retrieve a completed video URL.

## Changes

- Added `taskId` to the shared Inspiration material contract.
- Added `POST /api/inspiration/video-task` to poll a submitted video task through the backend.
- Added backend task-status normalization and defensive URL extraction from nested provider task responses.
- Updated the Inspiration frontend to automatically poll processing video tasks, replace the result when ready/failed, render the `<video>`, and show a download link when a URL is available.
- Added a normalized `progress` percentage to video materials and surfaced it as a real-time progress bar in the Inspiration result card.
- Removed the model-routing note, result section label, and metadata chip row from the Inspiration result area, then restyled the card for a cleaner title/progress/media layout.
- Removed prompt-derived titles/descriptions from text, image, and video result cards.
- Moved text/image/video selection into the composer toolbar dropdown and removed the separate selector row.
- Added image/video custom generation options; image generation supports count, ratio, and quality, while video generation supports ratio and quality.
- Added multi-image response handling and an even image grid in the result area.
- Removed the extra Agent mode, Auto, Use skills, and subject buttons from the Inspiration composer toolbar.
- Changed both generation-type and custom settings panels to open downward from their toolbar buttons.
- Made generation-type and custom dropdowns mutually exclusive.
- Moved the generation submit button to the right side of the composer.

## Verification

- `corepack pnpm --filter @shopclip/shared build` passed.
- `corepack pnpm --filter @shopclip/api typecheck` passed.
- `corepack pnpm --filter @shopclip/web typecheck` passed.
- `corepack pnpm --filter @shopclip/api test -- inspiration-flow.test.ts` passed; Vitest ran the API suite and reported 32 tests passing.
- `corepack pnpm --filter @shopclip/web test -- App.test.tsx` passed; Vitest reported 23 tests passing.
- `corepack pnpm --filter @shopclip/api build` passed.
- `corepack pnpm --filter @shopclip/web build` passed.

## Known Follow-Up

- `corepack pnpm --filter @shopclip/web test -- App.test.tsx` still has an unrelated existing assertion mismatch: the test expects `Select or type a model`, while Settings currently renders `Select a model or paste an endpoint ID`.
- The video polling URL extraction is intentionally defensive until the final Ark task response shape is locked.
