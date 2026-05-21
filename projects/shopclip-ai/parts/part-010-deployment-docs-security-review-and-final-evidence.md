# Part 010: Deployment, Docs, Security Review, And Final Evidence

## Status

- Project slug: shopclip-ai
- Part number: 010
- Owner role: `delivery-ops-engineer`
- Status: Planned
- Created: 2026-05-21
- Last updated: 2026-05-21

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

- [ ] Deployed demo is reachable through a public URL or documented access path.
- [ ] README includes project story, setup, env vars, directory structure, demo flow, architecture, and fallback behavior.
- [ ] Final browser flow verifies P0 and representative P1 features.
- [ ] No secrets appear in committed docs, source files, logs, or frontend bundles.
- [ ] Final evidence includes screenshots/logs and a concise handoff note.

## Verification Plan

- Automated: production build, typecheck, tests, Playwright smoke test.
- Manual: deployed walkthrough.
- Browser/screenshot: required final screenshots.
- Security: secret scan by text search and manual env var review.

## Risks And Follow-Ups

- If Render deployment requires account action, document exact setup steps and collect local evidence as fallback.

