# COS Intelligent Search Evidence

- Date: 2026-05-26
- Owner role: `implementation-engineer`
- Related part: `projects/shopclip-ai/parts/part-006-p1-asset-tagging-and-retrieval.md`

## Change Summary

- Added a Tencent COS CI intelligent search adapter for `POST /datasetquery/hybridsearch`.
- The adapter sends text search with `Mode: "text"`, `Templates: "ImageSearch"`, and `MatchThreshold: 60`.
- `/api/assets/search` maps COS image result URIs back to stored asset metadata by `objectKey` or the asset id segment in the COS object path.
- Results at score `60` or below are filtered out; only `score > 60` reaches the frontend.
- The asset library now renders search matches directly in the existing asset grid and no longer renders the separate project-result strip.
- COS search failures are caught inside `/api/assets/search`; the API logs a warning and returns an empty result set instead of returning HTTP 500 or local `score: 0` fallback rows to the frontend.

## Configuration

- `COS_SECRET_ID` and `COS_SECRET_KEY` stay server-side.
- `COS_APP_ID` can be set explicitly, or derived from `COS_BUCKET` when the bucket ends in `-<appid>`.
- `COS_INTELLIGENT_SEARCH_DATASET` should be set to the target dataset, for example `shopclip-multidata`.
- `COS_INTELLIGENT_SEARCH_REGION` defaults independently from object storage when needed, for example `ap-beijing`.

## Verification

- `corepack pnpm --filter @shopclip/api test -- cosIntelligentSearchProvider asset-cos-flow p1-flow`: passed.
- `corepack pnpm --filter @shopclip/web test -- App.test.tsx`: passed.
- `corepack pnpm typecheck`: passed.
- `corepack pnpm lint`: passed.
- `corepack pnpm test`: passed.
- `corepack pnpm build`: passed.
- `corepack pnpm --filter @shopclip/api test -- asset-cos-flow`: passed after adding the COS failure empty-result regression case.

## Residual Risk

- Live Tencent COS CI verification still requires real server environment variables and a dataset with indexed files.
- The mapper expects the COS object path to include either the stored `objectKey` or an asset id segment like `raw/<assetId>/source.ext`.
