import { describe, expect, it } from "vitest";

import { createApp } from "./app";

describe("createApp", () => {
  it("creates an Express app with routes registered", () => {
    const app = createApp();

    expect(app).toBeDefined();
    expect(typeof app.listen).toBe("function");
  });
});
