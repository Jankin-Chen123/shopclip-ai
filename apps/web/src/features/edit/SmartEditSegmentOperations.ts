import type {
  SmartEditPlan,
  SmartEditSegment,
  SmartEditTimeline,
} from "@shopclip/shared";

import { audioVolumeKeyframes } from "./SmartEditSegmentUtils";
import type { SmartEditTrackId } from "./SmartEditTrackUtils";
import type {
  SmartEditClipboard,
  SmartEditTimelineEditMode,
  SmartEditTimelineElement,
} from "./SmartEditTimelineTypes";
import {
  MIN_SMART_EDIT_CLIP_SECONDS,
  TIMELINE_EDGE_SNAP_SECONDS,
  clampInSegmentOffset,
  clampPlaybackRate,
  clampSmartEditDuration,
  clampTimelineStart,
  clipDurationWithinSegment,
  snapTimelineSeconds,
} from "./SmartEditTimelineMath";

export const reorderSegments = (
  plan: SmartEditPlan,
  segmentId: string,
  direction: "earlier" | "later",
): SmartEditPlan => {
  const sorted = [...plan.segments].sort((left, right) => left.order - right.order);
  const index = sorted.findIndex((segment) => segment.id === segmentId);
  const targetIndex = direction === "earlier" ? index - 1 : index + 1;
  if (index < 0 || targetIndex < 0 || targetIndex >= sorted.length) {
    return plan;
  }
  const current = sorted[index]!;
  sorted[index] = sorted[targetIndex]!;
  sorted[targetIndex] = current;
  return withRebuiltTimeline({
    ...plan,
    segments: sorted.map((segment, segmentIndex) => ({
      ...segment,
      order: segmentIndex + 1,
    })),
  });
};

export const replaceSegment = (
  plan: SmartEditPlan,
  segmentId: string,
  update: (segment: SmartEditSegment) => SmartEditSegment,
): SmartEditPlan => {
  const segments = plan.segments.map((segment) =>
    segment.id === segmentId ? update(segment) : segment,
  );
  return withRebuiltTimeline({
    ...plan,
    segments,
  });
};

type SmartEditTimelineInterval = {
  endSecond: number;
  id: string;
  startSecond: number;
};

export const smartEditTrackIdForTimelineTrack = (
  track: Pick<SmartEditTimeline["tracks"][number], "id" | "kind">,
): SmartEditTrackId =>
  (track.id === "audio-source"
    ? "sourceAudio"
    : track.kind === "audio"
      ? "voice"
      : track.kind === "text"
        ? "caption"
        : track.kind) as SmartEditTrackId;

export const smartEditTrackIdForElement = (
  element: Pick<SmartEditTimeline["elements"][number], "kind" | "trackId">,
): SmartEditTrackId =>
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

export const timelineDurationForElements = (timeline: SmartEditTimeline | undefined): number | undefined => {
  if (!timeline?.elements.length) {
    return undefined;
  }
  return Math.min(
    600,
    Math.max(
      1,
      ...timeline.elements
        .filter((element) => !element.hidden)
        .map((element) => element.startSecond + element.durationSeconds),
    ),
  );
};

export const isDerivedTimelineElement = (element: SmartEditTimeline["elements"][number]): boolean =>
  element.id === "bgm-bed" ||
  (!!element.segmentId &&
    [
      `${element.segmentId}-video`,
      `${element.segmentId}-audio`,
      `${element.segmentId}-text`,
      `${element.segmentId}-voice`,
    ].includes(element.id));

const hasPersistentTimelineElements = (timeline: SmartEditTimeline | undefined): boolean =>
  !!timeline?.elements.some((element) => !isDerivedTimelineElement(element));

const persistentTimelineElementsForSegment = (
  plan: SmartEditPlan,
  segmentId: string,
): SmartEditTimeline["elements"] =>
  (plan.timeline?.elements ?? []).filter(
    (element) => element.segmentId === segmentId && !isDerivedTimelineElement(element),
  );

const clonePersistentTimelineElementsForSegmentCopies = (
  plan: SmartEditPlan,
  copies: Array<{
    duplicateSegmentId: string;
    duplicateStart: number;
    elementToken: string;
    sourceSegmentId: string;
    sourceStart: number;
  }>,
): SmartEditTimeline["elements"] =>
  copies.flatMap((copy) =>
    persistentTimelineElementsForSegment(plan, copy.sourceSegmentId).map((element) => ({
      ...element,
      id: `${element.id}-${copy.elementToken}`,
      label: `${element.label} (copy)`,
      segmentId: copy.duplicateSegmentId,
      startSecond: clampTimelineStart(
        snapTimelineSeconds(copy.duplicateStart + element.startSecond - copy.sourceStart),
      ),
    })),
  );

const withPersistentTimelineCopies = (
  plan: SmartEditPlan,
  copiedElements: SmartEditTimeline["elements"],
): SmartEditPlan => {
  if (!copiedElements.length || !plan.timeline) {
    return plan;
  }
  return {
    ...plan,
    timeline: {
      ...plan.timeline,
      durationSeconds:
        timelineDurationForElements({
          ...plan.timeline,
          elements: [...plan.timeline.elements, ...copiedElements],
        }) ?? plan.timeline.durationSeconds,
      elements: [...plan.timeline.elements, ...copiedElements],
    },
  };
};

export const mergePersistentTimelineWithDerivedSegments = (
  plan: SmartEditPlan,
  rebuiltTimeline: SmartEditTimeline,
): SmartEditTimeline => {
  if (!hasPersistentTimelineElements(plan.timeline)) {
    return rebuiltTimeline;
  }
  const persistentElements = plan.timeline!.elements;
  const persistentSegmentIds = new Set(
    persistentElements.map((element) => element.segmentId).filter(Boolean),
  );
  const mergedElements = [
    ...persistentElements,
    ...rebuiltTimeline.elements.filter((element) =>
      element.segmentId
        ? !persistentSegmentIds.has(element.segmentId)
        : !persistentElements.some((persistent) => persistent.id === element.id),
    ),
  ];
  const mergedTrackIds = new Set(plan.timeline!.tracks.map((track) => track.id));
  const mergedTracks = [
    ...plan.timeline!.tracks,
    ...rebuiltTimeline.tracks.filter((track) => !mergedTrackIds.has(track.id)),
  ];
  return {
    durationSeconds:
      timelineDurationForElements({
        ...plan.timeline!,
        elements: mergedElements,
      }) ?? rebuiltTimeline.durationSeconds,
    elements: mergedElements,
    scale: plan.timeline!.scale,
    tracks: mergedTracks,
  };
};

export const segmentTimelineBaseStart = (
  plan: SmartEditPlan,
  segmentId: string,
  fallbackStarts = timelineStartsForSegments(plan.segments),
): number => {
  const videoElement = plan.timeline?.elements.find(
    (element) => element.segmentId === segmentId && smartEditTrackIdForElement(element) === "video",
  );
  return clampTimelineStart(videoElement?.startSecond ?? fallbackStarts.get(segmentId) ?? 0);
};

export const isTextEditingTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLTextAreaElement ||
  target instanceof HTMLSelectElement ||
  (target instanceof HTMLElement && target.isContentEditable);

export const isPlaybackShortcutControlTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLButtonElement ||
  target instanceof HTMLAnchorElement ||
  target instanceof HTMLVideoElement ||
  (target instanceof HTMLElement && target.getAttribute("role") === "button");

const planDurationSeconds = (segments: SmartEditSegment[]): number =>
  Math.min(
    600,
    Math.max(
      1,
      timelineDurationForSegments(segments),
    ),
  );

export const timelineDurationForSegments = (segments: SmartEditSegment[]): number => {
  const enabledSegments = segments.filter((segment) => segment.enabled);
  const hasManualTimelineStarts = enabledSegments.some(
    (segment) => clampTimelineStart(segment.timelineStartSecond ?? 0) > 0,
  );
  let cursor = 0;
  for (const segment of enabledSegments) {
    const startSecond = hasManualTimelineStarts
      ? clampTimelineStart(segment.timelineStartSecond ?? 0)
      : cursor;
    cursor = Math.max(cursor, startSecond + segment.durationSeconds);
  }
  return cursor;
};

export const buildSmartEditTimeline = (plan: SmartEditPlan): SmartEditTimeline => {
  const enabledSegments = [...plan.segments]
    .filter((segment) => segment.enabled)
    .sort((left, right) => left.order - right.order);
  const hasManualTimelineStarts = enabledSegments.some(
    (segment) => clampTimelineStart(segment.timelineStartSecond ?? 0) > 0,
  );
  const tracks: SmartEditTimeline["tracks"] = [
    {
      hidden: false,
      id: "video-main",
      kind: "video",
      label: "Video",
      locked: false,
      muted: false,
    },
    {
      hidden: false,
      id: "audio-source",
      kind: "audio",
      label: "Source audio",
      locked: false,
      muted: false,
    },
    {
      hidden: false,
      id: "text-copy",
      kind: "text",
      label: "Text",
      locked: false,
      muted: false,
    },
    {
      hidden: false,
      id: "voiceover",
      kind: "audio",
      label: "Voice",
      locked: false,
      muted: false,
    },
    ...(plan.audio.bgmTrack !== "none"
      ? [
          {
            hidden: false,
            id: "bgm-bed",
            kind: "bgm" as const,
            label: "BGM",
            locked: false,
            muted: false,
          },
        ]
      : []),
  ];
  const elements: SmartEditTimeline["elements"] = [];
  let cursor = 0;
  for (const segment of enabledSegments) {
    const startSecond = hasManualTimelineStarts
      ? clampTimelineStart(segment.timelineStartSecond ?? 0)
      : cursor;
    const durationSeconds = segment.durationSeconds;
    const sourceStart = segment.source.startSecond ?? 0;
    const sourceEnd = segment.source.endSecond;
    cursor = Math.max(cursor, startSecond + durationSeconds);
    elements.push({
      detachedAudio: false,
      durationSeconds,
      hidden: false,
      id: `${segment.id}-video`,
      kind: "video",
      label: `Scene ${segment.order}`,
      muted: false,
      playbackRate: segment.playbackRate ?? 1,
      sceneId: segment.sceneId,
      segmentId: segment.id,
      sourceDurationSeconds:
        sourceEnd !== undefined ? Math.max(0.1, sourceEnd - sourceStart) : durationSeconds,
      sourceUrl:
        segment.source.sceneClipVideoOnlyUrl ?? segment.source.sceneClipUrl ?? segment.source.imageUrl,
      startSecond,
      trackId: "video-main",
      trimEndSecond: sourceEnd,
      trimStartSecond: sourceStart,
    });
    if (segment.source.sceneClipAudioUrl) {
      const sourceAudioOffsetSeconds = clampInSegmentOffset(
        segment.sourceAudioStartOffsetSeconds ?? 0,
        durationSeconds,
      );
      const sourceAudioDurationSeconds = clipDurationWithinSegment(
        segment.sourceAudioDurationSeconds,
        sourceAudioOffsetSeconds,
        durationSeconds,
      );
      elements.push({
        detachedAudio: true,
        durationSeconds: sourceAudioDurationSeconds,
        hidden: false,
        id: `${segment.id}-audio`,
        kind: "audio",
        label: `Scene ${segment.order} audio`,
        muted: segment.sourceAudioMuted ?? false,
        audioFadeInSeconds: segment.sourceAudioFadeInSeconds ?? 0,
        audioFadeOutSeconds: segment.sourceAudioFadeOutSeconds ?? 0,
        audioVolume: segment.sourceAudioVolume ?? 1,
        audioVolumeKeyframes: audioVolumeKeyframes(
          segment.sourceAudioVolumeKeyframes,
          sourceAudioDurationSeconds,
        ),
        playbackRate: segment.playbackRate ?? 1,
        sceneId: segment.sceneId,
        segmentId: segment.id,
        sourceUrl: segment.source.sceneClipAudioUrl,
        startSecond: startSecond + sourceAudioOffsetSeconds,
        trackId: "audio-source",
        trimEndSecond:
          sourceEnd === undefined
            ? sourceStart + sourceAudioDurationSeconds * (segment.playbackRate ?? 1)
            : Math.min(sourceEnd, sourceStart + sourceAudioDurationSeconds * (segment.playbackRate ?? 1)),
        trimStartSecond: sourceStart,
      });
    }
    const captionOffsetSeconds = clampInSegmentOffset(segment.captionStartOffsetSeconds ?? 0, durationSeconds);
    const captionDurationSeconds = clipDurationWithinSegment(
      segment.captionDurationSeconds,
      captionOffsetSeconds,
      durationSeconds,
    );
    elements.push({
      detachedAudio: false,
      durationSeconds: captionDurationSeconds,
      hidden: segment.captionHidden ?? false,
      id: `${segment.id}-text`,
      kind: "text",
      label: segment.subtitle,
      muted: false,
      playbackRate: 1,
      sceneId: segment.sceneId,
      segmentId: segment.id,
      startSecond: startSecond + captionOffsetSeconds,
      text: segment.subtitle,
      textColor: segment.captionTextColor,
      textFontSize: segment.captionTextFontSize,
      textPositionYPercent: segment.captionTextPositionYPercent,
      trackId: "text-copy",
      trimStartSecond: 0,
    });
    if (segment.voiceover.trim()) {
      const voiceoverOffsetSeconds = clampInSegmentOffset(
        segment.voiceoverStartOffsetSeconds ?? 0,
        durationSeconds,
      );
      const voiceoverDurationSeconds = clipDurationWithinSegment(
        segment.voiceoverDurationSeconds,
        voiceoverOffsetSeconds,
        durationSeconds,
      );
      elements.push({
        detachedAudio: false,
        durationSeconds: voiceoverDurationSeconds,
        hidden: false,
        id: `${segment.id}-voice`,
        kind: "audio",
        label: segment.voiceover,
        muted: false,
        audioFadeInSeconds: segment.voiceoverFadeInSeconds ?? 0,
        audioFadeOutSeconds: segment.voiceoverFadeOutSeconds ?? 0,
        audioVolume: segment.voiceoverVolume ?? 1,
        audioVolumeKeyframes: audioVolumeKeyframes(
          segment.voiceoverVolumeKeyframes,
          voiceoverDurationSeconds,
        ),
        playbackRate: 1,
        sceneId: segment.sceneId,
        segmentId: segment.id,
        startSecond: startSecond + voiceoverOffsetSeconds,
        text: segment.voiceover,
        trackId: "voiceover",
        trimStartSecond: 0,
      });
    }
  }

  if (plan.audio.bgmTrack !== "none" && cursor > 0) {
    elements.push({
      detachedAudio: false,
      durationSeconds: cursor,
      hidden: false,
      id: "bgm-bed",
      kind: "bgm",
      label: plan.audio.bgmTrack,
      muted: false,
      playbackRate: 1,
      startSecond: 0,
      trackId: "bgm-bed",
      trimStartSecond: 0,
    });
  }

  return {
    durationSeconds: cursor,
    elements,
    scale: plan.timeline?.scale ?? 1,
    tracks,
  };
};

export const withRebuiltTimeline = (plan: SmartEditPlan): SmartEditPlan => {
  const timeline = mergePersistentTimelineWithDerivedSegments(plan, buildSmartEditTimeline(plan));
  return {
    ...plan,
    targetDurationSeconds: timelineDurationForElements(timeline) ?? planDurationSeconds(plan.segments),
    timeline,
  };
};

export type SmartEditRippleGap = {
  endSecond: number;
  startSecond: number;
};

const normalizedRippleGaps = (gaps: SmartEditRippleGap[]): SmartEditRippleGap[] =>
  gaps
    .map((gap) => ({
      endSecond: snapTimelineSeconds(Math.max(gap.startSecond, gap.endSecond)),
      startSecond: snapTimelineSeconds(Math.min(gap.startSecond, gap.endSecond)),
    }))
    .filter((gap) => gap.endSecond - gap.startSecond >= MIN_SMART_EDIT_CLIP_SECONDS)
    .sort((left, right) => left.startSecond - right.startSecond)
    .reduce<SmartEditRippleGap[]>((merged, gap) => {
      const previous = merged.at(-1);
      if (!previous || gap.startSecond > previous.endSecond + 0.001) {
        merged.push(gap);
        return merged;
      }
      previous.endSecond = snapTimelineSeconds(Math.max(previous.endSecond, gap.endSecond));
      return merged;
    }, []);

const rippleShiftAtSecond = (second: number, gaps: SmartEditRippleGap[]): number =>
  normalizedRippleGaps(gaps).reduce((shiftSeconds, gap) => {
    const gapDurationSeconds = snapTimelineSeconds(gap.endSecond - gap.startSecond);
    if (second >= gap.endSecond - 0.001) {
      return snapTimelineSeconds(shiftSeconds + gapDurationSeconds);
    }
    return shiftSeconds;
  }, 0);

const rippleTimelineStart = (second: number, gaps: SmartEditRippleGap[]): number => {
  const normalized = normalizedRippleGaps(gaps);
  const containingGap = normalized.find(
    (gap) => second > gap.startSecond + 0.001 && second < gap.endSecond + 0.001,
  );
  if (containingGap) {
    return clampTimelineStart(
      snapTimelineSeconds(containingGap.startSecond - rippleShiftAtSecond(containingGap.startSecond, normalized)),
    );
  }
  return clampTimelineStart(snapTimelineSeconds(second - rippleShiftAtSecond(second, normalized)));
};

export const shiftTimelineElementsByRippleGaps = (
  elements: SmartEditTimeline["elements"],
  gaps: SmartEditRippleGap[],
): SmartEditTimeline["elements"] =>
  normalizedRippleGaps(gaps).length === 0
    ? elements
    : elements.map((element) => ({
        ...element,
        startSecond: rippleTimelineStart(element.startSecond, gaps),
      }));

export const shiftSegmentsByRippleGaps = (
  segments: SmartEditSegment[],
  gaps: SmartEditRippleGap[],
  currentStarts = timelineStartsForSegments(segments),
): SmartEditSegment[] =>
  normalizedRippleGaps(gaps).length === 0
    ? segments
    : segments.map((segment) => ({
        ...segment,
        timelineStartSecond: rippleTimelineStart(
          currentStarts.get(segment.id) ?? segment.timelineStartSecond ?? 0,
          gaps,
        ),
      }));

export const timelineStartsForSegments = (segments: SmartEditSegment[]): Map<string, number> => {
  const sortedSegments = [...segments].sort((left, right) => left.order - right.order);
  const hasManualTimelineStarts = sortedSegments
    .filter((segment) => segment.enabled)
    .some((segment) => clampTimelineStart(segment.timelineStartSecond ?? 0) > 0);
  const starts = new Map<string, number>();
  let cursor = 0;
  for (const segment of sortedSegments) {
    const startSecond =
      segment.enabled && hasManualTimelineStarts
        ? clampTimelineStart(segment.timelineStartSecond ?? 0)
        : cursor;
    starts.set(segment.id, startSecond);
    if (segment.enabled) {
      cursor = Math.max(cursor, startSecond + segment.durationSeconds);
    }
  }
  return starts;
};

export const timelineIntervalsForSegments = (
  segments: SmartEditSegment[],
  currentStarts = timelineStartsForSegments(segments),
  excludedIds = new Set<string>(),
): SmartEditTimelineInterval[] =>
  segments
    .filter((segment) => segment.enabled && !excludedIds.has(segment.id))
    .map((segment) => {
      const startSecond = clampTimelineStart(currentStarts.get(segment.id) ?? segment.timelineStartSecond ?? 0);
      return {
        endSecond: snapTimelineSeconds(startSecond + segment.durationSeconds),
        id: segment.id,
        startSecond,
      };
    })
    .sort((left, right) => left.startSecond - right.startSecond);

export const intervalsOverlap = (
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number,
): boolean => leftStart < rightEnd - 0.001 && leftEnd > rightStart + 0.001;

export const resolveTimelineBlockStart = (
  intervals: SmartEditTimelineInterval[],
  blockItems: Array<{ durationSeconds: number; offsetSecond: number }>,
  desiredStart: number,
  snapPoints: number[] = [],
): number => {
  if (blockItems.length === 0) {
    return clampTimelineStart(snapTimelineSeconds(desiredStart));
  }

  const edgeSnapStarts = snapPoints.flatMap((point) =>
    blockItems.flatMap((item) => [
      point - item.offsetSecond,
      point - item.offsetSecond - item.durationSeconds,
    ]),
  );
  const nearbySnapStart = edgeSnapStarts
    .map((point) => clampTimelineStart(snapTimelineSeconds(point)))
    .filter((point) => Math.abs(point - desiredStart) <= TIMELINE_EDGE_SNAP_SECONDS)
    .sort((left, right) => Math.abs(left - desiredStart) - Math.abs(right - desiredStart))[0];
  const snappedDesired = clampTimelineStart(snapTimelineSeconds(nearbySnapStart ?? desiredStart));
  const rawCandidates = [
    snappedDesired,
    ...edgeSnapStarts,
    ...intervals.flatMap((interval) =>
      blockItems.flatMap((item) => [
        interval.endSecond - item.offsetSecond,
        interval.startSecond - item.offsetSecond - item.durationSeconds,
      ]),
    ),
  ];

  const candidates = [...new Set([
    snappedDesired,
    ...rawCandidates.map((candidate) => clampTimelineStart(snapTimelineSeconds(candidate))),
  ])].sort((left, right) => {
      const leftDistance = Math.abs(left - snappedDesired);
      const rightDistance = Math.abs(right - snappedDesired);
      return leftDistance === rightDistance ? left - right : leftDistance - rightDistance;
    });

  const hasCollision = (candidate: number): boolean =>
    blockItems.some((item) => {
      const startSecond = clampTimelineStart(candidate + item.offsetSecond);
      const endSecond = snapTimelineSeconds(startSecond + item.durationSeconds);
      return intervals.some((interval) =>
        intervalsOverlap(startSecond, endSecond, interval.startSecond, interval.endSecond),
      );
    });

  return candidates.find((candidate) => !hasCollision(candidate)) ?? snappedDesired;
};

const containingTimelineInterval = (
  intervals: SmartEditTimelineInterval[],
  desiredStart: number,
): SmartEditTimelineInterval | undefined => {
  const snappedDesired = clampTimelineStart(snapTimelineSeconds(desiredStart));
  return intervals.find(
    (interval) =>
      snappedDesired > interval.startSecond + MIN_SMART_EDIT_CLIP_SECONDS &&
      snappedDesired < interval.endSecond - MIN_SMART_EDIT_CLIP_SECONDS,
  );
};

const splitSmartEditSegmentForInsert = (
  segment: SmartEditSegment,
  offsetSeconds: number,
  rightId: string,
): { left: SmartEditSegment; right: SmartEditSegment } | undefined => {
  if (
    offsetSeconds < MIN_SMART_EDIT_CLIP_SECONDS ||
    segment.durationSeconds - offsetSeconds < MIN_SMART_EDIT_CLIP_SECONDS
  ) {
    return undefined;
  }
  const playbackRate = clampPlaybackRate(segment.playbackRate ?? 1);
  const firstDuration = clampSmartEditDuration(offsetSeconds);
  const secondDuration = clampSmartEditDuration(segment.durationSeconds - offsetSeconds);
  const sourceStart = segment.source.startSecond ?? 0;
  const sourceEnd = segment.source.endSecond ?? sourceStart + segment.durationSeconds * playbackRate;
  const sourceMid = Math.min(sourceEnd, sourceStart + firstDuration * playbackRate);
  return {
    left: {
      ...segment,
      durationSeconds: firstDuration,
      source: {
        ...segment.source,
        endSecond: sourceMid,
        startSecond: sourceStart,
      },
    },
    right: {
      ...segment,
      durationSeconds: secondDuration,
      id: rightId,
      source: {
        ...segment.source,
        endSecond: sourceEnd,
        startSecond: sourceMid,
      },
      subtitle: `${segment.subtitle} (split)`,
    },
  };
};

export const splitPersistentTimelineElement = (
  element: SmartEditTimelineElement,
  splitSecond: number,
  rightSegmentId: string | undefined,
  splitToken: string,
): SmartEditTimelineElement[] => {
  const elementStart = clampTimelineStart(element.startSecond);
  const elementEnd = snapTimelineSeconds(elementStart + element.durationSeconds);
  if (splitSecond <= elementStart + 0.001) {
    return [{ ...element, segmentId: rightSegmentId }];
  }
  if (splitSecond >= elementEnd - 0.001) {
    return [element];
  }

  const leftDuration = Math.max(0, snapTimelineSeconds(splitSecond - elementStart));
  const rightDuration = Math.max(0, snapTimelineSeconds(elementEnd - splitSecond));
  if (leftDuration <= 0.001) {
    return [{ ...element, segmentId: rightSegmentId }];
  }
  if (rightDuration <= 0.001) {
    return [element];
  }

  const playbackRate = clampPlaybackRate(element.playbackRate ?? 1);
  const trimStart = element.trimStartSecond ?? 0;
  const originalTrimEnd =
    element.trimEndSecond ?? trimStart + element.durationSeconds * playbackRate;
  const splitTrim = Math.min(
    originalTrimEnd,
    trimStart + leftDuration * playbackRate,
  );
  const usesSourceTrim = element.kind === "video" || element.kind === "audio";
  const leftElement: SmartEditTimelineElement = {
    ...element,
    durationSeconds: leftDuration,
    ...(usesSourceTrim ? { trimEndSecond: splitTrim } : {}),
  };
  const rightElement: SmartEditTimelineElement = {
    ...element,
    durationSeconds: rightDuration,
    id: `${element.id}-split-${splitToken}`,
    label: `${element.label} (split)`,
    segmentId: rightSegmentId,
    startSecond: splitSecond,
    ...(usesSourceTrim
      ? {
          trimEndSecond: originalTrimEnd,
          trimStartSecond: splitTrim,
        }
      : {}),
  };
  return [leftElement, rightElement];
};

export const trimPersistentTimelineElementAtSecond = (
  element: SmartEditTimelineElement,
  splitSecond: number,
  side: "left" | "right",
): SmartEditTimelineElement[] => {
  const elementStart = clampTimelineStart(element.startSecond);
  const elementEnd = snapTimelineSeconds(elementStart + element.durationSeconds);
  if (side === "left") {
    if (splitSecond <= elementStart + 0.001) {
      return [];
    }
    if (splitSecond >= elementEnd - 0.001) {
      return [element];
    }
  } else {
    if (splitSecond <= elementStart + 0.001) {
      return [element];
    }
    if (splitSecond >= elementEnd - 0.001) {
      return [];
    }
  }

  const playbackRate = clampPlaybackRate(element.playbackRate ?? 1);
  const trimStart = element.trimStartSecond ?? 0;
  const trimEnd = element.trimEndSecond ?? trimStart + element.durationSeconds * playbackRate;
  const usesSourceTrim = element.kind === "video" || element.kind === "audio";

  if (side === "left") {
    const nextDuration = Math.max(0, snapTimelineSeconds(splitSecond - elementStart));
    if (nextDuration < MIN_SMART_EDIT_CLIP_SECONDS) {
      return [];
    }
    return [
      {
        ...element,
        durationSeconds: nextDuration,
        ...(usesSourceTrim
          ? { trimEndSecond: Math.min(trimEnd, trimStart + nextDuration * playbackRate) }
          : {}),
      },
    ];
  }

  const nextDuration = Math.max(0, snapTimelineSeconds(elementEnd - splitSecond));
  if (nextDuration < MIN_SMART_EDIT_CLIP_SECONDS) {
    return [];
  }
  const sourceOffsetSeconds = Math.max(0, splitSecond - elementStart) * playbackRate;
  return [
    {
      ...element,
      durationSeconds: nextDuration,
      startSecond: splitSecond,
      ...(usesSourceTrim
        ? {
            trimEndSecond: trimEnd,
            trimStartSecond: Math.min(trimEnd, trimStart + sourceOffsetSeconds),
          }
        : {}),
    },
  ];
};

const splitPersistentTimelineElementsForSegment = (
  plan: SmartEditPlan,
  segmentId: string,
  splitSecond: number,
  rightSegmentId: string,
  splitToken: string,
): SmartEditTimeline["elements"] | undefined => {
  if (!plan.timeline || !hasPersistentTimelineElements(plan.timeline)) {
    return undefined;
  }
  return plan.timeline.elements.flatMap((element) => {
    if (element.segmentId !== segmentId) {
      return [element];
    }
    if (isDerivedTimelineElement(element)) {
      return [];
    }
    return splitPersistentTimelineElement(
      element,
      splitSecond,
      rightSegmentId,
      splitToken,
    );
  });
};

const trimPersistentTimelineElementsForSegment = (
  plan: SmartEditPlan,
  segmentId: string,
  splitSecond: number,
  side: "left" | "right",
): SmartEditTimeline["elements"] | undefined => {
  if (!plan.timeline || !hasPersistentTimelineElements(plan.timeline)) {
    return undefined;
  }
  return plan.timeline.elements.flatMap((element) => {
    if (element.segmentId !== segmentId) {
      return [element];
    }
    if (isDerivedTimelineElement(element)) {
      return [];
    }
    return trimPersistentTimelineElementAtSecond(element, splitSecond, side);
  });
};

export const splitSmartEditSegmentOnTimeline = (
  plan: SmartEditPlan,
  segmentId: string,
  offsetSeconds: number,
  splitToken = String(Date.now()),
): SmartEditPlan | undefined => {
  const sorted = [...plan.segments].sort((left, right) => left.order - right.order);
  const index = sorted.findIndex((segment) => segment.id === segmentId);
  const targetSegment = sorted[index];
  if (!targetSegment) {
    return undefined;
  }
  const rightId = `${targetSegment.id}-split-${splitToken}`;
  const splitSegment = splitSmartEditSegmentForInsert(targetSegment, offsetSeconds, rightId);
  if (!splitSegment) {
    return undefined;
  }

  const currentStarts = timelineStartsForSegments(plan.segments);
  const targetStart = segmentTimelineBaseStart(plan, targetSegment.id, currentStarts);
  const firstDuration = splitSegment.left.durationSeconds;
  const splitSecond = snapTimelineSeconds(targetStart + firstDuration);
  const splitElements = splitPersistentTimelineElementsForSegment(
    plan,
    targetSegment.id,
    splitSecond,
    rightId,
    splitToken,
  );
  sorted.splice(index, 1, splitSegment.left, splitSegment.right);

  return withRebuiltTimeline({
    ...(splitElements && plan.timeline
      ? {
          ...plan,
          timeline: {
            ...plan.timeline,
            elements: splitElements,
          },
        }
      : plan),
    segments: sorted.map((segment, segmentIndex) => ({
      ...segment,
      order: segmentIndex + 1,
      timelineStartSecond:
        segment.id === targetSegment.id
          ? targetStart
          : segment.id === rightId
            ? clampTimelineStart(targetStart + firstDuration)
            : clampTimelineStart(currentStarts.get(segment.id) ?? segment.timelineStartSecond ?? 0),
    })),
  });
};

export const trimSmartEditSegmentAtPlayhead = (
  plan: SmartEditPlan,
  segmentId: string,
  offsetSeconds: number,
  side: "left" | "right",
  editMode: SmartEditTimelineEditMode = "magnetic",
): SmartEditPlan | undefined => {
  const sorted = [...plan.segments].sort((left, right) => left.order - right.order);
  const targetSegment = sorted.find((segment) => segment.id === segmentId);
  if (!targetSegment) {
    return undefined;
  }
  const splitSegment = splitSmartEditSegmentForInsert(
    targetSegment,
    offsetSeconds,
    `${targetSegment.id}-trim-preview`,
  );
  if (!splitSegment) {
    return undefined;
  }

  const currentStarts = timelineStartsForSegments(plan.segments);
  const targetStart = segmentTimelineBaseStart(plan, targetSegment.id, currentStarts);
  const retainedSegment =
    side === "left"
      ? splitSegment.left
      : {
          ...splitSegment.right,
          id: targetSegment.id,
          subtitle: targetSegment.subtitle,
          timelineStartSecond: clampTimelineStart(targetStart + splitSegment.left.durationSeconds),
        };
  const splitSecond = snapTimelineSeconds(targetStart + splitSegment.left.durationSeconds);
  const retainedElements = trimPersistentTimelineElementsForSegment(
    plan,
    targetSegment.id,
    splitSecond,
    side,
  );
  const removedGap: SmartEditRippleGap =
    side === "left"
      ? {
          endSecond: snapTimelineSeconds(targetStart + targetSegment.durationSeconds),
          startSecond: splitSecond,
        }
      : {
          endSecond: splitSecond,
          startSecond: targetStart,
        };
  const shouldRipple = editMode === "ripple";
  const baseSegments = sorted.map((segment, segmentIndex) => ({
    ...(segment.id === targetSegment.id ? retainedSegment : segment),
    order: segmentIndex + 1,
    timelineStartSecond:
      segment.id === targetSegment.id
        ? side === "left"
          ? targetStart
          : clampTimelineStart(targetStart + splitSegment.left.durationSeconds)
        : clampTimelineStart(currentStarts.get(segment.id) ?? segment.timelineStartSecond ?? 0),
  }));
  const nextSegments = shouldRipple
    ? shiftSegmentsByRippleGaps(baseSegments, [removedGap], currentStarts)
    : baseSegments;
  const nextElements =
    shouldRipple && retainedElements
      ? shiftTimelineElementsByRippleGaps(retainedElements, [removedGap])
      : retainedElements;

  return withRebuiltTimeline({
    ...(nextElements && plan.timeline
      ? {
          ...plan,
          timeline: {
            ...plan.timeline,
            elements: nextElements,
          },
        }
      : plan),
    segments: nextSegments,
  });
};

export const removeSmartEditSegmentsFromTimeline = (
  plan: SmartEditPlan,
  segmentIds: string[],
  editMode: SmartEditTimelineEditMode = "magnetic",
): SmartEditPlan => {
  if (segmentIds.length === 0 || plan.segments.length <= 1) {
    return plan;
  }
  const removeIdSet = new Set(segmentIds);
  const sorted = [...plan.segments].sort((left, right) => left.order - right.order);
  const currentStarts = timelineStartsForSegments(plan.segments);
  const removedSegments = sorted.filter((segment) => removeIdSet.has(segment.id));
  const retainedSegments = sorted.filter((segment) => !removeIdSet.has(segment.id));
  if (removedSegments.length === 0 || retainedSegments.length === 0) {
    return plan;
  }
  const removedGaps = removedSegments
    .filter((segment) => segment.enabled)
    .map((segment) => {
      const startSecond = currentStarts.get(segment.id) ?? segment.timelineStartSecond ?? 0;
      return {
        endSecond: snapTimelineSeconds(startSecond + segment.durationSeconds),
        startSecond,
      };
    });
  const orderedSegments = retainedSegments.map((segment, index) => ({
    ...segment,
    order: index + 1,
    timelineStartSecond: clampTimelineStart(currentStarts.get(segment.id) ?? segment.timelineStartSecond ?? 0),
  }));
  const nextSegments =
    editMode === "ripple"
      ? shiftSegmentsByRippleGaps(orderedSegments, removedGaps, currentStarts)
      : orderedSegments;
  const baseTimeline = plan.timeline ?? buildSmartEditTimeline(plan);
  const retainedElements = baseTimeline.elements.filter(
    (element) => !element.segmentId || !removeIdSet.has(element.segmentId),
  );
  const nextElements =
    editMode === "ripple"
      ? shiftTimelineElementsByRippleGaps(retainedElements, removedGaps)
      : retainedElements;

  return withRebuiltTimeline({
    ...plan,
    timeline: {
      ...baseTimeline,
      elements: nextElements,
    },
    segments: nextSegments,
  });
};

const buildInsertMoveSegments = ({
  blockDurationSeconds,
  currentStarts,
  desiredStart,
  duplicateToken,
  insertedSegments,
  plan,
  replacedSegmentIds,
}: {
  blockDurationSeconds: number;
  currentStarts: Map<string, number>;
  desiredStart: number;
  duplicateToken: string;
  insertedSegments: SmartEditSegment[];
  plan: SmartEditPlan;
  replacedSegmentIds: Set<string>;
}): SmartEditSegment[] => {
  const intervals = timelineIntervalsForSegments(plan.segments, currentStarts, replacedSegmentIds);
  const containingInterval = containingTimelineInterval(intervals, desiredStart);
  const containingSegment = containingInterval
    ? plan.segments.find((segment) => segment.id === containingInterval.id)
    : undefined;
  const splitOffset =
    containingInterval && containingSegment ? desiredStart - containingInterval.startSecond : undefined;
  const splitSegment =
    containingSegment && splitOffset !== undefined
      ? splitSmartEditSegmentForInsert(
          containingSegment,
          splitOffset,
          `${containingSegment.id}-insert-split-${duplicateToken}`,
        )
      : undefined;
  const nextSegments: SmartEditSegment[] = [];

  for (const segment of [...plan.segments].sort((left, right) => left.order - right.order)) {
    if (replacedSegmentIds.has(segment.id)) {
      continue;
    }
    const startSecond = clampTimelineStart(currentStarts.get(segment.id) ?? segment.timelineStartSecond ?? 0);
    if (splitSegment && segment.id === containingSegment?.id && containingInterval) {
      nextSegments.push({
        ...splitSegment.left,
        timelineStartSecond: containingInterval.startSecond,
      });
      nextSegments.push(...insertedSegments);
      nextSegments.push({
        ...splitSegment.right,
        timelineStartSecond: clampTimelineStart(desiredStart + blockDurationSeconds),
      });
      continue;
    }
    if (!splitSegment && startSecond >= desiredStart - 0.001 && nextSegments.every((item) => item.id !== insertedSegments[0]?.id)) {
      nextSegments.push(...insertedSegments);
    }
    nextSegments.push({
      ...segment,
      timelineStartSecond:
        segment.enabled && startSecond >= desiredStart - 0.001
          ? clampTimelineStart(startSecond + blockDurationSeconds)
          : startSecond,
    });
  }

  if (nextSegments.every((segment) => segment.id !== insertedSegments[0]?.id)) {
    nextSegments.push(...insertedSegments);
  }

  return nextSegments.map((segment, index) => ({
    ...segment,
    order: index + 1,
  }));
};

export const moveSmartEditSegmentOnTimeline = (
  plan: SmartEditPlan,
  segmentId: string,
  deltaSeconds: number,
  playheadSecond?: number,
): SmartEditPlan => {
  return moveSmartEditSegmentOnTimelineWithMode(
    plan,
    segmentId,
    deltaSeconds,
    "magnetic",
    playheadSecond,
  );
};

export const moveSmartEditSegmentOnTimelineWithMode = (
  plan: SmartEditPlan,
  segmentId: string,
  deltaSeconds: number,
  editMode: SmartEditTimelineEditMode = "magnetic",
  playheadSecond?: number,
): SmartEditPlan => {
  const currentStarts = timelineStartsForSegments(plan.segments);
  const currentStart = currentStarts.get(segmentId);
  const targetSegment = plan.segments.find((segment) => segment.id === segmentId);
  if (currentStart === undefined || !targetSegment) {
    return plan;
  }
  if (editMode !== "magnetic") {
    const existingIntervals = timelineIntervalsForSegments(
      plan.segments,
      currentStarts,
      new Set([segmentId]),
    );
    const desiredStart =
      editMode === "insert"
        ? clampTimelineStart(snapTimelineSeconds(currentStart + deltaSeconds))
        : clampTimelineStart(snapTimelineSeconds(currentStart + deltaSeconds));
    const desiredEnd = snapTimelineSeconds(desiredStart + targetSegment.durationSeconds);
    if (editMode === "insert") {
      return withRebuiltTimeline({
        ...plan,
        segments: buildInsertMoveSegments({
          blockDurationSeconds: targetSegment.durationSeconds,
          currentStarts,
          desiredStart,
          duplicateToken: `move-${segmentId}`,
          insertedSegments: [
            {
              ...targetSegment,
              enabled: true,
              timelineStartSecond: desiredStart,
            },
          ],
          plan,
          replacedSegmentIds: new Set([segmentId]),
        }),
      });
    }
    return withRebuiltTimeline({
      ...plan,
      segments: plan.segments.map((segment) => {
        const startSecond = clampTimelineStart(currentStarts.get(segment.id) ?? segment.timelineStartSecond ?? 0);
        if (segment.id === segmentId) {
          return {
            ...segment,
            enabled: true,
            timelineStartSecond: desiredStart,
          };
        }
        if (
          editMode === "overwrite" &&
          segment.enabled &&
          existingIntervals.some(
            (interval) =>
              interval.id === segment.id &&
              intervalsOverlap(desiredStart, desiredEnd, interval.startSecond, interval.endSecond),
          )
        ) {
          return {
            ...segment,
            enabled: false,
            timelineStartSecond: startSecond,
          };
        }
        return {
          ...segment,
          timelineStartSecond: startSecond,
        };
      }),
    });
  }
  const intervals = timelineIntervalsForSegments(plan.segments, currentStarts, new Set([segmentId]));
  const snapPoints = [
    ...(playheadSecond === undefined ? [] : [playheadSecond]),
    ...intervals.flatMap((interval) => [interval.startSecond, interval.endSecond]),
  ];
  const nextStart = resolveTimelineBlockStart(
    intervals,
    [{ durationSeconds: targetSegment.durationSeconds, offsetSecond: 0 }],
    currentStart + deltaSeconds,
    snapPoints,
  );
  return withRebuiltTimeline({
    ...plan,
    segments: plan.segments.map((segment) => ({
      ...segment,
      timelineStartSecond:
        segment.id === segmentId
          ? nextStart
          : clampTimelineStart(currentStarts.get(segment.id) ?? segment.timelineStartSecond ?? 0),
    })),
  });
};

export const duplicateSmartEditSegmentOnTimeline = (
  plan: SmartEditPlan,
  segmentId: string,
  duplicateToken = String(Date.now()),
): SmartEditPlan => {
  return duplicateSmartEditSegmentsOnTimeline(plan, [segmentId], duplicateToken);
};

export const duplicateSmartEditSegmentsOnTimeline = (
  plan: SmartEditPlan,
  segmentIds: string[],
  duplicateToken = String(Date.now()),
): SmartEditPlan => {
  const selectedIds = new Set(segmentIds);
  if (selectedIds.size === 0) {
    return plan;
  }
  const sortedSegments = [...plan.segments].sort((left, right) => left.order - right.order);
  const currentStarts = timelineStartsForSegments(plan.segments);
  const nextSegments: SmartEditSegment[] = [];
  const duplicateStarts = new Map<string, number>();
  const sourceCopies: Array<{
    duplicateId: string;
    durationSeconds: number;
    elementToken: string;
    sourceSegmentId: string;
    sourceStart: number;
  }> = [];
  let duplicateIndex = 0;
  for (const segment of sortedSegments) {
    nextSegments.push(segment);
    if (!selectedIds.has(segment.id)) {
      continue;
    }
    duplicateIndex += 1;
    const sourceStart = currentStarts.get(segment.id) ?? 0;
    const duplicateId =
      segmentIds.length === 1
        ? `${segment.id}-${duplicateToken}`
        : `${segment.id}-${duplicateToken}-${duplicateIndex}`;
    sourceCopies.push({
      duplicateId,
      durationSeconds: segment.durationSeconds,
      elementToken: segmentIds.length === 1 ? duplicateToken : `${duplicateToken}-${duplicateIndex}`,
      sourceSegmentId: segment.id,
      sourceStart,
    });
    nextSegments.push({
      ...segment,
      id: duplicateId,
      order: segment.order + 1,
      subtitle: `${segment.subtitle} (copy)`,
    });
  }

  if (duplicateIndex === 0) {
    return plan;
  }

  const earliestStart = Math.min(...sourceCopies.map((copy) => copy.sourceStart));
  const latestEnd = Math.max(...sourceCopies.map((copy) => copy.sourceStart + copy.durationSeconds));
  const desiredStart = clampTimelineStart(latestEnd);
  const intervals = timelineIntervalsForSegments(sortedSegments, currentStarts);
  const blockStart = resolveTimelineBlockStart(
    intervals,
    sourceCopies.map((copy) => ({
      durationSeconds: copy.durationSeconds,
      offsetSecond: copy.sourceStart - earliestStart,
    })),
    desiredStart,
    intervals.flatMap((interval) => [interval.startSecond, interval.endSecond]),
  );
  for (const copy of sourceCopies) {
    duplicateStarts.set(copy.duplicateId, clampTimelineStart(blockStart + copy.sourceStart - earliestStart));
  }

  return withRebuiltTimeline({
    ...withPersistentTimelineCopies(
      plan,
      clonePersistentTimelineElementsForSegmentCopies(
        plan,
        sourceCopies.map((copy) => ({
          duplicateSegmentId: copy.duplicateId,
          duplicateStart: duplicateStarts.get(copy.duplicateId) ?? 0,
          elementToken: copy.elementToken,
          sourceSegmentId: copy.sourceSegmentId,
          sourceStart: copy.sourceStart,
        })),
      ),
    ),
    segments: nextSegments.map((segment, index) => ({
      ...segment,
      order: index + 1,
      timelineStartSecond: duplicateStarts.has(segment.id)
        ? duplicateStarts.get(segment.id)!
        : clampTimelineStart(currentStarts.get(segment.id) ?? segment.timelineStartSecond ?? 0),
    })),
  });
};

export const pasteSmartEditSegmentsAtPlayhead = (
  plan: SmartEditPlan,
  segmentIds: string[],
  playheadSecond: number,
  duplicateToken = String(Date.now()),
  editMode: SmartEditTimelineEditMode = "magnetic",
): SmartEditPlan => {
  const selectedIds = new Set(segmentIds);
  if (selectedIds.size === 0) {
    return plan;
  }
  const sortedSegments = [...plan.segments].sort((left, right) => left.order - right.order);
  const currentStarts = timelineStartsForSegments(plan.segments);
  const sourceSegments = sortedSegments.filter((segment) => selectedIds.has(segment.id));
  if (sourceSegments.length === 0) {
    return plan;
  }
  const earliestStart = Math.min(
    ...sourceSegments.map((segment) => currentStarts.get(segment.id) ?? 0),
  );
  const intervals = timelineIntervalsForSegments(sortedSegments, currentStarts);
  const blockItems = sourceSegments.map((segment) => ({
    durationSeconds: segment.durationSeconds,
    offsetSecond: (currentStarts.get(segment.id) ?? 0) - earliestStart,
  }));
  const targetStart =
    editMode === "magnetic"
      ? resolveTimelineBlockStart(
          intervals,
          blockItems,
          playheadSecond,
          [playheadSecond, ...intervals.flatMap((interval) => [interval.startSecond, interval.endSecond])],
        )
      : clampTimelineStart(snapTimelineSeconds(playheadSecond));
  const blockEnd = Math.max(
    ...blockItems.map((item) => targetStart + item.offsetSecond + item.durationSeconds),
  );
  const blockDuration = Math.max(0, blockEnd - targetStart);
  const pastedSegments = sourceSegments.map((segment, index): SmartEditSegment => {
    const sourceStart = currentStarts.get(segment.id) ?? 0;
    const relativeOffset = sourceStart - earliestStart;
    return {
      ...segment,
      id: `${segment.id}-${duplicateToken}-${index + 1}`,
      order: sortedSegments.length + index + 1,
      subtitle: `${segment.subtitle} (copy)`,
      timelineStartSecond: clampTimelineStart(targetStart + relativeOffset),
    };
  });
  const pastedStarts = new Map(
    pastedSegments.map((segment) => [segment.id, segment.timelineStartSecond ?? 0]),
  );
  const pastedPersistentElements = clonePersistentTimelineElementsForSegmentCopies(
    plan,
    sourceSegments.map((segment, index) => {
      const sourceStart = currentStarts.get(segment.id) ?? 0;
      const duplicateSegmentId = `${segment.id}-${duplicateToken}-${index + 1}`;
      return {
        duplicateSegmentId,
        duplicateStart: pastedStarts.get(duplicateSegmentId) ?? 0,
        elementToken: `${duplicateToken}-${index + 1}`,
        sourceSegmentId: segment.id,
        sourceStart,
      };
    }),
  );

  if (editMode === "insert") {
    return withRebuiltTimeline({
      ...withPersistentTimelineCopies(plan, pastedPersistentElements),
      segments: buildInsertMoveSegments({
        blockDurationSeconds: blockDuration,
        currentStarts,
        desiredStart: targetStart,
        duplicateToken,
        insertedSegments: pastedSegments,
        plan,
        replacedSegmentIds: new Set(),
      }),
    });
  }

  return withRebuiltTimeline({
    ...withPersistentTimelineCopies(plan, pastedPersistentElements),
    segments: [...sortedSegments, ...pastedSegments].map((segment, index) => ({
      ...segment,
      order: index + 1,
      enabled:
        editMode === "overwrite" &&
        !pastedStarts.has(segment.id) &&
        segment.enabled &&
        intervals.some(
          (interval) =>
            interval.id === segment.id &&
            intervalsOverlap(targetStart, blockEnd, interval.startSecond, interval.endSecond),
        )
          ? false
          : segment.enabled,
      timelineStartSecond: pastedStarts.has(segment.id)
        ? pastedStarts.get(segment.id)!
        : clampTimelineStart(currentStarts.get(segment.id) ?? segment.timelineStartSecond ?? 0),
    })),
  });
};

export const copySmartEditSegmentsToClipboard = (
  plan: SmartEditPlan,
  segmentIds: string[],
): SmartEditClipboard | undefined => {
  const selectedIds = new Set(segmentIds);
  if (selectedIds.size === 0) {
    return undefined;
  }
  const currentStarts = timelineStartsForSegments(plan.segments);
  const items = [...plan.segments]
    .sort((left, right) => left.order - right.order)
    .filter((segment) => selectedIds.has(segment.id))
    .map((segment) => ({
      elements: persistentTimelineElementsForSegment(plan, segment.id).map((element) => ({ ...element })),
      segment: { ...segment },
      startSecond: currentStarts.get(segment.id) ?? 0,
    }));
  return items.length > 0 ? { items } : undefined;
};

export const pasteSmartEditClipboardAtPlayhead = (
  plan: SmartEditPlan,
  clipboard: SmartEditClipboard | undefined,
  playheadSecond: number,
  duplicateToken = String(Date.now()),
  editMode: SmartEditTimelineEditMode = "magnetic",
): SmartEditPlan => {
  if (!clipboard || clipboard.items.length === 0) {
    return plan;
  }
  const sortedSegments = [...plan.segments].sort((left, right) => left.order - right.order);
  const currentStarts = timelineStartsForSegments(plan.segments);
  const earliestStart = Math.min(...clipboard.items.map((item) => item.startSecond));
  const intervals = timelineIntervalsForSegments(sortedSegments, currentStarts);
  const blockItems = clipboard.items.map((item) => ({
    durationSeconds: item.segment.durationSeconds,
    offsetSecond: item.startSecond - earliestStart,
  }));
  const targetStart =
    editMode === "magnetic"
      ? resolveTimelineBlockStart(
          intervals,
          blockItems,
          playheadSecond,
          [playheadSecond, ...intervals.flatMap((interval) => [interval.startSecond, interval.endSecond])],
        )
      : clampTimelineStart(snapTimelineSeconds(playheadSecond));
  const blockEnd = Math.max(
    ...blockItems.map((item) => targetStart + item.offsetSecond + item.durationSeconds),
  );
  const blockDuration = Math.max(0, blockEnd - targetStart);
  const pastedSegments = clipboard.items.map((item, index): SmartEditSegment => ({
    ...item.segment,
    id: `${item.segment.id}-${duplicateToken}-${index + 1}`,
    order: sortedSegments.length + index + 1,
    subtitle: `${item.segment.subtitle} (copy)`,
    timelineStartSecond: clampTimelineStart(targetStart + item.startSecond - earliestStart),
  }));
  const pastedStarts = new Map(
    pastedSegments.map((segment) => [segment.id, segment.timelineStartSecond ?? 0]),
  );
  const pastedPersistentElements = clipboard.items.flatMap((item, index) => {
    const duplicateSegmentId = `${item.segment.id}-${duplicateToken}-${index + 1}`;
    const duplicateStart = pastedStarts.get(duplicateSegmentId) ?? 0;
    const elements =
      item.elements && item.elements.length > 0
        ? item.elements
        : persistentTimelineElementsForSegment(plan, item.segment.id);
    return elements.map((element) => ({
      ...element,
      id: `${element.id}-${duplicateToken}-${index + 1}`,
      label: `${element.label} (copy)`,
      segmentId: duplicateSegmentId,
      startSecond: clampTimelineStart(
        snapTimelineSeconds(duplicateStart + element.startSecond - item.startSecond),
      ),
    }));
  });

  if (editMode === "insert") {
    return withRebuiltTimeline({
      ...withPersistentTimelineCopies(plan, pastedPersistentElements),
      segments: buildInsertMoveSegments({
        blockDurationSeconds: blockDuration,
        currentStarts,
        desiredStart: targetStart,
        duplicateToken,
        insertedSegments: pastedSegments,
        plan,
        replacedSegmentIds: new Set(),
      }),
    });
  }

  return withRebuiltTimeline({
    ...withPersistentTimelineCopies(plan, pastedPersistentElements),
    segments: [...sortedSegments, ...pastedSegments].map((segment, index) => ({
      ...segment,
      order: index + 1,
      enabled:
        editMode === "overwrite" &&
        !pastedStarts.has(segment.id) &&
        segment.enabled &&
        intervals.some(
          (interval) =>
            interval.id === segment.id &&
            intervalsOverlap(targetStart, blockEnd, interval.startSecond, interval.endSecond),
        )
          ? false
          : segment.enabled,
      timelineStartSecond: pastedStarts.has(segment.id)
        ? pastedStarts.get(segment.id)!
        : clampTimelineStart(currentStarts.get(segment.id) ?? segment.timelineStartSecond ?? 0),
    })),
  });
};
