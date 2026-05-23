import { afterEach, describe, expect, it, vi } from "vitest";

import { generateInspiration } from "./arkInspirationProvider";

const touchedKeys = [
  "AI_PROVIDER_MODE",
  "AI_API_KEY",
  "AI_IMAGE_API_KEY",
  "AI_TEXT_ENDPOINT_ID",
  "AI_IMAGE_ENDPOINT_ID",
  "AI_VIDEO_ENDPOINT_ID",
  "ARK_API_BASE_URL",
];

const configureArkEnv = () => {
  process.env.AI_PROVIDER_MODE = "ark";
  process.env.AI_API_KEY = "test-api-key";
  process.env.AI_TEXT_ENDPOINT_ID = "ep-text-test";
  process.env.AI_IMAGE_ENDPOINT_ID = "ep-image-test";
  process.env.AI_VIDEO_ENDPOINT_ID = "ep-video-test";
  process.env.ARK_API_BASE_URL = "https://ark.example.test/api/v3";
};

describe("ark inspiration provider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    for (const key of touchedKeys) {
      delete process.env[key];
    }
  });

  it("uses the image generation endpoint for image artifacts", async () => {
    configureArkEnv();
    const fetchMock = vi.fn(async () =>
      Response.json({
        data: [
          {
            url: "https://cdn.example.test/generated-dog.png",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const generated = await generateInspiration({
      prompt: "Create an image for a fold-flat phone stand.",
      assetType: "image",
    });

    expect(generated.fallback.used).toBe(false);
    expect(generated.model).toBe("doubao-seedream");
    expect(generated.materials[0]).toMatchObject({
      type: "image",
      status: "ready",
      mimeType: "image/png",
      url: "https://cdn.example.test/generated-dog.png",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://ark.example.test/api/v3/images/generations",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("uses the image API key override for Seedream image generation", async () => {
    configureArkEnv();
    process.env.AI_IMAGE_API_KEY = "image-api-key";
    const fetchMock = vi.fn(async () =>
      Response.json({
        data: [
          {
            b64_json: "iVBORw0KGgo=",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await generateInspiration({
      prompt: "Create an image for a fold-flat phone stand.",
      assetType: "image",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://ark.example.test/api/v3/images/generations",
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer image-api-key",
        }),
      }),
    );
  });

  it("keeps image results in fallback when the image provider does not return media", async () => {
    configureArkEnv();
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ data: [{}] })));

    const generated = await generateInspiration({
      prompt: "Create an image for a fold-flat phone stand.",
      assetType: "image",
    });

    expect(generated.fallback.used).toBe(true);
    expect(generated.materials[0]).toMatchObject({
      type: "image",
      status: "failed",
      mimeType: "image/png",
    });
    expect(generated.materials[0].url).toBeUndefined();
  });

  it("uses the user supplied API settings instead of environment configuration", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        choices: [
          {
            message: {
              content: "User configured text response.",
            },
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const generated = await generateInspiration({
      prompt: "Create a launch concept for a fold-flat phone stand.",
      assetType: "text",
      apiConfig: {
        general: {
          provider: "openai-compatible",
          apiBaseUrl: "https://api.example.test/v1",
          model: "custom-text-model",
          apiKey: "user-api-key",
        },
      },
    });

    expect(generated.fallback.used).toBe(false);
    expect(generated.model).toBe("custom-text-model");
    expect(generated.provider).toBe("openai-compatible");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.test/v1/chat/completions",
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer user-api-key",
        }),
        body: expect.stringContaining('"model":"custom-text-model"'),
      }),
    );
  });
});
