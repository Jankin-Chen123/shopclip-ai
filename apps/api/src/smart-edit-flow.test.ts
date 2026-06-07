import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import type {
  AssetMetadata,
  RenderTask,
  SceneRenderClip,
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
        index === 0 || index === 2
          ? {
              ...segment,
              subtitle: index === 0 ? "????????" : "ins???????,?????????",
              voiceover: index === 0 ? "????????" : "ins???????,?????????",
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
    expect(completedRefresh.renderTask.smartEditPlan?.segments[2]?.subtitle).toBe(
      generated.body.script.scenes[2]?.subtitle,
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

  it("recomposes an existing smart edit currentPlan without replanning or dropping timeline edits", async () => {
    const plannerCalls: unknown[] = [];
    const composerPlans: SmartEditPlan[] = [];
    const app = createApp({
      smartEditPlanner: async (input) => {
        plannerCalls.push(input);
        return {
          fallback: {
            provider: "unexpected-planner",
            used: false,
          },
          plan: planFromScenes(input.project.id, input.scenes, input.assets[0]?.id ?? "asset-fallback"),
        };
      },
      smartEditComposer: async (projectId, plan) => {
        composerPlans.push(plan);
        return {
          exportId: "export-current-plan",
          localUrl: `/api/render-exports/${projectId}/export-current-plan/export.mp4`,
          objectKey: `projects/${projectId}/smart-edits/export-current-plan/export.mp4`,
          outputPath: "/tmp/export-current-plan.mp4",
          publicUrl: `https://storage.example.test/${projectId}/export-current-plan.mp4`,
          segmentOutputs: plan.segments
            .filter((segment) => segment.enabled)
            .map((segment) => ({
              objectKey: `projects/${projectId}/smart-edits/export-current-plan/segments/${segment.id}.mp4`,
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
        title: "Current plan smart edit",
        productName: "Desk Lamp",
        audience: "home office buyers",
        sellingPoints: ["soft light"],
        tone: "calm",
        style: "clean demo",
        targetDurationSeconds: 8,
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
          name: "lamp.png",
          mimeType: "image/png",
          sizeBytes: 64,
          tags: ["hero"],
          url: "https://cdn.example.test/lamp.png",
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
          keywords: ["soft light"],
          materials: [],
        }),
      },
    );
    expect(generated.status).toBe(201);

    const currentPlan = planFromScenes(
      created.body.project.id,
      generated.body.script.scenes.slice(0, 1),
      asset.body.asset.id,
    );
    currentPlan.timeline = {
      durationSeconds: currentPlan.segments[0]!.durationSeconds,
      scale: 1,
      tracks: [
        { hidden: false, id: "video-main", kind: "video", label: "Video", locked: false, muted: false },
        { hidden: false, id: "text-copy", kind: "text", label: "Text", locked: false, muted: false },
      ],
      elements: [
        {
          detachedAudio: false,
          durationSeconds: currentPlan.segments[0]!.durationSeconds,
          hidden: false,
          id: "current-plan-video",
          kind: "video",
          label: "Current plan video",
          muted: false,
          playbackRate: 1,
          sceneId: currentPlan.segments[0]!.sceneId,
          segmentId: currentPlan.segments[0]!.id,
          sourceUrl: "https://cdn.example.test/lamp.png",
          startSecond: 0,
          trackId: "video-main",
          trimStartSecond: 0,
        },
        {
          detachedAudio: false,
          durationSeconds: 2,
          hidden: false,
          id: "current-plan-edited-text",
          kind: "text",
          label: "Edited caption",
          muted: false,
          playbackRate: 1,
          sceneId: currentPlan.segments[0]!.sceneId,
          startSecond: 1,
          text: "Edited caption",
          trackId: "text-copy",
        },
      ],
    };

    const smartEdit = await request<RenderSnapshot>(
      baseUrl,
      `/api/projects/${created.body.project.id}/smart-edit`,
      {
        method: "POST",
        body: JSON.stringify({
          currentPlan,
          locale: "zh-CN",
          targetLanguage: "zh-CN",
        }),
      },
    );
    expect(smartEdit.status).toBe(202);

    const completed = await waitForRenderTask(baseUrl, smartEdit.body.renderTask.id);
    expect(completed.renderTask.status).toBe("completed");
    expect(plannerCalls).toHaveLength(0);
    expect(composerPlans).toHaveLength(1);
    expect(
      composerPlans[0]?.timeline?.elements.some((element) => element.id === "current-plan-edited-text"),
    ).toBe(true);
    expect(completed.traceEvents.some((event) => event.step === "smart-edit-plan-current")).toBe(true);
  });

  it("applies the latest materialized Seedance scene clips before smart edit composition", async () => {
    vi.stubEnv("VIDEO_RENDER_PROVIDER_MODE", "seedance");
    vi.stubEnv("AI_VIDEO_API_KEY", "video-key");
    vi.stubEnv("AI_VIDEO_MODEL_ID", "ep-seedance-render");
    vi.stubEnv("ARK_API_BASE_URL", "https://ark.example.test/api/v3");

    const composedUrl = "https://storage.example.test/fresh-materials/export.mp4";
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
            audioWaveform: {
              bucketDurationSeconds: 0.5,
              buckets: [{ durationSeconds: 0.5, index: 0, peak: 0.7, rms: 0.3, startSecond: 0 }],
              durationSeconds: 4,
              sampleRate: 8000,
            },
            materializedAt: "2026-06-06T00:00:00.000Z",
            status: "ready" as const,
            text: clip.subtitle,
            videoOnlyUrl: `https://cdn.example.test/${renderTaskId}/scene-${clip.order}/video-only.mp4`,
          },
        })),
    );
    const composerPlans: SmartEditPlan[] = [];
    const app = createApp({
      renderExportPublisher,
      sceneClipMaterializer,
      smartEditPlanner: async ({ project, scenes }) => ({
        fallback: {
          provider: "test-smart-edit-planner",
          used: false,
        },
        plan: {
          id: "plan-with-expired-scene-urls",
          audio: {
            bgmTrack: "creator-pop",
            targetLanguage: "zh-CN",
            voice: "clear-host",
          },
          createdAt: "2026-06-06T00:00:00.000Z",
          projectId: project.id,
          segments: scenes.map((scene, index) => ({
            id: `segment-${scene.id}`,
            assetTags: [],
            durationSeconds: 4,
            enabled: true,
            order: index + 1,
            rationale: "Planner returned an expired provider URL.",
            sceneId: scene.id,
            sourceAudioMuted: true,
            sourceAudioVolume: 0,
            source: {
              imageUrl: "https://cdn.example.test/stable-image.png",
              kind: "generated-scene-clip" as const,
              sceneClipUrl: `https://expired.example.test/scene-${index + 1}.mp4`,
              startSecond: 0,
              endSecond: 4,
            },
            subtitle: scene.subtitle,
            transition: index === 0 ? "cut" : "fade",
            voiceover: scene.voiceover,
          })),
          strategy: "Return expired URLs so the router must bridge fresh scene materials.",
          targetDurationSeconds: scenes.length * 4,
        },
      }),
      smartEditComposer: async (projectId, plan) => {
        composerPlans.push(plan);
        return {
          exportId: "fresh-materials-export",
          localUrl: `/api/render-exports/${projectId}/fresh-materials-export/export.mp4`,
          objectKey: `projects/${projectId}/smart-edits/fresh-materials-export/export.mp4`,
          outputPath: "/tmp/fresh-materials-export.mp4",
          publicUrl: composedUrl,
          segmentOutputs: plan.segments
            .filter((segment) => segment.enabled)
            .map((segment) => ({
              objectKey: `projects/${projectId}/smart-edits/fresh-materials-export/segments/${segment.id}.mp4`,
              outputPath: `/tmp/${segment.id}.mp4`,
              publicUrl: `https://storage.example.test/${segment.id}.mp4`,
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
        content: {
          video_url: `https://cdn.example.test/${taskId}.mp4`,
        },
        status: "succeeded",
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const created = await request<{ project: { id: string } }>(baseUrl, "/api/projects", {
      method: "POST",
      body: JSON.stringify({
        title: "Fresh material smart edit",
        productName: "Cat Cup",
        audience: "TikTok Shop cup lovers",
        sellingPoints: ["cute print", "straw lid"],
        tone: "energetic",
        style: "fast demo",
        targetDurationSeconds: 12,
      }),
    });
    expect(created.status).toBe(201);

    const generated = await request<{ script: { scenes: Array<{ id: string }> } }>(
      baseUrl,
      `/api/projects/${created.body.project.id}/generate-script`,
      {
        method: "POST",
        body: JSON.stringify({}),
      },
    );
    expect(generated.status).toBe(201);
    await makeScenesRenderable(baseUrl, generated.body.script.scenes, 4);

    const render = await request<{ renderTask: { id: string } }>(
      baseUrl,
      `/api/projects/${created.body.project.id}/render`,
      {
        method: "POST",
        body: JSON.stringify({}),
      },
    );
    expect(render.status).toBe(201);

    const completedRender = await waitForRenderTask(baseUrl, render.body.renderTask.id);
    expect(completedRender.renderTask.status).toBe("completed");
    expect(completedRender.traceEvents.map((event) => event.step)).toContain(
      "scene-clip-materialize",
    );
    const seedanceCreateBodies = fetchMock.mock.calls
      .filter(([url]) => String(url).endsWith("/contents/generations/tasks"))
      .map(([, init]) => JSON.parse(String((init as RequestInit | undefined)?.body)));
    expect(seedanceCreateBodies.length).toBeGreaterThan(0);
    expect(seedanceCreateBodies.every((body) => body.generate_audio === true)).toBe(true);

    const smartEdit = await request<RenderSnapshot>(
      baseUrl,
      `/api/projects/${created.body.project.id}/smart-edit`,
      {
        method: "POST",
        body: JSON.stringify({}),
      },
    );
    expect(smartEdit.status).toBe(202);

    const completedSmartEdit = await waitForRenderTask(baseUrl, smartEdit.body.renderTask.id);
    expect(completedSmartEdit.renderTask.status).toBe("completed");
    expect(completedSmartEdit.traceEvents.map((event) => event.step)).toContain(
      "smart-edit-scene-materials-applied",
    );
    const composedPlan = composerPlans[0]!;
    expect(
      composedPlan.segments.every((segment) =>
        segment.source.sceneClipVideoOnlyUrl?.includes(render.body.renderTask.id),
      ),
    ).toBe(true);
    expect(
      composedPlan.segments.every((segment) =>
        segment.source.sceneClipAudioUrl?.includes(render.body.renderTask.id),
      ),
    ).toBe(true);
    expect(composedPlan.segments.every((segment) => segment.sourceAudioMuted === false)).toBe(
      true,
    );
    expect(
      composedPlan.timeline?.elements
        .filter((element) => element.trackId === "video-main")
        .every((element) => element.sourceUrl?.includes("/video-only.mp4")),
    ).toBe(true);
    expect(
      composedPlan.timeline?.elements.some((element) => element.trackId === "audio-source"),
    ).toBe(true);

    const staleCurrentPlan: SmartEditPlan = {
      ...composedPlan,
      id: "stale-current-plan",
      segments: composedPlan.segments.map((segment) => ({
        ...segment,
        source: {
          ...segment.source,
          sceneClipAudioUrl: "https://expired.example.test/audio.m4a",
          sceneClipUrl: "https://expired.example.test/scene.mp4",
          sceneClipVideoOnlyUrl: "https://expired.example.test/video-only.mp4",
        },
      })),
      timeline: composedPlan.timeline
        ? {
            ...composedPlan.timeline,
            elements: composedPlan.timeline.elements.map((element) =>
              element.trackId === "video-main" || element.trackId === "audio-source"
                ? {
                    ...element,
                    durationSeconds: Math.max(1, element.durationSeconds - 0.5),
                    playbackRate: element.trackId === "video-main" ? 1.5 : element.playbackRate,
                    startSecond: element.startSecond + 0.25,
                    sourceUrl: `https://expired.example.test/${element.id}`,
                    trimStartSecond: (element.trimStartSecond ?? 0) + 0.5,
                  }
                : element.trackId === "text-copy"
                  ? {
                      ...element,
                      durationSeconds: Math.max(1, element.durationSeconds - 0.25),
                      startSecond: element.startSecond + 0.5,
                      text: "Edited timeline caption",
                    }
                  : element,
            ),
          }
        : undefined,
    };
    const recomposed = await request<RenderSnapshot>(
      baseUrl,
      `/api/projects/${created.body.project.id}/smart-edit`,
      {
        method: "POST",
        body: JSON.stringify({ currentPlan: staleCurrentPlan }),
      },
    );
    expect(recomposed.status).toBe(202);

    const completedRecompose = await waitForRenderTask(baseUrl, recomposed.body.renderTask.id);
    expect(completedRecompose.renderTask.status).toBe("completed");
    const recomposedPlan = composerPlans[1]!;
    expect(
      recomposedPlan.timeline?.elements
        .filter((element) => element.trackId === "video-main")
        .every((element) => element.sourceUrl?.includes(render.body.renderTask.id)),
    ).toBe(true);
    expect(
      recomposedPlan.timeline?.elements
        .filter((element) => element.trackId === "audio-source")
        .every((element) => element.sourceUrl?.includes(render.body.renderTask.id)),
    ).toBe(true);
    expect(
      recomposedPlan.timeline?.elements
        .filter((element) => element.trackId === "video-main")
        .every(
          (element) =>
            element.startSecond >= 0.25 &&
            element.playbackRate === 1.5 &&
            element.trimStartSecond === 0.5,
        ),
    ).toBe(true);
    expect(
      recomposedPlan.timeline?.elements.some(
        (element) => element.trackId === "text-copy" && element.text === "Edited timeline caption",
      ),
    ).toBe(true);
  });
});
