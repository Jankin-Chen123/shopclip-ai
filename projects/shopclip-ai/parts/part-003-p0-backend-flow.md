# Part 003: P0 Backend Flow

## Status

- Project slug: shopclip-ai
- Part number: 003
- Owner role: `implementation-engineer`
- Status: Planned
- Created: 2026-05-21
- Last updated: 2026-05-21

## Source Of Truth

Before starting, read `../00-requirements.md`, `../01-design-spec.md`, `../02-development-plan.md`, and `AGENTS.md`.

## Objective

Implement the backend APIs for the P0 end-to-end flow: project creation, asset intake, script/storyboard generation, render task trace, preview, and export fallback.

## Scope

### In Scope

- Project create/load endpoints.
- Asset upload with validation and storage abstraction.
- Script/storyboard provider adapter with deterministic fallback.
- Render task lifecycle with trace events and preview artifact.

### Out Of Scope

- P1 retrieval, editing Agent, dashboard, and advanced media controls.

## Dependencies

- Prior Parts: Part 001 and Part 002.
- External services: optional AI provider; fallback must work without provider config.

## Expected Files Or Modules

- `apps/api/src/modules/projects/`
- `apps/api/src/modules/assets/`
- `apps/api/src/modules/generation/`
- `apps/api/src/modules/render/`
- `apps/api/src/providers/ai/`
- `apps/api/src/providers/renderer/`

## Implementation Notes

- Every generation and render step writes a TraceEvent.
- Frontend must receive clear fallback markers when mock mode is used.
- Provider credentials stay in server environment variables only.

## Acceptance Criteria

- [ ] API can create and load a project.
- [ ] API can accept at least image assets and persist metadata.
- [ ] API can generate a script and storyboard with no external provider configured.
- [ ] API can create a render task and return progress plus a preview URL.
- [ ] API can expose an export/download path for the demo artifact.

## Verification Plan

- Automated: API integration tests for full P0 backend lifecycle.
- Manual: call endpoints with REST client or curl.
- Security: upload validation and no secret exposure in responses.

## Risks And Follow-Ups

- Video artifact generation may need to be a static demo file first; record the chosen fallback in `../decisions/`.

