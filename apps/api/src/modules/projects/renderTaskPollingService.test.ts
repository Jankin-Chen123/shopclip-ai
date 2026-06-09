import { describe, expect, it, vi } from "vitest";
import type { RenderTask, SceneRenderClip, TraceEvent } from "@shopclip/shared";

import type { StorageProvider } from "../../providers/storage/storageProvider.js";
import type { ProjectSnapshot, ProjectStore } from "./projectStore.js";
import {
  isActiveSeedanceRenderTask,
  materializeCompletedSceneClips,
  pollActiveSeedanceRenderTask,
  refreshCompletedRenderMaterials,
} from "./renderTaskPollingService.js";

const now = "2026-06-09T00:00:00.000Z";

const clip = (overrides: Partial<SceneRenderClip> = {}): SceneRenderClip => ({
  order: 1,
  progress: 100,
  sceneId: "scene-1",
  status: "completed",
  subtitle: "Hook",
  videoUrl: "https://cdn.example.test/scene-1.mp4",
  ...overrides,
});

const renderTask = (overrides: Partial<RenderTask> = {}): RenderTask => ({
  id: "render-1",
  projectId: "project-1",
  provider: "volcengine-seedance",
  progress: 80,
  status: "running",
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

const project = (overrides: Partial<ProjectSnapshot> = {}): ProjectSnapshot =>
  ({
    id: "project-1",
    title: "Demo",
    productName: "Demo",
    audience: "buyers",
    sellingPoints: ["fast"],
    tone: "direct",
    style: "demo",
    targetDurationSeconds: 15,
    prepKeywords: [],
    status: "ready",
    createdAt: now,
    updatedAt: now,
    assets: [],
    assetSlices: [],
    assetProcessingEvents: [],
    assetProcessingJobs: [],
    referenceVideos: [],
    viralTemplates: [],
    scripts: [],
    scenes: [],
    renderTasks: [],
    ...overrides,
  }) as ProjectSnapshot;

const snapshot = (task: RenderTask = renderTask()) => ({
  project: project(),
  renderTask: task,
  traceEvents: [],
});

const storageProvider = {} as StorageProvider;

describe("render task polling service", () => {
  it("detects active Seedance render statuses", () => {
    expect(isActiveSeedanceRenderTask(renderTask({ status: "queued" }))).toBe(true);
    expect(isActiveSeedanceRenderTask(renderTask({ status: "retrying" }))).toBe(true);
    expect(isActiveSeedanceRenderTask(renderTask({ status: "completed" }))).toBe(false);
    expect(isActiveSeedanceRenderTask(renderTask({ provider: "mock-renderer" }))).toBe(false);
  });

  it("skips materialization when completed clips already have materials", async () => {
    const sceneClipMaterializer = vi.fn();

    const result = await materializeCompletedSceneClips({
      projectId: "project-1",
      renderTaskId: "render-1",
      sceneClipMaterializer,
      sceneClips: [
        clip({
          material: {
            materializedAt: now,
            status: "ready",
            text: "Hook",
            videoOnlyUrl: "https://cdn.example.test/video-only.mp4",
          },
        }),
      ],
      storageProvider,
    });

    expect(sceneClipMaterializer).not.toHaveBeenCalled();
    expect(result.traceEvents).toEqual([]);
  });

  it("materializes missing completed clip materials and reports partial failures", async () => {
    const sceneClipMaterializer = vi.fn().mockResolvedValue([
      clip({
        material: {
          materializedAt: now,
          status: "ready",
          text: "Hook",
          videoOnlyUrl: "https://cdn.example.test/video-only.mp4",
        },
      }),
      clip({
        order: 2,
        sceneId: "scene-2",
        material: {
          errorMessage: "audio split failed",
          materializedAt: now,
          status: "failed",
          text: "",
        },
      }),
    ]);

    const result = await materializeCompletedSceneClips({
      projectId: "project-1",
      renderTaskId: "render-1",
      sceneClipMaterializer,
      sceneClips: [clip(), clip({ order: 2, sceneId: "scene-2" })],
      storageProvider,
    });

    expect(sceneClipMaterializer).toHaveBeenCalledOnce();
    expect(result.sceneClips).toHaveLength(2);
    expect(result.traceEvents).toEqual([
      expect.objectContaining({
        status: "retrying",
        step: "scene-clip-materialize-partial",
      }),
    ]);
  });

  it("stores refreshed materials for a completed Seedance render", async () => {
    const updateRenderTask = vi.fn().mockResolvedValue({
      renderTask: renderTask({ sceneClips: [clip()] }),
      traceEvents: [] as TraceEvent[],
    });
    const store = { updateRenderTask } as unknown as ProjectStore;
    const sceneClipMaterializer = vi.fn().mockResolvedValue([
      clip({
        material: {
          materializedAt: now,
          status: "ready",
          text: "Hook",
          videoOnlyUrl: "https://cdn.example.test/video-only.mp4",
        },
      }),
    ]);

    await refreshCompletedRenderMaterials({
      renderTask: snapshot(renderTask({ progress: 100, sceneClips: [clip()], status: "completed" })),
      sceneClipMaterializer,
      storageProvider,
      store,
    });

    expect(updateRenderTask).toHaveBeenCalledWith(
      "render-1",
      { sceneClips: expect.arrayContaining([expect.objectContaining({ sceneId: "scene-1" })]) },
      [expect.objectContaining({ step: "scene-clip-materialize" })],
    );
  });

  it("publishes and materializes completed provider results during polling", async () => {
    const updateRenderTask = vi.fn().mockResolvedValue({
      renderTask: renderTask({ status: "completed" }),
      traceEvents: [] as TraceEvent[],
    });
    const store = { updateRenderTask } as unknown as ProjectStore;
    const sceneClipMaterializer = vi.fn().mockResolvedValue([
      clip({
        material: {
          materializedAt: now,
          status: "ready",
          text: "Hook",
          videoOnlyUrl: "https://cdn.example.test/video-only.mp4",
        },
      }),
    ]);

    await pollActiveSeedanceRenderTask({
      loadRenderTask: vi.fn().mockResolvedValue({
        renderTask: { progress: 100, sceneClips: [clip()], status: "completed" },
        traceEvents: [],
      }),
      publishRenderExport: vi.fn().mockResolvedValue("https://cdn.example.test/export.mp4"),
      renderTask: snapshot(),
      sceneClipMaterializer,
      storageProvider,
      store,
    });

    expect(updateRenderTask).toHaveBeenCalledWith(
      "render-1",
      expect.objectContaining({
        exportUrl: "https://cdn.example.test/export.mp4",
        status: "completed",
      }),
      expect.arrayContaining([
        expect.objectContaining({ step: "render-export-published" }),
        expect.objectContaining({ step: "scene-clip-materialize" }),
      ]),
    );
  });

  it("marks polling failures on the render task", async () => {
    const updateRenderTask = vi.fn().mockResolvedValue({
      renderTask: renderTask({ status: "failed" }),
      traceEvents: [] as TraceEvent[],
    });

    await pollActiveSeedanceRenderTask({
      loadRenderTask: vi.fn().mockRejectedValue(new Error("provider unavailable")),
      publishRenderExport: vi.fn(),
      renderTask: snapshot(renderTask({ progress: 45 })),
      sceneClipMaterializer: vi.fn(),
      storageProvider,
      store: { updateRenderTask } as unknown as ProjectStore,
    });

    expect(updateRenderTask).toHaveBeenCalledWith(
      "render-1",
      {
        errorMessage: "provider unavailable",
        progress: 45,
        status: "failed",
      },
      [expect.objectContaining({ step: "seedance-task-poll-failed" })],
    );
  });
});
