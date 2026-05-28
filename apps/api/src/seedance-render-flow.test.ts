import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "./app";

const touchedKeys = [
  "ARK_API_BASE_URL",
  "AI_VIDEO_API_KEY",
  "AI_VIDEO_MODEL_ID",
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

describe("Seedance render API flow", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    process.env.VIDEO_RENDER_PROVIDER_MODE = "seedance";
    process.env.AI_VIDEO_API_KEY = "video-key";
    process.env.AI_VIDEO_MODEL_ID = "ep-seedance-render";
    process.env.ARK_API_BASE_URL = "https://ark.example.test/api/v3";

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

  it("creates a Seedance render task and completes it when polling returns a video URL", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const requestUrl = url instanceof Request ? url.url : String(url);
      if (requestUrl.startsWith(baseUrl)) {
        return originalFetch(url, init);
      }
      if (requestUrl.endsWith("/contents/generations/tasks")) {
        return Response.json({
          id: "seedance-task-456",
          status: "queued",
        });
      }
      return Response.json({
        status: "succeeded",
        content: {
          video_url: "https://cdn.example.test/final-video.mp4",
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
    const generated = await request(baseUrl, `/api/projects/${created.body.project.id}/generate-script`, {
      method: "POST",
      body: JSON.stringify({
        assetIds: [asset.body.asset.id],
      }),
    });
    expect(generated.status).toBe(201);

    const render = await request<{
      renderTask: {
        id: string;
        status: string;
        provider: string;
        providerTaskId: string;
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
      status: "running",
      provider: "volcengine-seedance",
      providerTaskId: "seedance-task-456",
    });
    const seedanceCreateCall = fetchMock.mock.calls.find(([url]) =>
      String(url instanceof Request ? url.url : url).endsWith("/contents/generations/tasks"),
    );
    const seedanceCreateBody = JSON.parse(String((seedanceCreateCall?.[1] as RequestInit).body));
    expect(seedanceCreateBody).toMatchObject({
      ratio: "1:1",
      resolution: "1080p",
      generate_audio: true,
      watermark: true,
      seed: 77,
    });

    const polled = await request<{
      renderTask: {
        status: string;
        progress: number;
        previewUrl: string;
        exportUrl: string;
      };
      traceEvents: Array<{ step: string; status: string }>;
    }>(baseUrl, `/api/render-tasks/${render.body.renderTask.id}`);

    expect(polled.status).toBe(200);
    expect(polled.body.renderTask).toMatchObject({
      status: "completed",
      progress: 100,
      previewUrl: "https://cdn.example.test/final-video.mp4",
      exportUrl: "https://cdn.example.test/final-video.mp4",
    });
    expect(polled.body.traceEvents.map((event) => event.step)).toContain("seedance-video-ready");
  });
});
