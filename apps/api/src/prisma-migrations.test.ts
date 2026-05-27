import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsPath = join(process.cwd(), "prisma", "migrations");

const readMigrationSql = (): string =>
  readdirSync(migrationsPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(migrationsPath, entry.name, "migration.sql"))
    .filter((migrationPath) => existsSync(migrationPath))
    .map((migrationPath) => readFileSync(migrationPath, "utf8"))
    .join("\n");

describe("Prisma migrations", () => {
  it("migrates storyboard scene image URLs used by historical project loading", () => {
    expect(readMigrationSql()).toContain('"imageUrl" TEXT');
  });
});
