import { describe, expect, it } from "vitest";

import { shouldUsePrismaStore } from "./storeFactory";

describe("project store factory", () => {
  it("uses Prisma persistence when DATABASE_URL is configured", () => {
    expect(
      shouldUsePrismaStore({
        DATABASE_URL: "postgresql://shopclip:password@127.0.0.1:5432/shopclip_ai",
      }),
    ).toBe(true);
  });

  it("allows memory mode to be forced for tests and local demos", () => {
    expect(
      shouldUsePrismaStore({
        DATABASE_URL: "postgresql://shopclip:password@127.0.0.1:5432/shopclip_ai",
        PROJECT_STORE_MODE: "memory",
      }),
    ).toBe(false);
  });
});

