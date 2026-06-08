import type {
  MediaSettings,
  RenderTask,
  SmartEditPlan,
  SmartEditRequest,
  SmartEditResult,
  StoryboardScene,
  VideoGenerationSettings,
} from "@shopclip/shared";

import type { Language } from "./i18n";
import type { UserApiConfig } from "../lib/api";

interface SmartEditRequestInput {
  apiConfig: UserApiConfig;
  instructions: string;
  language: Language;
  mediaSettings: MediaSettings;
  renderTask: RenderTask | undefined;
  scenes: StoryboardScene[];
  smartEditResult: SmartEditResult | undefined;
  targetLanguage: string;
  videoSettings: VideoGenerationSettings;
}

export const createSmartEditRequestPayload = ({
  apiConfig,
  instructions,
  language,
  mediaSettings,
  renderTask,
  scenes,
  smartEditResult,
  targetLanguage,
  videoSettings,
}: SmartEditRequestInput): SmartEditRequest => {
  const renderedSceneSegments = selectRenderedSmartEditSceneSegments(
    renderTask,
    scenes,
    smartEditResult,
  );
  return {
    apiConfig,
    instructions: instructions || undefined,
    locale: language === "zh" ? "zh-CN" : "en-US",
    mediaSettings,
    currentPlan: smartEditResult?.plan,
    segments: selectSmartEditPlanSegmentOverrides(smartEditResult?.plan) ?? renderedSceneSegments,
    targetLanguage: targetLanguage.trim() || undefined,
    videoSettings,
  };
};

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
