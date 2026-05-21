# Part 007: P1 Scene Editor, Partial Regeneration, And Editing Agent

## Status

- Project slug: shopclip-ai
- Part number: 007
- Owner role: `implementation-engineer`
- Status: Planned
- Created: 2026-05-21
- Last updated: 2026-05-21

## Source Of Truth

Before starting, read `../00-requirements.md`, `../01-design-spec.md`, `../02-development-plan.md`, and `AGENTS.md`.

## Objective

Complete the P1 editor experience with robust scene editing, single-scene regeneration, and AI editing suggestions.

## Scope

### In Scope

- Scene field editing with dirty/saved/error states.
- Reorder/delete controls with keyboard alternatives.
- Single-scene regeneration endpoint and UI.
- Editing Agent suggestions with apply/dismiss.

### Out Of Scope

- Production-grade autonomous Agent orchestration.
- Multi-user collaborative editing.

## Dependencies

- Prior Parts: Part 005.

## Expected Files Or Modules

- `apps/web/src/features/studio/`
- `apps/api/src/modules/scenes/`
- `apps/api/src/modules/generation/`
- `apps/api/src/providers/ai/editingAgentProvider.ts`

## Acceptance Criteria

- [ ] User can edit scene duration, subtitle, voiceover, visual style, and selected asset.
- [ ] User can reorder and delete scenes without pointer-only interaction.
- [ ] User can regenerate one scene while other scenes remain unchanged.
- [ ] User can apply or dismiss at least one Agent suggestion.
- [ ] Trace records scene regeneration and suggestion application.

## Verification Plan

- Automated: scene API tests and editor interaction tests.
- Manual: edit/regenerate/apply suggestion workflow.
- Browser/screenshot: capture studio editor P1 state.
- Accessibility: keyboard scene selection and reorder alternative.

## Risks And Follow-Ups

- Keep suggestion UI explainable; do not make opaque Agent decisions.

