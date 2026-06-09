import { describe, expect, it } from "vitest";
import type { AssetMetadata } from "@shopclip/shared";
import type { ProjectSnapshot } from "./projectStore.js";

import {
  resolvePreparedScriptAssets,
  resolveScriptTemplateAssets,
} from "./projectAssetResolution.js";

const asset = (
  id: string,
  patch: Partial<AssetMetadata> = {},
): AssetMetadata =>
  ({
    id,
    projectId: undefined,
    type: "image",
    source: "merchant_upload",
    ...patch,
  }) as AssetMetadata;

const lookupFrom = (assets: AssetMetadata[]) => {
  const assetsById = new Map(assets.map((candidate) => [candidate.id, candidate]));
  return async (assetId: string): Promise<AssetMetadata | undefined> => assetsById.get(assetId);
};

describe("resolvePreparedScriptAssets", () => {
  it("falls back to project assets when the request does not specify asset ids", async () => {
    const projectAssets = [asset("project-asset")];
    const result = await resolvePreparedScriptAssets({
      getAsset: lookupFrom([]),
      project: { id: "project-1", assets: projectAssets } as ProjectSnapshot,
      requestedAssetIds: [],
    });

    expect(result).toEqual({ assets: projectAssets, invalidAssetIds: [] });
  });

  it("deduplicates requested ids and rejects missing or cross-project assets", async () => {
    const valid = asset("valid", { projectId: "project-1" });
    const crossProject = asset("cross-project", { projectId: "project-2" });

    const result = await resolvePreparedScriptAssets({
      getAsset: lookupFrom([valid, crossProject]),
      project: { id: "project-1", assets: [asset("fallback")] } as ProjectSnapshot,
      requestedAssetIds: ["valid", "valid", "missing", "cross-project"],
    });

    expect(result.assets).toEqual([]);
    expect(result.invalidAssetIds).toEqual(["missing", "cross-project"]);
  });

  it("returns requested assets when every requested asset can be used by the project", async () => {
    const shared = asset("shared", { projectId: undefined });
    const owned = asset("owned", { projectId: "project-1" });

    const result = await resolvePreparedScriptAssets({
      getAsset: lookupFrom([shared, owned]),
      project: { id: "project-1", assets: [asset("fallback")] } as ProjectSnapshot,
      requestedAssetIds: ["shared", "owned"],
    });

    expect(result).toEqual({ assets: [shared, owned], invalidAssetIds: [] });
  });
});

describe("resolveScriptTemplateAssets", () => {
  it("returns not-found when any requested script asset is missing", async () => {
    const result = await resolveScriptTemplateAssets({
      getAsset: lookupFrom([asset("script-asset")]),
      isScriptAsset: () => true,
      requestedAssetIds: ["script-asset", "missing"],
    });

    expect(result).toEqual({ kind: "not-found", missingAssetIds: ["missing"] });
  });

  it("returns invalid-type when a requested asset is not a script library asset", async () => {
    const scriptAsset = asset("script-asset");
    const imageAsset = asset("image-asset");

    const result = await resolveScriptTemplateAssets({
      getAsset: lookupFrom([scriptAsset, imageAsset]),
      isScriptAsset: (candidate) => candidate.id === "script-asset",
      requestedAssetIds: ["script-asset", "image-asset"],
    });

    expect(result).toEqual({ kind: "invalid-type", invalidAssetIds: ["image-asset"] });
  });

  it("returns deduplicated script assets when all requested assets are valid", async () => {
    const scriptAsset = asset("script-asset");

    const result = await resolveScriptTemplateAssets({
      getAsset: lookupFrom([scriptAsset]),
      isScriptAsset: () => true,
      requestedAssetIds: ["script-asset", "script-asset"],
    });

    expect(result).toEqual({ kind: "ready", assets: [scriptAsset] });
  });
});
