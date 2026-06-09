import type { SmartEditPlan, SmartEditSegment } from "@shopclip/shared";

export const normalizeDuration = (segment: SmartEditSegment): number =>
  Math.max(0.1, Math.min(120, segment.durationSeconds));

export const normalizePlaybackRate = (segment: SmartEditSegment): number =>
  Math.max(0.25, Math.min(4, segment.playbackRate ?? 1));

export const normalizeTimelineStart = (segment: SmartEditSegment): number =>
  Math.max(0, Math.min(600, segment.timelineStartSecond ?? 0));

export const normalizeInSegmentOffset = (
  offsetSeconds: number | undefined,
  segment: SmartEditSegment,
): number => Math.max(0, Math.min(normalizeDuration(segment) - 0.01, offsetSeconds ?? 0));

export const normalizeInSegmentClipDuration = (
  durationSeconds: number | undefined,
  offsetSeconds: number | undefined,
  segment: SmartEditSegment,
): number => {
  const startOffset = normalizeInSegmentOffset(offsetSeconds, segment);
  const maxDuration = Math.max(0.1, normalizeDuration(segment) - startOffset);
  return Math.max(0.1, Math.min(maxDuration, durationSeconds ?? maxDuration));
};

export type SmartEditTimelineElement = NonNullable<SmartEditPlan["timeline"]>["elements"][number];

export const timelineElementTrackKind = (
  element: Pick<SmartEditTimelineElement, "kind" | "trackId">,
): "video" | "sourceAudio" | "caption" | "voice" | "bgm" =>
  element.trackId === "audio-source"
    ? "sourceAudio"
    : element.trackId === "text-copy"
      ? "caption"
      : element.trackId === "video-main"
        ? "video"
        : element.trackId === "bgm-bed"
          ? "bgm"
          : element.kind === "audio"
            ? "voice"
            : element.kind === "text"
              ? "caption"
              : element.kind;

const timelineTrackForElement = (
  plan: SmartEditPlan,
  element: Pick<SmartEditTimelineElement, "trackId">,
) => plan.timeline?.tracks.find((track) => track.id === element.trackId);

export const isTimelineElementHiddenByTrack = (
  plan: SmartEditPlan,
  element: Pick<SmartEditTimelineElement, "trackId">,
): boolean => timelineTrackForElement(plan, element)?.hidden ?? false;

export const isTimelineElementMutedByTrack = (
  plan: SmartEditPlan,
  element: Pick<SmartEditTimelineElement, "trackId">,
): boolean => timelineTrackForElement(plan, element)?.muted ?? false;

const timelineElementOffsetWithinSegment = (
  element: SmartEditTimelineElement,
  baseStartSecond: number,
  segment: SmartEditSegment,
): number =>
  normalizeInSegmentOffset(
    Math.max(0, element.startSecond - baseStartSecond),
    segment,
  );

const isDerivedTimelineElement = (element: SmartEditTimelineElement): boolean =>
  element.id === "bgm-bed" ||
  (!!element.segmentId &&
    [
      `${element.segmentId}-video`,
      `${element.segmentId}-audio`,
      `${element.segmentId}-text`,
      `${element.segmentId}-voice`,
    ].includes(element.id));

const persistentVideoTimelineElements = (plan: SmartEditPlan): SmartEditTimelineElement[] =>
  (plan.timeline?.elements ?? [])
    .filter(
      (element) =>
        timelineElementTrackKind(element) === "video" &&
        !isDerivedTimelineElement(element) &&
        !element.hidden &&
        !isTimelineElementHiddenByTrack(plan, element) &&
        Boolean(element.segmentId || element.sceneId) &&
        Boolean(element.sourceUrl),
    )
    .sort((left, right) => left.startSecond - right.startSecond);

const timelineElementMidpoint = (element: SmartEditTimelineElement): number =>
  element.startSecond + element.durationSeconds / 2;

const owningVideoElementForTimelineElement = (
  element: SmartEditTimelineElement,
  videoElements: SmartEditTimelineElement[],
): SmartEditTimelineElement | undefined => {
  const midpoint = timelineElementMidpoint(element);
  return (
    videoElements.find((videoElement) => {
      if (element.segmentId && videoElement.segmentId !== element.segmentId) {
        return false;
      }
      return (
        midpoint >= videoElement.startSecond - 0.001 &&
        midpoint <= videoElement.startSecond + videoElement.durationSeconds + 0.001
      );
    }) ??
    videoElements.find((videoElement) => element.segmentId && videoElement.segmentId === element.segmentId)
  );
};

const planWithPersistentVideoElementSegments = (plan: SmartEditPlan): SmartEditPlan => {
  const videoElements = persistentVideoTimelineElements(plan);
  if (videoElements.length === 0) {
    return plan;
  }

  const segments = videoElements.flatMap((videoElement, index): SmartEditSegment[] => {
    const baseSegment = plan.segments.find(
      (segment) =>
        segment.id === videoElement.segmentId ||
        segment.sceneId === videoElement.sceneId,
    );
    if (!baseSegment) {
      return [];
    }
    const trimStartSecond = videoElement.trimStartSecond ?? baseSegment.source.startSecond;
    const trimEndSecond =
      videoElement.trimEndSecond ??
      (trimStartSecond === undefined
        ? baseSegment.source.endSecond
        : trimStartSecond + videoElement.durationSeconds * (videoElement.playbackRate ?? 1));
    return [
      {
        ...baseSegment,
        durationSeconds: videoElement.durationSeconds,
        enabled: !videoElement.hidden,
        id: videoElement.id,
        order: index + 1,
        playbackRate: videoElement.playbackRate ?? baseSegment.playbackRate,
        sceneId: videoElement.sceneId ?? baseSegment.sceneId,
        timelineStartSecond: videoElement.startSecond,
        source: {
          ...baseSegment.source,
          ...(videoElement.sourceUrl
            ? {
                sceneClipVideoOnlyUrl: videoElement.sourceUrl,
              }
            : {}),
          ...(trimStartSecond !== undefined ? { startSecond: trimStartSecond } : {}),
          ...(trimEndSecond !== undefined ? { endSecond: trimEndSecond } : {}),
        },
        visualEffects: videoElement.visualEffects ?? baseSegment.visualEffects,
      },
    ];
  });

  if (segments.length === 0) {
    return plan;
  }

  const elements = (plan.timeline?.elements ?? []).map((element) => {
    const owningVideoElement =
      timelineElementTrackKind(element) === "video"
        ? videoElements.find((videoElement) => videoElement.id === element.id)
        : owningVideoElementForTimelineElement(element, videoElements);
    if (!owningVideoElement) {
      return element;
    }
    return {
      ...element,
      sceneId: owningVideoElement.sceneId ?? element.sceneId,
      segmentId: owningVideoElement.id,
    };
  });

  return {
    ...plan,
    segments,
    targetDurationSeconds:
      plan.timeline?.durationSeconds ??
      Math.max(...segments.map((segment) => normalizeTimelineStart(segment) + normalizeDuration(segment))),
    timeline: plan.timeline
      ? {
          ...plan.timeline,
          elements,
        }
      : plan.timeline,
  };
};

const planWithPersistentTimelineElementOverrides = (plan: SmartEditPlan): SmartEditPlan => {
  const elements = plan.timeline?.elements ?? [];
  if (elements.length === 0) {
    return plan;
  }

  return {
    ...plan,
    segments: plan.segments.map((segment) => {
      const segmentElements = elements.filter((element) => element.segmentId === segment.id);
      if (segmentElements.length === 0) {
        return segment;
      }
      const videoElement = segmentElements.find(
        (element) => timelineElementTrackKind(element) === "video",
      );
      const segmentDuration = videoElement
        ? normalizeDuration({ ...segment, durationSeconds: videoElement.durationSeconds })
        : normalizeDuration(segment);
      const baseStartSecond = videoElement?.startSecond ?? normalizeTimelineStart(segment);
      const sourceStartSecond = videoElement?.trimStartSecond ?? segment.source.startSecond;
      const sourceEndSecond =
        videoElement?.trimEndSecond ??
        (sourceStartSecond === undefined
          ? segment.source.endSecond
          : sourceStartSecond + segmentDuration * normalizePlaybackRate(segment));
      const sourceAudioElement = segmentElements.find(
        (element) => timelineElementTrackKind(element) === "sourceAudio",
      );
      const captionElement = segmentElements.find(
        (element) => timelineElementTrackKind(element) === "caption",
      );
      const voiceElement = segmentElements.find(
        (element) => timelineElementTrackKind(element) === "voice",
      );
      const nextSegment: SmartEditSegment = {
        ...segment,
        durationSeconds: segmentDuration,
        playbackRate: videoElement?.playbackRate ?? segment.playbackRate,
        timelineStartSecond: baseStartSecond,
        source: {
          ...segment.source,
          ...(videoElement?.sourceUrl ? { sceneClipVideoOnlyUrl: videoElement.sourceUrl } : {}),
          ...(sourceStartSecond !== undefined ? { startSecond: sourceStartSecond } : {}),
          ...(sourceEndSecond !== undefined ? { endSecond: sourceEndSecond } : {}),
        },
        visualEffects: videoElement?.visualEffects ?? segment.visualEffects,
      };

      if (sourceAudioElement) {
        nextSegment.sourceAudioMuted = sourceAudioElement.muted;
        nextSegment.sourceAudioStartOffsetSeconds = timelineElementOffsetWithinSegment(
          sourceAudioElement,
          baseStartSecond,
          nextSegment,
        );
        nextSegment.sourceAudioDurationSeconds = sourceAudioElement.durationSeconds;
        nextSegment.sourceAudioVolume = sourceAudioElement.audioVolume ?? segment.sourceAudioVolume;
        nextSegment.sourceAudioVolumeKeyframes =
          sourceAudioElement.audioVolumeKeyframes ?? segment.sourceAudioVolumeKeyframes;
        nextSegment.sourceAudioFadeInSeconds =
          sourceAudioElement.audioFadeInSeconds ?? segment.sourceAudioFadeInSeconds;
        nextSegment.sourceAudioFadeOutSeconds =
          sourceAudioElement.audioFadeOutSeconds ?? segment.sourceAudioFadeOutSeconds;
        nextSegment.source = {
          ...nextSegment.source,
          ...(sourceAudioElement.sourceUrl ? { sceneClipAudioUrl: sourceAudioElement.sourceUrl } : {}),
        };
      }

      if (captionElement) {
        nextSegment.captionHidden = captionElement.hidden;
        nextSegment.captionStartOffsetSeconds = timelineElementOffsetWithinSegment(
          captionElement,
          baseStartSecond,
          nextSegment,
        );
        nextSegment.captionDurationSeconds = captionElement.durationSeconds;
        nextSegment.captionTextColor = captionElement.textColor;
        nextSegment.captionTextFontSize = captionElement.textFontSize;
        nextSegment.captionTextPositionYPercent = captionElement.textPositionYPercent;
        nextSegment.subtitle = captionElement.text?.trim() || captionElement.label || segment.subtitle;
      }

      if (voiceElement) {
        nextSegment.voiceoverStartOffsetSeconds = timelineElementOffsetWithinSegment(
          voiceElement,
          baseStartSecond,
          nextSegment,
        );
        nextSegment.voiceoverDurationSeconds = voiceElement.durationSeconds;
        nextSegment.voiceoverVolume = voiceElement.audioVolume ?? segment.voiceoverVolume;
        nextSegment.voiceoverVolumeKeyframes =
          voiceElement.audioVolumeKeyframes ?? segment.voiceoverVolumeKeyframes;
        nextSegment.voiceoverFadeInSeconds =
          voiceElement.audioFadeInSeconds ?? segment.voiceoverFadeInSeconds;
        nextSegment.voiceoverFadeOutSeconds =
          voiceElement.audioFadeOutSeconds ?? segment.voiceoverFadeOutSeconds;
        nextSegment.voiceover = voiceElement.text?.trim() || voiceElement.label || segment.voiceover;
      }

      return nextSegment;
    }),
  };
};

export const smartEditExecutableTimelinePlan = (plan: SmartEditPlan): SmartEditPlan =>
  planWithPersistentTimelineElementOverrides(planWithPersistentVideoElementSegments(plan));

export const timelineSegmentStartSeconds = (segments: SmartEditSegment[]): Map<string, number> => {
  const starts = new Map<string, number>();
  const hasManualStarts = segments.some((segment) => normalizeTimelineStart(segment) > 0);
  let cursor = 0;
  for (const segment of segments) {
    const requestedStart = normalizeTimelineStart(segment);
    const start = hasManualStarts ? requestedStart : cursor;
    starts.set(segment.id, start);
    cursor = Math.max(cursor, start + normalizeDuration(segment));
  }
  return starts;
};
