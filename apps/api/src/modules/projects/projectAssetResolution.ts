import type { AssetMetadata } from "@shopclip/shared";

import type { MaybePromise, ProjectSnapshot } from "./projectStore.js";
import { canUseAssetInProject } from "./projectAssetUtils.js";

type AssetLookup = (assetId: string) => MaybePromise<AssetMetadata | undefined>;

export interface PreparedScriptAssetResolutionInput {
  getAsset: AssetLookup;
  project: ProjectSnapshot;
  requestedAssetIds: string[];
}

export interface PreparedScriptAssetResolution {
  assets: AssetMetadata[];
  invalidAssetIds: string[];
}

export type ScriptTemplateAssetResolution =
  | { kind: "ready"; assets: AssetMetadata[] }
  | { kind: "not-found"; missingAssetIds: string[] }
  | { kind: "invalid-type"; invalidAssetIds: string[] };

export const selectUniqueAssetIds = (assetIds: string[]): string[] => [...new Set(assetIds)];

const loadAssetsById = async (
  getAsset: AssetLookup,
  assetIds: string[],
): Promise<Map<string, AssetMetadata>> => {
  const loadedAssets = await Promise.all(assetIds.map((assetId) => getAsset(assetId)));
  return new Map(
    loadedAssets
      .filter((asset): asset is AssetMetadata => Boolean(asset))
      .map((asset) => [asset.id, asset]),
  );
};

export const resolvePreparedScriptAssets = async ({
  getAsset,
  project,
  requestedAssetIds,
}: PreparedScriptAssetResolutionInput): Promise<PreparedScriptAssetResolution> => {
  const uniqueAssetIds = selectUniqueAssetIds(requestedAssetIds);
  if (uniqueAssetIds.length === 0) {
    return { assets: project.assets, invalidAssetIds: [] };
  }

  const assetById = await loadAssetsById(getAsset, uniqueAssetIds);
  const invalidAssetIds = uniqueAssetIds.filter((assetId) => {
    const asset = assetById.get(assetId);
    return !asset || !canUseAssetInProject(asset, project.id);
  });

  return invalidAssetIds.length > 0
    ? { assets: [], invalidAssetIds }
    : {
        assets: uniqueAssetIds.map((assetId) => assetById.get(assetId) as AssetMetadata),
        invalidAssetIds: [],
      };
};

export const resolveScriptTemplateAssets = async ({
  getAsset,
  isScriptAsset,
  requestedAssetIds,
}: {
  getAsset: AssetLookup;
  isScriptAsset: (asset: AssetMetadata) => boolean;
  requestedAssetIds: string[];
}): Promise<ScriptTemplateAssetResolution> => {
  const uniqueAssetIds = selectUniqueAssetIds(requestedAssetIds);
  const assetById = await loadAssetsById(getAsset, uniqueAssetIds);
  const missingAssetIds = uniqueAssetIds.filter((assetId) => !assetById.has(assetId));
  if (missingAssetIds.length > 0) {
    return { kind: "not-found", missingAssetIds };
  }

  const assets = uniqueAssetIds.map((assetId) => assetById.get(assetId) as AssetMetadata);
  const invalidAssetIds = assets.filter((asset) => !isScriptAsset(asset)).map((asset) => asset.id);
  if (invalidAssetIds.length > 0) {
    return { kind: "invalid-type", invalidAssetIds };
  }

  return { kind: "ready", assets };
};
