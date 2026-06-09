import type { SmartEditPlan, SmartEditSegment, SmartEditVisualEffect } from "@shopclip/shared";

import {
  audioVolumeKeyframes,
  defaultVisualEffectAmount,
  effectsForSegment,
  transformForSegment,
  upsertSmartEditKeyframeAtTime,
  visualEffectKeyframes,
  visualEffectsForSegment,
  visualKeyframesForSegment,
  type SmartEditVisualEffectType,
} from "./SmartEditSegmentUtils";
import {
  clampAudioVolume,
  clampVisualKeyframeTime,
  clipDurationWithinSegment,
} from "./SmartEditTimelineMath";
import {
  replaceSegment,
  segmentTimelineBaseStart,
  type SmartEditTrackSegment,
} from "./SmartEditTimelineOperations";

export const addSmartEditVisualKeyframeAtPlayhead = ({
  boundedPlayheadSeconds,
  createToken,
  plan,
  selectedSegment,
}: {
  boundedPlayheadSeconds: number;
  createToken: () => string;
  plan: SmartEditPlan;
  selectedSegment: SmartEditSegment;
}): SmartEditPlan => {
  const selectedStart = segmentTimelineBaseStart(plan, selectedSegment.id);
  const timeSecond = clampVisualKeyframeTime(
    boundedPlayheadSeconds - selectedStart,
    selectedSegment.durationSeconds,
  );
  const token = createToken();
  return replaceSegment(plan, selectedSegment.id, (segment) => ({
    ...segment,
    visualKeyframes: upsertSmartEditKeyframeAtTime({
      keyframe: {
        easing: "linear" as const,
        effects: effectsForSegment(segment),
        id: `${segment.id}-visual-kf-${token}`,
        timeSecond,
        transform: transformForSegment(segment),
      },
      keyframes: visualKeyframesForSegment(segment),
    }),
  }));
};

export const removeSmartEditVisualKeyframe = ({
  keyframeId,
  plan,
  selectedSegment,
}: {
  keyframeId: string;
  plan: SmartEditPlan;
  selectedSegment: SmartEditSegment;
}): SmartEditPlan =>
  replaceSegment(plan, selectedSegment.id, (segment) => ({
    ...segment,
    visualKeyframes: visualKeyframesForSegment(segment).filter(
      (keyframe) => keyframe.id !== keyframeId,
    ),
  }));

export const addSmartEditVisualEffectToSegment = ({
  createToken,
  plan,
  selectedSegment,
  type,
}: {
  createToken: () => string;
  plan: SmartEditPlan;
  selectedSegment: SmartEditSegment;
  type: SmartEditVisualEffectType;
}): SmartEditPlan => {
  const token = createToken();
  return replaceSegment(plan, selectedSegment.id, (segment) => ({
    ...segment,
    visualEffects: [
      ...visualEffectsForSegment(segment),
      {
        enabled: true,
        id: `${segment.id}-${type}-effect-${token}`,
        params: {
          amount: defaultVisualEffectAmount(type),
          radius: 4,
        },
        type,
      },
    ].slice(0, 20),
  }));
};

export const updateSmartEditVisualEffectOnSegment = ({
  effectId,
  plan,
  selectedSegment,
  update,
}: {
  effectId: string;
  plan: SmartEditPlan;
  selectedSegment: SmartEditSegment;
  update: (effect: SmartEditVisualEffect) => SmartEditVisualEffect;
}): SmartEditPlan =>
  replaceSegment(plan, selectedSegment.id, (segment) => ({
    ...segment,
    visualEffects: visualEffectsForSegment(segment).map((effect) =>
      effect.id === effectId ? update(effect) : effect,
    ),
  }));

export const removeSmartEditVisualEffectFromSegment = ({
  effectId,
  plan,
  selectedSegment,
}: {
  effectId: string;
  plan: SmartEditPlan;
  selectedSegment: SmartEditSegment;
}): SmartEditPlan =>
  replaceSegment(plan, selectedSegment.id, (segment) => ({
    ...segment,
    visualEffects: visualEffectsForSegment(segment).filter((effect) => effect.id !== effectId),
  }));

export const moveSmartEditVisualEffectOnSegment = ({
  direction,
  effectId,
  plan,
  selectedSegment,
}: {
  direction: -1 | 1;
  effectId: string;
  plan: SmartEditPlan;
  selectedSegment: SmartEditSegment;
}): SmartEditPlan =>
  replaceSegment(plan, selectedSegment.id, (segment) => {
    const effects = visualEffectsForSegment(segment);
    const index = effects.findIndex((effect) => effect.id === effectId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= effects.length) {
      return segment;
    }
    const nextEffects = [...effects];
    const [moved] = nextEffects.splice(index, 1);
    nextEffects.splice(nextIndex, 0, moved!);
    return {
      ...segment,
      visualEffects: nextEffects,
    };
  });

export const addSmartEditVisualEffectAmountKeyframe = ({
  boundedPlayheadSeconds,
  createToken,
  effectId,
  plan,
  selectedSegment,
}: {
  boundedPlayheadSeconds: number;
  createToken: () => string;
  effectId: string;
  plan: SmartEditPlan;
  selectedSegment: SmartEditSegment;
}): SmartEditPlan => {
  const selectedStart = segmentTimelineBaseStart(plan, selectedSegment.id);
  const timeSecond = clampVisualKeyframeTime(
    boundedPlayheadSeconds - selectedStart,
    selectedSegment.durationSeconds,
  );
  const token = createToken();
  return replaceSegment(plan, selectedSegment.id, (segment) => ({
    ...segment,
    visualEffects: visualEffectsForSegment(segment).map((effect) => {
      if (effect.id !== effectId) {
        return effect;
      }
      return {
        ...effect,
        keyframes: upsertSmartEditKeyframeAtTime({
          keyframe: {
            easing: "linear" as const,
            id: `${effect.id}-amount-kf-${token}`,
            param: "amount" as const,
            timeSecond,
            value: effect.params.amount,
          },
          keyframes: visualEffectKeyframes(effect),
        }),
      };
    }),
  }));
};

export const removeSmartEditVisualEffectAmountKeyframe = ({
  effectId,
  keyframeId,
  plan,
  selectedSegment,
}: {
  effectId: string;
  keyframeId: string;
  plan: SmartEditPlan;
  selectedSegment: SmartEditSegment;
}): SmartEditPlan =>
  replaceSegment(plan, selectedSegment.id, (segment) => ({
    ...segment,
    visualEffects: visualEffectsForSegment(segment).map((effect) =>
      effect.id === effectId
        ? {
            ...effect,
            keyframes: visualEffectKeyframes(effect).filter(
              (keyframe) => keyframe.id !== keyframeId,
            ),
          }
        : effect,
    ),
  }));

export const addSmartEditSegmentAudioVolumeKeyframeAtPlayhead = ({
  boundedPlayheadSeconds,
  createToken,
  plan,
  selectedSegment,
  selectedTrackClip,
  trackId,
}: {
  boundedPlayheadSeconds: number;
  createToken: () => string;
  plan: SmartEditPlan;
  selectedSegment: SmartEditSegment;
  selectedTrackClip: SmartEditTrackSegment | undefined;
  trackId: "sourceAudio" | "voice";
}): SmartEditPlan => {
  const selectedStart = segmentTimelineBaseStart(plan, selectedSegment.id);
  const clipStartSecond =
    selectedTrackClip?.startSecond ??
    selectedStart +
      (trackId === "sourceAudio"
        ? selectedSegment.sourceAudioStartOffsetSeconds ?? 0
        : selectedSegment.voiceoverStartOffsetSeconds ?? 0);
  const clipDurationSeconds =
    trackId === "sourceAudio"
      ? clipDurationWithinSegment(
          selectedSegment.sourceAudioDurationSeconds,
          selectedSegment.sourceAudioStartOffsetSeconds,
          selectedSegment.durationSeconds,
        )
      : clipDurationWithinSegment(
          selectedSegment.voiceoverDurationSeconds,
          selectedSegment.voiceoverStartOffsetSeconds,
          selectedSegment.durationSeconds,
        );
  const timeSecond = clampVisualKeyframeTime(
    boundedPlayheadSeconds - clipStartSecond,
    clipDurationSeconds,
  );
  const token = createToken();
  return replaceSegment(plan, selectedSegment.id, (segment) => {
    if (trackId === "sourceAudio") {
      return {
        ...segment,
        sourceAudioVolumeKeyframes: upsertSmartEditKeyframeAtTime({
          keyframe: {
            easing: "linear" as const,
            id: `${segment.id}-source-volume-kf-${token}`,
            timeSecond,
            volume: clampAudioVolume(segment.sourceAudioVolume ?? 1),
          },
          keyframes: audioVolumeKeyframes(
            segment.sourceAudioVolumeKeyframes,
            clipDurationSeconds,
          ),
        }),
      };
    }
    return {
      ...segment,
      voiceoverVolumeKeyframes: upsertSmartEditKeyframeAtTime({
        keyframe: {
          easing: "linear" as const,
          id: `${segment.id}-voice-volume-kf-${token}`,
          timeSecond,
          volume: clampAudioVolume(segment.voiceoverVolume ?? 1),
        },
        keyframes: audioVolumeKeyframes(
          segment.voiceoverVolumeKeyframes,
          clipDurationSeconds,
        ),
      }),
    };
  });
};

export const removeSmartEditSegmentAudioVolumeKeyframe = ({
  keyframeId,
  plan,
  selectedSegment,
  trackId,
}: {
  keyframeId: string;
  plan: SmartEditPlan;
  selectedSegment: SmartEditSegment;
  trackId: "sourceAudio" | "voice";
}): SmartEditPlan =>
  replaceSegment(plan, selectedSegment.id, (segment) =>
    trackId === "sourceAudio"
      ? {
          ...segment,
          sourceAudioVolumeKeyframes: audioVolumeKeyframes(
            segment.sourceAudioVolumeKeyframes,
            segment.durationSeconds,
          ).filter((keyframe) => keyframe.id !== keyframeId),
        }
      : {
          ...segment,
          voiceoverVolumeKeyframes: audioVolumeKeyframes(
            segment.voiceoverVolumeKeyframes,
            segment.durationSeconds,
          ).filter((keyframe) => keyframe.id !== keyframeId),
        },
  );
