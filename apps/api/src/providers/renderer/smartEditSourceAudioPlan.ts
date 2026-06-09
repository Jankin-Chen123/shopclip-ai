import type { SmartEditPlan } from "@shopclip/shared";

import {
  audioVolumeKeyframes,
  normalizeAudioVolume,
  type SmartEditAudioVolumeKeyframe,
} from "./smartEditAudioFilters.js";
import {
  isTimelineElementHiddenByTrack,
  isTimelineElementMutedByTrack,
  normalizeDuration,
  normalizeInSegmentClipDuration,
  normalizeInSegmentOffset,
  normalizePlaybackRate,
  normalizeTimelineStart,
  timelineElementTrackKind,
  timelineSegmentStartSeconds,
} from "./smartEditTimelinePlan.js";

export type SourceAudioTimelineClip = {
  delaySeconds: number;
  durationSeconds: number;
  fadeInSeconds: number;
  fadeOutSeconds: number;
  id: string;
  mediaDurationSeconds: number;
  playbackRate: number;
  sourceUrl: string;
  startSecond: number;
  trimEndSecond: number;
  trimStartSecond: number;
  volume: number;
  volumeKeyframes: SmartEditAudioVolumeKeyframe[];
};

export const safeFileToken = (value: string): string =>
  value.replace(/[^a-zA-Z0-9_-]+/gu, "-").replace(/^-+|-+$/gu, "") || "clip";

export const globalTimelineDurationSeconds = (plan: SmartEditPlan): number =>
  Math.max(
    plan.timeline?.durationSeconds ?? 0,
    ...plan.segments
      .filter((segment) => segment.enabled)
      .map((segment) => normalizeTimelineStart(segment) + normalizeDuration(segment)),
    ...(plan.timeline?.elements ?? [])
      .filter((element) => !element.hidden && !isTimelineElementHiddenByTrack(plan, element))
      .map((element) => element.startSecond + element.durationSeconds),
    0.01,
  );

export const sourceAudioTimelineClips = (plan: SmartEditPlan): SourceAudioTimelineClip[] => {
  const enabledSegments = [...plan.segments]
    .filter((segment) => segment.enabled)
    .sort((left, right) => left.order - right.order);
  const timelineStarts = timelineSegmentStartSeconds(enabledSegments);
  const segmentClips = enabledSegments.flatMap((segment): SourceAudioTimelineClip[] => {
    const sourceAudioElement = plan.timeline?.elements.find(
      (element) =>
        element.segmentId === segment.id &&
        timelineElementTrackKind(element) === "sourceAudio",
    );
    const sourceAudioUrl = segment.sourceAudioMuted ||
      (sourceAudioElement &&
        (sourceAudioElement.muted ||
          sourceAudioElement.hidden ||
          isTimelineElementMutedByTrack(plan, sourceAudioElement) ||
          isTimelineElementHiddenByTrack(plan, sourceAudioElement)))
      ? undefined
      : sourceAudioElement?.sourceUrl ?? segment.source.sceneClipAudioUrl;
    if (!sourceAudioUrl) {
      return [];
    }
    const audioOffsetSeconds = normalizeInSegmentOffset(segment.sourceAudioStartOffsetSeconds, segment);
    const audioDurationSeconds = normalizeInSegmentClipDuration(
      sourceAudioElement?.durationSeconds ?? segment.sourceAudioDurationSeconds,
      segment.sourceAudioStartOffsetSeconds,
      segment,
    );
    const sourceAudioStart = sourceAudioElement?.trimStartSecond ?? segment.source.startSecond ?? 0;
    const trimEnd =
      sourceAudioElement?.trimEndSecond ??
      (segment.source.endSecond === undefined
        ? sourceAudioStart + audioDurationSeconds * normalizePlaybackRate(segment)
        : Math.min(
            segment.source.endSecond,
            sourceAudioStart + audioDurationSeconds * normalizePlaybackRate(segment),
          ));
    return [
      {
        delaySeconds: audioOffsetSeconds,
        durationSeconds: normalizeDuration(segment),
        fadeInSeconds: sourceAudioElement?.audioFadeInSeconds ?? segment.sourceAudioFadeInSeconds ?? 0,
        fadeOutSeconds: sourceAudioElement?.audioFadeOutSeconds ?? segment.sourceAudioFadeOutSeconds ?? 0,
        id: segment.id,
        mediaDurationSeconds: audioDurationSeconds,
        playbackRate: normalizePlaybackRate(segment),
        sourceUrl: sourceAudioUrl,
        startSecond: timelineStarts.get(segment.id) ?? 0,
        trimEndSecond: trimEnd,
        trimStartSecond: sourceAudioStart,
        volume: normalizeAudioVolume(sourceAudioElement?.audioVolume ?? segment.sourceAudioVolume),
        volumeKeyframes: audioVolumeKeyframes(
          sourceAudioElement?.audioVolumeKeyframes ?? segment.sourceAudioVolumeKeyframes,
          audioDurationSeconds,
        ),
      },
    ];
  });
  const globalElementClips = (plan.timeline?.elements ?? [])
    .filter(
      (element) =>
        timelineElementTrackKind(element) === "sourceAudio" &&
        !element.segmentId &&
        !element.hidden &&
        !element.muted &&
        !isTimelineElementHiddenByTrack(plan, element) &&
        !isTimelineElementMutedByTrack(plan, element) &&
        Boolean(element.sourceUrl),
    )
    .map((element): SourceAudioTimelineClip => {
      const trimStartSecond = element.trimStartSecond ?? 0;
      return {
        delaySeconds: 0,
        durationSeconds: element.durationSeconds,
        fadeInSeconds: element.audioFadeInSeconds ?? 0,
        fadeOutSeconds: element.audioFadeOutSeconds ?? 0,
        id: element.id,
        mediaDurationSeconds: element.durationSeconds,
        playbackRate: element.playbackRate ?? 1,
        sourceUrl: element.sourceUrl!,
        startSecond: element.startSecond,
        trimEndSecond: element.trimEndSecond ?? trimStartSecond + element.durationSeconds * (element.playbackRate ?? 1),
        trimStartSecond,
        volume: normalizeAudioVolume(element.audioVolume),
        volumeKeyframes: audioVolumeKeyframes(element.audioVolumeKeyframes, element.durationSeconds),
      };
    });
  return [...segmentClips, ...globalElementClips].sort((left, right) => left.startSecond - right.startSecond);
};

export const hasOverlappingSourceAudioClips = (clips: SourceAudioTimelineClip[]): boolean => {
  let cursor = 0;
  for (const clip of clips) {
    if (clip.startSecond < cursor - 0.01) {
      return true;
    }
    cursor = Math.max(cursor, clip.startSecond + clip.durationSeconds);
  }
  return false;
};
