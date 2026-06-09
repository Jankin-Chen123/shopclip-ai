import { describe, expect, it } from "vitest";
import type { AssetMetadata, AssetSlice, ScriptResult, StoryboardScene } from "@shopclip/shared";
import type { AssetSearchResult } from "../lib/api";

import {
  removeDeletedAssetSearchResults,
  removeDeletedAssetsFromAssetLibrary,
  removeDeletedAssetsFromScript,
  selectUniqueNonEmptyIds,
} from "./AppAssetCleanupUtils";

const asset = (id: string): AssetMetadata => ({ id }) as AssetMetadata;
const slice = (id: string, assetId: string): AssetSlice => ({ id, assetId }) as AssetSlice;
const scene = (id: string, assetId?: string): StoryboardScene =>
  ({ id, assetId }) as StoryboardScene;
const searchResult = (assetId: string): AssetSearchResult =>
  ({ asset: asset(assetId) }) as AssetSearchResult;

describe("removeDeletedAssetsFromAssetLibrary", () => {
  it("removes deleted assets and their slices from an asset library snapshot", () => {
    const nextLibrary = removeDeletedAssetsFromAssetLibrary(
      {
        assets: [asset("keep"), asset("delete")],
        assetSlices: [slice("slice-keep", "keep"), slice("slice-delete", "delete")],
      },
      new Set(["delete"]),
    );

    expect(nextLibrary.assets.map((candidate) => candidate.id)).toEqual(["keep"]);
    expect(nextLibrary.assetSlices.map((candidate) => candidate.id)).toEqual(["slice-keep"]);
  });
});

describe("removeDeletedAssetsFromScript", () => {
  it("clears deleted asset references from active script scenes", () => {
    const script = {
      id: "script-1",
      scenes: [scene("scene-keep", "keep"), scene("scene-delete", "delete")],
    } as ScriptResult;

    expect(removeDeletedAssetsFromScript(script, new Set(["delete"]))?.scenes).toEqual([
      expect.objectContaining({ id: "scene-keep", assetId: "keep" }),
      expect.objectContaining({ id: "scene-delete", assetId: undefined }),
    ]);
  });

  it("preserves an undefined script", () => {
    expect(removeDeletedAssetsFromScript(undefined, new Set(["delete"]))).toBeUndefined();
  });
});

describe("removeDeletedAssetSearchResults", () => {
  it("removes search results for deleted assets", () => {
    expect(
      removeDeletedAssetSearchResults(
        [searchResult("keep"), searchResult("delete")],
        new Set(["delete"]),
      ).map((result) => result.asset.id),
    ).toEqual(["keep"]);
  });
});

describe("selectUniqueNonEmptyIds", () => {
  it("deduplicates ids while dropping empty values", () => {
    expect(selectUniqueNonEmptyIds(["reference-1", "", "reference-1", "reference-2"])).toEqual([
      "reference-1",
      "reference-2",
    ]);
  });
});
