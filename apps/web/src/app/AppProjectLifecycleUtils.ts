import type { AssetMetadata, AssetSlice, ProjectBrief } from "@shopclip/shared";

import { assetMatchesCategory } from "../features/assets/AssetCategoryTabs";
import type { AssetLibraryCategory, ProjectSnapshot } from "../lib/api";

type AssetLibraryState = {
  assets: AssetMetadata[];
  assetSlices: AssetSlice[];
};

export const createBriefFromProject = (project: ProjectSnapshot): ProjectBrief => ({
  title: project.title,
  productName: project.productName,
  audience: project.audience,
  sellingPoints: project.sellingPoints,
  tone: project.tone,
  style: project.style,
  targetDurationSeconds: project.targetDurationSeconds,
});

export const replaceAssetCategoryInLibrary = (
  currentLibrary: AssetLibraryState,
  category: AssetLibraryCategory,
  assets: AssetMetadata[],
  assetSlices: AssetSlice[],
): AssetLibraryState => {
  if (category === "all") {
    return { assets, assetSlices };
  }

  const replacedAssetIds = new Set(
    currentLibrary.assets
      .filter((asset) => assetMatchesCategory(asset, category))
      .map((asset) => asset.id),
  );
  const nextAssetIds = new Set(assets.map((asset) => asset.id));

  return {
    assets: [
      ...currentLibrary.assets.filter((asset) => !replacedAssetIds.has(asset.id)),
      ...assets,
    ],
    assetSlices: [
      ...currentLibrary.assetSlices.filter(
        (slice) => !replacedAssetIds.has(slice.assetId) && !nextAssetIds.has(slice.assetId),
      ),
      ...assetSlices,
    ],
  };
};
