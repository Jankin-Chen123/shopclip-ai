import { describe, expect, it } from "vitest";
import type { ReferenceVideo, StoryboardScene, ViralTemplate } from "@shopclip/shared";

import type { ProjectSnapshot } from "./projectStore.js";
import {
  applyReferenceVideoUpdate,
  materializeScriptScenes,
  projectUsesTemplateReference,
  removeProjectAssetsById,
  removeTemplatesForReference,
  upsertViralTemplate,
} from "./memoryProjectStoreUtils.js";

const referenceVideo = (id: string, overrides: Partial<ReferenceVideo> = {}): ReferenceVideo =>
  ({
    id,
    sourceUrl: `https://example.test/${id}`,
    sourcePlatform: "tiktok",
    sourceDeclaration: "Public reference URL.",
    title: `Reference ${id}`,
    category: "Kitchen",
    status: "failed",
    errorMessage: "previous failure",
    createdAt: "2026-06-09T00:00:00.000Z",
    updatedAt: "2026-06-09T00:00:00.000Z",
    ...overrides,
  }) as ReferenceVideo;

const viralTemplate = (templateId: string, sourceReferenceIds: string[]): ViralTemplate =>
  ({
    templateId,
    name: `Template ${templateId}`,
    category: "Kitchen",
    strategy: "Hook and prove.",
    factorSet: [],
    narrativeStructure: ["hook"],
    shotRequirements: [],
    copywritingRules: [],
    sourceReferenceIds,
    confidence: 0.8,
  }) as ViralTemplate;

const scene = (id: string): StoryboardScene =>
  ({
    id,
    projectId: "old-project",
    order: 1,
    durationSeconds: 4,
    subtitle: "Demo",
    voiceover: "Demo",
    visualPrompt: "Show the product.",
    status: "draft",
  }) as StoryboardScene;

describe("memory project store utils", () => {
  it("clears stale reference errors when a non-failed status is applied without an error", () => {
    expect(
      applyReferenceVideoUpdate(
        referenceVideo("ref-1"),
        { status: "ready" },
        "2026-06-09T01:00:00.000Z",
      ),
    ).toEqual(
      expect.objectContaining({
        id: "ref-1",
        status: "ready",
        updatedAt: "2026-06-09T01:00:00.000Z",
      }),
    );
    expect(
      applyReferenceVideoUpdate(referenceVideo("ref-1"), { status: "ready" }, "2026-06-09T01:00:00.000Z"),
    ).not.toHaveProperty("errorMessage");
  });

  it("upserts viral templates and detects project reference ownership", () => {
    const firstTemplate = viralTemplate("template-1", ["ref-1"]);
    const replacementTemplate = {
      ...firstTemplate,
      name: "Updated template",
    };
    const templates = upsertViralTemplate([firstTemplate], replacementTemplate);
    const project = {
      referenceVideos: [referenceVideo("ref-1")],
    } as ProjectSnapshot;

    expect(templates).toEqual([replacementTemplate]);
    expect(projectUsesTemplateReference(project, replacementTemplate)).toBe(true);
  });

  it("removes templates that depend on a deleted reference", () => {
    const result = removeTemplatesForReference(
      [viralTemplate("template-1", ["ref-1"]), viralTemplate("template-2", ["ref-2"])],
      "ref-1",
    );

    expect(result.deletedTemplateIds).toEqual(["template-1"]);
    expect(result.templates.map((template) => template.templateId)).toEqual(["template-2"]);
  });

  it("removes project asset state and clears scene/script references", () => {
    const project = {
      assets: [{ id: "asset-1" }, { id: "asset-2" }],
      assetSlices: [{ id: "slice-1", assetId: "asset-1" }],
      assetProcessingJobs: [{ id: "job-1", assetId: "asset-1" }],
      assetProcessingEvents: [{ id: "event-1", assetId: "asset-1" }],
      scenes: [{ ...scene("scene-1"), assetId: "asset-1" }],
      scripts: [
        {
          id: "script-1",
          scenes: [{ ...scene("scene-1"), assetId: "asset-1" }],
        },
      ],
    } as ProjectSnapshot;

    const result = removeProjectAssetsById(project, new Set(["asset-1"]));

    expect(result.changed).toBe(true);
    expect(result.deletedAssets.map((asset) => asset.id)).toEqual(["asset-1"]);
    expect(result.assets.map((asset) => asset.id)).toEqual(["asset-2"]);
    expect(result.assetSlices).toEqual([]);
    expect(result.assetProcessingJobs).toEqual([]);
    expect(result.assetProcessingEvents).toEqual([]);
    expect(result.scenes[0]?.assetId).toBeUndefined();
    expect(result.scripts[0]?.scenes[0]?.assetId).toBeUndefined();
  });

  it("materializes script scenes with new ids and the target project id", () => {
    let nextId = 0;
    const scenes = materializeScriptScenes([scene("old-1"), scene("old-2")], "project-1", () => {
      nextId += 1;
      return `new-${nextId}`;
    });

    expect(scenes.map((candidate) => candidate.id)).toEqual(["new-1", "new-2"]);
    expect(scenes.every((candidate) => candidate.projectId === "project-1")).toBe(true);
  });
});
