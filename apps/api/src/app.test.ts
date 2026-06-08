import { describe, expect, it } from "vitest";

import { createApp } from "./app";
import { listenOnFetchSafePort } from "./testServer";

describe("createApp", () => {
  it("creates an Express app with routes registered", () => {
    const app = createApp();

    expect(app).toBeDefined();
    expect(typeof app.listen).toBe("function");
  });

  it("sets production-safe baseline headers and a bounded error shape", async () => {
    const app = createApp();
    const { baseUrl, server } = await listenOnFetchSafePort(app);

    try {
      const health = await fetch(`${baseUrl}/health`);
      expect(health.headers.get("x-powered-by")).toBeNull();
      expect(health.headers.get("x-content-type-options")).toBe("nosniff");
      expect(health.headers.get("x-frame-options")).toBe("DENY");

      const missing = await fetch(`${baseUrl}/missing`);
      expect(missing.status).toBe(404);
      expect(await missing.json()).toEqual({
        error: {
          code: "NOT_FOUND",
          message: "Route was not found.",
        },
      });
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });
});
