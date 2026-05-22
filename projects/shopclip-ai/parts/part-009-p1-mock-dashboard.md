# Part 009: P1 Mock Dashboard

## Status

- Project slug: shopclip-ai
- Part number: 009
- Owner role: `implementation-engineer`
- Status: Done
- Created: 2026-05-21
- Last updated: 2026-05-22

## Source Of Truth

Before starting, read `../00-requirements.md`, `../01-design-spec.md`, `../02-development-plan.md`, and `AGENTS.md`.

## Objective

Implement a lightweight mock performance dashboard that connects creative factors to simulated ecommerce outcomes.

## Scope

### In Scope

- Dashboard endpoint.
- Summary cards.
- Funnel chart.
- Bullet chart grid.
- Factor table with suggested actions.
- Accessible chart summaries.

### Out Of Scope

- Real ecommerce data ingestion.
- Multi-factor production attribution.

## Dependencies

- Prior Parts: Part 005.

## Expected Files Or Modules

- `apps/api/src/modules/dashboard/`
- `apps/web/src/features/dashboard/`

## Acceptance Criteria

- [x] Dashboard loads for seeded and generated projects.
- [x] Summary cards show watch-through, hook strength, subtitle clarity, and product-focus score.
- [x] Funnel and bullet chart values are visible as text, not only color.
- [x] Factor table links factor, scene, expected impact, and suggested action.
- [x] Empty/error states are present.

## Verification Plan

- Automated: dashboard endpoint and chart component tests.
- Manual: navigate from preview/export to dashboard.
- Browser/screenshot: capture dashboard.
- Accessibility: chart text summaries and keyboard-readable table.

## Risks And Follow-Ups

- Keep chart density low so it supports the story instead of distracting from the editor.
- Current metrics are deterministic mock analytics. Real commerce attribution remains out of scope
  for this part and should be handled as a future provider/data integration.

## Completion Notes

- Added `/api/projects/:projectId/dashboard` backed by deterministic mock metrics and readable
  factor recommendations.
- Added the Dashboard workspace page with summary metric cards, visible funnel counts, bullet-style
  metric bars, empty/error handling, and an accessible factor table.
- Added API and browser coverage for the dashboard flow, including screenshot evidence at
  `projects/shopclip-ai/evidence/p1-09-dashboard.png`.

## Verification Evidence

- `corepack pnpm test`: passed.
- `corepack pnpm typecheck`: passed.
- `corepack pnpm lint`: passed.
- `corepack pnpm build`: passed.
- `corepack pnpm --filter @shopclip/web test:e2e`: passed, 4 browser tests.
- Evidence file: `projects/shopclip-ai/evidence/part-009-verification.md`.
