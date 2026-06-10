# Final Handoff

Date: 2026-05-22

## 2026-06-10 Status Update

- Live public URL now exists: `https://shopclip.site`.
- Recommended review entry: `https://shopclip.site/#project`.
- API health check: `https://shopclip.site/health`.
- The original Render account-side note below is retained as historical context. Current production access should use `shopclip.site` unless a new Render Blueprint environment is being created.

## Delivery Path

- Local demo: `corepack pnpm dev`, then open `http://localhost:5173/#project`.
- Render path: use `render.yaml` as a Blueprint, then set `CORS_ORIGIN` on the API service and
  `VITE_API_URL` on the static web service.
- Historical note: a Render public URL was not created in the original 2026-05-22 session because
  Render account-side Blueprint creation and environment variable entry required authenticated account
  action. Current production access is available at `https://shopclip.site`.

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

- Create a Render Blueprint only if a second reproducible Render environment is needed.
- Enter account-generated `CORS_ORIGIN` and `VITE_API_URL` values for any new Render environment.
- Verify live `/health`, static site routing, and response headers after each new deployment target.
- Replace in-memory persistence with Prisma/PostgreSQL before production data use.
