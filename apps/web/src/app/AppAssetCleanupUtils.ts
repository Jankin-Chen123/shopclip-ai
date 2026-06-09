import type { AssetMetadata, AssetSlice, ScriptResult, StoryboardScene } from "@shopclip/shared";
import type { AssetSearchResult } from "../lib/api";

export type AssetLibrarySnapshot = {
  assets: AssetMetadata[];
  assetSlices: AssetSlice[];
};

const clearSceneDeletedAssetReference = <T extends StoryboardScene>(
  scene: T,
  deletedAssetIds: Set<string>,
): T =>
  scene.assetId && deletedAssetIds.has(scene.assetId)
    ? { ...scene, assetId: undefined }
    : scene;

export const removeDeletedAssetsFromAssetLibrary = (
  assetLibrary: AssetLibrarySnapshot,
  deletedAssetIds: Set<string>,
): AssetLibrarySnapshot => ({
  assets: assetLibrary.assets.filter((asset) => !deletedAssetIds.has(asset.id)),
  assetSlices: assetLibrary.assetSlices.filter((slice) => !deletedAssetIds.has(slice.assetId)),
});

export const removeDeletedAssetsFromScript = (
  script: ScriptResult | undefined,
  deletedAssetIds: Set<string>,
): ScriptResult | undefined =>
  script
    ? {
        ...script,
        scenes: script.scenes.map((scene) =>
          clearSceneDeletedAssetReference(scene, deletedAssetIds),
        ),
      }
    : script;

export const removeDeletedAssetSearchResults = (
  searchResults: AssetSearchResult[],
  deletedAssetIds: Set<string>,
): AssetSearchResult[] =>
  searchResults.filter((result) => !deletedAssetIds.has(result.asset.id));

export const selectUniqueNonEmptyIds = (ids: string[]): string[] =>
  Array.from(new Set(ids)).filter(Boolean);
