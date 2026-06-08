import type {
  AssetMetadata,
  RenderTask,
  SmartEditPlan,
  SmartEditTimeline,
} from "@shopclip/shared";

import {
  audioVolumeKeyframes,
  sourceLabel,
} from "./SmartEditSegmentUtils";
import {
  intervalsOverlap,
  moveSmartEditSegmentOnTimelineWithMode,
  replaceSegment,
  resolveTimelineBlockStart,
  segmentTimelineBaseStart,
  smartEditTrackIdForElement,
  smartEditTrackIdForTimelineTrack,
  timelineDurationForElements,
  timelineDurationForSegments,
  timelineStartsForSegments,
  withRebuiltTimeline,
} from "./SmartEditSegmentOperations";
import {
  linkedTimelineElementIds,
  withUpdatedTimelineElements,
} from "./SmartEditTimelineElementOperations";
import type {
  SmartEditTimelineEditMode,
  SmartEditTrack,
  SmartEditTrackSegment,
} from "./SmartEditTimelineTypes";
import {
  MIN_SMART_EDIT_CLIP_SECONDS,
  TIMELINE_EDGE_SNAP_SECONDS,
  clampInSegmentOffset,
  clampTimelineStart,
  clipDurationWithinSegment,
  formatTimelineTime,
  snapTimelineSeconds,
  sourceRangeLabel,
  timelineRangeLabel,
} from "./SmartEditTimelineMath";

export const previewSmartEditTrackClipDrag = ({
  currentClientX,
  pixelsPerSecond,
  selectedIds,
  snapPoints = [],
  startClientX,
  trackClip,
  trackClips,
}: {
  currentClientX: number;
  pixelsPerSecond: number;
  selectedIds: string[];
  snapPoints?: number[];
  startClientX: number;
  trackClip: Pick<SmartEditTrackSegment, "durationSeconds" | "id" | "startSecond" | "trackId">;
  trackClips: Array<Pick<SmartEditTrackSegment, "durationSeconds" | "id" | "startSecond" | "trackId">>;
}): Array<Pick<SmartEditTrackSegment, "durationSeconds" | "id" | "startSecond" | "trackId">> => {
  if (pixelsPerSecond <= 0) {
    return [];
  }
  const selectedIdSet = new Set(selectedIds);
  const sourceClips =
    selectedIdSet.has(trackClip.id) && selectedIdSet.size > 1
      ? trackClips.filter((candidate) => selectedIdSet.has(candidate.id))
      : [trackClip];
  if (sourceClips.length === 0) {
    return [];
  }
  const rawDeltaSeconds = snapTimelineSeconds((currentClientX - startClientX) / pixelsPerSecond);
  const earliestStart = Math.min(...sourceClips.map((candidate) => candidate.startSecond));
  const clampedDeltaSeconds = Math.max(rawDeltaSeconds, -earliestStart);
  const previewDeltaSeconds =
    snapPoints
      .flatMap((point) =>
        sourceClips.flatMap((candidate) => [
          {
            delta: snapTimelineSeconds(point - candidate.startSecond),
            distance: Math.abs(point - (candidate.startSecond + clampedDeltaSeconds)),
          },
          {
            delta: snapTimelineSeconds(point - candidate.startSecond - candidate.durationSeconds),
            distance: Math.abs(point - (candidate.startSecond + candidate.durationSeconds + clampedDeltaSeconds)),
          },
        ]),
      )
      .filter((candidate) => candidate.distance <= TIMELINE_EDGE_SNAP_SECONDS)
      .sort((left, right) => left.distance - right.distance)[0]?.delta ?? clampedDeltaSeconds;
  const finalDeltaSeconds = Math.max(previewDeltaSeconds, -earliestStart);
  return sourceClips.map((candidate) => ({
    durationSeconds: candidate.durationSeconds,
    id: candidate.id,
    startSecond: clampTimelineStart(snapTimelineSeconds(candidate.startSecond + finalDeltaSeconds)),
    trackId: candidate.trackId,
  }));
};

export const snapSmartEditTrackClipTrimDelta = ({
  deltaSeconds,
  edge,
  snapPoints,
  trackClips,
}: {
  deltaSeconds: number;
  edge: "in" | "out";
  snapPoints: number[];
  trackClips: Array<Pick<SmartEditTrackSegment, "durationSeconds" | "startSecond">>;
}): number =>
  snapPoints
    .flatMap((point) =>
      trackClips.map((candidate) => {
        const currentEdge =
          edge === "in"
            ? candidate.startSecond
            : snapTimelineSeconds(candidate.startSecond + candidate.durationSeconds);
        const desiredEdge = snapTimelineSeconds(currentEdge + deltaSeconds);
        return {
          delta: snapTimelineSeconds(point - currentEdge),
          distance: Math.abs(point - desiredEdge),
        };
      }),
    )
    .filter((candidate) => candidate.distance <= TIMELINE_EDGE_SNAP_SECONDS)
    .sort((left, right) => left.distance - right.distance)[0]?.delta ?? deltaSeconds;

export const resizeSmartEditTrackClipPreview = (
  trackClip: Pick<SmartEditTrackSegment, "durationSeconds" | "id" | "startSecond" | "trackId">,
  edge: "in" | "out",
  deltaSeconds: number,
): Pick<SmartEditTrackSegment, "durationSeconds" | "id" | "startSecond" | "trackId"> => {
  const startSecond = clampTimelineStart(trackClip.startSecond);
  const durationSeconds = Math.max(MIN_SMART_EDIT_CLIP_SECONDS, trackClip.durationSeconds);
  if (edge === "in") {
    const endSecond = snapTimelineSeconds(startSecond + durationSeconds);
    const latestStart = Math.max(0, endSecond - MIN_SMART_EDIT_CLIP_SECONDS);
    const nextStart = Math.min(
      latestStart,
      Math.max(0, snapTimelineSeconds(startSecond + deltaSeconds)),
    );
    const actualDelta = snapTimelineSeconds(nextStart - startSecond);
    return {
      durationSeconds: Math.max(
        MIN_SMART_EDIT_CLIP_SECONDS,
        snapTimelineSeconds(durationSeconds - actualDelta),
      ),
      id: trackClip.id,
      startSecond: nextStart,
      trackId: trackClip.trackId,
    };
  }
  return {
    durationSeconds: Math.max(
      MIN_SMART_EDIT_CLIP_SECONDS,
      snapTimelineSeconds(durationSeconds + deltaSeconds),
    ),
    id: trackClip.id,
    startSecond,
    trackId: trackClip.trackId,
  };
};

export const previewSmartEditTrackClipTrimDrag = ({
  currentClientX,
  edge,
  pixelsPerSecond,
  snapPoints = [],
  startClientX,
  trackClip,
}: {
  currentClientX: number;
  edge: "in" | "out";
  pixelsPerSecond: number;
  snapPoints?: number[];
  startClientX: number;
  trackClip: Pick<SmartEditTrackSegment, "durationSeconds" | "id" | "startSecond" | "trackId">;
}): Pick<SmartEditTrackSegment, "durationSeconds" | "id" | "startSecond" | "trackId"> | undefined => {
  if (pixelsPerSecond <= 0) {
    return undefined;
  }
  const rawDeltaSeconds = snapTimelineSeconds((currentClientX - startClientX) / pixelsPerSecond);
  const snappedDeltaSeconds = snapSmartEditTrackClipTrimDelta({
    deltaSeconds: rawDeltaSeconds,
    edge,
    snapPoints,
    trackClips: [trackClip],
  });
  return resizeSmartEditTrackClipPreview(trackClip, edge, snappedDeltaSeconds);
};

export const moveSmartEditTrackClipOnTimeline = (
  plan: SmartEditPlan,
  trackClip: Pick<SmartEditTrackSegment, "id" | "trackId"> & { segmentId?: string },
  deltaSeconds: number,
  editMode: SmartEditTimelineEditMode = "magnetic",
  playheadSecond?: number,
): SmartEditPlan => {
  if (!trackClip.segmentId) {
    const baseTimeline = plan.timeline;
    if (!baseTimeline?.elements.length) {
      return plan;
    }
    const targetElement = baseTimeline.elements.find((element) => element.id === trackClip.id);
    if (!targetElement) {
      return plan;
    }
    const linkedIds = linkedTimelineElementIds(baseTimeline, targetElement);
    const moveLinkedElements = (nextStart: number, elements = baseTimeline.elements) => {
      const actualDelta = snapTimelineSeconds(nextStart - targetElement.startSecond);
      return elements.map((element) =>
        linkedIds.has(element.id)
          ? {
              ...element,
              startSecond: clampTimelineStart(snapTimelineSeconds(element.startSecond + actualDelta)),
            }
          : element,
      );
    };
    if (editMode === "magnetic") {
      const intervals = baseTimeline.elements
        .filter(
          (element) =>
            !linkedIds.has(element.id) && element.trackId === targetElement.trackId,
        )
        .map((element) => ({
          endSecond: snapTimelineSeconds(element.startSecond + element.durationSeconds),
          id: element.id,
          startSecond: clampTimelineStart(element.startSecond),
        }))
        .sort((left, right) => left.startSecond - right.startSecond);
      const snapPoints = [
        ...(playheadSecond === undefined ? [] : [playheadSecond]),
        ...intervals.flatMap((interval) => [interval.startSecond, interval.endSecond]),
      ];
      const nextStart = resolveTimelineBlockStart(
        intervals,
        [{ durationSeconds: targetElement.durationSeconds, offsetSecond: 0 }],
        targetElement.startSecond + deltaSeconds,
        snapPoints,
      );
      return withUpdatedTimelineElements(plan, moveLinkedElements(nextStart), baseTimeline.tracks);
    }
    if (editMode === "insert") {
      const nextStart = clampTimelineStart(snapTimelineSeconds(targetElement.startSecond + deltaSeconds));
      const nextElements = baseTimeline.elements.map((element) => {
        if (linkedIds.has(element.id)) {
          const actualDelta = snapTimelineSeconds(nextStart - targetElement.startSecond);
          return {
            ...element,
            startSecond: clampTimelineStart(snapTimelineSeconds(element.startSecond + actualDelta)),
          };
        }
        if (
          element.trackId === targetElement.trackId &&
          element.startSecond + element.durationSeconds > nextStart + 0.001
        ) {
          return {
            ...element,
            startSecond: snapTimelineSeconds(element.startSecond + targetElement.durationSeconds),
          };
        }
        return element;
      });
      return withUpdatedTimelineElements(plan, nextElements, baseTimeline.tracks);
    }
    if (editMode === "overwrite") {
      const nextStart = clampTimelineStart(snapTimelineSeconds(targetElement.startSecond + deltaSeconds));
      const nextEnd = snapTimelineSeconds(nextStart + targetElement.durationSeconds);
      const nextElements = baseTimeline.elements
        .filter(
          (element) =>
            linkedIds.has(element.id) ||
            element.trackId !== targetElement.trackId ||
            !intervalsOverlap(nextStart, nextEnd, element.startSecond, element.startSecond + element.durationSeconds),
        )
        .map((element) => {
          if (!linkedIds.has(element.id)) {
            return element;
          }
          const actualDelta = snapTimelineSeconds(nextStart - targetElement.startSecond);
          return {
            ...element,
            startSecond: clampTimelineStart(snapTimelineSeconds(element.startSecond + actualDelta)),
          };
        });
      return withUpdatedTimelineElements(plan, nextElements, baseTimeline.tracks);
    }
    return withUpdatedTimelineElements(
      plan,
      moveLinkedElements(
        clampTimelineStart(snapTimelineSeconds(targetElement.startSecond + deltaSeconds)),
      ),
      baseTimeline.tracks,
    );
  }
  if (trackClip.trackId === "video") {
    return moveSmartEditSegmentOnTimelineWithMode(
      plan,
      trackClip.segmentId,
      deltaSeconds,
      editMode,
      playheadSecond,
    );
  }
  if (plan.timeline?.elements.length) {
    const currentStarts = timelineStartsForSegments(plan.segments);
    const targetElement = plan.timeline.elements.find(
      (element) =>
        element.segmentId === trackClip.segmentId &&
        smartEditTrackIdForElement(element) === trackClip.trackId,
    );
    if (targetElement) {
      const nextElementStart = clampTimelineStart(
        snapTimelineSeconds(targetElement.startSecond + deltaSeconds),
      );
      const nextTimeline: SmartEditTimeline = {
        ...plan.timeline,
        durationSeconds: timelineDurationForElements({
          ...plan.timeline,
          elements: plan.timeline.elements.map((element) =>
            element.id === targetElement.id ? { ...element, startSecond: nextElementStart } : element,
          ),
        }) ?? plan.timeline.durationSeconds,
        elements: plan.timeline.elements.map((element) =>
          element.id === targetElement.id ? { ...element, startSecond: nextElementStart } : element,
        ),
      };
      const baseStart = segmentTimelineBaseStart(
        { ...plan, timeline: nextTimeline },
        trackClip.segmentId,
        currentStarts,
      );
      const nextOffset = clampInSegmentOffset(
        snapTimelineSeconds(nextElementStart - baseStart),
        plan.segments.find((segment) => segment.id === trackClip.segmentId)?.durationSeconds ?? 0,
      );
      return withRebuiltTimeline({
        ...plan,
        segments: plan.segments.map((segment) => {
          if (segment.id !== trackClip.segmentId) {
            return segment;
          }
          if (trackClip.trackId === "sourceAudio") {
            return {
              ...segment,
              sourceAudioDurationSeconds: targetElement.durationSeconds,
              sourceAudioFadeInSeconds: targetElement.audioFadeInSeconds ?? 0,
              sourceAudioFadeOutSeconds: targetElement.audioFadeOutSeconds ?? 0,
              sourceAudioMuted: targetElement.muted,
              sourceAudioStartOffsetSeconds: nextOffset,
              sourceAudioVolume: targetElement.audioVolume ?? 1,
              sourceAudioVolumeKeyframes: targetElement.audioVolumeKeyframes,
            };
          }
          if (trackClip.trackId === "caption") {
            return {
              ...segment,
              captionDurationSeconds: targetElement.durationSeconds,
              captionHidden: targetElement.hidden,
              captionStartOffsetSeconds: nextOffset,
              captionTextColor: targetElement.textColor,
              captionTextFontSize: targetElement.textFontSize,
              captionTextPositionYPercent: targetElement.textPositionYPercent,
              subtitle: targetElement.text?.trim() || targetElement.label || segment.subtitle,
            };
          }
          if (trackClip.trackId === "voice") {
            return {
              ...segment,
              voiceover: targetElement.text?.trim() || targetElement.label || segment.voiceover,
              voiceoverDurationSeconds: targetElement.durationSeconds,
              voiceoverFadeInSeconds: targetElement.audioFadeInSeconds ?? 0,
              voiceoverFadeOutSeconds: targetElement.audioFadeOutSeconds ?? 0,
              voiceoverStartOffsetSeconds: nextOffset,
              voiceoverVolume: targetElement.audioVolume ?? 1,
              voiceoverVolumeKeyframes: targetElement.audioVolumeKeyframes,
            };
          }
          return segment;
        }),
        timeline: nextTimeline,
      });
    }
  }
  if (trackClip.trackId === "sourceAudio") {
    return replaceSegment(plan, trackClip.segmentId, (segment) => ({
      ...segment,
      sourceAudioStartOffsetSeconds: clampInSegmentOffset(
        snapTimelineSeconds((segment.sourceAudioStartOffsetSeconds ?? 0) + deltaSeconds),
        segment.durationSeconds,
      ),
    }));
  }
  if (trackClip.trackId === "caption") {
    return replaceSegment(plan, trackClip.segmentId, (segment) => ({
      ...segment,
      captionStartOffsetSeconds: clampInSegmentOffset(
        snapTimelineSeconds((segment.captionStartOffsetSeconds ?? 0) + deltaSeconds),
        segment.durationSeconds,
      ),
    }));
  }
  if (trackClip.trackId === "voice") {
    return replaceSegment(plan, trackClip.segmentId, (segment) => ({
      ...segment,
      voiceoverStartOffsetSeconds: clampInSegmentOffset(
        snapTimelineSeconds((segment.voiceoverStartOffsetSeconds ?? 0) + deltaSeconds),
        segment.durationSeconds,
      ),
    }));
  }
  return plan;
};

export const timelineTrackSegments = (
  plan: SmartEditPlan | undefined,
  assets: AssetMetadata[],
  renderTask?: RenderTask,
): SmartEditTrack[] => {
  if (plan?.timeline?.elements?.length) {
    return plan.timeline.tracks.map((track) => ({
      id: smartEditTrackIdForTimelineTrack(track),
      segments: plan.timeline!.elements
        .filter((element) => element.trackId === track.id)
        .map((element) => ({
          audioVolumeKeyframes: element.audioVolumeKeyframes,
          durationSeconds: element.durationSeconds,
          hidden: element.hidden,
          id: element.id,
          meta: `${element.playbackRate}x - trim ${formatTimelineTime(
            element.trimStartSecond,
          )}${element.trimEndSecond ? `-${formatTimelineTime(element.trimEndSecond)}` : ""}`,
          muted: element.muted,
          range: timelineRangeLabel(element.startSecond, element.durationSeconds),
          segmentId: element.segmentId,
          startSecond: element.startSecond,
          textColor: element.textColor,
          textFontSize: element.textFontSize,
          textPositionYPercent: element.textPositionYPercent,
          trackId: smartEditTrackIdForTimelineTrack(track),
          trimStartSecond: element.trimStartSecond,
          text: element.text,
          title: element.kind === "text" ? element.text ?? element.label : element.label,
          waveform: element.audioWaveform,
        })),
    }));
  }

  if (!plan) {
    const renderedClips =
      renderTask?.status === "completed"
        ? [...(renderTask.sceneClips ?? [])]
            .filter((clip) => clip.videoUrl)
            .sort((left, right) => left.order - right.order)
        : [];
    if (renderedClips.length === 0) {
      return [];
    }
    let cursor = 0;
    const timedClips = renderedClips.map((clip) => {
      const duration = 4;
      const startSecond = cursor;
      cursor += duration;
      return { clip, duration, startSecond };
    });
    return [
      {
        id: "video",
        segments: timedClips.map(({ clip, duration, startSecond }) => ({
          durationSeconds: duration,
          id: `${clip.sceneId}-video`,
          meta: clip.material?.videoOnlyUrl ? "video-only material" : "generated clip",
          range: timelineRangeLabel(startSecond, duration),
          startSecond,
          trackId: "video",
          title: `Scene ${clip.order}`,
        })),
      },
      {
        id: "sourceAudio",
        segments: timedClips
          .filter(({ clip }) => clip.material?.audioUrl)
          .map(({ clip, duration, startSecond }) => ({
            durationSeconds: duration,
            id: `${clip.sceneId}-audio`,
            meta: "source audio material",
            range: timelineRangeLabel(startSecond, duration),
            startSecond,
            trackId: "sourceAudio",
            title: `Scene ${clip.order} audio`,
            waveform: clip.material?.audioWaveform,
          })),
      },
      {
        id: "caption",
        segments: timedClips.map(({ clip, duration, startSecond }) => ({
          durationSeconds: duration,
          id: `${clip.sceneId}-text`,
          meta: "storyboard text",
          range: timelineRangeLabel(startSecond, duration),
          startSecond,
          text: clip.material?.text || clip.subtitle,
          trackId: "caption",
          title: clip.material?.text || clip.subtitle,
        })),
      },
    ];
  }

  const enabledSegments = [...plan.segments]
    .filter((segment) => segment.enabled)
    .sort((left, right) => left.order - right.order);

  const currentStarts = timelineStartsForSegments(enabledSegments);
  const timedSegments = enabledSegments.map((segment) => {
    const startSecond = currentStarts.get(segment.id) ?? 0;
    return { segment, startSecond };
  });

  if (timedSegments.length === 0) {
    return [];
  }

  const videoSegments = timedSegments.map(({ segment, startSecond }) => ({
    id: segment.id,
    segmentId: segment.id,
    title: sourceLabel(segment, assets),
    range: timelineRangeLabel(startSecond, segment.durationSeconds),
    meta: sourceRangeLabel(segment),
    durationSeconds: segment.durationSeconds,
    startSecond,
    trackId: "video" as const,
  }));
  const sourceAudioSegments = timedSegments
    .filter(({ segment }) => segment.source.sceneClipAudioUrl)
    .map(({ segment, startSecond }) => {
      const sourceAudioOffsetSeconds = clampInSegmentOffset(
        segment.sourceAudioStartOffsetSeconds ?? 0,
        segment.durationSeconds,
      );
      const sourceAudioDurationSeconds = clipDurationWithinSegment(
        segment.sourceAudioDurationSeconds,
        sourceAudioOffsetSeconds,
        segment.durationSeconds,
      );
      return {
        id: `${segment.id}-audio`,
        segmentId: segment.id,
        title: `Scene ${segment.order} audio`,
        range: timelineRangeLabel(startSecond + sourceAudioOffsetSeconds, sourceAudioDurationSeconds),
        meta: segment.sourceAudioMuted ? "muted source audio" : "source audio material",
        durationSeconds: sourceAudioDurationSeconds,
        startSecond: startSecond + sourceAudioOffsetSeconds,
        audioVolumeKeyframes: audioVolumeKeyframes(
          segment.sourceAudioVolumeKeyframes,
          sourceAudioDurationSeconds,
        ),
        muted: segment.sourceAudioMuted ?? false,
        trackId: "sourceAudio" as const,
        trimStartSecond: segment.source.startSecond,
        waveform: segment.source.sceneClipAudioWaveform,
      };
    });
  const captionSegments = timedSegments
    .filter(({ segment }) => segment.subtitle.trim().length > 0)
    .map(({ segment, startSecond }) => {
      const captionOffsetSeconds = clampInSegmentOffset(
        segment.captionStartOffsetSeconds ?? 0,
        segment.durationSeconds,
      );
      const captionDurationSeconds = clipDurationWithinSegment(
        segment.captionDurationSeconds,
        captionOffsetSeconds,
        segment.durationSeconds,
      );
      return {
        id: `${segment.id}-caption`,
        segmentId: segment.id,
        title: segment.subtitle,
        range: timelineRangeLabel(startSecond + captionOffsetSeconds, captionDurationSeconds),
        meta: segment.transition,
        durationSeconds: captionDurationSeconds,
        startSecond: startSecond + captionOffsetSeconds,
        hidden: segment.captionHidden ?? false,
        text: segment.subtitle,
        trackId: "caption" as const,
      };
    });
  const voiceSegments = timedSegments
    .filter(({ segment }) => segment.voiceover.trim().length > 0)
    .map(({ segment, startSecond }) => {
      const voiceoverOffsetSeconds = clampInSegmentOffset(
        segment.voiceoverStartOffsetSeconds ?? 0,
        segment.durationSeconds,
      );
      const voiceoverDurationSeconds = clipDurationWithinSegment(
        segment.voiceoverDurationSeconds,
        voiceoverOffsetSeconds,
        segment.durationSeconds,
      );
      return {
        id: `${segment.id}-voice`,
        segmentId: segment.id,
        title: segment.voiceover,
        range: timelineRangeLabel(startSecond + voiceoverOffsetSeconds, voiceoverDurationSeconds),
        meta: plan.audio.voice,
        durationSeconds: voiceoverDurationSeconds,
        startSecond: startSecond + voiceoverOffsetSeconds,
        audioVolumeKeyframes: audioVolumeKeyframes(
          segment.voiceoverVolumeKeyframes,
          voiceoverDurationSeconds,
        ),
        trackId: "voice" as const,
      };
    });
  const tracks: SmartEditTrack[] = [
    { id: "video", segments: videoSegments },
    { id: "sourceAudio", segments: sourceAudioSegments },
    { id: "caption", segments: captionSegments },
    { id: "voice", segments: voiceSegments },
  ];

  if (plan.audio.bgmTrack !== "none") {
    const durationSeconds = timelineDurationForSegments(plan.segments);
    tracks.push({
      id: "bgm",
      segments: [
        {
          id: "bgm-bed",
          title: plan.audio.bgmTrack,
          range: timelineRangeLabel(0, durationSeconds),
          meta: plan.audio.targetLanguage ?? "project audio",
          durationSeconds: Math.max(1, durationSeconds),
          startSecond: 0,
          trackId: "bgm",
        },
      ],
    });
  }

  return tracks;
};
