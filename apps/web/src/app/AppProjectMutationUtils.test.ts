import { describe, expect, it } from "vitest";
import type { AssetMetadata, AssetSlice, ScriptResult, StoryboardScene } from "@shopclip/shared";

import type { ProjectSnapshot } from "../lib/api";
import { removeProjectAssets } from "./AppProjectMutationUtils";

const asset = (id: string): AssetMetadata => ({ id }) as AssetMetadata;
const slice = (id: string, assetId: string): AssetSlice => ({ id, assetId }) as AssetSlice;
const scene = (id: string, assetId?: string): StoryboardScene =>
  ({ id, assetId }) as StoryboardScene;

describe("removeProjectAssets", () => {
  it("removes assets and slices while clearing scene asset references", () => {
    const project = {
      assets: [asset("asset-keep"), asset("asset-delete")],
      assetSlices: [slice("slice-keep", "asset-keep"), slice("slice-delete", "asset-delete")],
      scenes: [scene("scene-keep", "asset-keep"), scene("scene-delete", "asset-delete")],
      scripts: [
        {
          id: "script-1",
          scenes: [
            scene("script-scene-keep", "asset-keep"),
            scene("script-scene-delete", "asset-delete"),
          ],
        } as ScriptResult,
      ],
    } as ProjectSnapshot;

    const nextProject = removeProjectAssets(project, new Set(["asset-delete"]));

    expect(nextProject?.assets.map((candidate) => candidate.id)).toEqual(["asset-keep"]);
    expect(nextProject?.assetSlices.map((candidate) => candidate.id)).toEqual(["slice-keep"]);
    expect(nextProject?.scenes).toEqual([
      expect.objectContaining({ id: "scene-keep", assetId: "asset-keep" }),
      expect.objectContaining({ id: "scene-delete", assetId: undefined }),
    ]);
    expect(nextProject?.scripts[0]?.scenes).toEqual([
      expect.objectContaining({ id: "script-scene-keep", assetId: "asset-keep" }),
      expect.objectContaining({ id: "script-scene-delete", assetId: undefined }),
    ]);
  });

  it("preserves an undefined project", () => {
    expect(removeProjectAssets(undefined, new Set(["asset-delete"]))).toBeUndefined();
  });
});
