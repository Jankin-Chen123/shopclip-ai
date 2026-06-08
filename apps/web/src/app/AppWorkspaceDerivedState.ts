import type {
  AssetMetadata,
  AssetSlice,
  ReferenceVideo,
  ScriptResult,
  StoryboardScene,
  ViralTemplate,
} from "@shopclip/shared";

import { assetMatchesCategory, type AssetCategory } from "../features/assets/AssetCategoryTabs";
import type { WorkspacePageId } from "../components/layout/AppShell";
import type { AssetLibraryCategory, ProjectSnapshot } from "../lib/api";
import {
  getCreationAssetLibraryRefreshCategory,
  hasActivePendingReferenceAnalysis,
  mergeReferences,
  mergeTemplates,
} from "./AppSetupUtils";
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

export type WorkspaceAssetRefreshAction =
  | { type: "asset"; category: AssetLibraryCategory }
  | { type: "reference"; includeTemplates: true }
  | { type: "none" };

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

export const selectWorkspaceAssetRefreshAction = ({
  activeAssetCategory,
  activePage,
}: {
  activeAssetCategory: AssetCategory;
  activePage: WorkspacePageId;
}): WorkspaceAssetRefreshAction => {
  if (activePage === "assets") {
    return activeAssetCategory === "template"
      ? { type: "reference", includeTemplates: true }
      : { type: "asset", category: activeAssetCategory };
  }

  const creationAssetLibraryRefreshCategory =
    activePage === "inspiration" ? "all" : getCreationAssetLibraryRefreshCategory(activePage);
  return creationAssetLibraryRefreshCategory
    ? { type: "asset", category: creationAssetLibraryRefreshCategory }
    : { type: "none" };
};

export const selectWorkspaceScenes = (
  script: ScriptResult | undefined,
  project: ProjectSnapshot | undefined,
): StoryboardScene[] => script?.scenes ?? project?.scenes ?? [];

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
