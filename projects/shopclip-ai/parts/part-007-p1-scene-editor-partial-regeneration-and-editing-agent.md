# Part 007: P1 Scene Editor, Partial Regeneration, And Editing Agent

## Status

- Project slug: shopclip-ai
- Part number: 007
- Owner role: `implementation-engineer`
- Status: Done
- Created: 2026-05-21
- Last updated: 2026-05-27

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

- [x] User can edit scene duration, subtitle, voiceover, visual style, and selected asset.
- [x] User can reorder and delete scenes without pointer-only interaction.
- [x] User can regenerate one scene while other scenes remain unchanged.
- [x] User can apply or dismiss at least one Agent suggestion.
- [x] Trace records scene regeneration and suggestion application.

## Completion Notes

- Added scene update, reorder, delete, single-scene regeneration, suggestion list, and suggestion apply endpoints.
- Added deterministic editing Agent fallback provider with explainable suggestions.
- Updated Studio UI with save, keyboard-accessible move buttons, delete, regenerate, suggestion apply, and suggestion dismiss actions.
- Added trace events for scene regeneration and Agent suggestion application.
- 2026-05-27 update: single-scene regeneration now refreshes that scene's generated `imageUrl` while preserving the rest of the storyboard.
- 2026-05-28 update: single-scene regeneration now uses the current inspector fields directly for image generation. It no longer rewrites subtitle, voiceover, or visual prompt through the editing fallback provider; the frontend posts the current scene fields and API settings, and the backend refreshes only the image while persisting those current fields.
- Added browser evidence screenshots:
  - `projects/shopclip-ai/evidence/p1-07-scene-agent-regeneration.png`
  - `projects/shopclip-ai/evidence/part-007-verification.md`
- Added 2026-05-27 regression coverage that edits Scene 1, regenerates only Scene 2, and reloads the project to verify the edited and untouched scenes keep their prior values.

## Verification Evidence

- `corepack pnpm test`
- `corepack pnpm typecheck`
- `corepack pnpm lint`
- `corepack pnpm build`
- `corepack pnpm --filter @shopclip/web test:e2e`
- `corepack pnpm --filter @shopclip/api test -- p0-flow.test.ts`
- `projects/shopclip-ai/evidence/2026-05-27-full-chain-scene-regeneration.md`
- `projects/shopclip-ai/evidence/2026-05-27-storyboard-scene-image-preview.md`
- `output/playwright/full-chain-studio-regenerated-scene.png`

## Verification Plan

- Automated: scene API tests and editor interaction tests.
- Manual: edit/regenerate/apply suggestion workflow.
- Browser/screenshot: capture studio editor P1 state.
- Accessibility: keyboard scene selection and reorder alternative.

## Risks And Follow-Ups

- Keep suggestion UI explainable; do not make opaque Agent decisions.
