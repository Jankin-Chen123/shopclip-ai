import { describe, expect, it, vi } from "vitest";
import type { SmartEditPlan } from "@shopclip/shared";

import type { ProjectStore } from "./projectStore.js";
import {
  smartEditPlanningTraceEvents,
  smartEditSegmentRefreshTraceEvents,
  updateSmartEditComposeCompleted,
  updateSmartEditComposeStarted,
  updateSmartEditJobFailed,
  updateSmartEditJobStarted,
} from "./smartEditJobTaskUpdates.js";

const plan = (overrides: Partial<SmartEditPlan> = {}): SmartEditPlan =>
  ({
    id: "smart-edit-plan-1",
    projectId: "project-1",
    createdAt: "2026-06-09T00:00:00.000Z",
    updatedAt: "2026-06-09T00:00:00.000Z",
    segments: [
      {
        id: "segment-1",
        sceneId: "scene-1",
        durationSeconds: 3,
        enabled: true,
        order: 1,
        sourceAssetId: "asset-1",
        sourceEndSeconds: 3,
        sourceStartSeconds: 0,
        subtitle: "Hook",
        transition: "cut",
        visualTreatment: "close-up",
        voiceover: "Hook",
      },
    ],
    ...overrides,
  }) as SmartEditPlan;

const storeWithUpdate = () => ({
  updateRenderTask: vi.fn(),
});

describe("smart edit job task updates", () => {
  it("stores the initial running state with the provided trace", async () => {
    const store = storeWithUpdate();

    await updateSmartEditJobStarted(store as unknown as ProjectStore, "render-1", {
      status: "running",
      step: "smart-edit-plan-started",
      message: "Planning started.",
    });

    expect(store.updateRenderTask).toHaveBeenCalledWith(
      "render-1",
      {
        progress: 12,
        status: "running",
      },
      [
        {
          status: "running",
          step: "smart-edit-plan-started",
          message: "Planning started.",
        },
      ],
    );
  });

  it("stores a normalized failed state and trace event", async () => {
    const store = storeWithUpdate();

    await updateSmartEditJobFailed(
      store as unknown as ProjectStore,
      "render-1",
      new Error("planner unavailable"),
      "Planning failed.",
      "smart-edit-plan-failed",
    );

    expect(store.updateRenderTask).toHaveBeenCalledWith(
      "render-1",
      {
        errorMessage: "planner unavailable",
        progress: 100,
        status: "failed",
      },
      [
        {
          status: "failed",
          step: "smart-edit-plan-failed",
          message: "planner unavailable",
        },
      ],
    );
  });

  it("stores compose-started plan metadata and scene clips", async () => {
    const store = storeWithUpdate();
    const smartEditPlan = plan();

    await updateSmartEditComposeStarted(store as unknown as ProjectStore, "render-1", smartEditPlan, [
      {
        status: "running",
        step: "smart-edit-ffmpeg-compose-started",
        message: "Compose started.",
      },
    ]);

    expect(store.updateRenderTask).toHaveBeenCalledWith(
      "render-1",
      expect.objectContaining({
        progress: 42,
        providerTaskId: "smart-edit-plan-1",
        smartEditPlan,
        status: "running",
      }),
      [expect.objectContaining({ step: "smart-edit-ffmpeg-compose-started" })],
    );
    expect(store.updateRenderTask.mock.calls[0]?.[1].sceneClips).toHaveLength(1);
  });

  it("stores compose completion export metadata and response segment outputs", async () => {
    const store = storeWithUpdate();

    await updateSmartEditComposeCompleted(
      store as unknown as ProjectStore,
      "render-1",
      plan(),
      {
        publicUrl: "https://cdn.example.test/export.mp4",
        segmentOutputs: [
          {
            exportUrl: "https://cdn.example.test/segment-1.mp4",
            segmentId: "segment-1",
          },
        ],
      },
      {
        status: "completed",
        step: "smart-edit-ffmpeg-compose",
        message: "Compose complete.",
      },
    );

    expect(store.updateRenderTask).toHaveBeenCalledWith(
      "render-1",
      expect.objectContaining({
        exportUrl: "https://cdn.example.test/export.mp4",
        previewUrl: "https://cdn.example.test/export.mp4",
        progress: 100,
        status: "completed",
      }),
      [expect.objectContaining({ step: "smart-edit-ffmpeg-compose" })],
    );
    expect(store.updateRenderTask.mock.calls[0]?.[1].smartEditSegmentOutputs).toEqual([
      expect.objectContaining({ segmentId: "segment-1" }),
    ]);
  });

  it("builds full smart-edit planning trace events", () => {
    expect(
      smartEditPlanningTraceEvents({
        appliedMaterialsCount: 2,
        fallback: { provider: "ark", used: false },
        reusedCurrentPlan: false,
      }),
    ).toEqual([
      expect.objectContaining({ step: "smart-edit-plan-model", status: "completed" }),
      expect.objectContaining({ step: "smart-edit-scene-materials-applied" }),
      expect.objectContaining({ step: "smart-edit-ffmpeg-compose-started" }),
    ]);

    expect(
      smartEditPlanningTraceEvents({
        appliedMaterialsCount: 0,
        fallback: { provider: "current-plan", used: false },
        reusedCurrentPlan: true,
      })[0],
    ).toEqual(
      expect.objectContaining({
        message: "Smart edit reused the current edited timeline plan for ffmpeg composition.",
        step: "smart-edit-plan-current",
      }),
    );
  });

  it("builds segment refresh trace events", () => {
    expect(
      smartEditSegmentRefreshTraceEvents({
        appliedMaterialsCount: 1,
        fallback: { provider: "local", reason: "offline", used: true },
      }),
    ).toEqual([
      expect.objectContaining({
        message: "Segment refresh used local planning fallback: offline",
        status: "retrying",
        step: "smart-edit-segment-plan-fallback",
      }),
      expect.objectContaining({ step: "smart-edit-scene-materials-applied" }),
      expect.objectContaining({ step: "smart-edit-segment-refresh-compose-started" }),
    ]);
  });
});
