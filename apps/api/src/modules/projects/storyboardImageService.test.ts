import { afterEach, describe, expect, it, vi } from "vitest";
import type { ScriptGenerationRequest, StoryboardScene } from "@shopclip/shared";

import { generateInspiration } from "../../providers/ai/arkInspirationProvider.js";
import type { VideoFrameExtractor } from "../../providers/media/videoFrameExtractor.js";
import type { ProjectSnapshot } from "./projectStore.js";
import { generateStoryboardSceneImageUrl } from "./storyboardImageService.js";

vi.mock("../../providers/ai/arkInspirationProvider.js", () => ({
  generateInspiration: vi.fn(),
}));

const mockedGenerateInspiration = vi.mocked(generateInspiration);

const touchedEnvKeys = [
  "AI_PROVIDER_MODE",
  "SHOPCLIP_FORCE_MOCK_PROVIDERS",
  "STORYBOARD_IMAGE_PROVIDER_TIMEOUT_MS",
];

const project = (): ProjectSnapshot =>
  ({
    id: "project-1",
    audience: "TikTok shoppers",
    productName: "GlowGrip",
    sellingPoints: ["Locks a phone quickly"],
    style: "UGC demo",
    tone: "Direct",
  }) as ProjectSnapshot;

const scene = (): StoryboardScene => ({
  id: "scene-1",
  projectId: "project-1",
  order: 1,
  durationSeconds: 3,
  subtitle: "Stop shaky desk videos",
  voiceover: "Stop shaky desk videos.",
  visualPrompt: "Show the phone locked on the desk mount.",
  status: "generated",
});

const request: ScriptGenerationRequest = {
  assetIds: [],
  draftScript: "Draft script",
  keywords: ["desk"],
  materials: [],
  productionMode: "automatic",
};

const noopFrameExtractor: VideoFrameExtractor = async () => [];

describe("generateStoryboardSceneImageUrl", () => {
  afterEach(() => {
    vi.clearAllMocks();
    for (const key of touchedEnvKeys) {
      delete process.env[key];
    }
  });

  it("falls back to a deterministic storyboard image when the image provider times out", async () => {
    process.env.AI_PROVIDER_MODE = "ark";
    process.env.STORYBOARD_IMAGE_PROVIDER_TIMEOUT_MS = "1";
    mockedGenerateInspiration.mockImplementation(
      () => new Promise(() => undefined),
    );

    const imageUrl = await generateStoryboardSceneImageUrl(
      project(),
      scene(),
      request,
      [],
      noopFrameExtractor,
    );

    expect(mockedGenerateInspiration).toHaveBeenCalledTimes(1);
    expect(imageUrl).toMatch(/^data:image\/svg\+xml,/);
    expect(decodeURIComponent(imageUrl)).toContain("SCENE 1");
  });

  it("still surfaces non-timeout provider errors in real provider mode", async () => {
    process.env.AI_PROVIDER_MODE = "ark";
    process.env.STORYBOARD_IMAGE_PROVIDER_TIMEOUT_MS = "1000";
    mockedGenerateInspiration.mockRejectedValue(new Error("Ark image generation failed"));

    await expect(
      generateStoryboardSceneImageUrl(project(), scene(), request, [], noopFrameExtractor),
    ).rejects.toThrow("Ark image generation failed");
  });

  it("falls back when the image provider reports model capacity limits", async () => {
    process.env.AI_PROVIDER_MODE = "ark";
    process.env.STORYBOARD_IMAGE_PROVIDER_TIMEOUT_MS = "1000";
    mockedGenerateInspiration.mockRejectedValue(
      new Error(
        "Ark request failed with HTTP 429. {\"error\":{\"code\":\"SetLimitExceeded\",\"message\":\"model service has been paused\"}}",
      ),
    );

    const imageUrl = await generateStoryboardSceneImageUrl(
      project(),
      scene(),
      request,
      [],
      noopFrameExtractor,
    );

    expect(mockedGenerateInspiration).toHaveBeenCalledTimes(1);
    expect(imageUrl).toMatch(/^data:image\/svg\+xml,/);
    expect(decodeURIComponent(imageUrl)).toContain("SCENE 1");
  });
});
