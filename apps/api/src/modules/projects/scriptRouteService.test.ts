import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_SCRIPT_TEXT_PROVIDER_TIMEOUT_MS,
  scriptTextProviderTimeoutMs,
} from "./scriptRouteService.js";

describe("scriptTextProviderTimeoutMs", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses a provider timeout long enough for real script generation by default", () => {
    vi.stubEnv("SCRIPT_TEXT_PROVIDER_TIMEOUT_MS", "");

    expect(scriptTextProviderTimeoutMs()).toBe(DEFAULT_SCRIPT_TEXT_PROVIDER_TIMEOUT_MS);
    expect(scriptTextProviderTimeoutMs()).toBe(110_000);
  });

  it("allows deployments to override the text provider timeout", () => {
    vi.stubEnv("SCRIPT_TEXT_PROVIDER_TIMEOUT_MS", "120000");

    expect(scriptTextProviderTimeoutMs()).toBe(120_000);
  });
});
