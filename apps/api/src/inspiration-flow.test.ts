import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { InspirationGenerateResponse } from "@shopclip/shared";

import { createApp } from "./app";

const request = async <T>(
  baseUrl: string,
  path: string,
  options?: RequestInit,
): Promise<{ body: T; status: number }> => {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      "content-type": "application/json",
      ...options?.headers,
    },
    ...options,
  });

  const body = (await response.json()) as T;
  return { body, status: response.status };
};

describe("inspiration generation API", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    const app = createApp();
    server = app.listen(0);
    await new Promise<void>((resolve) => {
      server.once("listening", resolve);
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  });

  it("generates text materials with the Seed model contract", async () => {
    for (const assetType of ["text"] as const) {
      const generated = await request<InspirationGenerateResponse>(
        baseUrl,
        "/api/inspiration/generate",
        {
          method: "POST",
          body: JSON.stringify({
            prompt: "Create a launch concept for a fold-flat phone stand.",
            assetType,
          }),
        },
      );

      expect(generated.status).toBe(201);
      expect(generated.body.assetType).toBe(assetType);
      expect(generated.body.model).toBe("doubao-seed2.0-pro");
      expect(generated.body.fallback.used).toBe(true);
      expect(generated.body.materials[0]).toMatchObject({
        type: assetType,
        status: "ready",
      });
      if (generated.body.fallback.used) {
        expect(generated.body.materials[0].url).toBeUndefined();
      }
    }
  });

  it("keeps image requests media-oriented when the provider is mocked", async () => {
    const generated = await request<InspirationGenerateResponse>(
      baseUrl,
      "/api/inspiration/generate",
      {
        method: "POST",
        body: JSON.stringify({
          prompt: "Create an image for a fold-flat phone stand.",
          assetType: "image",
        }),
      },
    );

    expect(generated.status).toBe(201);
    expect(generated.body.assetType).toBe("image");
    expect(generated.body.model).toBe("doubao-seedream");
    expect(generated.body.fallback.used).toBe(true);
    expect(generated.body.materials[0]).toMatchObject({
      type: "image",
      status: "ready",
      mimeType: "image/png",
    });
    expect(generated.body.materials[0].url).toBeUndefined();
  });

  it("generates video materials with the Seedance model contract", async () => {
    const generated = await request<InspirationGenerateResponse>(
      baseUrl,
      "/api/inspiration/generate",
      {
        method: "POST",
        body: JSON.stringify({
          prompt: "Create a vertical product reveal video for a phone stand.",
          assetType: "video",
        }),
      },
    );

    expect(generated.status).toBe(201);
    expect(generated.body.assetType).toBe("video");
    expect(generated.body.model).toBe("doubao-seedance1.5-pro");
    expect(generated.body.fallback.used).toBe(true);
    expect(generated.body.materials[0]).toMatchObject({
      type: "video",
      status: "processing",
    });
    if (generated.body.fallback.used) {
      expect(generated.body.materials[0].url).toBeUndefined();
    }
  });

  it("rejects incomplete inspiration prompts before provider calls", async () => {
    const rejected = await request<{ error: { code: string } }>(
      baseUrl,
      "/api/inspiration/generate",
      {
        method: "POST",
        body: JSON.stringify({
          prompt: "x",
          assetType: "image",
        }),
      },
    );

    expect(rejected.status).toBe(400);
    expect(rejected.body.error.code).toBe("INVALID_INSPIRATION_REQUEST");
  });
});
