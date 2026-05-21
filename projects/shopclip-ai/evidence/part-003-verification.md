# Part 003 Verification Evidence

Date: 2026-05-21

## Scope Verified

- Project create/load API.
- P0 image asset metadata validation and intake.
- Deterministic script/storyboard generation without external provider config.
- Render task lifecycle with trace events and preview/export fallback URLs.
- No provider secrets exposed in responses.

## Automated Checks

```text
corepack pnpm --filter @shopclip/api test
Result: passed, 3 tests.
```

The API integration test covers:

- `POST /api/projects`
- `GET /api/projects/:id`
- `POST /api/projects/:id/assets`
- `POST /api/projects/:id/generate-script`
- `POST /api/projects/:id/render`
- `GET /api/render-tasks/:id`
- `GET /api/projects/:id/export`
- invalid asset rejection before metadata storage

```text
corepack pnpm --filter @shopclip/api typecheck
Result: passed.
```

```text
corepack pnpm --filter @shopclip/api build
Result: passed.
```

## Fallback Behavior

- Script generation response includes `fallback.used = true` and `provider = mock-script-provider`.
- Render export response includes `fallback.used = true` and `provider = mock-renderer`.
- Preview/export URLs are deterministic local demo paths and do not require an external video provider.

## Security Notes

- No API key, provider endpoint, or secret is returned by any P0 endpoint.
- Asset intake accepts only `image/jpeg`, `image/png`, and `image/webp` metadata in P0.
- Image metadata is limited to 10 MB.

## Residual Risk

- The repository is currently in-memory because the local PostgreSQL service is unavailable. Prisma-backed persistence should be wired after a real `DATABASE_URL` is available.
