# Final Handoff

Date: 2026-05-22

## Delivery Path

- Local demo: `corepack pnpm dev`, then open `http://localhost:5173/#project`.
- Render path: use `render.yaml` as a Blueprint, then set `CORS_ORIGIN` on the API service and
  `VITE_API_URL` on the static web service.
- Live public URL: not created in this session because Render account-side Blueprint creation and
  environment variable entry require authenticated account action.

## Completed Flow Evidence

- P0 flow screenshots: `projects/shopclip-ai/evidence/p0-*.png`
- P1 asset search: `projects/shopclip-ai/evidence/p1-06-asset-search.png`
- P1 scene agent/regeneration: `projects/shopclip-ai/evidence/p1-07-scene-agent-regeneration.png`
- P1 media failure/retry: `projects/shopclip-ai/evidence/p1-08-failed-render-retry-state.png`,
  `projects/shopclip-ai/evidence/p1-08-media-render-success.png`
- P1 dashboard: `projects/shopclip-ai/evidence/p1-09-dashboard.png`

## Final Verification Commands

- `corepack pnpm test`
- `corepack pnpm typecheck`
- `corepack pnpm lint`
- `corepack pnpm build`
- `corepack pnpm --filter @shopclip/web test:e2e`

## Remaining Production Follow-Ups

- Create the Render Blueprint from the connected Git repository.
- Enter account-generated `CORS_ORIGIN` and `VITE_API_URL` values.
- Verify live `/health`, static site routing, and response headers after deployment.
- Replace in-memory persistence with Prisma/PostgreSQL before production data use.
