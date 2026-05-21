# Decision: Pin Prisma To 6.x For Part 002

Date: 2026-05-21

## Context

Part 002 needs a conventional Prisma Client, Prisma Migrate, and seed workflow for PostgreSQL.

During implementation, Prisma 7.8.0 was initially installed by default. It generated a valid schema client, but `new PrismaClient()` in the seed script failed at runtime because Prisma 7 expects different client construction/options in this environment.

## Decision

Use `prisma@6.19.0` and `@prisma/client@6.19.0` for the current project baseline.

## Rationale

- Matches the standard Prisma schema, migration, and seed flow expected by the development plan.
- Keeps `DATABASE_URL` in `schema.prisma`, which aligns with the current `.env.example`.
- Avoids introducing Prisma 7 driver-adapter work before P0 backend work exists.

## Follow-Up

Revisit Prisma 7 only after the P0 API lifecycle is stable and there is a clear benefit to the new runtime model.
