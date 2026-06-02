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
});
