import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { SceneRenderClip } from "@shopclip/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "./app";

const touchedKeys = [
  "ARK_API_BASE_URL",
  "AI_VIDEO_API_KEY",
  "AI_VIDEO_SCENE_SUBMIT_DELAY_MS",
  "AI_VIDEO_MODEL_ID",
  "FFMPEG_PATH",
  "VIDEO_RENDER_PROVIDER_MODE",
];

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

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const makeScenesRenderable = async (
  baseUrl: string,
  scenes: Array<{ id: string }>,
  durationSeconds = 4,
) => {
  await Promise.all(
    scenes.map((scene) =>
      request(baseUrl, `/api/scenes/${scene.id}`, {
        method: "PATCH",
        body: JSON.stringify({ durationSeconds }),
      }),
    ),
  );
};

describe("Seedance render API flow", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    process.env.AI_PROVIDER_MODE = "mock";
    process.env.VIDEO_RENDER_PROVIDER_MODE = "seedance";
    process.env.AI_VIDEO_API_KEY = "video-key";
    process.env.AI_VIDEO_MODEL_ID = "ep-seedance-render";
    process.env.ARK_API_BASE_URL = "https://ark.example.test/api/v3";
    process.env.FFMPEG_PATH = "ffmpeg-disabled-for-test";

    const app = createApp();
    server = app.listen(0);
    await new Promise<void>((resolve) => {
      server.once("listening", resolve);
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    for (const key of touchedKeys) {
      delete process.env[key];
    }
    delete process.env.AI_PROVIDER_MODE;
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

  it("creates Seedance scene clip tasks and completes them when polling returns video URLs", async () => {
    const originalFetch = globalThis.fetch;
    let createTaskCount = 0;
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const requestUrl = url instanceof Request ? url.url : String(url);
      if (requestUrl.startsWith(baseUrl)) {
        return originalFetch(url, init);
      }
      if (requestUrl.endsWith("/contents/generations/tasks")) {
        createTaskCount += 1;
        return Response.json({
          id: `seedance-scene-task-${createTaskCount}`,
          status: "queued",
        });
      }
      const taskId = requestUrl.split("/").at(-1);
      return Response.json({
        status: "succeeded",
        content: {
          video_url: `https://cdn.example.test/${taskId}.mp4`,
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const created = await request<{ project: { id: string } }>(baseUrl, "/api/projects", {
      method: "POST",
      body: JSON.stringify({
        title: "Seedance launch clip",
        productName: "GlowGrip Phone Stand",
        audience: "TikTok Shop buyers",
        sellingPoints: ["folds flat", "keeps shots stable"],
        tone: "confident",
        style: "fast desk demo",
        targetDurationSeconds: 12,
      }),
    });
    const asset = await request<{ asset: { id: string } }>(
      baseUrl,
      `/api/projects/${created.body.project.id}/assets`,
      {
        method: "POST",
        body: JSON.stringify({
          type: "image",
          name: "GlowGrip packshot",
          url: "https://cdn.example.test/product.png",
          mimeType: "image/png",
          sizeBytes: 220_000,
          tags: ["product", "desk"],
        }),
      },
    );
    const generated = await request<{ script: { scenes: Array<{ id: string }> } }>(
      baseUrl,
      `/api/projects/${created.body.project.id}/generate-script`,
      {
        method: "POST",
        body: JSON.stringify({
          assetIds: [asset.body.asset.id],
        }),
      },
    );
    expect(generated.status).toBe(201);
    await makeScenesRenderable(baseUrl, generated.body.script.scenes);

    const render = await request<{
      renderTask: {
        id: string;
        status: string;
        provider: string;
        providerTaskId: string;
        sceneClips: Array<{
          order: number;
          status: string;
          providerTaskId: string;
        }>;
      };
      traceEvents: Array<{ step: string; status: string }>;
    }>(baseUrl, `/api/projects/${created.body.project.id}/render`, {
      method: "POST",
      body: JSON.stringify({
        videoSettings: {
          ratio: "1:1",
          resolution: "1080p",
          generateAudio: true,
          watermark: true,
          seed: 77,
        },
      }),
    });

    expect(render.status).toBe(201);
    expect(render.body.renderTask).toMatchObject({
      status: "queued",
      provider: "volcengine-seedance",
    });
    expect(render.body.renderTask.sceneClips).toHaveLength(4);
    expect(render.body.renderTask.sceneClips.map((clip) => clip.status)).toEqual([
      "queued",
      "queued",
      "queued",
      "queued",
    ]);

    let polled:
      | {
          status: number;
          body: {
            renderTask: {
              status: string;
              progress: number;
              previewUrl: string;
              exportUrl: string;
              providerTaskId: string;
              sceneClips: Array<{
                status: string;
                videoUrl: string;
              }>;
            };
            traceEvents: Array<{ step: string; status: string }>;
          };
        }
      | undefined;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      polled = await request<{
        renderTask: {
          status: string;
          progress: number;
          previewUrl: string;
          exportUrl: string;
          providerTaskId: string;
          sceneClips: Array<{
            status: string;
            videoUrl: string;
          }>;
        };
        traceEvents: Array<{ step: string; status: string }>;
      }>(baseUrl, `/api/render-tasks/${render.body.renderTask.id}`);
      if (polled.body.renderTask.status === "completed") {
        break;
      }
      await wait(10);
    }

    expect(polled?.body.renderTask.providerTaskId).toBe(
      "seedance-scene-task-1,seedance-scene-task-2,seedance-scene-task-3,seedance-scene-task-4",
    );
    const seedanceCreateCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url instanceof Request ? url.url : url).endsWith("/contents/generations/tasks"),
    );
    expect(seedanceCreateCalls).toHaveLength(4);
    const seedanceCreateBody = JSON.parse(
      String((seedanceCreateCalls[0]?.[1] as RequestInit).body),
    );
    expect(seedanceCreateBody).toMatchObject({
      ratio: "1:1",
      resolution: "1080p",
      generate_audio: true,
      watermark: true,
      seed: 77,
    });

    expect(polled?.status).toBe(200);
    expect(polled?.body.renderTask).toMatchObject({
      status: "completed",
      progress: 100,
      previewUrl: "https://cdn.example.test/seedance-scene-task-1.mp4",
    });
    expect(polled?.body.renderTask.exportUrl).toBeUndefined();
    expect(polled?.body.renderTask.sceneClips.map((clip) => clip.videoUrl)).toEqual([
      "https://cdn.example.test/seedance-scene-task-1.mp4",
      "https://cdn.example.test/seedance-scene-task-2.mp4",
      "https://cdn.example.test/seedance-scene-task-3.mp4",
      "https://cdn.example.test/seedance-scene-task-4.mp4",
    ]);
    expect(polled?.body.traceEvents.map((event) => event.step)).toContain(
      "seedance-scene-clips-ready",
    );
    expect(polled?.body.traceEvents.map((event) => event.step)).toContain(
      "render-export-publish-failed",
    );

    const exported = await request<{ error: { code: string } }>(
      baseUrl,
      `/api/projects/${created.body.project.id}/export`,
    );
    expect(exported.status).toBe(502);
    expect(exported.body.error.code).toBe("EXPORT_COMPOSE_FAILED");
  });

  it("returns the published COS final video URL and materializes scene clips for smart edit", async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    const composedUrl =
      "https://cdn.example.test/projects/composed-project/exports/final/export.mp4";
    const renderExportPublisher = vi.fn(async () => composedUrl);
    const sceneClipMaterializer = vi.fn(
      async (
        _projectId: string,
        renderTaskId: string,
        sceneClips: SceneRenderClip[] | undefined,
      ) =>
        sceneClips?.map((clip) => ({
          ...clip,
          material: {
            audioUrl: `https://cdn.example.test/${renderTaskId}/scene-${clip.order}/audio.m4a`,
            materializedAt: "2026-06-05T00:00:00.000Z",
            status: "ready" as const,
            text: clip.subtitle,
            videoOnlyUrl: `https://cdn.example.test/${renderTaskId}/scene-${clip.order}/video-only.mp4`,
          },
        })),
    );
    const app = createApp({
      renderExportPublisher,
      sceneClipMaterializer,
    });
    server = app.listen(0);
    await new Promise<void>((resolve) => {
      server.once("listening", resolve);
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;

    const originalFetch = globalThis.fetch;
    let createTaskCount = 0;
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const requestUrl = url instanceof Request ? url.url : String(url);
      if (requestUrl.startsWith(baseUrl)) {
        return originalFetch(url, init);
      }
      if (requestUrl.endsWith("/contents/generations/tasks")) {
        createTaskCount += 1;
        return Response.json({
          id: `seedance-scene-task-${createTaskCount}`,
          status: "queued",
        });
      }
      const taskId = requestUrl.split("/").at(-1);
      return Response.json({
        status: "succeeded",
        content: {
          video_url: `https://cdn.example.test/${taskId}.mp4`,
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const created = await request<{ project: { id: string } }>(baseUrl, "/api/projects", {
      method: "POST",
      body: JSON.stringify({
        title: "Composed Seedance launch clip",
        productName: "GlowGrip Phone Stand",
        audience: "TikTok Shop buyers",
        sellingPoints: ["folds flat", "keeps shots stable"],
        tone: "confident",
        style: "fast desk demo",
        targetDurationSeconds: 12,
      }),
    });
    const generated = await request<{ script: { scenes: Array<{ id: string }> } }>(
      baseUrl,
      `/api/projects/${created.body.project.id}/generate-script`,
      {
        method: "POST",
        body: JSON.stringify({}),
      },
    );
    await makeScenesRenderable(baseUrl, generated.body.script.scenes);
    const render = await request<{ renderTask: { id: string } }>(
      baseUrl,
      `/api/projects/${created.body.project.id}/render`,
      {
        method: "POST",
        body: JSON.stringify({}),
      },
    );

    let polled:
      | {
          body: {
            renderTask: {
              id: string;
              status: string;
              exportUrl?: string;
              sceneClips?: Array<{
                material?: {
                  audioUrl?: string;
                  status: string;
                  text?: string;
                  videoOnlyUrl?: string;
                };
              }>;
            };
            traceEvents: Array<{ step: string; status: string }>;
          };
        }
      | undefined;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      polled = await request<{
        renderTask: {
          id: string;
          status: string;
          exportUrl?: string;
          sceneClips?: Array<{
            material?: {
              audioUrl?: string;
              status: string;
              text?: string;
              videoOnlyUrl?: string;
            };
          }>;
        };
        traceEvents: Array<{ step: string; status: string }>;
      }>(baseUrl, `/api/render-tasks/${render.body.renderTask.id}`);
      if (polled.body.renderTask.status === "completed") {
        break;
      }
      await wait(10);
    }

    expect(polled?.body.renderTask.exportUrl).toBe(composedUrl);
    expect(renderExportPublisher).toHaveBeenCalledTimes(1);
    expect(sceneClipMaterializer).toHaveBeenCalledTimes(1);
    expect(polled?.body.renderTask.sceneClips?.every((clip) => clip.material?.status === "ready")).toBe(
      true,
    );
    expect(polled?.body.renderTask.sceneClips?.[0]?.material).toMatchObject({
      audioUrl: `https://cdn.example.test/${polled?.body.renderTask.id}/scene-1/audio.m4a`,
      text: expect.any(String),
      videoOnlyUrl: `https://cdn.example.test/${polled?.body.renderTask.id}/scene-1/video-only.mp4`,
    });
    expect(polled?.body.traceEvents.map((event) => event.step)).toContain(
      "scene-clip-materialize",
    );
    const exported = await request<{ exportUrl: string; downloadUrl: string }>(
      baseUrl,
      `/api/projects/${created.body.project.id}/export`,
    );
    expect(exported.status).toBe(200);
    expect(exported.body.exportUrl).toBe(composedUrl);
    expect(exported.body.downloadUrl).toBe(composedUrl);
  });

  it("publishes a captioned final export even when Seedance renders a single scene", async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    const composedUrl = "https://cdn.example.test/projects/single-scene/exports/final/export.mp4";
    const renderExportPublisher = vi.fn(async () => composedUrl);
    const app = createApp({
      renderExportPublisher,
    });
    server = app.listen(0);
    await new Promise<void>((resolve) => {
      server.once("listening", resolve);
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;

    const originalFetch = globalThis.fetch;
    let createTaskCount = 0;
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const requestUrl = url instanceof Request ? url.url : String(url);
      if (requestUrl.startsWith(baseUrl)) {
        return originalFetch(url, init);
      }
      if (requestUrl.endsWith("/contents/generations/tasks")) {
        createTaskCount += 1;
        return Response.json({
          id: `seedance-scene-task-${createTaskCount}`,
          status: "queued",
        });
      }
      const taskId = requestUrl.split("/").at(-1);
      return Response.json({
        status: "succeeded",
        content: {
          video_url: `https://cdn.example.test/${taskId}.mp4`,
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const created = await request<{ project: { id: string } }>(baseUrl, "/api/projects", {
      method: "POST",
      body: JSON.stringify({
        title: "Single scene Seedance clip",
        productName: "GlowGrip Phone Stand",
        audience: "TikTok Shop buyers",
        sellingPoints: ["folds flat", "keeps shots stable"],
        tone: "confident",
        style: "fast desk demo",
        targetDurationSeconds: 4,
      }),
    });
    const generated = await request<{ script: { scenes: Array<{ id: string }> } }>(
      baseUrl,
      `/api/projects/${created.body.project.id}/generate-script`,
      {
        method: "POST",
        body: JSON.stringify({}),
      },
    );
    await Promise.all(
      generated.body.script.scenes.slice(1).map((scene) =>
        request(baseUrl, `/api/scenes/${scene.id}`, {
          method: "DELETE",
        }),
      ),
    );
    await makeScenesRenderable(baseUrl, generated.body.script.scenes.slice(0, 1));
    const render = await request<{ renderTask: { id: string } }>(
      baseUrl,
      `/api/projects/${created.body.project.id}/render`,
      {
        method: "POST",
        body: JSON.stringify({}),
      },
    );

    let polled:
      | {
          body: {
            renderTask: {
              status: string;
              exportUrl?: string;
              sceneClips?: Array<{ subtitle: string }>;
            };
          };
        }
      | undefined;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      polled = await request<{
        renderTask: {
          status: string;
          exportUrl?: string;
          sceneClips?: Array<{ subtitle: string }>;
        };
      }>(baseUrl, `/api/render-tasks/${render.body.renderTask.id}`);
      if (polled.body.renderTask.status === "completed") {
        break;
      }
      await wait(10);
    }

    expect(renderExportPublisher).toHaveBeenCalledTimes(1);
    expect(renderExportPublisher.mock.calls[0]?.[1]).toHaveLength(1);
    expect(polled?.body.renderTask.exportUrl).toBe(composedUrl);
  });

  it("returns a queued render task before slow Seedance scene submission completes", async () => {
    const originalFetch = globalThis.fetch;
    const pendingSeedanceRequests: Array<() => void> = [];
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const requestUrl = url instanceof Request ? url.url : String(url);
      if (requestUrl.startsWith(baseUrl)) {
        return originalFetch(url, init);
      }
      if (requestUrl.endsWith("/contents/generations/tasks")) {
        await new Promise<void>((resolve) => {
          pendingSeedanceRequests.push(resolve);
        });
        return Response.json({
          id: `seedance-scene-task-${pendingSeedanceRequests.length}`,
          status: "queued",
        });
      }
      return Response.json({ status: "queued" });
    });
    vi.stubGlobal("fetch", fetchMock);

    const created = await request<{ project: { id: string } }>(baseUrl, "/api/projects", {
      method: "POST",
      body: JSON.stringify({
        title: "Slow Seedance launch clip",
        productName: "GlowGrip Phone Stand",
        audience: "TikTok Shop buyers",
        sellingPoints: ["folds flat", "keeps shots stable"],
        tone: "confident",
        style: "fast desk demo",
        targetDurationSeconds: 12,
      }),
    });
    const asset = await request<{ asset: { id: string } }>(
      baseUrl,
      `/api/projects/${created.body.project.id}/assets`,
      {
        method: "POST",
        body: JSON.stringify({
          type: "image",
          name: "GlowGrip packshot",
          url: "https://cdn.example.test/product.png",
          mimeType: "image/png",
          sizeBytes: 220_000,
          tags: ["product", "desk"],
        }),
      },
    );
    const generated = await request<{ script: { scenes: Array<{ id: string }> } }>(
      baseUrl,
      `/api/projects/${created.body.project.id}/generate-script`,
      {
        method: "POST",
        body: JSON.stringify({
          assetIds: [asset.body.asset.id],
        }),
      },
    );
    await makeScenesRenderable(baseUrl, generated.body.script.scenes);

    const renderPromise = request<{
      renderTask: {
        status: string;
        sceneClips: Array<{ status: string }>;
      };
    }>(baseUrl, `/api/projects/${created.body.project.id}/render`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    const result = await Promise.race([renderPromise, wait(40).then(() => "timed-out" as const)]);
    pendingSeedanceRequests.forEach((resolve) => resolve());

    expect(result).not.toBe("timed-out");
    expect(result).toMatchObject({
      status: 201,
      body: {
        renderTask: {
          status: "queued",
          sceneClips: [
            { status: "queued" },
            { status: "queued" },
            { status: "queued" },
            { status: "queued" },
          ],
        },
      },
    });
  });

  it("renders only the latest generated storyboard scenes", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const requestUrl = url instanceof Request ? url.url : String(url);
      if (requestUrl.startsWith(baseUrl)) {
        return originalFetch(url, init);
      }
      return Response.json({
        id: "seedance-scene-task-current",
        status: "queued",
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const created = await request<{ project: { id: string } }>(baseUrl, "/api/projects", {
      method: "POST",
      body: JSON.stringify({
        title: "Current storyboard only",
        productName: "GlowGrip Phone Stand",
        audience: "TikTok Shop buyers",
        sellingPoints: ["folds flat", "keeps shots stable"],
        tone: "confident",
        style: "fast desk demo",
        targetDurationSeconds: 12,
      }),
    });
    const firstScript = await request<{
      script: { scenes: Array<{ id: string }> };
    }>(baseUrl, `/api/projects/${created.body.project.id}/generate-script`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    const latestScript = await request<{
      script: { scenes: Array<{ id: string }> };
    }>(baseUrl, `/api/projects/${created.body.project.id}/generate-script`, {
      method: "POST",
      body: JSON.stringify({
        draftScript: "第二版脚本，只渲染这一版。",
      }),
    });
    await makeScenesRenderable(baseUrl, latestScript.body.script.scenes);

    const render = await request<{
      renderTask: {
        sceneClips: Array<{ sceneId: string }>;
      };
    }>(baseUrl, `/api/projects/${created.body.project.id}/render`, {
      method: "POST",
      body: JSON.stringify({}),
    });

    expect(firstScript.body.script.scenes).toHaveLength(4);
    expect(latestScript.body.script.scenes).toHaveLength(4);
    expect(render.body.renderTask.sceneClips.map((clip) => clip.sceneId)).toEqual(
      latestScript.body.script.scenes.map((scene) => scene.id),
    );
  });
});
