# Part 010: Deployment, Docs, Security Review, And Final Evidence

## Status

- Project slug: shopclip-ai
- Part number: 010
- Owner role: `delivery-ops-engineer`
- Status: Done
- Created: 2026-05-21
- Last updated: 2026-05-22

## Source Of Truth

Before starting, read `../00-requirements.md`, `../01-design-spec.md`, `../02-development-plan.md`, and `AGENTS.md`.

## Objective

Deploy the completed P0/P1 demo, document usage and architecture, perform final security/quality checks, and collect submission evidence.

## Scope

### In Scope

- Render deployment config or step-by-step deployment docs.
- README and final submission checklist.
- Security review for secrets and frontend exposure.
- Browser verification against deployed URL.
- Evidence capture.

### Out Of Scope

- Production monitoring beyond logs and trace events.
- Paid infrastructure optimization.

## Dependencies

- Prior Parts: Parts 006, 007, 008, and 009.

## Expected Files Or Modules

- `render.yaml`
- `README.md`
- `.env.example`
- `projects/shopclip-ai/evidence/final-*`
- `projects/shopclip-ai/decisions/*` if deployment tradeoffs are made

## Acceptance Criteria

- [x] Deployed demo is reachable through a public URL or documented access path.
- [x] README includes project story, setup, env vars, directory structure, demo flow, architecture, and fallback behavior.
- [x] Final browser flow verifies P0 and representative P1 features.
- [x] No secrets appear in committed docs, source files, logs, or frontend bundles.
- [x] Final evidence includes screenshots/logs and a concise handoff note.

## Verification Plan

- Automated: production build, typecheck, tests, Playwright smoke test.
- Manual: deployed walkthrough.
- Browser/screenshot: required final screenshots.
- Security: secret scan by text search and manual env var review.

## Risks And Follow-Ups

- If Render deployment requires account action, document exact setup steps and collect local evidence as fallback.
- Live Render deployment still requires account-side Blueprint creation and final `CORS_ORIGIN` /
  `VITE_API_URL` values.

## Completion Notes

- Added `render.yaml` for the API web service and static web service.
- Rewrote `README.md` with setup, architecture, demo flow, API summary, fallback behavior,
  verification, Render deployment, and security notes.
- Added Express security baseline headers, JSON body limit, explicit CORS parsing, and generic 404
  handling.
- Added final security review, deployment decision, handoff note, and Task10 verification evidence.

## Verification Evidence

- `corepack pnpm test`: passed.
- `corepack pnpm typecheck`: passed.
- `corepack pnpm lint`: passed.
- `corepack pnpm build`: passed.
- `corepack pnpm --filter @shopclip/web test:e2e`: passed, 4 browser tests.
- Evidence file: `projects/shopclip-ai/evidence/part-010-verification.md`.
