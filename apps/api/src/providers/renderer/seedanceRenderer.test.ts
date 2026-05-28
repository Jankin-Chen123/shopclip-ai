import { afterEach, describe, expect, it, vi } from "vitest";

import type { ProjectSnapshot } from "../../modules/projects/projectStore.js";
import {
  createSeedanceRenderProvider,
  renderWithConfiguredVideoProvider,
} from "./seedanceRenderer.js";

const touchedKeys = [
  "ARK_API_BASE_URL",
  "ARK_API_KEY",
  "ARK_VIDEO_GENERATION_PATH",
  "AI_API_KEY",
  "AI_VIDEO_API_KEY",
  "AI_VIDEO_ENDPOINT_ID",
  "AI_VIDEO_GENERATE_AUDIO",
  "AI_VIDEO_MODEL_ID",
  "AI_VIDEO_RATIO",
  "AI_VIDEO_RESOLUTION",
  "AI_VIDEO_SEED",
  "AI_VIDEO_WATERMARK",
  "VIDEO_RENDER_PROVIDER_MODE",
];

const project: ProjectSnapshot = {
  id: "project-1",
  title: "Desk clip",
  productName: "GlowGrip Phone Stand",
  audience: "TikTok buyers",
  sellingPoints: ["folds flat", "keeps product shots stable"],
  tone: "confident",
  style: "fast desk demo",
  targetDurationSeconds: 12,
  status: "ready",
  createdAt: "2026-05-28T00:00:00.000Z",
  updatedAt: "2026-05-28T00:00:00.000Z",
  assets: [
    {
      id: "asset-1",
      projectId: "project-1",
      type: "image",
      status: "ready",
      url: "https://cdn.example.test/product.png",
      name: "Product packshot",
      tags: ["product", "desk"],
    },
  ],
  assetSlices: [],
  assetProcessingJobs: [],
  scripts: [],
  scenes: [
    {
      id: "scene-1",
      projectId: "project-1",
      order: 1,
      durationSeconds: 4,
      subtitle: "Fold flat in one move",
      voiceover: "Show how it folds flat.",
      visualPrompt: "Macro product shot on a desk, slow push in.",
      assetId: "asset-1",
      status: "generated",
    },
    {
      id: "scene-2",
      projectId: "project-1",
      order: 2,
      durationSeconds: 4,
      subtitle: "Stable hands free filming",
      voiceover: "Keep every demo angle steady.",
      visualPrompt: "Creator places phone on the stand, fixed camera.",
      status: "generated",
    },
  ],
  renderTasks: [],
};

describe("Seedance renderer provider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    for (const key of touchedKeys) {
      delete process.env[key];
    }
  });

  it("submits a Seedance task with storyboard prompt, reference image, and video options", async () => {
    process.env.VIDEO_RENDER_PROVIDER_MODE = "seedance";
    process.env.AI_VIDEO_API_KEY = "video-key";
    process.env.AI_VIDEO_MODEL_ID = "ep-seedance-render";
    process.env.ARK_API_BASE_URL = "https://ark.example.test/api/v3";
    process.env.AI_VIDEO_RATIO = "9:16";
    process.env.AI_VIDEO_RESOLUTION = "720p";

    const fetchMock = vi.fn(async () =>
      Response.json({
        id: "seedance-task-123",
        status: "queued",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await renderWithConfiguredVideoProvider(project, {
      mediaSettings: {
        ttsVoice: "clear-host",
        subtitleStyle: "clean-lower-third",
        subtitlesEnabled: true,
        bgmTrack: "creator-pop",
      },
    });

    expect(result.renderTask).toMatchObject({
      status: "running",
      progress: 15,
      provider: "volcengine-seedance",
      providerTaskId: "seedance-task-123",
    });
    expect(result.traceEvents.map((event) => event.step)).toEqual([
      "render-queued",
      "seedance-task-submitted",
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://ark.example.test/api/v3/contents/generations/tasks",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer video-key",
          "content-type": "application/json",
        }),
      }),
    );

    const requestBody = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(requestBody).toMatchObject({
      model: "ep-seedance-render",
      ratio: "9:16",
      resolution: "720p",
      duration: 8,
      generate_audio: false,
      watermark: false,
    });
    expect(requestBody.content[0].type).toBe("text");
    expect(requestBody.content[0].text).toContain("GlowGrip Phone Stand");
    expect(requestBody.content[0].text).toContain("Macro product shot");
    expect(requestBody.content[1]).toMatchObject({
      type: "image_url",
      role: "reference_image",
      image_url: {
        url: "https://cdn.example.test/product.png",
      },
    });
  });

  it("prefers render request video settings over environment defaults", async () => {
    process.env.VIDEO_RENDER_PROVIDER_MODE = "seedance";
    process.env.AI_VIDEO_API_KEY = "video-key";
    process.env.AI_VIDEO_MODEL_ID = "ep-seedance-render";
    process.env.ARK_API_BASE_URL = "https://ark.example.test/api/v3";
    process.env.AI_VIDEO_RATIO = "9:16";
    process.env.AI_VIDEO_RESOLUTION = "720p";
    process.env.AI_VIDEO_GENERATE_AUDIO = "false";
    process.env.AI_VIDEO_WATERMARK = "false";
    process.env.AI_VIDEO_SEED = "11";

    const fetchMock = vi.fn(async () =>
      Response.json({
        id: "seedance-task-frontend-settings",
        status: "queued",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await renderWithConfiguredVideoProvider(project, {
      mediaSettings: {
        ttsVoice: "clear-host",
        subtitleStyle: "clean-lower-third",
        subtitlesEnabled: true,
        bgmTrack: "creator-pop",
      },
      videoSettings: {
        ratio: "16:9",
        resolution: "1080p",
        generateAudio: true,
        watermark: true,
        seed: 42,
      },
    });

    const requestBody = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(requestBody).toMatchObject({
      ratio: "16:9",
      resolution: "1080p",
      generate_audio: true,
      watermark: true,
      seed: 42,
    });
  });

  it("polls a Seedance task and maps the returned video URL to preview and export URLs", async () => {
    process.env.AI_VIDEO_API_KEY = "video-key";
    process.env.AI_VIDEO_MODEL_ID = "ep-seedance-render";
    process.env.ARK_API_BASE_URL = "https://ark.example.test/api/v3";

    const fetchMock = vi.fn(async () =>
      Response.json({
        status: "succeeded",
        content: {
          video_url: "https://cdn.example.test/rendered.mp4",
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = createSeedanceRenderProvider();
    const result = await provider.loadTask("seedance-task-123");

    expect(result.renderTask).toMatchObject({
      status: "completed",
      progress: 100,
      previewUrl: "https://cdn.example.test/rendered.mp4",
      exportUrl: "https://cdn.example.test/rendered.mp4",
    });
    expect(result.traceEvents.at(-1)).toMatchObject({
      status: "completed",
      step: "seedance-video-ready",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://ark.example.test/api/v3/contents/generations/tasks/seedance-task-123",
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer video-key",
        }),
      }),
    );
  });

  it("uses the mock renderer when Seedance render mode is not explicitly enabled", async () => {
    process.env.AI_VIDEO_API_KEY = "video-key";
    process.env.AI_VIDEO_MODEL_ID = "ep-seedance-render";

    const result = await renderWithConfiguredVideoProvider(project, {
      mediaSettings: {
        ttsVoice: "clear-host",
        subtitleStyle: "clean-lower-third",
        subtitlesEnabled: true,
        bgmTrack: "creator-pop",
      },
    });

    expect(result.renderTask.provider).toBe("mock-renderer");
    expect(result.renderTask.previewUrl).toContain("/demo-exports/project-1/preview.mp4");
  });
});
