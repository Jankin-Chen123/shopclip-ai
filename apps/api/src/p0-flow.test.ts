import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";

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

describe("P0 backend lifecycle", () => {
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    const app = createApp();
    server = app.listen(0);
    await new Promise<void>((resolve) => {
      server.once("listening", resolve);
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
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

  it("creates a project, accepts an image asset, generates storyboard, renders, and exposes export", async () => {
    const created = await request<{
      project: { id: string; productName: string };
    }>(baseUrl, "/api/projects", {
      method: "POST",
      body: JSON.stringify({
        title: "Desk launch clip",
        productName: "GlowGrip Phone Stand",
        audience: "TikTok Shop buyers",
        sellingPoints: ["folds flat", "keeps shots stable"],
        tone: "confident",
        style: "fast desk demo",
        targetDurationSeconds: 15,
      }),
    });

    expect(created.status).toBe(201);
    expect(created.body.project.productName).toBe("GlowGrip Phone Stand");

    const projectId = created.body.project.id;
    const asset = await request<{
      asset: { id: string; status: string; type: string };
    }>(baseUrl, `/api/projects/${projectId}/assets`, {
      method: "POST",
      body: JSON.stringify({
        type: "image",
        name: "Packshot",
        mimeType: "image/png",
        sizeBytes: 200_000,
        tags: ["product", "desk"],
      }),
    });

    expect(asset.status).toBe(201);
    expect(asset.body.asset).toMatchObject({
      status: "ready",
      type: "image",
    });

    const generated = await request<{
      fallback: { used: boolean; provider: string };
      script: { hook: string; scenes: Array<{ durationSeconds: number }> };
    }>(baseUrl, `/api/projects/${projectId}/generate-script`, {
      method: "POST",
    });

    expect(generated.status).toBe(201);
    expect(generated.body.fallback).toEqual({
      used: true,
      provider: "mock-script-provider",
    });
    expect(generated.body.script.scenes).toHaveLength(4);
    expect(
      generated.body.script.scenes.reduce((sum, scene) => sum + scene.durationSeconds, 0),
    ).toBeLessThanOrEqual(15);

    const render = await request<{
      renderTask: {
        id: string;
        status: string;
        progress: number;
        previewUrl: string;
      };
      traceEvents: Array<{ step: string; status: string }>;
    }>(baseUrl, `/api/projects/${projectId}/render`, {
      method: "POST",
    });

    expect(render.status).toBe(201);
    expect(render.body.renderTask).toMatchObject({
      status: "completed",
      progress: 100,
      previewUrl: expect.stringContaining(projectId),
    });
    expect(render.body.traceEvents.map((event) => event.step)).toEqual([
      "render-queued",
      "storyboard-validated",
      "tts-synthesized",
      "subtitle-overlay-prepared",
      "bgm-selected",
      "preview-created",
    ]);

    const loadedRender = await request<{
      renderTask: { id: string };
      traceEvents: Array<{ status: string }>;
    }>(baseUrl, `/api/render-tasks/${render.body.renderTask.id}`);

    expect(loadedRender.status).toBe(200);
    expect(loadedRender.body.traceEvents).toHaveLength(6);

    const exported = await request<{
      exportUrl: string;
      downloadUrl: string;
    }>(baseUrl, `/api/projects/${projectId}/export`);

    expect(exported.status).toBe(200);
    expect(exported.body.exportUrl).toContain(projectId);
    expect(exported.body.downloadUrl).toBe(exported.body.exportUrl);

    const loadedProject = await request<{
      project: {
        id: string;
        assets: unknown[];
        scripts: unknown[];
        scenes: unknown[];
        renderTasks: unknown[];
      };
    }>(baseUrl, `/api/projects/${projectId}`);

    expect(loadedProject.status).toBe(200);
    expect(loadedProject.body.project.assets).toHaveLength(1);
    expect(loadedProject.body.project.scripts).toHaveLength(1);
    expect(loadedProject.body.project.scenes).toHaveLength(4);
    expect(loadedProject.body.project.renderTasks).toHaveLength(1);
  });

  it("rejects invalid assets before storing metadata", async () => {
    const created = await request<{ project: { id: string } }>(baseUrl, "/api/projects", {
      method: "POST",
      body: JSON.stringify({
        title: "Desk launch clip",
        productName: "GlowGrip Phone Stand",
        audience: "TikTok Shop buyers",
        sellingPoints: ["folds flat"],
        tone: "confident",
        style: "fast desk demo",
        targetDurationSeconds: 15,
      }),
    });

    const rejected = await request<{ error: { code: string } }>(
      baseUrl,
      `/api/projects/${created.body.project.id}/assets`,
      {
        method: "POST",
        body: JSON.stringify({
          type: "image",
          name: "Script file",
          mimeType: "application/javascript",
          sizeBytes: 1000,
        }),
      },
    );

    expect(rejected.status).toBe(400);
    expect(rejected.body.error.code).toBe("INVALID_ASSET");
  });
});
