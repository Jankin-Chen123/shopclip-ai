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

    const rewritten = await request<{
      fallback: { used: boolean; provider: string };
      scriptText: string;
    }>(baseUrl, `/api/projects/${projectId}/rewrite-script`, {
      method: "POST",
      body: JSON.stringify({
        assetIds: [asset.body.asset.id],
        draftScript: "show the stand on a desk",
        keywords: ["foldable", "stable"],
        materials: [
          {
            bucketId: "hero",
            name: "Packshot",
            type: "image",
          },
        ],
      }),
    });

    expect(rewritten.status).toBe(201);
    expect(rewritten.body.fallback).toEqual({
      used: true,
      provider: "mock-script-provider",
    });
    expect(rewritten.body.scriptText).toContain("GlowGrip Phone Stand");
    expect(rewritten.body.scriptText).toContain("show the stand on a desk");

    const generated = await request<{
      fallback: { used: boolean; provider: string };
      script: { hook: string; scenes: Array<{ durationSeconds: number }> };
    }>(baseUrl, `/api/projects/${projectId}/generate-script`, {
      method: "POST",
      body: JSON.stringify({
        draftScript: rewritten.body.scriptText,
        assetIds: [asset.body.asset.id],
        keywords: ["foldable", "stable"],
      }),
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

  it("uses prepared assets for storyboard generation and regenerates only the selected scene", async () => {
    const created = await request<{ project: { id: string } }>(baseUrl, "/api/projects", {
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
    const projectId = created.body.project.id;

    const preparedAsset = await request<{
      asset: { id: string; name: string };
    }>(baseUrl, "/api/assets", {
      method: "POST",
      body: JSON.stringify({
        type: "image",
        name: "Prepared hero packshot",
        mimeType: "image/png",
        sizeBytes: 200_000,
        tags: ["product", "hero"],
      }),
    });

    const generated = await request<{
      script: {
        scenes: Array<{
          assetId?: string;
          id: string;
          subtitle: string;
          voiceover: string;
          visualPrompt: string;
        }>;
      };
    }>(baseUrl, `/api/projects/${projectId}/generate-script`, {
      method: "POST",
      body: JSON.stringify({
        assetIds: [preparedAsset.body.asset.id],
        draftScript: "show the prepared hero packshot on a desk",
        keywords: ["foldable", "stable"],
        materials: [
          {
            assetId: preparedAsset.body.asset.id,
            bucketId: "hero",
            name: preparedAsset.body.asset.name,
            type: "image",
          },
        ],
      }),
    });

    expect(generated.status).toBe(201);
    expect(generated.body.script.scenes.map((scene) => scene.assetId)).toEqual([
      preparedAsset.body.asset.id,
      preparedAsset.body.asset.id,
      preparedAsset.body.asset.id,
      preparedAsset.body.asset.id,
    ]);

    const [firstScene, secondScene] = generated.body.script.scenes;
    expect(firstScene).toBeDefined();
    expect(secondScene).toBeDefined();

    const edited = await request<{
      scene: { id: string; status: string; subtitle: string; voiceover: string };
    }>(baseUrl, `/api/scenes/${firstScene!.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        subtitle: "Edited hook subtitle",
        voiceover: "Edited hook voiceover",
        status: "edited",
      }),
    });

    expect(edited.status).toBe(200);
    expect(edited.body.scene).toMatchObject({
      id: firstScene!.id,
      status: "edited",
      subtitle: "Edited hook subtitle",
      voiceover: "Edited hook voiceover",
    });

    const regenerated = await request<{
      scene: { id: string; status: string; subtitle: string };
      traceEvent: { step: string; status: string };
    }>(baseUrl, `/api/scenes/${secondScene!.id}/regenerate`, {
      method: "POST",
    });

    expect(regenerated.status).toBe(200);
    expect(regenerated.body.scene).toMatchObject({
      id: secondScene!.id,
      status: "generated",
    });
    expect(regenerated.body.scene.subtitle).toContain("Regenerated:");
    expect(regenerated.body.traceEvent).toMatchObject({
      step: "scene-regenerated",
      status: "completed",
    });

    const loadedProject = await request<{
      project: {
        scenes: Array<{
          id: string;
          subtitle: string;
          voiceover: string;
        }>;
      };
    }>(baseUrl, `/api/projects/${projectId}`);
    const loadedFirstScene = loadedProject.body.project.scenes.find(
      (scene) => scene.id === firstScene!.id,
    );
    const loadedSecondScene = loadedProject.body.project.scenes.find(
      (scene) => scene.id === secondScene!.id,
    );
    const untouchedScenes = loadedProject.body.project.scenes.filter(
      (scene) => scene.id !== firstScene!.id && scene.id !== secondScene!.id,
    );

    expect(loadedFirstScene).toMatchObject({
      subtitle: "Edited hook subtitle",
      voiceover: "Edited hook voiceover",
    });
    expect(loadedSecondScene?.subtitle).toContain("Regenerated:");
    expect(untouchedScenes.map((scene) => scene.subtitle)).toEqual([
      "Prove the benefit",
      "Export to TikTok Shop",
    ]);
  });
});
