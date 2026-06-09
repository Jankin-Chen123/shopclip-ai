import type {
  AssetMetadata,
  AssetSlice,
  RenderTask,
  ReferenceVideo,
  SmartEditResult,
  ScriptResult,
  StoryboardScene,
  ViralTemplate,
} from "@shopclip/shared";

import { assetMatchesCategory, type AssetCategory } from "../features/assets/AssetCategoryTabs";
import type { WorkspacePageId, WorkspaceSectionId } from "../components/layout/AppShell";
import type { AssetLibraryCategory, MediaSettings, ProjectSnapshot } from "../lib/api";
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
import {
  createSmartEditResultFromCompletedSourceRender,
  selectLatestCompletedSmartEditTask,
  selectStudioBaseRenderTask,
} from "./AppRenderUtils";
import type { Language } from "./i18n";
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

export type LoadedProjectWorkspaceState = {
  latestScript: ScriptResult | undefined;
  scriptDraft: string;
  selectedSceneId: string | undefined;
  selectedSmartEditSegmentId: string | undefined;
  smartEditResult: SmartEditResult | undefined;
  studioBaseRender: RenderTask | undefined;
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

export const selectLoadedProjectWorkspaceState = ({
  language,
  mediaSettings,
  project,
  smartEditTargetLanguage,
}: {
  language: Language;
  mediaSettings: MediaSettings;
  project: ProjectSnapshot;
  smartEditTargetLanguage: string;
}): LoadedProjectWorkspaceState => {
  const latestScript = project.scripts.at(-1);
  const studioBaseRender = selectStudioBaseRenderTask(project.renderTasks);
  const latestSmartEditRender = selectLatestCompletedSmartEditTask(project.renderTasks);
  const smartEditResult =
    latestSmartEditRender?.smartEditPlan &&
    latestSmartEditRender.exportUrl &&
    latestSmartEditRender.previewUrl
      ? {
          exportUrl: latestSmartEditRender.exportUrl,
          plan: latestSmartEditRender.smartEditPlan,
          previewUrl: latestSmartEditRender.previewUrl,
          renderTaskId: latestSmartEditRender.id,
          segmentOutputs: latestSmartEditRender.smartEditSegmentOutputs ?? [],
          traceEvents: [],
        }
      : studioBaseRender
        ? createSmartEditResultFromCompletedSourceRender({
            language,
            mediaSettings,
            renderTask: studioBaseRender,
            scenes: latestScript?.scenes ?? project.scenes,
            targetLanguage: smartEditTargetLanguage,
            traceEvents: [],
          })
        : undefined;

  return {
    latestScript,
    scriptDraft: latestScript?.narrative ?? "",
    selectedSceneId: latestScript?.scenes[0]?.id ?? project.scenes[0]?.id,
    selectedSmartEditSegmentId: smartEditResult?.plan.segments[0]?.id,
    smartEditResult,
    studioBaseRender,
  };
};

export const selectWorkspaceScenes = (
  script: ScriptResult | undefined,
  project: ProjectSnapshot | undefined,
): StoryboardScene[] => script?.scenes ?? project?.scenes ?? [];

export const selectSectionPage = (section: WorkspaceSectionId): WorkspacePageId => {
  if (section === "assets" || section === "inspiration" || section === "settings") {
    return section;
  }
  return "project";
};

export const selectAssetPrepKeywordsChanged = (
  projectPrepKeywords: string[],
  snapshotKeywords: string[],
): boolean => projectPrepKeywords.join("\u001f") !== snapshotKeywords.join("\u001f");

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

export const selectReferenceSourceAssets = (assets: AssetMetadata[]): AssetMetadata[] =>
  assets.filter(
    (asset) =>
      (asset.type === "video" || asset.mimeType?.startsWith("video/")) &&
      asset.source !== "public_reference",
  );

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
