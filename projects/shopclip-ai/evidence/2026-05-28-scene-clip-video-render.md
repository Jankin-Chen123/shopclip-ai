# Scene Clip Video Render Evidence

## Context

The video render flow previously submitted one Seedance task for the whole storyboard. That could only carry one first-frame image and could not make each storyboard scene follow its own bound asset and scene fields.

## Change

- Render tasks now persist `sceneClips`, one entry per storyboard scene.
- Seedance rendering submits each scene separately with that scene's subtitle, voiceover, visual prompt, duration, and bound image asset. Scene duration is rounded up to the configured allowed Seedance durations, defaulting to 5 or 10 seconds.
- Polling updates every scene clip with its provider task id, status, progress, video URL, and cover URL.
- Step 04 shows completed scene clips as playable `<video>` cards; browser metadata loading uses the first frame as the visible cover when no separate poster is available.
- If multiple scene clips are completed and `FFMPEG_PATH` is configured, the API attempts to concatenate them with ffmpeg and exposes the result through `/api/render-exports`.

## Verification

- RED: `corepack pnpm --filter @shopclip/shared test -- schemas.test.ts` initially dropped `sceneClips` from parsed render tasks.
- RED: `corepack pnpm --filter @shopclip/api test -- seedance-render-flow.test.ts` initially showed only one Seedance task id.
- GREEN: after adding scene clip contract, provider orchestration, persistence, and polling, `corepack pnpm --filter @shopclip/api test -- seedanceRenderer.test.ts seedance-render-flow.test.ts` passed.
- GREEN: `corepack pnpm --filter @shopclip/web test -- App.test.tsx` passed after adding Step 04 scene video previews.
- GREEN: `corepack pnpm typecheck` passed after regenerating Prisma client for the new `sceneClips` JSON column.
