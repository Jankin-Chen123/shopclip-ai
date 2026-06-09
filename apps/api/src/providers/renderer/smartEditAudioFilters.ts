import type { SmartEditPlan, SmartEditSegment } from "@shopclip/shared";

import { linearKeyframeExpression } from "./smartEditFfmpegExpressions.js";

export type SmartEditAudioVolumeKeyframe =
  NonNullable<SmartEditSegment["sourceAudioVolumeKeyframes"]>[number];

type SmartEditBgmTrack = SmartEditPlan["audio"]["bgmTrack"];

export const atempoFilter = (playbackRate: number): string => {
  const factors: number[] = [];
  let remaining = playbackRate;
  while (remaining > 2) {
    factors.push(2);
    remaining /= 2;
  }
  while (remaining < 0.5) {
    factors.push(0.5);
    remaining /= 0.5;
  }
  factors.push(remaining);
  return factors.map((factor) => `atempo=${factor.toFixed(4)}`).join(",");
};

export const normalizeAudioFadeSeconds = (
  seconds: number | undefined,
  durationSeconds: number,
): number => Math.max(0, Math.min(10, durationSeconds, seconds ?? 0));

export const audioFadeFilters = (
  durationSeconds: number,
  fadeInSeconds?: number,
  fadeOutSeconds?: number,
): string[] => {
  const fadeIn = normalizeAudioFadeSeconds(fadeInSeconds, durationSeconds);
  const fadeOut = normalizeAudioFadeSeconds(fadeOutSeconds, durationSeconds);
  return [
    ...(fadeIn > 0 && durationSeconds > fadeIn
      ? [`afade=t=in:st=0:d=${fadeIn.toFixed(2)}`]
      : []),
    ...(fadeOut > 0 && durationSeconds > fadeOut
      ? [
          `afade=t=out:st=${Math.max(0, durationSeconds - fadeOut).toFixed(2)}:d=${fadeOut.toFixed(
            2,
          )}`,
        ]
      : []),
  ];
};

export const normalizeAudioVolume = (volume: number | undefined): number =>
  Number.isFinite(volume) ? Math.max(0, Math.min(4, volume!)) : 1;

export const audioVolumeKeyframes = (
  keyframes: SmartEditAudioVolumeKeyframe[] | undefined,
  durationSeconds: number,
): SmartEditAudioVolumeKeyframe[] =>
  (keyframes ?? [])
    .slice(0, 40)
    .map((keyframe) => ({
      easing: keyframe.easing ?? "linear",
      id: keyframe.id,
      timeSecond: Math.max(0, Math.min(durationSeconds, keyframe.timeSecond)),
      volume: normalizeAudioVolume(keyframe.volume),
    }))
    .sort((left, right) => left.timeSecond - right.timeSecond);

export const audioVolumeFilter = (
  volume: number | undefined,
  keyframes: SmartEditAudioVolumeKeyframe[] | undefined,
  durationSeconds: number,
): string[] => {
  const normalizedVolume = normalizeAudioVolume(volume);
  const normalizedKeyframes = audioVolumeKeyframes(keyframes, durationSeconds);
  if (normalizedKeyframes.length >= 2) {
    const expression = linearKeyframeExpression(
      normalizedKeyframes,
      (keyframe) => keyframe.volume,
      normalizedVolume,
    );
    return [`volume='${expression}':eval=frame`];
  }
  if (Math.abs(normalizedVolume - 1) > 0.001) {
    return [`volume=${normalizedVolume.toFixed(3)}`];
  }
  return [];
};

const bgmProfiles: Record<Exclude<SmartEditBgmTrack, "none">, { lavfi: string; volume: number }> = {
  "creator-pop": {
    lavfi: "sine=frequency=523:sample_rate=44100",
    volume: 0.05,
  },
  "soft-lift": {
    lavfi: "sine=frequency=330:sample_rate=44100",
    volume: 0.035,
  },
  "tech-pulse": {
    lavfi: "sine=frequency=176:sample_rate=44100",
    volume: 0.045,
  },
};

export const smartEditBgmProfile = (
  bgmTrack: SmartEditBgmTrack,
): { lavfi: string; volume: number } | undefined =>
  bgmTrack === "none" ? undefined : bgmProfiles[bgmTrack] ?? bgmProfiles["creator-pop"];
