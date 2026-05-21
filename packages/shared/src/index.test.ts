import { describe, expect, it } from "vitest";

import { createHealthPayload } from "./index";

describe("createHealthPayload", () => {
  it("returns a stable health payload for a service", () => {
    expect(createHealthPayload("api")).toEqual({
      service: "api",
      status: "ok",
      version: "0.1.0",
    });
  });
});
