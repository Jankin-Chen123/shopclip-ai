import { describe, expect, it, vi } from "vitest";
import type { Response } from "express";
import type { AssetMetadata, ScriptGenerationRequest } from "@shopclip/shared";

import type { ProjectSnapshot } from "./projectStore.js";
import type { ScriptPromptContext } from "./scriptPromptContext.js";
import {
  prepareScriptRouteInputs,
  sendInvalidScriptRequest,
  sendScriptPreparationError,
  sendStoryboardRouteError,
} from "./scriptRouteUtils.js";

const project = (id = "project-1", keywords: string[] = []): ProjectSnapshot =>
  ({ id, assets: [], prepKeywords: keywords }) as ProjectSnapshot;

const asset = (id: string): AssetMetadata => ({ id }) as AssetMetadata;

const request: ScriptGenerationRequest = {
  assetIds: ["asset-1"],
  draftScript: "draft",
  keywords: ["hero", "demo"],
  materials: [],
  productionMode: "automatic",
};

const response = () => {
  const res = {
    json: vi.fn(),
    status: vi.fn(),
  };
  res.status.mockReturnValue(res);
  return res as unknown as Response & {
    json: ReturnType<typeof vi.fn>;
    status: ReturnType<typeof vi.fn>;
  };
};

describe("script route utils", () => {
  it("returns invalid-request when the route body fails script request validation", async () => {
    const result = await prepareScriptRouteInputs({
      project: project(),
      requestBody: { assetIds: [123] },
      resolvePreparedAssets: async () => ({ assets: [], invalidAssetIds: [] }),
      resolvePromptContext: async () => ({ context: {} }),
      updateProjectPrepKeywords: async () => project(),
    });

    expect(result).toEqual({ kind: "invalid-request" });
  });

  it("prepares route inputs with parsed request data and working project", async () => {
    const updatedProject = project("project-1", ["hero", "demo"]);

    const result = await prepareScriptRouteInputs({
      project: project("project-1", ["old"]),
      requestBody: request,
      resolvePreparedAssets: async (workingProject) => ({
        assets: [asset(`asset-for-${workingProject.prepKeywords.join("-")}`)],
        invalidAssetIds: [],
      }),
      resolvePromptContext: async () => ({ context: { reference: "ready" } as ScriptPromptContext }),
      updateProjectPrepKeywords: async () => updatedProject,
    });

    expect(result).toEqual({
      kind: "ready",
      assets: [asset("asset-for-hero-demo")],
      promptContext: { reference: "ready" },
      request,
      workingProject: updatedProject,
    });
  });

  it("returns preparation errors from shared script input preparation", async () => {
    const result = await prepareScriptRouteInputs({
      project: project(),
      requestBody: request,
      resolvePreparedAssets: async () => ({ assets: [], invalidAssetIds: ["missing-asset"] }),
      resolvePromptContext: async () => ({ context: {} }),
      updateProjectPrepKeywords: async () => project(),
    });

    expect(result).toEqual({
      kind: "preparation-error",
      error: {
        code: "INVALID_SCRIPT_ASSETS",
        message: "One or more requested assets do not exist or cannot be used in this project.",
        status: 400,
      },
    });
  });

  it("sends invalid script request responses", () => {
    const res = response();

    sendInvalidScriptRequest(res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: "INVALID_SCRIPT_REQUEST",
        message: "Script generation request is invalid.",
      },
    });
  });

  it("maps preparation and storyboard route errors to HTTP helpers", () => {
    const notFound = response();
    const invalid = response();

    sendScriptPreparationError(notFound, {
      code: "REFERENCE_NOT_FOUND",
      message: "Reference was not found.",
      status: 404,
    });
    sendStoryboardRouteError(invalid, {
      code: "SCRIPT_ASSETS_INVALID",
      message: "Storyboard assets are invalid.",
      status: 400,
    });

    expect(notFound.status).toHaveBeenCalledWith(404);
    expect(notFound.json).toHaveBeenCalledWith({
      error: {
        code: "REFERENCE_NOT_FOUND",
        message: "Reference was not found.",
      },
    });
    expect(invalid.status).toHaveBeenCalledWith(400);
    expect(invalid.json).toHaveBeenCalledWith({
      error: {
        code: "SCRIPT_ASSETS_INVALID",
        message: "Storyboard assets are invalid.",
      },
    });
  });
});
