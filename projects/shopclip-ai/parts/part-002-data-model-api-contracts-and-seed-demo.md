# Part 002: Data Model, API Contracts, And Seed Demo

## Status

- Project slug: shopclip-ai
- Part number: 002
- Owner role: `implementation-engineer`
- Status: Planned
- Created: 2026-05-21
- Last updated: 2026-05-21

## Source Of Truth

Before starting, read `../00-requirements.md`, `../01-design-spec.md`, `../02-development-plan.md`, and `AGENTS.md`.

## Objective

Define the persistent data model and shared request/response contracts needed by the P0/P1 product.

## Scope

### In Scope

- Prisma schema for Project, Asset, AssetSlice, Script, StoryboardScene, RenderTask, TraceEvent, MockMetric.
- Shared Zod schemas and TypeScript types.
- Seeded safe demo product and mock metrics.

### Out Of Scope

- Real upload handling.
- Real AI provider calls.

## Dependencies

- Prior Parts: Part 001.
- External services: local PostgreSQL or a development database.

## Expected Files Or Modules

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/seed.ts`
- `packages/shared/src/schemas.ts`
- `packages/shared/src/types.ts`

## Implementation Notes

- Keep scene duration total <= 15 seconds at validation level where practical.
- Use enums for task status, asset status, trace status, and asset type.
- Seed only safe mock/sample content. Do not copy API keys from the source document.

## Acceptance Criteria

- [ ] Prisma migration can be generated and applied.
- [ ] Seed script creates one complete demo project.
- [ ] Shared schemas validate project brief, scene, render task, trace event, and dashboard responses.
- [ ] Tests cover invalid duration, invalid status, and required fields.

## Verification Plan

- Automated: schema tests, migration command, seed command.
- Manual: inspect seeded project via Prisma Studio or API after Part 003.
- Security: verify seed data contains no real credentials.

## Risks And Follow-Ups

- Render Postgres may require small schema adjustments; document any migration decision in `../decisions/`.

