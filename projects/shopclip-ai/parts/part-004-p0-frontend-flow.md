# Part 004: P0 Frontend Flow

## Status

- Project slug: shopclip-ai
- Part number: 004
- Owner role: `implementation-engineer`
- Status: Implementation Complete
- Created: 2026-05-21
- Last updated: 2026-05-21

## Source Of Truth

Before starting, read `../00-requirements.md`, `../01-design-spec.md`, `../02-development-plan.md`, and `AGENTS.md`.

## Objective

Build the user-facing P0 flow from project setup through preview/export using the approved dark editor workspace design.

## Scope

### In Scope

- App shell and navigation.
- Product setup and asset upload UI.
- Script/storyboard generation UI.
- Studio editor first version.
- Render trace panel.
- Preview/export screen.

### Out Of Scope

- P1 retrieval, Agent suggestions, dashboard, and full media controls.

## Dependencies

- Prior Parts: Part 001 and shared contracts from Part 002; backend contract from Part 003.

## Expected Files Or Modules

- `apps/web/src/app/`
- `apps/web/src/components/`
- `apps/web/src/features/projects/`
- `apps/web/src/features/assets/`
- `apps/web/src/features/script/`
- `apps/web/src/features/studio/`
- `apps/web/src/features/render/`

## Implementation Notes

- Use lucide icons, not emoji icons.
- Preserve stable preview and scene card dimensions.
- Implement loading, empty, error, disabled, and success states for all P0 pages.

## Acceptance Criteria

- [x] User can create/load a project.
- [x] User can upload/list assets.
- [x] User can generate and view script/storyboard.
- [x] User can see and edit basic scene fields needed for P0.
- [x] User can start render, watch trace progress, preview, and export.
- [x] Layout has responsive CSS coverage for 375px, 768px, 1024px, and 1440px.

## Verification Plan

- Automated: component tests where useful, typecheck/build.
- Manual: local browser walkthrough.
- Browser/screenshot: capture P0 screens in Part 005.
- Accessibility: keyboard reachable primary controls and visible focus states.

## Risks And Follow-Ups

- Timeline drag can wait for P1; P0 scene cards should still be editable through explicit controls.
- Durable scene edit persistence is not available yet because Part 003 did not implement `PATCH /api/scenes/:id`; current P0 scene edits are local UI state.
- Browser screenshot verification remains assigned to Part 005.

## Change Summary

- Replaced the scaffold landing page with the P0 dark editor workspace shell.
- Added API client helpers for project create/load, asset intake, script generation, render task polling, and export.
- Added project setup, asset library, script/storyboard, Studio editor, render trace, and preview/export UI modules.
- Added stable 9:16 preview, scene cards, scene inspector controls, loading/empty/error/disabled/success states, visible focus styles, and responsive breakpoints.
- Added a frontend rendering test for the P0 workspace landmarks.
- Added a persistent interface language setting with English and Chinese copy for the P0 workspace shell, navigation, page cards, form labels, buttons, and empty states.

## Verification Evidence

- Evidence file: `../evidence/part-004-verification.md`
- `corepack pnpm --filter @shopclip/web test`: passed on 2026-05-21 after adding the language selection test.
- `corepack pnpm --filter @shopclip/web typecheck`: passed on 2026-05-21.
- `corepack pnpm --filter @shopclip/web build`: passed on 2026-05-21.
- `corepack pnpm --filter @shopclip/web lint`: passed.
- `corepack pnpm --filter @shopclip/web test`: passed.
- `corepack pnpm --filter @shopclip/web typecheck`: passed.
- `corepack pnpm --filter @shopclip/web build`: passed.
- `corepack pnpm test`: passed.
- `corepack pnpm typecheck`: passed.
- `corepack pnpm build`: passed.
