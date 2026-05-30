import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "./app";

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

const createRenderableProject = async (baseUrl: string): Promise<string> => {
  const created = await request<{ project: { id: string } }>(baseUrl, "/api/projects", {
    method: "POST",
    body: JSON.stringify({
      title: "Desk launch clip",
      productName: "GlowGrip Phone Stand",
      audience: "TikTok Shop buyers",
      sellingPoints: ["folds flat", "keeps product shots stable"],
      tone: "confident",
      style: "fast desk demo",
      targetDurationSeconds: 15,
    }),
  });
  expect(created.status).toBe(201);

  const asset = await request(baseUrl, `/api/projects/${created.body.project.id}/assets`, {
    method: "POST",
    body: JSON.stringify({
      type: "image",
      name: "GlowGrip packshot",
      mimeType: "image/png",
      sizeBytes: 220_000,
      tags: ["product", "desk", "hero"],
    }),
  });
  expect(asset.status).toBe(201);

  const generated = await request(
    baseUrl,
    `/api/projects/${created.body.project.id}/generate-script`,
    {
      method: "POST",
    },
  );
  expect(generated.status).toBe(201);

  return created.body.project.id;
};

describe("P1 media controls and render retry", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    process.env.AI_PROVIDER_MODE = "mock";
    process.env.VIDEO_RENDER_PROVIDER_MODE = "mock";
    const app = createApp();
    server = app.listen(0);
    await new Promise<void>((resolve) => {
      server.once("listening", resolve);
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    delete process.env.AI_PROVIDER_MODE;
    delete process.env.VIDEO_RENDER_PROVIDER_MODE;
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

  it("records media settings in render trace, exposes a recoverable failed render, and retries without losing storyboard data", async () => {
    const projectId = await createRenderableProject(baseUrl);

    const failedRender = await request<{
      renderTask: {
        id: string;
        status: string;
        progress: number;
        errorMessage: string;
        mediaSettings: {
          ttsVoice: string;
          subtitleStyle: string;
          subtitlesEnabled: boolean;
          bgmTrack: string;
        };
      };
      traceEvents: Array<{
        status: string;
        step: string;
        message: string;
        retryOfTraceEventId?: string;
      }>;
    }>(baseUrl, `/api/projects/${projectId}/render`, {
      method: "POST",
      body: JSON.stringify({
        mediaSettings: {
          ttsVoice: "energetic-seller",
          subtitleStyle: "high-contrast",
          subtitlesEnabled: true,
          bgmTrack: "creator-pop",
        },
        simulateFailure: true,
      }),
    });

    expect(failedRender.status).toBe(201);
    expect(failedRender.body.renderTask).toMatchObject({
      status: "failed",
      progress: 72,
      mediaSettings: {
        ttsVoice: "energetic-seller",
        subtitleStyle: "high-contrast",
        subtitlesEnabled: true,
        bgmTrack: "creator-pop",
      },
    });
    expect(failedRender.body.renderTask.errorMessage).toContain("Simulated renderer failure");
    expect(failedRender.body.traceEvents.map((event) => event.step)).toEqual([
      "render-queued",
      "storyboard-validated",
      "tts-synthesized",
      "subtitle-overlay-prepared",
      "bgm-selected",
      "preview-render-failed",
    ]);
    expect(failedRender.body.traceEvents.at(-1)?.status).toBe("failed");

    const retried = await request<{
      renderTask: {
        id: string;
        status: string;
        progress: number;
        previewUrl: string;
        retryOfRenderTaskId: string;
      };
      traceEvents: Array<{ step: string; status: string; retryOfTraceEventId?: string }>;
    }>(baseUrl, `/api/render-tasks/${failedRender.body.renderTask.id}/retry`, {
      method: "POST",
      body: JSON.stringify({
        mediaSettings: {
          ttsVoice: "energetic-seller",
          subtitleStyle: "high-contrast",
          subtitlesEnabled: true,
          bgmTrack: "creator-pop",
        },
      }),
    });

    expect(retried.status).toBe(201);
    expect(retried.body.renderTask).toMatchObject({
      status: "completed",
      progress: 100,
      retryOfRenderTaskId: failedRender.body.renderTask.id,
    });
    expect(retried.body.renderTask.previewUrl).toContain("voice=energetic-seller");
    expect(retried.body.renderTask.previewUrl).toContain("bgm=creator-pop");
    expect(retried.body.traceEvents[0]).toMatchObject({
      step: "render-retry-started",
      status: "retrying",
    });
    expect(retried.body.traceEvents[0].retryOfTraceEventId).toBeDefined();

    const loadedProject = await request<{
      project: { scenes: unknown[]; renderTasks: Array<{ id: string; status: string }> };
    }>(baseUrl, `/api/projects/${projectId}`);

    expect(loadedProject.status).toBe(200);
    expect(loadedProject.body.project.scenes).toHaveLength(4);
    expect(loadedProject.body.project.renderTasks.map((task) => task.status)).toEqual([
      "failed",
      "completed",
    ]);
  });
});
