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

  it("uses server API credentials when official configuration is requested", async () => {
    configureArkEnv();
    const fetchMock = vi.fn(async () =>
      Response.json({
        choices: [
          {
            message: {
              content: "Official configured text response.",
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
          credentialSource: "official",
          provider: "openai-compatible",
          apiBaseUrl: "https://api.example.test/v1",
          model: "custom-text-model",
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
          authorization: "Bearer test-api-key",
        }),
        body: expect.stringContaining('"model":"custom-text-model"'),
      }),
    );
  });

  it("uses the Ark Responses API for versioned Doubao Seed text models", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        output_text: "Responses API text response.",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const generated = await generateInspiration({
      prompt: "Create a launch concept for a fold-flat phone stand.",
      assetType: "text",
      apiConfig: {
        general: {
          provider: "volcengine-ark",
          apiBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
          model: "doubao-seed-2-0-pro-260215",
          apiKey: "user-api-key",
        },
      },
    });

    expect(generated.fallback.used).toBe(false);
    expect(generated.materials[0]?.content).toBe("Responses API text response.");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://ark.cn-beijing.volces.com/api/v3/responses",
      expect.objectContaining({
        body: expect.stringContaining('"type":"input_text"'),
      }),
    );
  });

  it("maps Ark display aliases to callable versioned model ids before provider calls", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        data: [
          {
            url: "https://cdn.example.test/generated-phone-stand.png",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const generated = await generateInspiration({
      prompt: "Create an image for a fold-flat phone stand.",
      assetType: "image",
      apiConfig: {
        image: {
          provider: "volcengine-ark",
          apiBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
          model: "Doubao-Seedream-4.0",
          apiKey: "user-api-key",
        },
      },
    });

    expect(generated.fallback.used).toBe(false);
    expect(generated.model).toBe("doubao-seedream-4-0-250828");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://ark.cn-beijing.volces.com/api/v3/images/generations",
      expect.objectContaining({
        body: expect.stringContaining('"model":"doubao-seedream-4-0-250828"'),
      }),
    );
  });

  it("uses callable Ark model ids when user settings contain display aliases", async () => {
    configureArkEnv();
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/images/generations")) {
        return Response.json({
          data: [
            {
              url: "https://cdn.example.test/generated-phone-stand.png",
            },
          ],
        });
      }

      if (url.endsWith("/contents/generations/tasks")) {
        return Response.json({ id: "ark-video-task-1" });
      }

      return Response.json({ output_text: "Generated text response." });
    });
    vi.stubGlobal("fetch", fetchMock);

    await generateInspiration({
      prompt: "Create a launch concept for a fold-flat phone stand.",
      assetType: "text",
      apiConfig: {
        general: {
          provider: "volcengine-ark",
          apiBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
          model: "doubao-seed-2.0-pro",
          apiKey: "user-api-key",
        },
      },
    });
    await generateInspiration({
      prompt: "Create an image for a fold-flat phone stand.",
      assetType: "image",
      apiConfig: {
        image: {
          provider: "volcengine-ark",
          apiBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
          model: "doubao-seedream-5.0",
          apiKey: "user-api-key",
        },
      },
    });
    await generateInspiration({
      prompt: "Create a vertical product reveal video for a phone stand.",
      assetType: "video",
      apiConfig: {
        video: {
          provider: "volcengine-ark",
          apiBaseUrl: "https://ark.cn-beijing.volces.com/api/v3",
          model: "doubao-seedance-1.5-pro",
          apiKey: "user-api-key",
        },
      },
    });

    const requestBodies = fetchMock.mock.calls.map(([, init]) =>
      JSON.parse(String((init as RequestInit).body)),
    );
    expect(requestBodies[0]).toMatchObject({ model: "doubao-seed-2-0-pro-260215" });
    expect(requestBodies[1]).toMatchObject({ model: "doubao-seedream-5-0-260128" });
    expect(requestBodies[2]).toMatchObject({ model: "doubao-seedance-1-5-pro-251215" });
  });
});
