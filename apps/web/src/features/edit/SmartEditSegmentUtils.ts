import type {
  AssetMetadata,
  SmartEditAudioVolumeKeyframe,
  SmartEditSegment,
  SmartEditVisualEffect,
} from "@shopclip/shared";

import {
  MIN_SMART_EDIT_CLIP_SECONDS,
  clampAudioVolume,
  clampBlur,
  clampEffectFade,
  clampOpacity,
  clampPercentOffset,
  clampPlaybackRate,
  clampRotationDegrees,
  clampSharpen,
  clampSmartEditDuration,
  clampTransformScale,
  clampVisualKeyframeTime,
} from "./SmartEditTimelineMath";

export type SmartEditVisualEffectType = SmartEditVisualEffect["type"];

export const transformForSegment = (segment: SmartEditSegment) => ({
  offsetXPercent: clampPercentOffset(segment.transform?.offsetXPercent ?? 0),
  offsetYPercent: clampPercentOffset(segment.transform?.offsetYPercent ?? 0),
  opacity: clampOpacity(segment.transform?.opacity ?? 1),
  rotateDegrees: clampRotationDegrees(segment.transform?.rotateDegrees ?? 0),
  scale: clampTransformScale(segment.transform?.scale ?? 1),
});

export const effectsForSegment = (segment: SmartEditSegment) => ({
  blur: clampBlur(segment.effects?.blur ?? 0),
  fadeInSeconds: clampEffectFade(segment.effects?.fadeInSeconds ?? 0),
  fadeOutSeconds: clampEffectFade(segment.effects?.fadeOutSeconds ?? 0),
  sharpen: clampSharpen(segment.effects?.sharpen ?? 0),
});

export const visualMaskForSegment = (segment: SmartEditSegment) => ({
  heightPercent: Number.isFinite(segment.visualMask?.heightPercent ?? Number.NaN)
    ? Math.max(1, Math.min(100, segment.visualMask!.heightPercent))
    : 80,
  id: segment.visualMask?.id ?? `${segment.id}-visual-mask`,
  inverted: segment.visualMask?.inverted ?? false,
  type: segment.visualMask?.type ?? "rectangle",
  widthPercent: Number.isFinite(segment.visualMask?.widthPercent ?? Number.NaN)
    ? Math.max(1, Math.min(100, segment.visualMask!.widthPercent))
    : 80,
  xPercent: Number.isFinite(segment.visualMask?.xPercent ?? Number.NaN)
    ? Math.max(0, Math.min(100, segment.visualMask!.xPercent))
    : 50,
  yPercent: Number.isFinite(segment.visualMask?.yPercent ?? Number.NaN)
    ? Math.max(0, Math.min(100, segment.visualMask!.yPercent))
    : 50,
});

export const visualEffectOptions: Array<{ label: string; type: SmartEditVisualEffectType }> = [
  { label: "Blur", type: "blur" },
  { label: "Sharpen", type: "sharpen" },
  { label: "Brightness", type: "brightness" },
  { label: "Contrast", type: "contrast" },
  { label: "Saturation", type: "saturation" },
  { label: "Vignette", type: "vignette" },
];

export const visualEffectLabel = (type: SmartEditVisualEffectType): string =>
  visualEffectOptions.find((option) => option.type === type)?.label ?? type;

export const defaultVisualEffectAmount = (type: SmartEditVisualEffectType): number => {
  if (type === "blur") {
    return 4;
  }
  if (type === "sharpen") {
    return 0.5;
  }
  if (type === "brightness") {
    return 0.1;
  }
  return 1;
};

export const clampVisualEffectAmount = (
  type: SmartEditVisualEffectType,
  amount: number,
): number => {
  const fallback = defaultVisualEffectAmount(type);
  const value = Number.isFinite(amount) ? amount : fallback;
  if (type === "blur") {
    return Math.max(0, Math.min(20, value));
  }
  if (type === "sharpen") {
    return Math.max(0, Math.min(2, value));
  }
  if (type === "brightness") {
    return Math.max(-1, Math.min(1, value));
  }
  if (type === "contrast" || type === "saturation") {
    return Math.max(0, Math.min(3, value));
  }
  return Math.max(0, Math.min(1, value));
};

export const visualEffectsForSegment = (segment: SmartEditSegment): SmartEditVisualEffect[] =>
  (segment.visualEffects ?? []).slice(0, 20).map((effect) => ({
    enabled: effect.enabled ?? true,
    id: effect.id,
    keyframes: (effect.keyframes ?? [])
      .filter((keyframe) => keyframe.param === "amount")
      .slice(0, 40)
      .map((keyframe) => ({
        easing: keyframe.easing ?? "linear",
        id: keyframe.id,
        param: "amount" as const,
        timeSecond: clampVisualKeyframeTime(keyframe.timeSecond, segment.durationSeconds),
        value: clampVisualEffectAmount(effect.type, keyframe.value),
      }))
      .sort((left, right) => left.timeSecond - right.timeSecond),
    params: {
      amount: clampVisualEffectAmount(
        effect.type,
        effect.params?.amount ?? defaultVisualEffectAmount(effect.type),
      ),
      radius: Math.max(0, Math.min(20, effect.params?.radius ?? 4)),
    },
    type: effect.type,
  }));

export const visualKeyframesForSegment = (segment: SmartEditSegment) =>
  [...(segment.visualKeyframes ?? [])].sort((left, right) => left.timeSecond - right.timeSecond);

export const visualEffectKeyframes = (effect: SmartEditVisualEffect) =>
  [...(effect.keyframes ?? [])].sort((left, right) => left.timeSecond - right.timeSecond);

export const upsertSmartEditKeyframeAtTime = <Keyframe extends { timeSecond: number }>({
  keyframe,
  keyframes,
  toleranceSeconds = 0.05,
}: {
  keyframe: Keyframe;
  keyframes: Keyframe[];
  toleranceSeconds?: number;
}): Keyframe[] =>
  [
    ...keyframes.filter(
      (candidate) => Math.abs(candidate.timeSecond - keyframe.timeSecond) > toleranceSeconds,
    ),
    keyframe,
  ].sort((left, right) => left.timeSecond - right.timeSecond);

export const audioVolumeKeyframes = (
  keyframes: SmartEditAudioVolumeKeyframe[] | undefined,
  durationSeconds: number,
): SmartEditAudioVolumeKeyframe[] =>
  (keyframes ?? [])
    .slice(0, 40)
    .map((keyframe) => ({
      easing: keyframe.easing ?? "linear",
      id: keyframe.id,
      timeSecond: clampVisualKeyframeTime(keyframe.timeSecond, durationSeconds),
      volume: clampAudioVolume(keyframe.volume),
    }))
    .sort((left, right) => left.timeSecond - right.timeSecond);

export const durationFromSourceRange = (
  startSecond: number | undefined,
  endSecond: number | undefined,
  playbackRate: number | undefined,
  fallbackDuration: number,
): number => {
  if (startSecond === undefined || endSecond === undefined || endSecond <= startSecond) {
    return clampSmartEditDuration(fallbackDuration);
  }
  return clampSmartEditDuration((endSecond - startSecond) / clampPlaybackRate(playbackRate ?? 1));
};

export const sourceLabel = (segment: SmartEditSegment, assets: AssetMetadata[]) => {
  const asset = segment.source.assetId
    ? assets.find((candidate) => candidate.id === segment.source.assetId)
    : undefined;
  if (asset) {
    return asset.name;
  }
  if (segment.source.kind === "generated-scene-clip") {
    return "Reused segment clip";
  }
  return segment.source.kind;
};

const mediaFragmentUrl = (url: string, segment: SmartEditSegment): string => {
  if (segment.source.startSecond === undefined) {
    return url;
  }
  const end = segment.source.endSecond ?? segment.source.startSecond + segment.durationSeconds;
  return `${url}#t=${segment.source.startSecond},${end}`;
};

export const previewMediaForSegment = (
  segment: SmartEditSegment | undefined,
  assets: AssetMetadata[],
):
  | {
      kind: "image" | "video";
      label: string;
      url: string;
    }
  | undefined => {
  if (!segment) {
    return undefined;
  }

  const asset = segment.source.assetId
    ? assets.find((candidate) => candidate.id === segment.source.assetId)
    : undefined;
  const url = segment.source.sceneClipUrl ?? segment.source.imageUrl ?? asset?.url;
  if (!url) {
    return undefined;
  }

  if (
    segment.source.kind === "generated-scene-clip" ||
    segment.source.kind === "video-slice" ||
    asset?.type === "video"
  ) {
    return {
      kind: "video",
      label: asset?.name ?? segment.source.kind,
      url: mediaFragmentUrl(url, segment),
    };
  }

  if (
    segment.source.kind === "image-asset" ||
    segment.source.kind === "fallback-still" ||
    asset?.type === "image"
  ) {
    return {
      kind: "image",
      label: asset?.name ?? segment.source.kind,
      url,
    };
  }

  return undefined;
};

export const trimSegmentSource = (
  segment: SmartEditSegment,
  edge: "in" | "out",
  sourceDeltaSeconds: number,
): SmartEditSegment => {
  const playbackRate = clampPlaybackRate(segment.playbackRate ?? 1);
  const sourceStart = segment.source.startSecond ?? 0;
  const sourceEnd = segment.source.endSecond ?? sourceStart + segment.durationSeconds * playbackRate;
  if (edge === "in") {
    const nextStart = Math.max(
      0,
      Math.min(sourceEnd - MIN_SMART_EDIT_CLIP_SECONDS * playbackRate, sourceStart + sourceDeltaSeconds),
    );
    return {
      ...segment,
      durationSeconds: durationFromSourceRange(
        nextStart,
        sourceEnd,
        playbackRate,
        segment.durationSeconds,
      ),
      source: {
        ...segment.source,
        endSecond: sourceEnd,
        startSecond: nextStart,
      },
    };
  }
  const nextEnd = Math.max(
    sourceStart + MIN_SMART_EDIT_CLIP_SECONDS * playbackRate,
    sourceEnd + sourceDeltaSeconds,
  );
  return {
    ...segment,
    durationSeconds: durationFromSourceRange(
      sourceStart,
      nextEnd,
      playbackRate,
      segment.durationSeconds,
    ),
    source: {
      ...segment.source,
      endSecond: nextEnd,
      startSecond: sourceStart,
    },
  };
};
