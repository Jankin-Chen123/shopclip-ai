import { describe, expect, it } from "vitest";
import type { AssetMetadata, ScriptGenerationRequest } from "@shopclip/shared";

import type { ProjectSnapshot } from "./projectStore.js";
import type { ScriptPromptContext } from "./scriptPromptContext.js";
import { prepareScriptGenerationInputs } from "./scriptRequestPreparation.js";

const project = (id: string, keywords: string[] = []): ProjectSnapshot =>
  ({ id, assets: [], prepKeywords: keywords }) as ProjectSnapshot;
const asset = (id: string): AssetMetadata => ({ id }) as AssetMetadata;

const request: ScriptGenerationRequest = {
  assetIds: ["asset-1"],
  draftScript: "draft",
  keywords: ["hero", "demo"],
  materials: [],
  productionMode: "automatic",
};

describe("prepareScriptGenerationInputs", () => {
  it("persists prep keywords only when the request body explicitly includes keywords", async () => {
    const originalProject = project("project-1", ["old"]);
    const updatedProject = project("project-1", ["hero", "demo"]);
    let updateCalls = 0;

    const result = await prepareScriptGenerationInputs({
      project: originalProject,
      request,
      requestBody: { keywords: request.keywords },
      resolvePreparedAssets: async (workingProject) => ({
        assets: [asset(`asset-for-${workingProject.prepKeywords.join("-")}`)],
        invalidAssetIds: [],
      }),
      resolvePromptContext: async () => ({ context: { reference: "ready" } as ScriptPromptContext }),
      updateProjectPrepKeywords: async () => {
        updateCalls += 1;
        return updatedProject;
      },
    });

    expect(updateCalls).toBe(1);
    expect(result).toEqual({
      kind: "ready",
      assets: [asset("asset-for-hero-demo")],
      promptContext: { reference: "ready" },
      workingProject: updatedProject,
    });
  });

  it("does not persist prep keywords when the request body omits keywords", async () => {
    let updateCalls = 0;
    const originalProject = project("project-1", ["old"]);

    const result = await prepareScriptGenerationInputs({
      project: originalProject,
      request,
      requestBody: { draftScript: request.draftScript },
      resolvePreparedAssets: async (workingProject) => ({
        assets: [asset(`asset-for-${workingProject.prepKeywords.join("-")}`)],
        invalidAssetIds: [],
      }),
      resolvePromptContext: async () => ({ context: {} }),
      updateProjectPrepKeywords: async () => {
        updateCalls += 1;
        return project("project-1", ["unexpected"]);
      },
    });

    expect(updateCalls).toBe(0);
    expect(result.kind).toBe("ready");
    expect(result.kind === "ready" ? result.workingProject : undefined).toBe(originalProject);
    expect(result.kind === "ready" ? result.assets : undefined).toEqual([asset("asset-for-old")]);
  });

  it("returns prompt context errors before mutating project prep keywords", async () => {
    let updateCalls = 0;

    const result = await prepareScriptGenerationInputs({
      project: project("project-1"),
      request,
      requestBody: { keywords: request.keywords },
      resolvePreparedAssets: async () => ({ assets: [], invalidAssetIds: [] }),
      resolvePromptContext: async () => ({
        context: {},
        error: {
          code: "REFERENCE_NOT_FOUND",
          message: "Reference was not found.",
          status: 404,
        },
      }),
      updateProjectPrepKeywords: async () => {
        updateCalls += 1;
        return project("project-1", ["unexpected"]);
      },
    });

    expect(updateCalls).toBe(0);
    expect(result).toEqual({
      kind: "error",
      error: {
        code: "REFERENCE_NOT_FOUND",
        message: "Reference was not found.",
        status: 404,
      },
    });
  });

  it("maps invalid prepared assets to the existing script asset error", async () => {
    const result = await prepareScriptGenerationInputs({
      project: project("project-1"),
      request,
      requestBody: {},
      resolvePreparedAssets: async () => ({
        assets: [],
        invalidAssetIds: ["missing-asset"],
      }),
      resolvePromptContext: async () => ({ context: {} }),
      updateProjectPrepKeywords: async () => project("project-1"),
    });

    expect(result).toEqual({
      kind: "error",
      error: {
        code: "INVALID_SCRIPT_ASSETS",
        message: "One or more requested assets do not exist or cannot be used in this project.",
        status: 400,
      },
    });
  });
});
