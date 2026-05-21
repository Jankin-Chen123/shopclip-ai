# Part 004: P0 Frontend Flow

## Status

- Project slug: shopclip-ai
- Part number: 004
- Owner role: `implementation-engineer`
- Status: Planned
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

- [ ] User can create/load a project.
- [ ] User can upload/list assets.
- [ ] User can generate and view script/storyboard.
- [ ] User can see and edit basic scene fields needed for P0.
- [ ] User can start render, watch trace progress, preview, and export.
- [ ] Layout works at 375px, 768px, 1024px, and 1440px.

## Verification Plan

- Automated: component tests where useful, typecheck/build.
- Manual: local browser walkthrough.
- Browser/screenshot: capture P0 screens in Part 005.
- Accessibility: keyboard reachable primary controls and visible focus states.

## Risks And Follow-Ups

- Timeline drag can wait for P1; P0 scene cards should still be editable through explicit controls.

