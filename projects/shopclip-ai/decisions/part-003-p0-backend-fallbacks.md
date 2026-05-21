# Decision: P0 Backend Uses Deterministic In-Memory Fallbacks

Date: 2026-05-21

## Context

Part 003 needs the P0 backend lifecycle to be testable before frontend integration:

- project creation and loading
- image asset intake
- script/storyboard generation
- render task trace
- preview and export fallback

The local environment does not currently have PostgreSQL running on `localhost:5432`, so direct Prisma-backed API integration tests cannot run end to end yet.

## Decision

Use an in-memory repository for the Part 003 API implementation and deterministic mock providers for script generation and rendering.

## Rationale

- Keeps the P0 API contract stable for Part 004 frontend work.
- Allows automated tests to verify the full lifecycle without external services.
- Preserves provider credentials on the server side and returns only explicit fallback metadata.
- Leaves Prisma schema and migration from Part 002 intact for later database-backed persistence.

## Follow-Up

Replace or wrap the in-memory repository with a Prisma-backed repository once a PostgreSQL `DATABASE_URL` is available. Keep the API response shape unchanged for frontend compatibility.
