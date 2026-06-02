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
  "AI_VIDEO_ALLOWED_DURATIONS",
  "AI_VIDEO_DURATION",
  "AI_VIDEO_IMAGE_INPUT_MODE",
  "AI_VIDEO_MAX_DURATION",
  "AI_VIDEO_MIN_DURATION",
  "AI_VIDEO_MODEL_ID",
  "AI_VIDEO_REFERENCE_IMAGES",
  "AI_VIDEO_REFERENCE_IMAGE_MODE",
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
  prepKeywords: [],
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

  it("submits a Seedance task with storyboard prompt, first-frame image, and video options", async () => {
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
      providerTaskId: "seedance-task-123,seedance-task-123",
    });
    expect(result.renderTask.sceneClips).toHaveLength(2);
    expect(result.traceEvents.map((event) => event.step)).toEqual([
      "render-queued",
      "seedance-scene-tasks-submitted",
    ]);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://ark.example.test/api/v3/contents/generations/tasks",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer video-key",
          "content-type": "application/json",
        }),
      }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const requestBody = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(requestBody).toMatchObject({
      model: "ep-seedance-render",
      ratio: "9:16",
      resolution: "720p",
      duration: 4,
      generate_audio: false,
      watermark: false,
    });
    expect(requestBody.content[0].type).toBe("text");
    expect(requestBody.content[0].text).toContain("GlowGrip Phone Stand");
    expect(requestBody.content[0].text).toContain("Macro product shot");
    expect(requestBody.content[0].text).toContain("时长必须为 4 秒");
    expect(requestBody.content[0].text).toContain(
      "后期字幕文案参考（不要出现在画面中）: Show how it folds flat.",
    );
    expect(requestBody.content[0].text).toContain(
      "绝对不要出现任何字幕、文字、caption、贴纸文字、价格文字、按钮文字或水印文字",
    );
    expect(requestBody.content[0].text).not.toContain("文案: Show how it folds flat.");
    expect(requestBody.content[1]).toEqual({
      type: "image_url",
      role: "first_frame",
      image_url: {
        url: "https://cdn.example.test/product.png",
      },
    });
    expect(requestBody.content).toHaveLength(2);
  });

  it("can submit reference-image role content when explicitly configured", async () => {
    process.env.VIDEO_RENDER_PROVIDER_MODE = "seedance";
    process.env.AI_VIDEO_API_KEY = "video-key";
    process.env.AI_VIDEO_MODEL_ID = "ep-seedance-render";
    process.env.ARK_API_BASE_URL = "https://ark.example.test/api/v3";
    process.env.AI_VIDEO_IMAGE_INPUT_MODE = "reference_image";

    const fetchMock = vi.fn(async () =>
      Response.json({
        id: "seedance-task-reference-image",
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
    });

    const requestBody = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(requestBody.content[1]).toMatchObject({
      type: "image_url",
      role: "reference_image",
      image_url: {
        url: "https://cdn.example.test/product.png",
      },
    });
  });

  it("uses the storyboard scene image as the video reference before the asset slot image", async () => {
    process.env.VIDEO_RENDER_PROVIDER_MODE = "seedance";
    process.env.AI_VIDEO_API_KEY = "video-key";
    process.env.AI_VIDEO_MODEL_ID = "ep-seedance-render";
    process.env.ARK_API_BASE_URL = "https://ark.example.test/api/v3";

    const fetchMock = vi.fn(async () =>
      Response.json({
        id: "seedance-task-scene-image",
        status: "queued",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await renderWithConfiguredVideoProvider(
      {
        ...project,
        scenes: [
          {
            ...project.scenes[0],
            imageUrl: "https://cdn.example.test/storyboard-scene-image.png",
            assetId: "asset-1",
          },
        ],
      },
      {
        mediaSettings: {
          ttsVoice: "clear-host",
          subtitleStyle: "clean-lower-third",
          subtitlesEnabled: true,
          bgmTrack: "creator-pop",
        },
      },
    );

    const requestBody = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(requestBody.content[1]).toEqual({
      type: "image_url",
      role: "first_frame",
      image_url: {
        url: "https://cdn.example.test/storyboard-scene-image.png",
      },
    });
  });

  it("can disable Seedance image input for text-only endpoints", async () => {
    process.env.VIDEO_RENDER_PROVIDER_MODE = "seedance";
    process.env.AI_VIDEO_API_KEY = "video-key";
    process.env.AI_VIDEO_MODEL_ID = "ep-seedance-render";
    process.env.ARK_API_BASE_URL = "https://ark.example.test/api/v3";
    process.env.AI_VIDEO_IMAGE_INPUT_MODE = "none";

    const fetchMock = vi.fn(async () =>
      Response.json({
        id: "seedance-task-text-only",
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
    });

    const requestBody = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(requestBody.content).toHaveLength(1);
    expect(requestBody.content[0].type).toBe("text");
  });

  it("does not override storyboard duration with legacy fixed duration environment", async () => {
    process.env.VIDEO_RENDER_PROVIDER_MODE = "seedance";
    process.env.AI_VIDEO_API_KEY = "video-key";
    process.env.AI_VIDEO_MODEL_ID = "ep-seedance-render";
    process.env.ARK_API_BASE_URL = "https://ark.example.test/api/v3";
    process.env.AI_VIDEO_DURATION = "10";
    process.env.AI_VIDEO_ALLOWED_DURATIONS = "5,10";

    const fetchMock = vi.fn(async () =>
      Response.json({
        id: "seedance-task-duration",
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
    });

    const requestBody = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(requestBody.duration).toBe(4);
  });

  it("derives each Seedance duration from its storyboard scene duration", async () => {
    process.env.VIDEO_RENDER_PROVIDER_MODE = "seedance";
    process.env.AI_VIDEO_API_KEY = "video-key";
    process.env.AI_VIDEO_MODEL_ID = "ep-seedance-render";
    process.env.ARK_API_BASE_URL = "https://ark.example.test/api/v3";

    const fetchMock = vi.fn(async () =>
      Response.json({
        id: "seedance-task-storyboard-duration",
        status: "queued",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await renderWithConfiguredVideoProvider(
      {
        ...project,
        scenes: project.scenes.map((scene, index) => ({
          ...scene,
          durationSeconds: index === 0 ? 7 : 8,
        })),
      },
      {
        mediaSettings: {
          ttsVoice: "clear-host",
          subtitleStyle: "clean-lower-third",
          subtitlesEnabled: true,
          bgmTrack: "creator-pop",
        },
      },
    );

    const requestDurations = fetchMock.mock.calls.map((call) => {
      const body = JSON.parse(String((call[1] as RequestInit).body));
      return body.duration;
    });
    expect(requestDurations).toEqual([7, 8]);
  });

  it("renders from the edited project storyboard instead of stale script scenes", async () => {
    process.env.VIDEO_RENDER_PROVIDER_MODE = "seedance";
    process.env.AI_VIDEO_API_KEY = "video-key";
    process.env.AI_VIDEO_MODEL_ID = "ep-seedance-render";
    process.env.ARK_API_BASE_URL = "https://ark.example.test/api/v3";

    const fetchMock = vi.fn(async () =>
      Response.json({
        id: "seedance-task-edited-storyboard",
        status: "queued",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await renderWithConfiguredVideoProvider(
      {
        ...project,
        scripts: [
          {
            id: "script-1",
            projectId: "project-1",
            hook: "old hook",
            narrative: "old narrative",
            constraints: [],
            scenes: [
              {
                ...project.scenes[0],
                subtitle: "Old script copy",
                voiceover: "Old script voiceover",
                visualPrompt: "Old script visual",
              },
            ],
          },
        ],
        scenes: [
          {
            ...project.scenes[0],
            subtitle: "Edited storyboard copy",
            voiceover: "Edited storyboard voiceover",
            visualPrompt: "Edited storyboard visual",
          },
        ],
      },
      {
        mediaSettings: {
          ttsVoice: "clear-host",
          subtitleStyle: "clean-lower-third",
          subtitlesEnabled: true,
          bgmTrack: "creator-pop",
        },
      },
    );

    const requestBody = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(requestBody.content[0].text).toContain("Edited storyboard visual");
    expect(requestBody.content[0].text).toContain("Edited storyboard voiceover");
    expect(requestBody.content[0].text).not.toContain("Old script");
  });

  it("rejects a storyboard duration outside the configured Seedance range", async () => {
    process.env.VIDEO_RENDER_PROVIDER_MODE = "seedance";
    process.env.AI_VIDEO_API_KEY = "video-key";
    process.env.AI_VIDEO_MODEL_ID = "doubao-seedance-1-5-pro";
    process.env.ARK_API_BASE_URL = "https://ark.example.test/api/v3";
    process.env.AI_VIDEO_MIN_DURATION = "4";
    process.env.AI_VIDEO_MAX_DURATION = "12";

    await expect(
      renderWithConfiguredVideoProvider(
        {
          ...project,
          scenes: [
            {
              ...project.scenes[0],
              durationSeconds: 3,
            },
          ],
        },
        {
          mediaSettings: {
            ttsVoice: "clear-host",
            subtitleStyle: "clean-lower-third",
            subtitlesEnabled: true,
            bgmTrack: "creator-pop",
          },
        },
      ),
    ).rejects.toThrow("outside the configured Seedance range 4-12s");
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

  it("submits the configured video model id verbatim from the environment", async () => {
    process.env.VIDEO_RENDER_PROVIDER_MODE = "seedance";
    process.env.AI_VIDEO_API_KEY = "video-key";
    process.env.AI_VIDEO_MODEL_ID = "doubao-seedance-1-5-pro";
    process.env.ARK_API_BASE_URL = "https://ark.example.test/api/v3";

    const fetchMock = vi.fn(async () =>
      Response.json({
        id: "seedance-task-normalized-model",
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
    });

    const requestBody = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body));
    expect(requestBody.model).toBe("doubao-seedance-1-5-pro");
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

  it("polls Seedance scene clips and exposes each returned video URL", async () => {
    process.env.AI_VIDEO_API_KEY = "video-key";
    process.env.AI_VIDEO_MODEL_ID = "ep-seedance-render";
    process.env.ARK_API_BASE_URL = "https://ark.example.test/api/v3";

    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const taskId = String(url instanceof Request ? url.url : url)
        .split("/")
        .at(-1);
      return Response.json({
        status: "succeeded",
        content: {
          video_url: `https://cdn.example.test/${taskId}.mp4`,
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const provider = createSeedanceRenderProvider();
    const result = await provider.loadTask("seedance-task-1,seedance-task-2", [
      {
        sceneId: "scene-1",
        order: 1,
        subtitle: "Hook",
        status: "running",
        progress: 15,
        providerTaskId: "seedance-task-1",
      },
      {
        sceneId: "scene-2",
        order: 2,
        subtitle: "Detail",
        status: "running",
        progress: 15,
        providerTaskId: "seedance-task-2",
      },
    ]);

    expect(result.renderTask).toMatchObject({
      status: "completed",
      progress: 100,
      previewUrl: "https://cdn.example.test/seedance-task-1.mp4",
    });
    expect(result.renderTask.exportUrl).toBeUndefined();
    expect(result.renderTask.sceneClips?.map((clip) => clip.videoUrl)).toEqual([
      "https://cdn.example.test/seedance-task-1.mp4",
      "https://cdn.example.test/seedance-task-2.mp4",
    ]);
    expect(result.traceEvents.at(-1)).toMatchObject({
      status: "completed",
      step: "seedance-scene-clips-ready",
    });
  });

  it("uses the mock renderer only when mock render mode is explicit", async () => {
    process.env.VIDEO_RENDER_PROVIDER_MODE = "mock";
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
