import { afterEach, describe, expect, it, vi } from "vitest";

import { generateInspiration } from "./arkInspirationProvider";

const touchedKeys = [
  "AI_PROVIDER_MODE",
  "AI_GENERAL_API_KEY",
  "AI_GENERAL_MODEL_ID",
  "AI_API_KEY",
  "AI_TEXT_API_KEY",
  "AI_TEXT_MODEL_ID",
  "AI_IMAGE_API_KEY",
  "AI_IMAGE_MODEL_ID",
  "AI_VIDEO_API_KEY",
  "AI_VIDEO_MODEL_ID",
  "AI_TEXT_ENDPOINT_ID",
  "AI_IMAGE_ENDPOINT_ID",
  "AI_VIDEO_ENDPOINT_ID",
  "ARK_API_KEY",
  "ARK_API_BASE_URL",
  "ARK_IMAGE_SIZE",
];

const configureArkEnv = () => {
  process.env.AI_PROVIDER_MODE = "ark";
  process.env.ARK_API_KEY = "ark-shared-key";
  process.env.AI_GENERAL_MODEL_ID = "ep-text-test";
  process.env.AI_IMAGE_MODEL_ID = "ep-image-test";
  process.env.AI_VIDEO_MODEL_ID = "ep-video-test";
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
    expect(generated.model).toBe("ep-image-test");
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

  it("sends Seedream reference images and disables sequential generation", async () => {
    configureArkEnv();
    const fetchMock = vi.fn(async () =>
      Response.json({
        data: [
          {
            url: "https://cdn.example.test/generated-reference-frame.png",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const generated = await generateInspiration({
      prompt: "根据参考图生成一张产品分镜图。",
      assetType: "image",
      options: {
        image: {
          aspectRatio: "9:16",
          count: 1,
          quality: "standard",
          referenceImages: [
            "https://cdn.example.test/product-main.png",
            "https://cdn.example.test/video-frame-001.png",
          ],
        },
      },
    });

    expect(generated.fallback.used).toBe(false);
    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(body).toMatchObject({
      image: [
        "https://cdn.example.test/product-main.png",
        "https://cdn.example.test/video-frame-001.png",
      ],
      model: "ep-image-test",
      prompt: "根据参考图生成一张产品分镜图。",
      response_format: "url",
      sequential_image_generation: "disabled",
      size: "1440x2560",
      watermark: false,
    });
  });

  it("constrains text generation to a Chinese storyboard-ready table", async () => {
    configureArkEnv();
    const fetchMock = vi.fn(async () =>
      Response.json({
        output_text: "脚本文案",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await generateInspiration({
      prompt: "请生成脚本。",
      assetType: "text",
    });

    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    const systemText = body.input[0].content[0].text;
    expect(systemText).toContain("中文");
    expect(systemText).toContain("Markdown 表格");
    expect(systemText).toContain("时间");
    expect(systemText).toContain("旁白");
    expect(systemText).toContain("字幕");
    expect(systemText).toContain("画面");
    expect(systemText).toContain("产品外观必须与用户素材一致");
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

  it("fails fast when the image provider does not return media in real mode", async () => {
    configureArkEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ data: [{}] })),
    );

    await expect(generateInspiration({
      prompt: "Create an image for a fold-flat phone stand.",
      assetType: "image",
    })).rejects.toThrow(/did not return an image URL/);
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

  it("uses complete server API configuration when official configuration is requested", async () => {
    configureArkEnv();
    process.env.AI_GENERAL_API_KEY = "general-official-key";
    const fetchMock = vi.fn(async () =>
      Response.json({
        output_text: "Official configured text response.",
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
          apiBaseUrl: "https://api.example.test/should-not-be-used",
          model: "custom-text-model",
        },
      },
    });

    expect(generated.fallback.used).toBe(false);
    expect(generated.model).toBe("ep-text-test");
    expect(generated.provider).toBe("volcengine-ark");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://ark.example.test/api/v3/responses",
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer general-official-key",
        }),
        body: expect.stringContaining('"model":"ep-text-test"'),
      }),
    );
  });

  it("falls back to ARK_API_KEY and the default text model when role-specific text env is blank", async () => {
    process.env.AI_PROVIDER_MODE = "ark";
    process.env.ARK_API_KEY = "ark-shared-key";
    process.env.ARK_API_BASE_URL = "https://ark.example.test/api/v3";
    const fetchMock = vi.fn(async () =>
      Response.json({
        output_text: "Official default model response.",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const generated = await generateInspiration({
      prompt: "Create a launch concept for a fold-flat phone stand.",
      assetType: "text",
      apiConfig: {
        general: {
          credentialSource: "official",
          provider: "volcengine-ark",
        },
      },
    });

    expect(generated.fallback.used).toBe(false);
    expect(generated.model).toBe("doubao-seed2.0-pro");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://ark.example.test/api/v3/responses",
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer ark-shared-key",
        }),
        body: expect.stringContaining('"model":"doubao-seed2.0-pro"'),
      }),
    );
  });

  it("keeps legacy endpoint and shared key environment names working", async () => {
    process.env.AI_PROVIDER_MODE = "ark";
    process.env.AI_API_KEY = "legacy-shared-key";
    process.env.AI_TEXT_ENDPOINT_ID = "legacy-text-endpoint";
    process.env.ARK_API_BASE_URL = "https://ark.example.test/api/v3";
    const fetchMock = vi.fn(async () =>
      Response.json({
        output_text: "Legacy environment text response.",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const generated = await generateInspiration({
      prompt: "Create a launch concept for a fold-flat phone stand.",
      assetType: "text",
    });

    expect(generated.fallback.used).toBe(false);
    expect(generated.model).toBe("legacy-text-endpoint");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://ark.example.test/api/v3/responses",
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer legacy-shared-key",
        }),
        body: expect.stringContaining('"model":"legacy-text-endpoint"'),
      }),
    );
  });

  it("uses role-specific server API keys and valid Seedream image sizes in official mode", async () => {
    configureArkEnv();
    process.env.AI_IMAGE_API_KEY = "image-official-key";
    process.env.ARK_IMAGE_SIZE = "1024x1024";
    const fetchMock = vi.fn(async () =>
      Response.json({
        data: [
          {
            url: "https://cdn.example.test/generated-official-image.png",
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
          credentialSource: "official",
          provider: "volcengine-ark",
          apiBaseUrl: "https://api.example.test/should-not-be-used",
          model: "doubao-seedream-5-0-260128",
        },
      },
    });

    expect(generated.fallback.used).toBe(false);
    expect(generated.model).toBe("ep-image-test");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://ark.example.test/api/v3/images/generations",
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer image-official-key",
        }),
        body: expect.stringContaining('"model":"ep-image-test"'),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('"size":"2048x2048"'),
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
