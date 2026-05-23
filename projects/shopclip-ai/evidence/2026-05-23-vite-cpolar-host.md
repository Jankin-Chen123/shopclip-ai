# Vite cpolar Host Access Fix

## Context

- Date: 2026-05-23
- Error: `Blocked request. This host ("1a537748.r38.cpolar.top") is not allowed.`
- Root cause: the Vite development server was started with `--host 0.0.0.0`, but no Vite config existed to allow external tunnel hosts.

## Change

- Added `apps/web/vite.config.ts`.
- Added `server.allowedHosts: true` for development tunnel access.
- Added matching `preview.allowedHosts: true` so `vite preview` behaves consistently.
- This intentionally allows all hosts in the local development/preview server.

## Verification

- `node --input-type=module -e "...resolveConfig..."`: passed; Vite resolved `server.allowedHosts` and `preview.allowedHosts` as `true`.
- `corepack pnpm --filter @shopclip/web typecheck`: passed.
- `corepack pnpm --filter @shopclip/web build`: passed.
