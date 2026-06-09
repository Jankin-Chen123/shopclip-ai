import type { SmartEditPlan } from "@shopclip/shared";

import {
  audioVolumeKeyframes,
  normalizeAudioVolume,
  type SmartEditAudioVolumeKeyframe,
} from "./smartEditAudioFilters.js";
import {
  isTimelineElementHiddenByTrack,
  isTimelineElementMutedByTrack,
  normalizeInSegmentClipDuration,
  normalizeInSegmentOffset,
  timelineElementTrackKind,
  timelineSegmentStartSeconds,
} from "./smartEditTimelinePlan.js";

export type VoiceoverTimelineClip = {
  durationSeconds: number;
  fadeInSeconds: number;
  fadeOutSeconds: number;
  id: string;
  startSecond: number;
  text: string;
  volume: number;
  volumeKeyframes: SmartEditAudioVolumeKeyframe[];
};

export const voiceoverTimelineClips = (plan: SmartEditPlan): VoiceoverTimelineClip[] => {
  const enabledSegments = [...plan.segments]
    .filter((segment) => segment.enabled)
    .sort((left, right) => left.order - right.order);
  const timelineStarts = timelineSegmentStartSeconds(enabledSegments);
  const segmentClips = enabledSegments.flatMap((segment): VoiceoverTimelineClip[] => {
    const voiceText = segment.voiceover.trim();
    if (!voiceText) {
      return [];
    }
    const voiceOffsetSeconds = normalizeInSegmentOffset(segment.voiceoverStartOffsetSeconds, segment);
    const voiceDurationSeconds = normalizeInSegmentClipDuration(
      segment.voiceoverDurationSeconds,
      segment.voiceoverStartOffsetSeconds,
      segment,
    );
    return [
      {
        durationSeconds: voiceDurationSeconds,
        fadeInSeconds: segment.voiceoverFadeInSeconds ?? 0,
        fadeOutSeconds: segment.voiceoverFadeOutSeconds ?? 0,
        id: segment.id,
        startSecond: (timelineStarts.get(segment.id) ?? 0) + voiceOffsetSeconds,
        text: voiceText,
        volume: normalizeAudioVolume(segment.voiceoverVolume),
        volumeKeyframes: audioVolumeKeyframes(segment.voiceoverVolumeKeyframes, voiceDurationSeconds),
      },
    ];
  });
  const timelineVoiceClips = (plan.timeline?.elements ?? [])
    .filter(
      (element) =>
        (timelineElementTrackKind(element) === "voice" ||
          (timelineElementTrackKind(element) === "caption" && !element.segmentId)) &&
        !element.segmentId &&
        !element.hidden &&
        !element.muted &&
        !isTimelineElementHiddenByTrack(plan, element) &&
        !isTimelineElementMutedByTrack(plan, element),
    )
    .flatMap((element): VoiceoverTimelineClip[] => {
      const text = (element.text?.trim() || element.label.trim()).trim();
      if (!text) {
        return [];
      }
      return [
        {
          durationSeconds: element.durationSeconds,
          fadeInSeconds: element.audioFadeInSeconds ?? 0,
          fadeOutSeconds: element.audioFadeOutSeconds ?? 0,
          id: element.id,
          startSecond: element.startSecond,
          text,
          volume: normalizeAudioVolume(element.audioVolume),
          volumeKeyframes: audioVolumeKeyframes(element.audioVolumeKeyframes, element.durationSeconds),
        },
      ];
    });
  return [...segmentClips, ...timelineVoiceClips].sort((left, right) => left.startSecond - right.startSecond);
};
