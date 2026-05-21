# Part 005: P0 Integration And Browser Verification

## Status

- Project slug: shopclip-ai
- Part number: 005
- Owner role: `quality-security-engineer`
- Status: Planned
- Created: 2026-05-21
- Last updated: 2026-05-21

## Source Of Truth

Before starting, read `../00-requirements.md`, `../01-design-spec.md`, `../02-development-plan.md`, and `AGENTS.md`.

## Objective

Verify the P0 end-to-end demo path and create evidence before any P1 implementation starts.

## Scope

### In Scope

- API + web integration.
- Playwright P0 flow.
- Screenshot/evidence capture.
- P0 acceptance gate.

### Out Of Scope

- P1 feature implementation.

## Dependencies

- Prior Parts: Part 003 and Part 004.

## Expected Files Or Modules

- `apps/web/e2e/p0-flow.spec.ts`
- `projects/shopclip-ai/evidence/p0-*`

## Implementation Notes

- Treat this Part as a stage gate. P1 starts only after this Part is Done.
- Include both happy path and one retry/error state check.

## Acceptance Criteria

- [ ] Playwright can complete create project -> upload/list asset -> generate storyboard -> render -> preview/export.
- [ ] Evidence folder contains P0 screenshots or logs.
- [ ] P0 defects are either fixed or explicitly documented as blocking.
- [ ] No P1 Part starts before this gate is marked Done.

## Verification Plan

- Automated: `pnpm test`, `pnpm typecheck`, `pnpm build`, Playwright P0 spec.
- Manual: full browser walkthrough.
- Browser/screenshot: required.
- Security: quick check for secrets in generated frontend assets and docs.

## Risks And Follow-Ups

- If Playwright setup is blocked, record manual browser evidence and add Playwright as a blocking follow-up.

