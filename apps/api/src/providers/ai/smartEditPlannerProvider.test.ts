import type { AssetMetadata, AssetSlice, ProjectBrief, StoryboardScene } from "@shopclip/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

const project: ProjectBrief & { id: string } = {
  audience: "college students",
  id: "project-smart-edit",
  productName: "Cat water cup",
  sellingPoints: ["cute print", "straw lid", "portable"],
  style: "cute ecommerce demo",
  targetDurationSeconds: 12,
  title: "Cat cup campaign",
  tone: "friendly",
};

const assets: AssetMetadata[] = [
  {
    id: "asset-image",
    mimeType: "image/png",
    name: "cat cup.png",
    sizeBytes: 128,
    status: "ready",
    tags: ["hero", "cup"],
    type: "image",
    url: "https://storage.example.test/cat-cup.png",
  },
];

const assetSlices: AssetSlice[] = [];

const scenes: StoryboardScene[] = [
  {
    assetId: "asset-image",
    durationSeconds: 4,
    id: "scene-1",
    order: 1,
    projectId: "project-smart-edit",
    status: "ready",
    subtitle: "Who can say no to this cute cat cup?",
    visualPrompt: "Close-up of the cat cup.",
    voiceover: "Who can say no to this cute cat cup?",
  },
];

describe("smart edit planner provider", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    delete process.env.AI_PROVIDER_MODE;
    delete process.env.ARK_API_KEY;
    delete process.env.AI_GENERAL_MODEL_ID;
    delete process.env.ARK_API_BASE_URL;
  });

  it("sends target-language dubbing instructions to the general model and uses returned localized copy", async () => {
    process.env.AI_PROVIDER_MODE = "ark";
    process.env.ARK_API_KEY = "ark-test-key";
    process.env.AI_GENERAL_MODEL_ID = "general-test-model";
    process.env.ARK_API_BASE_URL = "https://ark.example.test/api/v3";
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      const systemText = body.input[0].content[0].text as string;
      const userText = body.input[1].content[0].text as string;
      expect(systemText).toContain("rewrite both subtitle and voiceover");
      expect(userText).toContain("Dubbing requirement");
      expect(userText).toContain("es-ES");
      return new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            audio: {
              bgmTrack: "creator-pop",
              targetLanguage: "es-ES",
              voice: "clear-host",
            },
            createdAt: "2026-06-02T00:00:00.000Z",
            id: "plan-es",
            projectId: "project-smart-edit",
            segments: [
              {
                assetTags: ["hero", "cup"],
                durationSeconds: 4,
                enabled: true,
                id: "segment-es-1",
                order: 1,
                rationale: "Use the hero product visual with Spanish dubbing.",
                sceneId: "scene-1",
                source: {
                  assetId: "asset-image",
                  imageUrl: "https://storage.example.test/cat-cup.png",
                  kind: "image-asset",
                },
                subtitle: "Quien puede resistirse a este vaso de gatito?",
                transition: "cut",
                voiceover: "Quien puede resistirse a este vaso de gatito?",
              },
            ],
            strategy: "Localized smart edit for Spanish dubbing.",
            targetDurationSeconds: 4,
          }),
        }),
        {
          headers: { "content-type": "application/json" },
        },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const { createSmartEditPlan } = await import("./smartEditPlannerProvider.js");
    const result = await createSmartEditPlan({
      apiConfig: {
        general: {
          credentialSource: "official",
        },
      },
      assets,
      assetSlices,
      project,
      request: {
        apiConfig: {
          general: {
            credentialSource: "official",
          },
        },
        instructions: undefined,
        locale: "en-US",
        mediaSettings: {
          bgmTrack: "creator-pop",
          subtitleStyle: "clean-lower-third",
          subtitlesEnabled: true,
          ttsVoice: "clear-host",
        },
        segments: [],
        targetLanguage: "es-ES",
        videoSettings: {
          generateAudio: false,
          ratio: "9:16",
          resolution: "720p",
          watermark: false,
        },
      },
      scenes,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://ark.example.test/api/v3/responses",
      expect.any(Object),
    );
    expect(result.fallback.used).toBe(false);
    expect(result.plan.audio.targetLanguage).toBe("es-ES");
    expect(result.plan.segments[0]?.subtitle).toContain("gatito");
    expect(result.plan.segments[0]?.voiceover).toContain("gatito");
  });

  it("uses server env credentials when the frontend sends partial official model settings", async () => {
    process.env.AI_PROVIDER_MODE = "ark";
    process.env.AI_GENERAL_API_KEY = "env-general-key";
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      expect(headers.authorization).toBe("Bearer env-general-key");
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe("frontend-model");
      return new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            audio: {
              bgmTrack: "none",
              targetLanguage: "zh-CN",
              voice: "clear-host",
            },
            createdAt: "2026-06-02T00:00:00.000Z",
            id: "plan-partial-config",
            projectId: "project-smart-edit",
            segments: [
              {
                assetTags: ["hero", "cup"],
                durationSeconds: 4,
                enabled: true,
                id: "segment-1",
                order: 1,
                rationale: "Use configured model with server credentials.",
                sceneId: "scene-1",
                source: {
                  assetId: "asset-image",
                  imageUrl: "https://storage.example.test/cat-cup.png",
                  kind: "image-asset",
                },
                subtitle: "Env key works",
                transition: "cut",
                voiceover: "Env key works",
              },
            ],
            strategy: "Use server env key for partial frontend config.",
            targetDurationSeconds: 4,
          }),
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const { createSmartEditPlan } = await import("./smartEditPlannerProvider.js");
    const result = await createSmartEditPlan({
      apiConfig: {
        general: {
          apiBaseUrl: "https://frontend.example.test/api/v3",
          model: "frontend-model",
          provider: "volcengine-ark",
        },
      },
      assets,
      assetSlices,
      project,
      request: {
        apiConfig: {
          general: {
            apiBaseUrl: "https://frontend.example.test/api/v3",
            model: "frontend-model",
            provider: "volcengine-ark",
          },
        },
        locale: "zh-CN",
        mediaSettings: {
          bgmTrack: "none",
          subtitleStyle: "clean-lower-third",
          subtitlesEnabled: true,
          ttsVoice: "clear-host",
        },
        segments: [],
        targetLanguage: "zh-CN",
        videoSettings: {
          generateAudio: false,
          ratio: "9:16",
          resolution: "720p",
          watermark: false,
        },
      },
      scenes,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://frontend.example.test/api/v3/responses",
      expect.any(Object),
    );
    expect(result.fallback.used).toBe(false);
  });

  it("routes Ark custom endpoint IDs through chat completions instead of responses", async () => {
    process.env.AI_PROVIDER_MODE = "ark";
    process.env.AI_GENERAL_API_KEY = "env-general-key";
    process.env.AI_GENERAL_MODEL_ID = "ep-custom-general";
    process.env.ARK_API_BASE_URL = "https://ark.example.test/api/v3";
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      expect(headers.authorization).toBe("Bearer env-general-key");
      const body = JSON.parse(String(init?.body));
      expect(body.model).toBe("ep-custom-general");
      expect(body.messages[0].role).toBe("system");
      expect(body.messages[1].role).toBe("user");
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  audio: {
                    bgmTrack: "none",
                    targetLanguage: "zh-CN",
                    voice: "clear-host",
                  },
                  createdAt: "2026-06-02T00:00:00.000Z",
                  id: "plan-chat-endpoint",
                  projectId: "project-smart-edit",
                  segments: [
                    {
                      assetTags: ["hero", "cup"],
                      durationSeconds: 4,
                      enabled: true,
                      id: "segment-1",
                      order: 1,
                      rationale: "Use custom endpoint chat completions.",
                      sceneId: "scene-1",
                      source: {
                        assetId: "asset-image",
                        imageUrl: "https://storage.example.test/cat-cup.png",
                        kind: "image-asset",
                      },
                      subtitle: "Custom endpoint works",
                      transition: "cut",
                      voiceover: "Custom endpoint works",
                    },
                  ],
                  strategy: "Use chat completions for Ark endpoint IDs.",
                  targetDurationSeconds: 4,
                }),
              },
            },
          ],
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const { createSmartEditPlan } = await import("./smartEditPlannerProvider.js");
    const result = await createSmartEditPlan({
      apiConfig: {
        general: {
          credentialSource: "official",
        },
      },
      assets,
      assetSlices,
      project,
      request: {
        apiConfig: {
          general: {
            credentialSource: "official",
          },
        },
        locale: "zh-CN",
        mediaSettings: {
          bgmTrack: "none",
          subtitleStyle: "clean-lower-third",
          subtitlesEnabled: true,
          ttsVoice: "clear-host",
        },
        segments: [],
        targetLanguage: "zh-CN",
        videoSettings: {
          generateAudio: false,
          ratio: "9:16",
          resolution: "720p",
          watermark: false,
        },
      },
      scenes,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://ark.example.test/api/v3/chat/completions",
      expect.any(Object),
    );
    expect(result.fallback.used).toBe(false);
  });

  it("normalizes near-valid model plans instead of falling back when enums or empty source URLs are malformed", async () => {
    process.env.AI_PROVIDER_MODE = "ark";
    process.env.ARK_API_KEY = "ark-test-key";
    process.env.AI_GENERAL_MODEL_ID = "general-test-model";
    process.env.ARK_API_BASE_URL = "https://ark.example.test/api/v3";
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          output_text: JSON.stringify({
            audio: {
              bgmTrack: "upbeat pop music",
              targetLanguage: "zh-CN",
              voice: "female creator",
            },
            createdAt: "2026-06-02T00:00:00.000Z",
            id: "plan-near-valid",
            projectId: "wrong-project",
            segments: [
              {
                assetTags: ["hero", "cup"],
                durationSeconds: 4,
                enabled: true,
                id: "segment-near-valid-1",
                order: 1,
                rationale: "Use close-up product visual.",
                sceneId: "scene-1",
                source: {
                  assetId: "asset-image",
                  imageUrl: "",
                  kind: "image-asset",
                  sceneClipUrl: "",
                },
                subtitle: "这只小猫水杯也太可爱了！",
                transition: "quick push-in",
                voiceover: "这只小猫水杯也太可爱了！",
              },
            ],
            strategy: "Normalize imperfect model output.",
            targetDurationSeconds: 4,
          }),
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { createSmartEditPlan } = await import("./smartEditPlannerProvider.js");
    const result = await createSmartEditPlan({
      apiConfig: {
        general: {
          credentialSource: "official",
        },
      },
      assets,
      assetSlices,
      project,
      request: {
        apiConfig: {
          general: {
            credentialSource: "official",
          },
        },
        locale: "zh-CN",
        mediaSettings: {
          bgmTrack: "creator-pop",
          subtitleStyle: "clean-lower-third",
          subtitlesEnabled: true,
          ttsVoice: "clear-host",
        },
        segments: [],
        targetLanguage: "zh-CN",
        videoSettings: {
          generateAudio: false,
          ratio: "9:16",
          resolution: "720p",
          watermark: false,
        },
      },
      scenes,
    });

    expect(result.fallback.used).toBe(false);
    expect(result.plan.projectId).toBe("project-smart-edit");
    expect(result.plan.audio.bgmTrack).toBe("creator-pop");
    expect(result.plan.audio.voice).toBe("clear-host");
    expect(result.plan.segments[0]?.transition).toBe("cut");
    expect(result.plan.segments[0]?.source).toEqual({
      assetId: "asset-image",
      imageUrl: "https://storage.example.test/cat-cup.png",
      kind: "image-asset",
    });
    expect(result.plan.segments[0]?.subtitle).toBe("这只小猫水杯也太可爱了！");
  });
});
