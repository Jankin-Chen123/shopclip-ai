import type {
  AssetMetadata,
  AssetSlice,
  ReferenceVideo,
  RenderTask,
  ScriptResult,
  SmartEditPlan,
  SmartEditRequest,
  SmartEditResult,
  StoryboardScene,
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

export const selectWorkspaceScenes = (
  script: ScriptResult | undefined,
  project: ProjectSnapshot | undefined,
): StoryboardScene[] => script?.scenes ?? project?.scenes ?? [];

export const selectRenderedSmartEditSceneSegments = (
  renderTask: RenderTask | undefined,
  scenes: StoryboardScene[],
  smartEditResult: SmartEditResult | undefined,
): SmartEditRequest["segments"] => {
  if (smartEditResult || renderTask?.status !== "completed" || !renderTask.sceneClips) {
    return [];
  }

  return renderTask.sceneClips
    .filter((clip) => clip.videoUrl)
    .map((clip) => {
      const scene = scenes.find((candidate) => candidate.id === clip.sceneId);
      return {
        sceneId: clip.sceneId,
        durationSeconds: scene?.durationSeconds ?? 4,
        enabled: true,
        timelineStartSecond: 0,
        playbackRate: 1,
        sourceAudioMuted: false,
        sourceAudioStartOffsetSeconds: 0,
        captionHidden: false,
        captionStartOffsetSeconds: 0,
        voiceoverStartOffsetSeconds: 0,
        source: {
          kind: "generated-scene-clip" as const,
          sceneClipAudioUrl: clip.material?.audioUrl,
          sceneClipAudioWaveform: clip.material?.audioWaveform,
          sceneClipUrl: clip.videoUrl,
          sceneClipVideoOnlyUrl: clip.material?.videoOnlyUrl,
        },
        subtitle: clip.material?.text || clip.subtitle,
        transition: clip.order === 1 ? ("cut" as const) : ("fade" as const),
        voiceover: scene?.voiceover || clip.subtitle,
      };
    });
};

export const selectSmartEditPlanSegmentOverrides = (
  plan: SmartEditPlan | undefined,
): SmartEditRequest["segments"] | undefined =>
  plan?.segments.map((segment) => ({
    sceneId: segment.sceneId,
    durationSeconds: segment.durationSeconds,
    enabled: segment.enabled,
    timelineStartSecond: segment.timelineStartSecond,
    playbackRate: segment.playbackRate,
    captionHidden: segment.captionHidden,
    captionStartOffsetSeconds: segment.captionStartOffsetSeconds,
    captionDurationSeconds: segment.captionDurationSeconds,
    captionTextColor: segment.captionTextColor,
    captionTextFontSize: segment.captionTextFontSize,
    captionTextPositionYPercent: segment.captionTextPositionYPercent,
    voiceoverStartOffsetSeconds: segment.voiceoverStartOffsetSeconds,
    voiceoverDurationSeconds: segment.voiceoverDurationSeconds,
    voiceoverVolume: segment.voiceoverVolume,
    voiceoverVolumeKeyframes: segment.voiceoverVolumeKeyframes,
    voiceoverFadeInSeconds: segment.voiceoverFadeInSeconds,
    voiceoverFadeOutSeconds: segment.voiceoverFadeOutSeconds,
    source: segment.source,
    sourceAudioMuted: segment.sourceAudioMuted,
    sourceAudioStartOffsetSeconds: segment.sourceAudioStartOffsetSeconds,
    sourceAudioDurationSeconds: segment.sourceAudioDurationSeconds,
    sourceAudioVolume: segment.sourceAudioVolume,
    sourceAudioVolumeKeyframes: segment.sourceAudioVolumeKeyframes,
    sourceAudioFadeInSeconds: segment.sourceAudioFadeInSeconds,
    sourceAudioFadeOutSeconds: segment.sourceAudioFadeOutSeconds,
    subtitle: segment.subtitle,
    transition: segment.transition,
    voiceover: segment.voiceover,
  }));

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
