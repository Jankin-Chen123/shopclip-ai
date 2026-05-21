# Part 009: P1 Mock Dashboard

## Status

- Project slug: shopclip-ai
- Part number: 009
- Owner role: `implementation-engineer`
- Status: Planned
- Created: 2026-05-21
- Last updated: 2026-05-21

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

- [ ] Dashboard loads for seeded and generated projects.
- [ ] Summary cards show watch-through, hook strength, subtitle clarity, and product-focus score.
- [ ] Funnel and bullet chart values are visible as text, not only color.
- [ ] Factor table links factor, scene, expected impact, and suggested action.
- [ ] Empty/error states are present.

## Verification Plan

- Automated: dashboard endpoint and chart component tests.
- Manual: navigate from preview/export to dashboard.
- Browser/screenshot: capture dashboard.
- Accessibility: chart text summaries and keyboard-readable table.

## Risks And Follow-Ups

- Keep chart density low so it supports the story instead of distracting from the editor.

