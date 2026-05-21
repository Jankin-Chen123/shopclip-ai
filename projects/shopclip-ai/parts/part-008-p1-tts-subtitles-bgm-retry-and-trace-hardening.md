# Part 008: P1 TTS, Subtitles, BGM, Retry, And Trace Hardening

## Status

- Project slug: shopclip-ai
- Part number: 008
- Owner role: `implementation-engineer`
- Status: Planned
- Created: 2026-05-21
- Last updated: 2026-05-21

## Source Of Truth

Before starting, read `../00-requirements.md`, `../01-design-spec.md`, `../02-development-plan.md`, and `AGENTS.md`.

## Objective

Add P1 media controls and make generation failures recoverable and observable.

## Scope

### In Scope

- TTS provider adapter with mock fallback.
- Subtitle overlay/control data.
- BGM selection.
- Retry action for failed generation/render steps.
- Hardened trace statuses.

### Out Of Scope

- Perfect audio/video synchronization for arbitrary media.
- Licensed music marketplace.

## Dependencies

- Prior Parts: Part 005.

## Expected Files Or Modules

- `apps/api/src/providers/tts/`
- `apps/api/src/providers/renderer/`
- `apps/api/src/modules/render/`
- `apps/web/src/features/render/`
- `apps/web/src/features/studio/`

## Acceptance Criteria

- [ ] User can select or preview TTS/subtitle/BGM settings.
- [ ] Mock render visibly reflects subtitle and selected media state.
- [ ] Failed render/generation step exposes retry.
- [ ] Retry preserves previous successful project/storyboard data.
- [ ] Trace entries include step, timestamp, status, message, and retry relationship when applicable.

## Verification Plan

- Automated: render retry tests and media option validation.
- Manual: force a failure, retry, and verify recovery.
- Browser/screenshot: capture failed and successful trace states.
- Security: provider errors do not leak secrets.

## Risks And Follow-Ups

- Real TTS integration may be disabled for deployed demo if quota or latency is unsafe.

