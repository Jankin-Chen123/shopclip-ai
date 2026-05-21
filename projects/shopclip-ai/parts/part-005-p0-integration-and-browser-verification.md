# Part 005: P0 Integration And Browser Verification

## Status

- Project slug: shopclip-ai
- Part number: 005
- Owner role: `quality-security-engineer`
- Status: Done
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

- [x] Playwright can complete create project -> upload/list asset -> generate storyboard -> render -> preview/export.
- [x] Evidence folder contains P0 screenshots or logs.
- [x] P0 defects are either fixed or explicitly documented as blocking.
- [x] No P1 Part starts before this gate is marked Done.

## Verification Plan

- Automated: `pnpm test`, `pnpm typecheck`, `pnpm build`, Playwright P0 spec.
- Manual: full browser walkthrough.
- Browser/screenshot: required.
- Security: quick check for secrets in generated frontend assets and docs.

## Risks And Follow-Ups

- If Playwright setup is blocked, record manual browser evidence and add Playwright as a blocking follow-up.

## Completion Record

- Completed: 2026-05-21
- Implemented `apps/web/e2e/p0-flow.spec.ts` and `apps/web/e2e/playwright.config.ts`.
- Added `@playwright/test` to `apps/web` and split the web unit test script so Vitest only runs `src`.
- Verified a recoverable error state by loading a missing project ID, then completed the happy path:
  create project -> upload asset metadata -> generate storyboard -> edit/save a scene -> render -> trace -> preview -> export.
- Captured screenshots in `projects/shopclip-ai/evidence/`.
- Fixed one lint-only type import issue in `apps/api/src/p0-flow.test.ts`.
- P0 gate result: passed. P1 work can start from Part 006 onward.

## Verification Evidence

- Evidence summary: `projects/shopclip-ai/evidence/p0-browser-verification.md`
- Screenshots:
  - `projects/shopclip-ai/evidence/p0-00-recoverable-error-state.png`
  - `projects/shopclip-ai/evidence/p0-01-project-created.png`
  - `projects/shopclip-ai/evidence/p0-02-assets-and-storyboard.png`
  - `projects/shopclip-ai/evidence/p0-03-studio-edit.png`
  - `projects/shopclip-ai/evidence/p0-04-delivery-export.png`

## Verified Commands

- `corepack pnpm test`
- `corepack pnpm typecheck`
- `corepack pnpm build`
- `corepack pnpm lint`
- `corepack pnpm --filter @shopclip/web test:e2e`
- API health: `http://localhost:4000/health`
- Web health: `http://localhost:5173/#project`
