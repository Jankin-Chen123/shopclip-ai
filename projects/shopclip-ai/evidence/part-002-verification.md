# Part 002 Verification Evidence

Date: 2026-05-21

## Scope Verified

- Prisma data model for Project, Asset, AssetSlice, Script, StoryboardScene, RenderTask, TraceEvent, and MockMetric.
- Shared Zod contracts and TypeScript types for brief, asset metadata, script result, scene update, render task, trace event, and dashboard response.
- Seeded safe demo product, assets, storyboard, render trace, and mock metrics.

## Commands Run

```text
corepack pnpm --filter @shopclip/shared test
Result: passed, 6 tests.
```

```text
$env:DATABASE_URL='postgresql://user:password@localhost:5432/shopclip_ai'; apps\api\node_modules\.bin\prisma.CMD validate --schema apps\api\prisma\schema.prisma
Result: passed.
```

```text
apps\api\node_modules\.bin\prisma.CMD generate --schema apps\api\prisma\schema.prisma
Result: passed, Prisma Client v6.19.0 generated.
```

```text
apps\api\node_modules\.bin\prisma.CMD migrate diff --from-empty --to-schema-datamodel apps\api\prisma\schema.prisma --script
Result: passed, SQL generated for all p002 tables, enums, indexes, and foreign keys.
```

```text
corepack pnpm test
Result: passed, workspace tests passed.
```

```text
corepack pnpm typecheck
Result: passed.
```

```text
corepack pnpm build
Result: passed.
```

## Database Apply / Seed Check

```text
Test-NetConnection -ComputerName localhost -Port 5432
Result: TcpTestSucceeded = False.
```

```text
$env:DATABASE_URL='postgresql://user:password@localhost:5432/shopclip_ai'; corepack pnpm --filter @shopclip/api db:seed
Result: blocked by missing local PostgreSQL, Prisma error P1001: Can't reach database server at localhost:5432.
```

```text
$env:DATABASE_URL='postgresql://user:password@localhost:5432/shopclip_ai'; apps\api\node_modules\.bin\prisma.CMD migrate dev --schema apps\api\prisma\schema.prisma --name init --create-only
Result: blocked by missing local PostgreSQL.
```

## Security Check

- Seed content uses fictional product data only.
- Seed paths are local demo paths.
- No API keys, tokens, provider endpoints, or real merchant data were added.

## Residual Risk

- Migration apply and seed execution still need a real PostgreSQL database or Render PostgreSQL `DATABASE_URL`.
