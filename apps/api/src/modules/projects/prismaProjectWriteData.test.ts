import { describe, expect, it } from "vitest";
import type { RenderTask, StoryboardScene } from "@shopclip/shared";

import {
  toReferenceVideoUpdateData,
  toRenderTaskCreateData,
  toScriptSceneCreateData,
  toViralTemplateCreateData,
  toViralTemplateUpdateData,
} from "./prismaProjectWriteData.js";

const scene = (id: string): StoryboardScene =>
  ({
    id,
    projectId: "old-project",
    order: 2,
    durationSeconds: 4,
    subtitle: "Show it",
    voiceover: "Show it",
    visualPrompt: "Close-up product demo.",
    assetRecallQuery: "demo close-up",
    imageUrl: "/demo.png",
    assetId: "asset-1",
    status: "draft",
  }) as StoryboardScene;

const renderTask = (): Omit<RenderTask, "id" | "projectId" | "createdAt" | "updatedAt"> =>
  ({
    displayName: "Render 1",
    status: "queued",
    progress: 0,
    provider: "mock",
    sceneClips: [],
  }) as Omit<RenderTask, "id" | "projectId" | "createdAt" | "updatedAt">;

describe("prisma project write data", () => {
  it("clears stale reference errors when status moves away from failed", () => {
    expect(toReferenceVideoUpdateData({ status: "ready" })).toEqual(
      expect.objectContaining({
        errorMessage: null,
        status: "ready",
      }),
    );
  });

  it("uses the target project id and generated id for script scene creates", () => {
    const data = toScriptSceneCreateData(scene("old-scene"), "project-1", () => "new-scene");

    expect(data).toEqual(
      expect.objectContaining({
        id: "new-scene",
        projectId: "project-1",
        order: 2,
        assetId: "asset-1",
      }),
    );
  });

  it("keeps viral template create and update payloads aligned", () => {
    const template = {
      templateId: "template-1",
      name: "Template 1",
      category: "Kitchen",
      strategy: "Hook and prove.",
      factorSet: ["hook"],
      narrativeStructure: ["hook"],
      shotRequirements: ["close-up"],
      copywritingRules: ["short hook"],
      riskRules: ["avoid claims"],
      sourceReferenceIds: ["ref-1"],
    };

    expect(toViralTemplateCreateData(template, "project-1")).toEqual({
      id: "template-1",
      ...toViralTemplateUpdateData(template, "project-1"),
    });
  });

  it("materializes render task trace events with generated ids", () => {
    const data = toRenderTaskCreateData(
      "project-1",
      renderTask(),
      [
        {
          status: "queued",
          step: "render",
          message: "Queued.",
        },
      ],
      () => "generated-id",
    );

    expect(data).toEqual(
      expect.objectContaining({
        id: "generated-id",
        projectId: "project-1",
        status: "queued",
      }),
    );
    expect(data.traceEvents.create).toEqual([
      expect.objectContaining({
        id: "generated-id",
        status: "queued",
        step: "render",
      }),
    ]);
  });
});
