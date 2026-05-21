# Part 002: Data Model, API Contracts, And Seed Demo

## Status

- Project slug: shopclip-ai
- Part number: 002
- Owner role: `implementation-engineer`
- Status: Implementation Complete; DB Apply Blocked By Missing Local PostgreSQL
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

- [x] Prisma migration can be generated.
- [ ] Prisma migration can be applied. Blocked locally because no PostgreSQL service is listening on `localhost:5432`.
- [x] Seed script creates one complete demo project when a PostgreSQL `DATABASE_URL` is available.
- [x] Shared schemas validate project brief, scene, render task, trace event, and dashboard responses.
- [x] Tests cover invalid duration, invalid status, and required fields.

## Verification Plan

- Automated: schema tests, migration command, seed command.
- Manual: inspect seeded project via Prisma Studio or API after Part 003.
- Security: verify seed data contains no real credentials.

## Risks And Follow-Ups

- Render Postgres may require small schema adjustments; document any migration decision in `../decisions/`.
- Prisma is pinned to 6.19.0 for the current conventional migration/seed workflow. Decision recorded in `../decisions/part-002-prisma-version.md`.
- Run `corepack pnpm --filter @shopclip/api db:migrate` and `corepack pnpm --filter @shopclip/api db:seed` after a real PostgreSQL `DATABASE_URL` is available.

## Change Summary

- Added PostgreSQL Prisma schema and initial migration for Project, Asset, AssetSlice, Script, StoryboardScene, RenderTask, TraceEvent, and MockMetric.
- Added Prisma seed script with a fictional safe demo product, mock assets, 15-second storyboard, completed render trace, and mock metrics.
- Added shared Zod schemas and exported TypeScript contract types.
- Added shared schema tests for required fields, invalid duration, invalid enum status/type, trace event response shape, and dashboard response shape.
- Added API package database scripts: `db:generate`, `db:migrate`, and `db:seed`.

## Verification Evidence

- Evidence file: `../evidence/part-002-verification.md`
- `corepack pnpm test`: passed.
- `corepack pnpm typecheck`: passed.
- `corepack pnpm build`: passed.
- Prisma validate: passed with `DATABASE_URL` set.
- Prisma generate: passed.
- Prisma migrate diff from empty schema: passed and produced SQL.
- Local PostgreSQL check: blocked, `TcpTestSucceeded = False` for `localhost:5432`.
