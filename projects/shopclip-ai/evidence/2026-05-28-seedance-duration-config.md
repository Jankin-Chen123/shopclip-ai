# Seedance Duration Config Evidence

## Context

After switching Seedance rendering to text-to-video, Ark returned:

`the parameter duration specified in the request is not valid for model doubao-seedance-1-5-pro in t2v`

The renderer was sending raw storyboard scene totals. For one project that produced an 8 second request, the selected endpoint rejected the value even though the product duration should still come from Step 03 storyboard durations.

## Change

- Seedance render requests now derive `duration` from storyboard scene durations.
- Raw storyboard totals are rounded up to the nearest value in `AI_VIDEO_ALLOWED_DURATIONS`, defaulting to `5,10,12`.
- Added `AI_VIDEO_DURATION` so the server can force a specific value if the selected endpoint requires it.
- Updated `.env.example`, `README.md`, and Part 008 notes.

## Verification

- RED: `corepack pnpm --filter @shopclip/api test -- seedanceRenderer.test.ts` failed because the default request sent raw duration 8 and ignored `AI_VIDEO_DURATION`.
- GREEN: after adding storyboard-derived duration rounding and override support, the same command passed.
