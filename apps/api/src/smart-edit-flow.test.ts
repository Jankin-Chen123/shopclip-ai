import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import type {
  AssetMetadata,
  RenderTask,
  SmartEditPlan,
  SmartEditSegmentOutput,
  StoryboardScene,
  TraceEvent,
} from "@shopclip/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createApp } from "./app.js";

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

  return {
    body: (await response.json()) as T,
    status: response.status,
  };
};

const planFromScenes = (
  projectId: string,
  scenes: StoryboardScene[],
  assetId: string,
): SmartEditPlan => ({
  id: `plan-${projectId}-${scenes.map((scene) => scene.id).join("-")}`,
  audio: {
    bgmTrack: "creator-pop",
    targetLanguage: "zh-CN",
    voice: "clear-host",
  },
  createdAt: "2026-06-02T00:00:00.000Z",
  projectId,
  segments: scenes.map((scene, index) => ({
    id: `segment-${scene.id}`,
    assetTags: ["hero", "demo"],
    durationSeconds: Math.max(4, Math.min(12, scene.durationSeconds)),
    enabled: true,
    order: index + 1,
    rationale: "Planner selected the scene-linked asset.",
    sceneId: scene.id,
    source: {
      assetId,
      imageUrl: "https://cdn.example.test/hero.png",
      kind: "image-asset",
    },
    subtitle: scene.subtitle,
    transition: index === 0 ? "cut" : "fade",
    voiceover: scene.voiceover,
  })),
  strategy: "Use real smart edit route planning and ffmpeg composition.",
  targetDurationSeconds: scenes.reduce(
    (sum, scene) => sum + Math.max(4, Math.min(12, scene.durationSeconds)),
    0,
  ),
});

interface RenderSnapshot {
  renderTask: RenderTask;
  traceEvents: TraceEvent[];
}

const waitForRenderTask = async (
  baseUrl: string,
  renderTaskId: string,
): Promise<RenderSnapshot> => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const polled = await request<RenderSnapshot>(baseUrl, `/api/render-tasks/${renderTaskId}`);
    if (["completed", "failed"].includes(polled.body.renderTask.status)) {
      return polled.body;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error(`Render task ${renderTaskId} did not finish.`);
};

describe("smart edit API flow", () => {
  let baseUrl = "";
  let server: Server | undefined;

  beforeEach(async () => {
    vi.stubEnv("AI_PROVIDER_MODE", "mock");
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    if (server) {
      await new Promise<void>((resolve) => server?.close(() => resolve()));
      server = undefined;
    }
  });

  it("creates a full smart edit asynchronously and refreshes one scene by reusing existing segment outputs", async () => {
    const plannerCalls: Array<{ scenes: StoryboardScene[] }> = [];
    const composerPlans: SmartEditPlan[] = [];
    const app = createApp({
      smartEditPlanner: async ({ assets, project, request: smartEditRequest, scenes }) => {
        plannerCalls.push({ scenes });
        const assetId = assets[0]?.id ?? "asset-fallback";
        const overrides = new Map(
          smartEditRequest.segments.map((segment) => [segment.sceneId, segment]),
        );
        const plan = planFromScenes(project.id, scenes, assetId);
        return {
          fallback: {
            provider: "test-smart-edit-planner",
            used: false,
          },
          plan: {
            ...plan,
            segments: plan.segments.map((segment) => ({
              ...segment,
              ...overrides.get(segment.sceneId),
              source: overrides.get(segment.sceneId)?.source ?? segment.source,
            })),
          },
        };
      },
      smartEditComposer: async (projectId, plan) => {
        composerPlans.push(plan);
        return {
          exportId: `export-${composerPlans.length}`,
          localUrl: `/api/render-exports/${projectId}/export-${composerPlans.length}/export.mp4`,
          objectKey: `projects/${projectId}/smart-edits/export-${composerPlans.length}/export.mp4`,
          outputPath: `/tmp/export-${composerPlans.length}.mp4`,
          publicUrl: `https://storage.example.test/${projectId}/export-${composerPlans.length}.mp4`,
          segmentOutputs: plan.segments
            .filter((segment) => segment.enabled)
            .map((segment) => ({
              objectKey: `projects/${projectId}/smart-edits/export-${composerPlans.length}/segments/${segment.id}.mp4`,
              outputPath: `/tmp/${segment.id}.mp4`,
              publicUrl: `https://storage.example.test/${projectId}/segments/${segment.id}.mp4`,
              sceneId: segment.sceneId,
              segmentId: segment.id,
            })),
        };
      },
    });

    server = app.listen(0);
    await new Promise<void>((resolve) => server?.once("listening", () => resolve()));
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;

    const created = await request<{ project: { id: string } }>(baseUrl, "/api/projects", {
      method: "POST",
      body: JSON.stringify({
        title: "Smart edit launch",
        productName: "Cat Cup",
        audience: "TikTok Shop cup lovers",
        sellingPoints: ["cute print", "leak proof"],
        tone: "energetic",
        style: "fast demo",
        targetDurationSeconds: 12,
      }),
    });
    expect(created.status).toBe(201);

    const asset = await request<{ asset: AssetMetadata }>(
      baseUrl,
      `/api/projects/${created.body.project.id}/assets`,
      {
        method: "POST",
        body: JSON.stringify({
          type: "image",
          name: "hero.png",
          mimeType: "image/png",
          sizeBytes: 64,
          tags: ["hero"],
          url: "https://cdn.example.test/hero.png",
        }),
      },
    );
    expect(asset.status).toBe(201);

    const generated = await request<{ script: { scenes: StoryboardScene[] } }>(
      baseUrl,
      `/api/projects/${created.body.project.id}/generate-script`,
      {
        method: "POST",
        body: JSON.stringify({
          assetIds: [asset.body.asset.id],
          keywords: ["cute", "leak proof"],
          materials: [],
        }),
      },
    );
    expect(generated.status).toBe(201);
    expect(generated.body.script.scenes.length).toBeGreaterThan(1);

    const fullEdit = await request<RenderSnapshot>(
      baseUrl,
      `/api/projects/${created.body.project.id}/smart-edit`,
      {
        method: "POST",
        body: JSON.stringify({
          locale: "zh-CN",
          targetLanguage: "zh-CN",
        }),
      },
    );
    expect(fullEdit.status).toBe(202);
    expect(fullEdit.body.renderTask.status).toBe("queued");

    const completedFullEdit = await waitForRenderTask(baseUrl, fullEdit.body.renderTask.id);
    expect(completedFullEdit.renderTask.status).toBe("completed");
    expect(completedFullEdit.renderTask.exportUrl).toContain("/export-1.mp4");
    expect(completedFullEdit.renderTask.smartEditPlan).toBeDefined();
    expect(completedFullEdit.renderTask.smartEditSegmentOutputs).toHaveLength(
      generated.body.script.scenes.length,
    );
    expect(
      completedFullEdit.traceEvents.some((event) => event.step === "smart-edit-plan-model"),
    ).toBe(true);
    expect(plannerCalls[0]?.scenes).toHaveLength(generated.body.script.scenes.length);

    const sceneToRefresh = generated.body.script.scenes[1]!;
    const currentPlanForRefresh = {
      ...completedFullEdit.renderTask.smartEditPlan!,
      segments: completedFullEdit.renderTask.smartEditPlan!.segments.map((segment, index) =>
        index === 0
          ? {
              ...segment,
              subtitle: "????????",
              voiceover: "????????",
            }
          : segment,
      ),
    };
    const refreshed = await request<RenderSnapshot>(
      baseUrl,
      `/api/projects/${created.body.project.id}/smart-edit/segments/${sceneToRefresh.id}/refresh`,
      {
        method: "POST",
        body: JSON.stringify({
          currentPlan: currentPlanForRefresh,
          segmentOutputs: completedFullEdit.renderTask
            .smartEditSegmentOutputs as SmartEditSegmentOutput[],
          segment: {
            sceneId: sceneToRefresh.id,
            subtitle: "Refreshed single-scene copy",
            transition: "crossfade",
          },
          locale: "zh-CN",
          targetLanguage: "zh-CN",
        }),
      },
    );
    expect(refreshed.status, JSON.stringify(refreshed.body)).toBe(202);

    const completedRefresh = await waitForRenderTask(baseUrl, refreshed.body.renderTask.id);
    expect(completedRefresh.renderTask.status).toBe("completed");
    expect(completedRefresh.renderTask.exportUrl).toContain("/export-2.mp4");
    expect(completedRefresh.renderTask.smartEditPlan?.segments[1]?.subtitle).toBe(
      "Refreshed single-scene copy",
    );
    expect(completedRefresh.renderTask.smartEditPlan?.segments[0]?.subtitle).toBe(
      generated.body.script.scenes[0]?.subtitle,
    );
    expect(plannerCalls[1]?.scenes).toHaveLength(1);
    expect(plannerCalls[1]?.scenes[0]?.id).toBe(sceneToRefresh.id);

    const refreshComposerPlan = composerPlans[1]!;
    expect(
      refreshComposerPlan.segments
        .filter((segment) => segment.sceneId !== sceneToRefresh.id)
        .every((segment) => segment.source.kind === "generated-scene-clip"),
    ).toBe(true);
    expect(
      refreshComposerPlan.segments.find((segment) => segment.sceneId === sceneToRefresh.id)?.source
        .kind,
    ).toBe("image-asset");
  });
});
