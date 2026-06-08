import type {
  AssetMetadata,
  AssetSlice,
  ReferenceVideo,
  ViralTemplate,
} from "@shopclip/shared";

import { assetMatchesCategory, type AssetCategory } from "../features/assets/AssetCategoryTabs";
import type { ProjectSnapshot } from "../lib/api";
import { hasActivePendingReferenceAnalysis, mergeReferences, mergeTemplates } from "./AppSetupUtils";
import {
  getCreationUsableAssets,
  getPreparedAssetsByBucket,
  getReferenceScriptAssets,
} from "./AppProjectAssetUtils";
import type { BackgroundTaskTarget } from "./useBackgroundTaskTracker";

type AssetLibrarySnapshot = {
  assets: AssetMetadata[];
  assetSlices: AssetSlice[];
};

type CurrentBackgroundTaskTargetInput = BackgroundTaskTarget & {
  projectDetailTab: BackgroundTaskTarget["projectDetailTab"];
};

export const selectCurrentBackgroundTaskTarget = ({
  flow,
  isProjectStudioMode,
  page,
  projectDetailTab,
  section,
}: CurrentBackgroundTaskTargetInput): BackgroundTaskTarget => ({
  flow: isProjectStudioMode ? flow : undefined,
  isProjectStudioMode,
  page,
  projectDetailTab: page === "project" ? projectDetailTab : undefined,
  section,
});

export const selectActiveAssetCategoryAssets = (
  assets: AssetMetadata[],
  activeAssetCategory: AssetCategory,
): AssetMetadata[] => assets.filter((asset) => assetMatchesCategory(asset, activeAssetCategory));

export const selectCreationUsableAssets = (
  project: ProjectSnapshot | undefined,
  assetLibrary: AssetLibrarySnapshot,
): AssetMetadata[] =>
  getCreationUsableAssets(project?.id, [...(project?.assets ?? []), ...assetLibrary.assets]);

export const selectStudioAssets = (
  project: ProjectSnapshot | undefined,
  assetLibraryAssets: AssetMetadata[],
): AssetMetadata[] => {
  const assetsById = new Map<string, AssetMetadata>();
  [...(project?.assets ?? []), ...assetLibraryAssets].forEach((asset) => {
    assetsById.set(asset.id, asset);
  });
  return [...assetsById.values()];
};

export const selectSmartEditAssetSlices = (
  project: ProjectSnapshot | undefined,
  assetLibrary: AssetLibrarySnapshot,
): AssetSlice[] => [...(project?.assetSlices ?? []), ...assetLibrary.assetSlices];

export const selectPreparedProjectAssetsByBucket = (project: ProjectSnapshot | undefined) =>
  getPreparedAssetsByBucket(project?.assets ?? []);

export const selectScriptReferenceLibrary = (
  project: ProjectSnapshot | undefined,
  referenceLibrary: ReferenceVideo[],
): ReferenceVideo[] => mergeReferences(project?.referenceVideos ?? [], referenceLibrary);

export const selectScriptReferenceAssets = (
  project: ProjectSnapshot | undefined,
  assetLibraryAssets: AssetMetadata[],
): AssetMetadata[] => getReferenceScriptAssets([...(project?.assets ?? []), ...assetLibraryAssets]);

export const selectHasPendingReferences = (references: ReferenceVideo[]): boolean =>
  hasActivePendingReferenceAnalysis(references);

export const selectScriptTemplateLibrary = (
  project: ProjectSnapshot | undefined,
  viralTemplateLibrary: ViralTemplate[],
): ViralTemplate[] => mergeTemplates(viralTemplateLibrary, project?.viralTemplates ?? []);
