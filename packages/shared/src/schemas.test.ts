import { describe, expect, it } from "vitest";

import {
  AssetMetadataSchema,
  DashboardResponseSchema,
  ProjectBriefSchema,
  RenderTaskSchema,
  ScriptResultSchema,
  StoryboardSceneSchema,
  TraceEventSchema,
} from "./schemas";

describe("shared contract schemas", () => {
  it("requires product brief fields used by generation", () => {
    const result = ProjectBriefSchema.safeParse({
      title: "Launch video",
      productName: "GlowGrip Phone Stand",
      audience: "TikTok Shop buyers",
      sellingPoints: ["folds flat", "stable on desks"],
      tone: "confident",
      style: "fast demo",
      targetDurationSeconds: 15,
    });

    expect(result.success).toBe(true);
  });

  it("rejects project briefs without selling points", () => {
    const result = ProjectBriefSchema.safeParse({
      title: "Launch video",
      productName: "GlowGrip Phone Stand",
      audience: "TikTok Shop buyers",
      sellingPoints: [],
      tone: "confident",
      style: "fast demo",
      targetDurationSeconds: 15,
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid enum statuses and asset types", () => {
    expect(
      AssetMetadataSchema.safeParse({
        id: "asset_demo_1",
        projectId: "project_demo",
        type: "audio",
        status: "ready",
        url: "/assets/demo.png",
        name: "Demo asset",
        tags: ["product"],
      }).success,
    ).toBe(false);

    expect(
      RenderTaskSchema.safeParse({
        id: "render_demo",
        projectId: "project_demo",
        status: "almost-done",
        progress: 95,
        previewUrl: "/exports/demo.mp4",
        createdAt: "2026-05-21T00:00:00.000Z",
        updatedAt: "2026-05-21T00:00:01.000Z",
      }).success,
    ).toBe(false);
  });

  it("rejects invalid scene duration and scripts longer than 15 seconds", () => {
    expect(
      StoryboardSceneSchema.safeParse({
        id: "scene_1",
        projectId: "project_demo",
        order: 1,
        durationSeconds: 0,
        subtitle: "Snap it open",
        voiceover: "Snap it open",
        visualPrompt: "Close-up product demo",
        assetId: "asset_demo_1",
        status: "draft",
      }).success,
    ).toBe(false);

    expect(
      ScriptResultSchema.safeParse({
        id: "script_demo",
        projectId: "project_demo",
        hook: "Stop shaky product videos",
        narrative: "Show the pain, show the fix, close with offer.",
        constraints: ["Keep under 15 seconds"],
        scenes: [
          {
            id: "scene_1",
            projectId: "project_demo",
            order: 1,
            durationSeconds: 8,
            subtitle: "Before",
            voiceover: "Before",
            visualPrompt: "Phone sliding on desk",
            assetId: "asset_demo_1",
            status: "draft",
          },
          {
            id: "scene_2",
            projectId: "project_demo",
            order: 2,
            durationSeconds: 8,
            subtitle: "After",
            voiceover: "After",
            visualPrompt: "Phone locked in stand",
            assetId: "asset_demo_1",
            status: "draft",
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("validates trace events and dashboard responses", () => {
    expect(
      TraceEventSchema.safeParse({
        id: "trace_demo_1",
        renderTaskId: "render_demo",
        status: "completed",
        step: "mock-render",
        message: "Preview asset created",
        createdAt: "2026-05-21T00:00:02.000Z",
      }).success,
    ).toBe(true);

    expect(
      DashboardResponseSchema.safeParse({
        projectId: "project_demo",
        summary: {
          predictedCompletionRate: 0.72,
          hookStrength: 0.86,
          subtitleClarity: 0.91,
          productFocus: 0.88,
        },
        funnel: [
          { stage: "Impression", value: 10000 },
          { stage: "Watch 3s", value: 6200 },
        ],
        factors: [
          {
            id: "factor_1",
            sceneId: "scene_1",
            factor: "Hook clarity",
            expectedImpact: "high",
            evidence: "Opens with a concrete pain point.",
            recommendation: "Keep the first subtitle short.",
          },
        ],
      }).success,
    ).toBe(true);
  });
});
