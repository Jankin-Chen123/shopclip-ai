import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    vi.unstubAllGlobals();
    delete process.env.AI_PROVIDER_MODE;
    delete process.env.ARK_API_KEY;
    delete process.env.AI_GENERAL_API_KEY;
    delete process.env.AI_GENERAL_MODEL_ID;
    delete process.env.AI_TEXT_MODEL_ID;
    delete process.env.AI_IMAGE_API_KEY;
    delete process.env.AI_IMAGE_MODEL_ID;
    delete process.env.AI_VIDEO_API_KEY;
    delete process.env.AI_VIDEO_MODEL_ID;
    delete process.env.ARK_API_BASE_URL;
  });

  it("lists historical projects as compact summaries ordered by latest update", async () => {
    const first = await request<{
      project: { id: string; title: string };
    }>(baseUrl, "/api/projects", {
      method: "POST",
      body: JSON.stringify({
        title: "First launch clip",
        productName: "GlowGrip Phone Stand",
        audience: "TikTok Shop buyers",
        sellingPoints: ["folds flat"],
        tone: "confident",
        style: "fast desk demo",
        targetDurationSeconds: 15,
      }),
    });
    const second = await request<{
      project: { id: string; title: string };
    }>(baseUrl, "/api/projects", {
      method: "POST",
      body: JSON.stringify({
        title: "Second launch clip",
        productName: "Desk Halo Lamp",
        audience: "home office shoppers",
        sellingPoints: ["soft light"],
        tone: "warm",
        style: "premium product closeups",
        targetDurationSeconds: 12,
      }),
    });

    await request(baseUrl, `/api/projects/${second.body.project.id}/assets`, {
      method: "POST",
      body: JSON.stringify({
        type: "image",
        name: "Lamp packshot",
        mimeType: "image/png",
        sizeBytes: 200_000,
        tags: ["lamp"],
      }),
    });
    await request(baseUrl, `/api/projects/${second.body.project.id}/generate-script`, {
      method: "POST",
    });

    const history = await request<{
      projects: Array<{
        id: string;
        title: string;
        productName: string;
        status: string;
        assetCount: number;
        sceneCount: number;
        updatedAt: string;
      }>;
    }>(baseUrl, "/api/projects");

    expect(history.status).toBe(200);
    expect(history.body.projects.map((project) => project.id)).toEqual([
      second.body.project.id,
      first.body.project.id,
    ]);
    expect(history.body.projects[0]).toMatchObject({
      title: "Second launch clip",
      productName: "Desk Halo Lamp",
      status: "ready",
      assetCount: 1,
      sceneCount: 4,
    });
  });

  it("deletes historical project data while preserving global asset library assets", async () => {
    const globalAsset = await request<{
      asset: { id: string; name: string; projectId?: string };
    }>(baseUrl, "/api/assets", {
      method: "POST",
      body: JSON.stringify({
        type: "image",
        name: "Reusable library packshot",
        mimeType: "image/png",
        sizeBytes: 120_000,
        tags: ["library", "hero"],
      }),
    });
    expect(globalAsset.status).toBe(201);
    expect(globalAsset.body.asset.projectId).toBeUndefined();

    const created = await request<{
      project: { id: string };
    }>(baseUrl, "/api/projects", {
      method: "POST",
      body: JSON.stringify({
        title: "Project to delete",
        productName: "GlowGrip Phone Stand",
        audience: "TikTok Shop buyers",
        sellingPoints: ["folds flat"],
        tone: "confident",
        style: "fast desk demo",
        targetDurationSeconds: 15,
      }),
    });
    const projectId = created.body.project.id;

    const projectAsset = await request<{
      asset: { id: string; projectId: string };
    }>(baseUrl, `/api/projects/${projectId}/assets`, {
      method: "POST",
      body: JSON.stringify({
        type: "image",
        name: "Project-only packshot",
        mimeType: "image/png",
        sizeBytes: 200_000,
        tags: ["project-only"],
      }),
    });
    expect(projectAsset.status).toBe(201);
    expect(projectAsset.body.asset.projectId).toBe(projectId);

    const generated = await request<{
      script: { scenes: Array<{ assetId?: string }> };
    }>(baseUrl, `/api/projects/${projectId}/generate-script`, {
      method: "POST",
      body: JSON.stringify({
        assetIds: [globalAsset.body.asset.id],
        materials: [
          {
            assetId: globalAsset.body.asset.id,
            bucketId: "hero",
            name: globalAsset.body.asset.name,
            source: "library",
            tags: ["library", "hero"],
            type: "image",
          },
        ],
      }),
    });
    expect(generated.status).toBe(201);

    const deleted = await request<{
      deletedAssets: Array<{ id: string }>;
      deletedProject: { id: string };
    }>(baseUrl, `/api/projects/${projectId}`, {
      method: "DELETE",
    });

    expect(deleted.status).toBe(200);
    expect(deleted.body.deletedProject.id).toBe(projectId);
    expect(deleted.body.deletedAssets.map((asset) => asset.id)).toEqual([projectAsset.body.asset.id]);

    const loadedProject = await request(baseUrl, `/api/projects/${projectId}`);
    expect(loadedProject.status).toBe(404);

    const history = await request<{ projects: Array<{ id: string }> }>(baseUrl, "/api/projects");
    expect(history.body.projects.map((project) => project.id)).not.toContain(projectId);

    const library = await request<{
      assets: Array<{ id: string; projectId?: string }>;
    }>(baseUrl, "/api/assets?category=all");
    expect(library.body.assets.map((asset) => asset.id)).toContain(globalAsset.body.asset.id);
    expect(library.body.assets.map((asset) => asset.id)).not.toContain(projectAsset.body.asset.id);
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
      script: { hook: string; scenes: Array<{ durationSeconds: number; imageUrl?: string }> };
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
    expect(generated.body.script.scenes.every((scene) => scene.imageUrl)).toBe(true);
    expect(generated.body.script.scenes[0]?.imageUrl).toEqual(
      expect.stringMatching(/^data:image\/svg\+xml,/),
    );

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

  it("passes bound image assets and video keyframes to Seedream storyboard generation", async () => {
    process.env.AI_PROVIDER_MODE = "ark";
    process.env.ARK_API_KEY = "ark-test-key";
    process.env.AI_IMAGE_MODEL_ID = "doubao-seedream-test";
    process.env.ARK_API_BASE_URL = "https://ark.example.test/api/v3";
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const requestUrl = url instanceof Request ? url.url : String(url);
      if (requestUrl.startsWith(baseUrl)) {
        return originalFetch(url, init);
      }

      return Response.json({
        data: [
          {
            url: "https://cdn.example.test/generated-storyboard.png",
          },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const getArkRequestBodies = () =>
      fetchMock.mock.calls
        .filter(([url]) => {
          const requestUrl = url instanceof Request ? url.url : String(url);
          return requestUrl.startsWith("https://ark.example.test");
        })
        .map(([, init]) => JSON.parse(String((init as RequestInit).body)));

    const created = await request<{ project: { id: string } }>(baseUrl, "/api/projects", {
      method: "POST",
      body: JSON.stringify({
        title: "Reference-bound clip",
        productName: "GlowGrip Phone Stand",
        audience: "TikTok Shop buyers",
        sellingPoints: ["folds flat", "keeps shots stable"],
        tone: "confident",
        style: "fast desk demo",
        targetDurationSeconds: 15,
      }),
    });
    const projectId = created.body.project.id;

    const imageAsset = await request<{
      asset: { id: string; url: string };
    }>(baseUrl, `/api/projects/${projectId}/assets`, {
      method: "POST",
      body: JSON.stringify({
        type: "image",
        name: "GlowGrip silver packshot.png",
        mimeType: "image/png",
        sizeBytes: 200_000,
        tags: ["silver", "packshot", "rounded"],
        metadata: {
          appearanceAnchors: {
            color: "银灰色",
            shape: "圆角折叠支架",
            material: "磨砂金属",
            logoText: "无明显 Logo",
          },
        },
      }),
    });

    const imageGenerated = await request<{
      script: { scenes: Array<{ visualPrompt: string; voiceover: string; subtitle: string }> };
    }>(baseUrl, `/api/projects/${projectId}/generate-script`, {
      method: "POST",
      body: JSON.stringify({
        assetIds: [imageAsset.body.asset.id],
        keywords: ["银灰色", "折叠支架"],
      }),
    });

    expect(imageGenerated.status).toBe(201);
    expect(imageGenerated.body.script.scenes[0]?.visualPrompt).toContain("产品外观必须与绑定素材一致");
    expect(imageGenerated.body.script.scenes[0]?.subtitle).toContain("痛点");
    expect(imageGenerated.body.script.scenes[0]?.voiceover).toContain("还在");

    const firstImageBody = getArkRequestBodies()[0];
    expect(firstImageBody.image).toEqual([imageAsset.body.asset.url]);
    expect(firstImageBody.prompt).toContain("【全局硬性规则】");
    expect(firstImageBody.prompt).toContain("【绑定素材】");
    expect(firstImageBody.prompt).toContain("【禁止改变】");
    expect(firstImageBody.prompt).toContain("银灰色");
    expect(firstImageBody.sequential_image_generation).toBe("disabled");

    const videoProject = await request<{ project: { id: string } }>(baseUrl, "/api/projects", {
      method: "POST",
      body: JSON.stringify({
        title: "Video reference clip",
        productName: "GlowGrip Phone Stand",
        audience: "TikTok Shop buyers",
        sellingPoints: ["folds flat"],
        tone: "confident",
        style: "fast desk demo",
        targetDurationSeconds: 15,
      }),
    });
    const videoAsset = await request<{
      asset: { id: string };
    }>(baseUrl, `/api/projects/${videoProject.body.project.id}/assets`, {
      method: "POST",
      body: JSON.stringify({
        type: "video",
        name: "GlowGrip usage demo.mp4",
        mimeType: "video/mp4",
        sizeBytes: 3_000_000,
        tags: ["usage", "demo"],
        metadata: {
          videoReferenceFrames: [
            {
              frameId: "frame-product-closeup",
              timestampSeconds: 1.2,
              imageUrl: "https://cdn.example.test/glowgrip-closeup-frame.png",
              purpose: "product-closeup",
            },
          ],
        },
      }),
    });

    await request(baseUrl, `/api/projects/${videoProject.body.project.id}/generate-script`, {
      method: "POST",
      body: JSON.stringify({
        assetIds: [videoAsset.body.asset.id],
      }),
    });

    const videoBodies = getArkRequestBodies().filter((body) => Array.isArray(body.image));
    expect(videoBodies.at(-1)?.image).toEqual([
      "https://cdn.example.test/glowgrip-closeup-frame.png",
    ]);
  });

  it("uses configured text model settings when one-click rewriting a script", async () => {
    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const requestUrl = url instanceof Request ? url.url : String(url);
      if (requestUrl.startsWith(baseUrl)) {
        return originalFetch(url, init);
      }

      return Response.json({
        choices: [
          {
            message: {
              content: "| 时间 | 旁白 | 字幕 | 画面 |\n|---|---|---|---|\n| 0-3s | 测试旁白 | 测试字幕 | 测试画面，产品外观必须与用户素材一致 |",
            },
          },
        ],
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const created = await request<{ project: { id: string } }>(baseUrl, "/api/projects", {
      method: "POST",
      body: JSON.stringify({
        title: "One click script",
        productName: "小猫水杯",
        audience: "通勤女生",
        sellingPoints: ["小包可放", "防漏"],
        tone: "轻快",
        style: "电商短视频",
        targetDurationSeconds: 15,
      }),
    });
    const asset = await request<{ asset: { id: string } }>(
      baseUrl,
      `/api/projects/${created.body.project.id}/assets`,
      {
        method: "POST",
        body: JSON.stringify({
          type: "image",
          name: "小猫水杯主图",
          mimeType: "image/png",
          sizeBytes: 200_000,
          tags: ["pink", "cup"],
        }),
      },
    );

    const rewritten = await request<{
      fallback: { used: boolean; provider: string };
      scriptText: string;
    }>(baseUrl, `/api/projects/${created.body.project.id}/rewrite-script`, {
      method: "POST",
      body: JSON.stringify({
        assetIds: [asset.body.asset.id],
        draftScript: "强调小包装得下和通勤防漏。",
        keywords: ["便携", "防漏"],
        materials: [
          {
            assetId: asset.body.asset.id,
            name: "小猫水杯主图",
            type: "image",
          },
        ],
        apiConfig: {
          general: {
            provider: "openai-compatible",
            apiBaseUrl: "https://api.example.test/v1",
            model: "custom-text-model",
            apiKey: "user-api-key",
          },
        },
      }),
    });

    expect(rewritten.status).toBe(201);
    expect(rewritten.body.fallback.used).toBe(false);
    expect(rewritten.body.scriptText).toContain("测试旁白");
    const externalCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url instanceof Request ? url.url : url).startsWith("https://api.example.test"),
    );
    expect(externalCalls).toHaveLength(1);
    const body = JSON.parse(String((externalCalls[0]?.[1] as RequestInit).body));
    expect(body.messages[1].content).toContain("产品：小猫水杯");
    expect(body.messages[1].content).toContain("目标人群：通勤女生");
    expect(body.messages[1].content).toContain("已准备素材：小猫水杯主图");
    expect(body.messages[1].content).toContain("关键词：便携、防漏");
    expect(body.messages[1].content).toContain("用户草稿：强调小包装得下和通勤防漏。");
  });

  it("uses official server text settings when one-click rewriting receives no browser API key", async () => {
    process.env.AI_PROVIDER_MODE = "mock";
    process.env.ARK_API_KEY = "ark-fallback-key";
    process.env.AI_GENERAL_API_KEY = "general-api-key";
    process.env.AI_GENERAL_MODEL_ID = "ep-general-script";
    process.env.ARK_API_BASE_URL = "https://ark.example.test/api/v3";
    delete process.env.AI_TEXT_MODEL_ID;

    const originalFetch = globalThis.fetch;
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const requestUrl = url instanceof Request ? url.url : String(url);
      if (requestUrl.startsWith(baseUrl)) {
        return originalFetch(url, init);
      }

      return Response.json({
        output_text:
          "| Time | Voiceover | Subtitle | Visual |\n|---|---|---|---|\n| 0-3s | Server model line | Server subtitle | Keep product appearance consistent with user assets |",
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const created = await request<{ project: { id: string } }>(baseUrl, "/api/projects", {
      method: "POST",
      body: JSON.stringify({
        title: "Official one click script",
        productName: "Fold Stand",
        audience: "desk workers",
        sellingPoints: ["folds flat", "stable shots"],
        tone: "clear",
        style: "desk demo",
        targetDurationSeconds: 15,
      }),
    });
    const asset = await request<{ asset: { id: string } }>(
      baseUrl,
      `/api/projects/${created.body.project.id}/assets`,
      {
        method: "POST",
        body: JSON.stringify({
          type: "image",
          name: "Fold Stand packshot",
          mimeType: "image/png",
          sizeBytes: 200_000,
          tags: ["stand"],
        }),
      },
    );

    const rewritten = await request<{
      fallback: { used: boolean; provider: string };
      scriptText: string;
    }>(baseUrl, `/api/projects/${created.body.project.id}/rewrite-script`, {
      method: "POST",
      body: JSON.stringify({
        assetIds: [asset.body.asset.id],
        draftScript: "Show desk portability.",
        keywords: ["portable", "stable"],
        materials: [
          {
            assetId: asset.body.asset.id,
            name: "Fold Stand packshot",
            type: "image",
          },
        ],
        apiConfig: {
          general: {
            credentialSource: "official",
            provider: "volcengine-ark",
          },
        },
      }),
    });

    expect(rewritten.status).toBe(201);
    expect(rewritten.body.fallback.used).toBe(false);
    expect(rewritten.body.scriptText).toContain("Server model line");
    const externalCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url instanceof Request ? url.url : url).startsWith("https://ark.example.test"),
    );
    expect(externalCalls).toHaveLength(1);
    const body = JSON.parse(String((externalCalls[0]?.[1] as RequestInit).body));
    expect(body.model).toBe("ep-general-script");
    expect(body.input[1].content[0].text).toContain("产品：Fold Stand");
    expect(externalCalls[0]?.[1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({
          authorization: "Bearer general-api-key",
        }),
      }),
    );
  });

  it("structures storyboard scene fields from the current script draft table", async () => {
    const created = await request<{ project: { id: string } }>(baseUrl, "/api/projects", {
      method: "POST",
      body: JSON.stringify({
        title: "Cup launch clip",
        productName: "小猫水杯",
        audience: "通勤女生",
        sellingPoints: ["小包可放", "防漏"],
        tone: "轻快",
        style: "电商短视频",
        targetDurationSeconds: 15,
      }),
    });
    const asset = await request<{ asset: { id: string } }>(
      baseUrl,
      `/api/projects/${created.body.project.id}/assets`,
      {
        method: "POST",
        body: JSON.stringify({
          type: "image",
          name: "小猫水杯主图",
          mimeType: "image/png",
          sizeBytes: 200_000,
          tags: ["product"],
        }),
      },
    );

    const generated = await request<{
      script: {
        narrative: string;
        scenes: Array<{
          durationSeconds: number;
          subtitle: string;
          voiceover: string;
          visualPrompt: string;
        }>;
      };
    }>(baseUrl, `/api/projects/${created.body.project.id}/generate-script`, {
      method: "POST",
      body: JSON.stringify({
        assetIds: [asset.body.asset.id],
        draftScript: [
          "| 时间 | 旁白 | 字幕 | 画面 |",
          "|---|---|---|---|",
          "| 0-3s | 小包塞不下水杯？ | 小包塞不下？ | 手拿小包和小猫水杯做尺寸对比 |",
          "| 3-7s | 这只小猫水杯轻松放进口袋 | 轻松塞进口袋 | 展示水杯放入随身小包 |",
          "| 7-11s | 防漏防滑，通勤更安心 | 防漏防滑 | 近景展示杯盖和防漏结构 |",
        ].join("\n"),
      }),
    });

    expect(generated.status).toBe(201);
    expect(generated.body.script.narrative).toContain("小包塞不下水杯");
    expect(generated.body.script.scenes).toHaveLength(3);
    expect(generated.body.script.scenes[0]).toMatchObject({
      durationSeconds: 3,
      subtitle: "小包塞不下？",
      voiceover: "小包塞不下水杯？",
    });
    expect(generated.body.script.scenes[0]?.visualPrompt).toContain(
      "手拿小包和小猫水杯做尺寸对比",
    );
    expect(generated.body.script.scenes[1]).toMatchObject({
      durationSeconds: 4,
      subtitle: "轻松塞进口袋",
      voiceover: "这只小猫水杯轻松放进口袋",
    });
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
          imageUrl?: string;
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
    expect(generated.body.script.scenes.map((scene) => scene.imageUrl)).toHaveLength(4);
    expect(generated.body.script.scenes.every((scene) => scene.imageUrl)).toBe(true);

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
      scene: { id: string; imageUrl?: string; status: string; subtitle: string };
      traceEvent: { step: string; status: string };
    }>(baseUrl, `/api/scenes/${secondScene!.id}/regenerate`, {
      method: "POST",
    });

    expect(regenerated.status).toBe(200);
    expect(regenerated.body.scene).toMatchObject({
      id: secondScene!.id,
      status: "generated",
    });
    expect(regenerated.body.scene.subtitle).toContain("重生成：");
    expect(regenerated.body.scene.imageUrl).toEqual(expect.stringMatching(/^data:image\/svg\+xml,/));
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
    expect(loadedSecondScene?.subtitle).toContain("重生成：");
    expect(untouchedScenes.map((scene) => scene.subtitle)).toEqual([
      "证明核心卖点",
      "行动号召",
    ]);
  });
});
