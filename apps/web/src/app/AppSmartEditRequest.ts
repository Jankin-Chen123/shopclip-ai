import type {
  RenderTask,
  SmartEditPlan,
  SmartEditRequest,
  SmartEditResult,
  StoryboardScene,
} from "@shopclip/shared";

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
