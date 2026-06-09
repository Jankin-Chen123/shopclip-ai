import { describe, expect, it } from "vitest";
import type { RenderTask, StoryboardScene } from "@shopclip/shared";

import {
  orderByRequestedIds,
  toAssetCreateData,
  toAssetSliceUpdateData,
  toJsonObject,
  toProjectStatusFromRenderTask,
  toReferenceVideoCreateData,
  toReferenceVideoUpdateData,
  toRenderTaskCreateData,
  toSceneUpdateData,
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
  it("builds asset create and slice update payloads", () => {
    const data = toAssetCreateData(
      "project-1",
      "asset-1",
      {
        type: "image",
        status: "ready",
        source: "merchant_upload",
        storageProvider: "cos",
        url: "/asset.png",
        name: "asset.png",
        tags: ["demo"],
      },
      [
        {
          label: "hero",
          tags: ["hero"],
        },
      ],
      () => "generated-id",
    );

    expect(data).toEqual(
      expect.objectContaining({
        id: "asset-1",
        projectId: "project-1",
        storageProvider: "cos",
      }),
    );
    expect(data.slices.create).toEqual([expect.objectContaining({ id: "generated-id" })]);
    expect(toAssetSliceUpdateData({ label: "updated" })).toEqual(
      expect.objectContaining({ label: "updated" }),
    );
  });

  it("clears stale reference errors when status moves away from failed", () => {
    expect(toReferenceVideoUpdateData({ status: "ready" })).toEqual(
      expect.objectContaining({
        errorMessage: null,
        status: "ready",
      }),
    );
  });

  it("builds reference create payloads and JSON object fallbacks", () => {
    expect(
      toReferenceVideoCreateData("project-1", "ref-1", {
        sourceUrl: "https://example.test/ref",
        sourcePlatform: "tiktok",
        sourceDeclaration: "Public URL.",
        title: "Reference",
        category: "Kitchen",
        publicStats: { likes: 1, comments: 2, shares: 3, views: 4 },
        status: "registered",
      }),
    ).toEqual(
      expect.objectContaining({
        id: "ref-1",
        projectId: "project-1",
        status: "registered",
      }),
    );
    expect(toJsonObject(["not-object"])).toEqual({});
    expect(toJsonObject({ ok: true })).toEqual({ ok: true });
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

  it("maps scene update nulls and render task status to persistence payloads", () => {
    expect(
      toSceneUpdateData({
        assetId: null,
        assetRecallQuery: null,
      }),
    ).toEqual(
      expect.objectContaining({
        assetId: null,
        assetRecallQuery: null,
        status: "edited",
      }),
    );
    expect(toProjectStatusFromRenderTask({ status: "completed" })).toBe("completed");
    expect(toProjectStatusFromRenderTask({ status: "failed" })).toBe("failed");
    expect(toProjectStatusFromRenderTask({ status: "queued" })).toBe("rendering");
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

  it("orders deleted assets by the requested id list", () => {
    expect(
      orderByRequestedIds(
        ["asset-2", "asset-1", "missing"],
        [
          { id: "asset-1", name: "one" },
          { id: "asset-2", name: "two" },
        ],
      ),
    ).toEqual([
      { id: "asset-2", name: "two" },
      { id: "asset-1", name: "one" },
    ]);
  });
});
