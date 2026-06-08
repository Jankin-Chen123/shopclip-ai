import type {
  AssetMetadata,
  SmartEditPlan,
  SmartEditSegment,
  SmartEditTimeline,
} from "@shopclip/shared";

import {
  formatSmartEditSrtTimestamp,
  parseSmartEditSrtCues,
} from "./SmartEditSrt";
import {
  audioVolumeKeyframes,
  durationFromSourceRange,
} from "./SmartEditSegmentUtils";
import { smartEditTrackOrder, type SmartEditTrackId } from "./SmartEditTrackUtils";
import {
  buildSmartEditTimeline,
  intervalsOverlap,
  isDerivedTimelineElement,
  mergePersistentTimelineWithDerivedSegments,
  resolveTimelineBlockStart,
  segmentTimelineBaseStart,
  shiftSegmentsByRippleGaps,
  shiftTimelineElementsByRippleGaps,
  smartEditTrackIdForElement,
  splitPersistentTimelineElement,
  timelineDurationForElements,
  timelineStartsForSegments,
  trimPersistentTimelineElementAtSecond,
  withRebuiltTimeline,
  type SmartEditRippleGap,
} from "./SmartEditSegmentOperations";
import type {
  SmartEditClipboard,
  SmartEditTimelineEditMode,
  SmartEditTimelineElement,
  SmartEditTimelineElementPatch,
  SmartEditTimelineTrackPatch,
  SmartEditTrack,
  SmartEditTrackSegment,
  TimelinePreviewRangeState,
} from "./SmartEditTimelineTypes";
import {
  MIN_SMART_EDIT_CLIP_SECONDS,
  TIMELINE_EDGE_SNAP_SECONDS,
  clampAudioFade,
  clampAudioVolume,
  clampInSegmentOffset,
  clampPlaybackRate,
  clampSmartEditDuration,
  clampTextFontSize,
  clampTextPositionYPercent,
  clampTimelineStart,
  clampVisualKeyframeTime,
  clipDurationWithinSegment,
  normalizeTextColor,
  snapTimelineSeconds,
} from "./SmartEditTimelineMath";

export const copySmartEditTimelineElementsToClipboard = (
  plan: SmartEditPlan,
  elementIds: string[],
): SmartEditClipboard | undefined => {
  const timeline = plan.timeline ?? buildSmartEditTimeline(plan);
  const selectedIds = new Set(elementIds);
  for (const elementId of elementIds) {
    const element = timeline.elements.find((candidate) => candidate.id === elementId);
    if (!element || isDerivedTimelineElement(element)) {
      continue;
    }
    for (const linkedId of linkedTimelineElementIds(timeline, element)) {
      selectedIds.add(linkedId);
    }
  }
  const timelineItems = timeline.elements
    .filter((element) => selectedIds.has(element.id) && !isDerivedTimelineElement(element))
    .sort((left, right) =>
      left.startSecond === right.startSecond
        ? left.trackId.localeCompare(right.trackId)
        : left.startSecond - right.startSecond,
    )
    .map((element) => ({
      element: { ...element },
      startSecond: element.startSecond,
    }));
  return timelineItems.length > 0 ? { items: [], timelineItems } : undefined;
};

export const cutSmartEditTimelineElementsToClipboard = (
  plan: SmartEditPlan,
  elementIds: string[],
  editMode: SmartEditTimelineEditMode = "magnetic",
): { clipboard: SmartEditClipboard | undefined; plan: SmartEditPlan } => {
  const clipboard = copySmartEditTimelineElementsToClipboard(plan, elementIds);
  if (!clipboard?.timelineItems?.length) {
    return { clipboard: undefined, plan };
  }
  return {
    clipboard,
    plan: removeSmartEditTimelineElementsFromTimeline(
      plan,
      clipboard.timelineItems.map((item) => item.element.id),
      editMode,
    ),
  };
};

export const duplicateSmartEditTimelineElementsOnTimeline = (
  plan: SmartEditPlan,
  elementIds: string[],
  duplicateToken = String(Date.now()),
  editMode: SmartEditTimelineEditMode = "magnetic",
): SmartEditPlan => {
  const clipboard = copySmartEditTimelineElementsToClipboard(plan, elementIds);
  if (!clipboard?.timelineItems?.length) {
    return plan;
  }
  const blockEnd = Math.max(
    ...clipboard.timelineItems.map((item) =>
      snapTimelineSeconds(item.startSecond + item.element.durationSeconds),
    ),
  );
  return pasteSmartEditTimelineClipboardAtPlayhead(
    plan,
    clipboard,
    blockEnd,
    duplicateToken,
    editMode,
  );
};

export const pasteSmartEditTimelineClipboardAtPlayhead = (
  plan: SmartEditPlan,
  clipboard: SmartEditClipboard | undefined,
  playheadSecond: number,
  duplicateToken = String(Date.now()),
  editMode: SmartEditTimelineEditMode = "magnetic",
): SmartEditPlan => {
  if (!clipboard?.timelineItems?.length) {
    return plan;
  }
  const baseTimeline = plan.timeline ?? buildSmartEditTimeline(plan);
  const earliestStart = Math.min(...clipboard.timelineItems.map((item) => item.startSecond));
  const blockItems = clipboard.timelineItems.map((item) => ({
    durationSeconds: item.element.durationSeconds,
    offsetSecond: snapTimelineSeconds(item.startSecond - earliestStart),
  }));
  const intervals = baseTimeline.elements.map((element) => ({
    endSecond: snapTimelineSeconds(element.startSecond + element.durationSeconds),
    id: element.id,
    startSecond: clampTimelineStart(element.startSecond),
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
  const pastedElements = clipboard.timelineItems.map((item, index) => ({
    ...item.element,
    id: `${item.element.id}-${duplicateToken}-${index + 1}`,
    label: `${item.element.label} (copy)`,
    linkedGroupId: item.element.linkedGroupId
      ? `${item.element.linkedGroupId}-${duplicateToken}`
      : undefined,
    startSecond: clampTimelineStart(
      snapTimelineSeconds(targetStart + item.startSecond - earliestStart),
    ),
  }));
  const blockEnd = Math.max(
    ...pastedElements.map((element) => snapTimelineSeconds(element.startSecond + element.durationSeconds)),
  );
  const blockDuration = snapTimelineSeconds(blockEnd - targetStart);
  const nextElements =
    editMode === "insert"
      ? [
          ...baseTimeline.elements.map((element) =>
            element.startSecond + element.durationSeconds > targetStart + 0.001
              ? {
                  ...element,
                  startSecond: snapTimelineSeconds(element.startSecond + blockDuration),
                }
              : element,
          ),
          ...pastedElements,
        ]
      : editMode === "overwrite"
        ? [
            ...baseTimeline.elements.filter(
              (element) =>
                !intervalsOverlap(
                  targetStart,
                  blockEnd,
                  element.startSecond,
                  element.startSecond + element.durationSeconds,
                ),
            ),
            ...pastedElements,
          ]
        : [...baseTimeline.elements, ...pastedElements];
  return withUpdatedTimelineElements(plan, nextElements, baseTimeline.tracks);
};

export const smartEditTimelineEditModes: SmartEditTimelineEditMode[] = [
  "magnetic",
  "insert",
  "overwrite",
  "ripple",
];

export const ensureTimelineTrack = (
  timeline: SmartEditTimeline,
  track: SmartEditTimeline["tracks"][number],
): SmartEditTimeline["tracks"] =>
  timeline.tracks.some((existingTrack) => existingTrack.id === track.id)
    ? timeline.tracks
    : [...timeline.tracks, track];

export const withUpdatedTimelineElements = (
  plan: SmartEditPlan,
  elements: SmartEditTimeline["elements"],
  tracks?: SmartEditTimeline["tracks"],
): SmartEditPlan => {
  const baseTimeline = plan.timeline ?? buildSmartEditTimeline(plan);
  const timeline: SmartEditTimeline = {
    ...baseTimeline,
    durationSeconds:
      timelineDurationForElements({
        ...baseTimeline,
        elements,
      }) ?? baseTimeline.durationSeconds,
    elements,
    tracks: tracks ?? baseTimeline.tracks,
  };
  return {
    ...plan,
    targetDurationSeconds: timeline.durationSeconds,
    timeline,
  };
};

const mergedTimelineIntervals = (
  elements: SmartEditTimeline["elements"],
): SmartEditRippleGap[] =>
  elements
    .map((element) => ({
      endSecond: snapTimelineSeconds(element.startSecond + element.durationSeconds),
      startSecond: clampTimelineStart(element.startSecond),
    }))
    .filter((interval) => interval.endSecond - interval.startSecond >= MIN_SMART_EDIT_CLIP_SECONDS)
    .sort((left, right) => left.startSecond - right.startSecond)
    .reduce<SmartEditRippleGap[]>((merged, interval) => {
      const previous = merged.at(-1);
      if (!previous || interval.startSecond > previous.endSecond + 0.001) {
        merged.push(interval);
        return merged;
      }
      previous.endSecond = Math.max(previous.endSecond, interval.endSecond);
      return merged;
    }, []);

const timelineGapAtPlayhead = (
  intervals: SmartEditRippleGap[],
  playheadSecond: number,
): SmartEditRippleGap | undefined => {
  const playhead = clampTimelineStart(snapTimelineSeconds(playheadSecond));
  if (intervals.length === 0) {
    return undefined;
  }
  const first = intervals[0];
  if (!first) {
    return undefined;
  }
  if (first.startSecond >= MIN_SMART_EDIT_CLIP_SECONDS && playhead <= first.startSecond + 0.001) {
    return { startSecond: 0, endSecond: first.startSecond };
  }
  for (let index = 0; index < intervals.length - 1; index += 1) {
    const current = intervals[index];
    const next = intervals[index + 1];
    if (!current || !next) {
      continue;
    }
    const gap = {
      endSecond: next.startSecond,
      startSecond: current.endSecond,
    };
    if (
      gap.endSecond - gap.startSecond >= MIN_SMART_EDIT_CLIP_SECONDS &&
      playhead >= gap.startSecond - 0.001 &&
      playhead <= gap.endSecond + 0.001
    ) {
      return gap;
    }
  }
  return undefined;
};

export const closeSmartEditTimelineGapAtPlayhead = (
  plan: SmartEditPlan,
  playheadSecond: number,
): SmartEditPlan => {
  const baseTimeline = plan.timeline ?? buildSmartEditTimeline(plan);
  const gap = timelineGapAtPlayhead(mergedTimelineIntervals(baseTimeline.elements), playheadSecond);
  if (!gap) {
    return plan;
  }
  const gapDurationSeconds = snapTimelineSeconds(gap.endSecond - gap.startSecond);
  if (gapDurationSeconds < MIN_SMART_EDIT_CLIP_SECONDS) {
    return plan;
  }
  const nextElements = baseTimeline.elements.map((element) =>
    element.startSecond >= gap.endSecond - 0.001
      ? {
          ...element,
          startSecond: clampTimelineStart(snapTimelineSeconds(element.startSecond - gapDurationSeconds)),
        }
      : element,
  );
  const currentStarts = timelineStartsForSegments(plan.segments);
  const nextSegments = plan.segments.map((segment) => {
    const startSecond = currentStarts.get(segment.id) ?? segment.timelineStartSecond ?? 0;
    return startSecond >= gap.endSecond - 0.001
      ? {
          ...segment,
          timelineStartSecond: clampTimelineStart(snapTimelineSeconds(startSecond - gapDurationSeconds)),
        }
      : segment;
  });
  return withUpdatedTimelineElements(
    {
      ...plan,
      segments: nextSegments,
    },
    nextElements,
    baseTimeline.tracks,
  );
};

export const updateSmartEditTimelineTrack = (
  plan: SmartEditPlan,
  trackId: string,
  patch: SmartEditTimelineTrackPatch,
): SmartEditPlan => {
  const baseTimeline = plan.timeline ?? buildSmartEditTimeline(plan);
  if (!baseTimeline.tracks.some((track) => track.id === trackId)) {
    return plan;
  }
  const tracks = baseTimeline.tracks.map((track) =>
    track.id === trackId
      ? {
          ...track,
          ...patch,
        }
      : track,
  );
  const elements = baseTimeline.elements.map((element) =>
    element.trackId === trackId
      ? {
          ...element,
          ...(patch.hidden !== undefined ? { hidden: patch.hidden } : {}),
          ...(patch.muted !== undefined ? { muted: patch.muted } : {}),
        }
      : element,
  );
  return withUpdatedTimelineElements(plan, elements, tracks);
};

export const exportSmartEditTimelineCaptionsToSrt = (plan: SmartEditPlan): string => {
  const timeline = mergePersistentTimelineWithDerivedSegments(plan, buildSmartEditTimeline(plan));
  const hiddenTrackIds = new Set(
    timeline.tracks.filter((track) => track.hidden).map((track) => track.id),
  );
  const captions = timeline.elements
    .filter(
      (element) =>
        element.kind === "text" &&
        !element.hidden &&
        !hiddenTrackIds.has(element.trackId) &&
        element.durationSeconds >= MIN_SMART_EDIT_CLIP_SECONDS,
    )
    .map((element) => ({
      endSecond: element.startSecond + element.durationSeconds,
      startSecond: element.startSecond,
      text: (element.text ?? element.label).replace(/\r\n?/g, "\n").trim(),
    }))
    .filter((caption) => caption.text && caption.endSecond > caption.startSecond)
    .sort((left, right) => left.startSecond - right.startSecond || left.endSecond - right.endSecond);

  return captions
    .map((caption, index) =>
      [
        String(index + 1),
        `${formatSmartEditSrtTimestamp(caption.startSecond)} --> ${formatSmartEditSrtTimestamp(
          caption.endSecond,
        )}`,
        caption.text,
      ].join("\n"),
    )
    .join("\n\n");
};

export const importSmartEditSrtCaptionsToTimeline = (
  plan: SmartEditPlan,
  srtText: string,
  token = `${Date.now()}`,
): SmartEditPlan => {
  const cues = parseSmartEditSrtCues(srtText);
  if (cues.length === 0) {
    return plan;
  }
  const baseTimeline = plan.timeline ?? buildSmartEditTimeline(plan);
  const importedElements: SmartEditTimelineElement[] = cues.map((cue, index) => ({
    detachedAudio: false,
    durationSeconds: Math.max(MIN_SMART_EDIT_CLIP_SECONDS, cue.durationSeconds),
    hidden: false,
    id: `srt-${token}-${index + 1}`,
    kind: "text",
    label: cue.text.split("\n")[0] ?? `Subtitle ${index + 1}`,
    muted: false,
    playbackRate: 1,
    startSecond: clampTimelineStart(cue.startSecond),
    text: cue.text,
    trackId: "text-copy",
    trimStartSecond: 0,
  }));
  return withUpdatedTimelineElements(
    plan,
    [...baseTimeline.elements, ...importedElements],
    ensureTimelineTrack(baseTimeline, {
      hidden: false,
      id: "text-copy",
      kind: "text",
      label: "Text",
      locked: false,
      muted: false,
    }),
  );
};

export const addSmartEditTimelineVoiceElement = (
  plan: SmartEditPlan,
  playheadSecond: number,
  token = `${Date.now()}`,
): SmartEditPlan => {
  const baseTimeline = plan.timeline ?? buildSmartEditTimeline(plan);
  const startSecond = clampTimelineStart(snapTimelineSeconds(playheadSecond));
  const element: SmartEditTimelineElement = {
    detachedAudio: false,
    durationSeconds: 2,
    hidden: false,
    id: `voice-${token}`,
    kind: "audio",
    label: "New voiceover",
    muted: false,
    playbackRate: 1,
    startSecond,
    text: "New voiceover",
    trackId: "voiceover",
    trimStartSecond: 0,
  };
  return withUpdatedTimelineElements(
    plan,
    [...baseTimeline.elements, element],
    ensureTimelineTrack(baseTimeline, {
      hidden: false,
      id: "voiceover",
      kind: "audio",
      label: "Voice",
      locked: false,
      muted: false,
    }),
  );
};

export const addSmartEditTimelineTextElement = (
  plan: SmartEditPlan,
  playheadSecond: number,
  token = `${Date.now()}`,
): SmartEditPlan => {
  const baseTimeline = plan.timeline ?? buildSmartEditTimeline(plan);
  const startSecond = clampTimelineStart(snapTimelineSeconds(playheadSecond));
  const element: SmartEditTimelineElement = {
    detachedAudio: false,
    durationSeconds: 2,
    hidden: false,
    id: `text-${token}`,
    kind: "text",
    label: "New text",
    muted: false,
    playbackRate: 1,
    startSecond,
    text: "New text",
    trackId: "text-copy",
    trimStartSecond: 0,
  };
  return withUpdatedTimelineElements(
    plan,
    [...baseTimeline.elements, element],
    ensureTimelineTrack(baseTimeline, {
      hidden: false,
      id: "text-copy",
      kind: "text",
      label: "Text",
      locked: false,
      muted: false,
    }),
  );
};

export const addSmartEditTimelineMediaElement = (
  plan: SmartEditPlan,
  asset: AssetMetadata,
  playheadSecond: number,
  token = `${Date.now()}`,
): SmartEditPlan => {
  if (asset.type !== "video" && asset.type !== "image") {
    return plan;
  }
  const baseTimeline = plan.timeline ?? buildSmartEditTimeline(plan);
  const startSecond = clampTimelineStart(snapTimelineSeconds(playheadSecond));
  const isImage = asset.type === "image";
  const trackId = "media-video";
  const element: SmartEditTimelineElement = {
    detachedAudio: false,
    durationSeconds: isImage ? 3 : 4,
    hidden: false,
    id: `media-${asset.id}-${token}`,
    kind: "video",
    label: asset.name,
    muted: false,
    playbackRate: 1,
    sourceUrl: asset.url,
    startSecond,
    trackId,
    trimStartSecond: 0,
  };
  return withUpdatedTimelineElements(
    plan,
    [...baseTimeline.elements, element],
    ensureTimelineTrack(baseTimeline, {
      hidden: false,
      id: trackId,
      kind: "video",
      label: "Media video",
      locked: false,
      muted: false,
    }),
  );
};

export const detachSmartEditSourceAudioToTimelineElement = (
  plan: SmartEditPlan,
  segmentId: string,
  token = `${Date.now()}`,
): SmartEditPlan => {
  const segment = plan.segments.find((candidate) => candidate.id === segmentId);
  if (!segment?.source.sceneClipAudioUrl) {
    return plan;
  }

  const segmentStartSecond = segmentTimelineBaseStart(plan, segment.id);
  const sourceAudioOffsetSeconds = clampInSegmentOffset(
    segment.sourceAudioStartOffsetSeconds ?? 0,
    segment.durationSeconds,
  );
  const sourceAudioDurationSeconds = clipDurationWithinSegment(
    segment.sourceAudioDurationSeconds,
    sourceAudioOffsetSeconds,
    segment.durationSeconds,
  );
  const playbackRate = clampPlaybackRate(segment.playbackRate ?? 1);
  const sourceStart = segment.source.startSecond ?? 0;
  const trimEndSecond =
    segment.source.endSecond === undefined
      ? sourceStart + sourceAudioDurationSeconds * playbackRate
      : Math.min(segment.source.endSecond, sourceStart + sourceAudioDurationSeconds * playbackRate);
  const detachedElement: SmartEditTimelineElement = {
    audioFadeInSeconds: segment.sourceAudioFadeInSeconds ?? 0,
    audioFadeOutSeconds: segment.sourceAudioFadeOutSeconds ?? 0,
    audioVolume: segment.sourceAudioVolume ?? 1,
    audioVolumeKeyframes: audioVolumeKeyframes(
      segment.sourceAudioVolumeKeyframes,
      sourceAudioDurationSeconds,
    ),
    audioWaveform: segment.source.sceneClipAudioWaveform,
    detachedAudio: true,
    durationSeconds: sourceAudioDurationSeconds,
    hidden: false,
    id: `source-audio-${segment.id}-${token}`,
    kind: "audio",
    label: `Scene ${segment.order} detached audio`,
    muted: false,
    playbackRate,
    sceneId: segment.sceneId,
    sourceDurationSeconds:
      segment.source.endSecond !== undefined
        ? Math.max(MIN_SMART_EDIT_CLIP_SECONDS, segment.source.endSecond - sourceStart)
        : undefined,
    sourceUrl: segment.source.sceneClipAudioUrl,
    startSecond: snapTimelineSeconds(segmentStartSecond + sourceAudioOffsetSeconds),
    trackId: "audio-source",
    trimEndSecond,
    trimStartSecond: sourceStart,
  };
  const mutedPlan = withRebuiltTimeline({
    ...plan,
    segments: plan.segments.map((candidate) =>
      candidate.id === segment.id
        ? {
            ...candidate,
            sourceAudioMuted: true,
          }
        : candidate,
    ),
  });
  const baseTimeline = mutedPlan.timeline ?? buildSmartEditTimeline(mutedPlan);
  return withUpdatedTimelineElements(
    mutedPlan,
    [...baseTimeline.elements, detachedElement],
    ensureTimelineTrack(baseTimeline, {
      hidden: false,
      id: "audio-source",
      kind: "audio",
      label: "Source audio",
      locked: false,
      muted: false,
    }),
  );
};

export const detachSmartEditSceneVideoToTimelineElement = (
  plan: SmartEditPlan,
  segmentId: string,
  token = `${Date.now()}`,
): SmartEditPlan => {
  const segment = plan.segments.find((candidate) => candidate.id === segmentId);
  const sourceUrl = segment?.source.sceneClipVideoOnlyUrl ?? segment?.source.sceneClipUrl;
  if (!segment || !sourceUrl) {
    return plan;
  }

  const playbackRate = clampPlaybackRate(segment.playbackRate ?? 1);
  const sourceStart = segment.source.startSecond ?? 0;
  const trimEndSecond =
    segment.source.endSecond === undefined
      ? sourceStart + segment.durationSeconds * playbackRate
      : segment.source.endSecond;
  const linkedGroupId = segment.source.sceneClipAudioUrl
    ? `scene-material-${segment.id}-${token}`
    : undefined;
  const detachedAudioElement: SmartEditTimelineElement | undefined =
    segment.source.sceneClipAudioUrl && linkedGroupId
      ? {
          audioFadeInSeconds: segment.sourceAudioFadeInSeconds ?? 0,
          audioFadeOutSeconds: segment.sourceAudioFadeOutSeconds ?? 0,
          audioVolume: segment.sourceAudioVolume ?? 1,
          audioVolumeKeyframes: audioVolumeKeyframes(
            segment.sourceAudioVolumeKeyframes,
            segment.durationSeconds,
          ),
          audioWaveform: segment.source.sceneClipAudioWaveform,
          detachedAudio: true,
          durationSeconds: segment.durationSeconds,
          hidden: false,
          id: `source-audio-${segment.id}-${token}`,
          kind: "audio",
          label: `Scene ${segment.order} linked audio`,
          linkedGroupId,
          muted: false,
          playbackRate,
          sceneId: segment.sceneId,
          sourceDurationSeconds: Math.max(MIN_SMART_EDIT_CLIP_SECONDS, trimEndSecond - sourceStart),
          sourceUrl: segment.source.sceneClipAudioUrl,
          startSecond: segmentTimelineBaseStart(plan, segment.id),
          trackId: "audio-source",
          trimEndSecond,
          trimStartSecond: sourceStart,
        }
      : undefined;
  const detachedElement: SmartEditTimelineElement = {
    detachedAudio: false,
    durationSeconds: segment.durationSeconds,
    hidden: false,
    id: `video-${segment.id}-${token}`,
    kind: "video",
    label: `Scene ${segment.order} detached video`,
    linkedGroupId,
    muted: false,
    playbackRate,
    sceneId: segment.sceneId,
    sourceDurationSeconds: Math.max(MIN_SMART_EDIT_CLIP_SECONDS, trimEndSecond - sourceStart),
    sourceUrl,
    startSecond: segmentTimelineBaseStart(plan, segment.id),
    trackId: "video-main",
    trimEndSecond,
    trimStartSecond: sourceStart,
    visualEffects: segment.visualEffects,
  };
  const disabledPlan = withRebuiltTimeline({
    ...plan,
    segments: plan.segments.map((candidate) =>
      candidate.id === segment.id
        ? {
            ...candidate,
            enabled: false,
          }
        : candidate,
    ),
  });
  const baseTimeline = disabledPlan.timeline ?? buildSmartEditTimeline(disabledPlan);
  return withUpdatedTimelineElements(
    disabledPlan,
    [
      ...baseTimeline.elements,
      ...(detachedAudioElement ? [detachedAudioElement] : []),
      detachedElement,
    ],
    ensureTimelineTrack(
      {
        ...baseTimeline,
        tracks: ensureTimelineTrack(baseTimeline, {
          hidden: false,
          id: "video-main",
          kind: "video",
          label: "Video",
          locked: false,
          muted: false,
        }),
      },
      {
        hidden: false,
        id: "audio-source",
        kind: "audio",
        label: "Source audio",
        locked: false,
        muted: false,
      },
    ),
  );
};

export const materializeSmartEditRenderedSegmentsToTimelineElements = (
  plan: SmartEditPlan,
  segmentIds?: string[],
  token = `${Date.now()}`,
): SmartEditPlan => {
  const selectedIds = segmentIds && segmentIds.length > 0 ? new Set(segmentIds) : undefined;
  const materializedSegments = plan.segments
    .filter((segment) => segment.enabled)
    .filter((segment) => !selectedIds || selectedIds.has(segment.id))
    .filter((segment) => segment.source.sceneClipVideoOnlyUrl || segment.source.sceneClipUrl);
  if (materializedSegments.length === 0) {
    return plan;
  }

  const materializedIdSet = new Set(materializedSegments.map((segment) => segment.id));
  const disabledPlan = withRebuiltTimeline({
    ...plan,
    segments: plan.segments.map((segment) =>
      materializedIdSet.has(segment.id)
        ? {
            ...segment,
            enabled: false,
          }
        : segment,
    ),
  });
  const baseTimeline = disabledPlan.timeline ?? buildSmartEditTimeline(disabledPlan);
  const nextElements = [...baseTimeline.elements];
  for (const segment of materializedSegments) {
    const segmentStartSecond = segmentTimelineBaseStart(plan, segment.id);
    const playbackRate = clampPlaybackRate(segment.playbackRate ?? 1);
    const sourceStart = segment.source.startSecond ?? 0;
    const sourceUrl = segment.source.sceneClipVideoOnlyUrl ?? segment.source.sceneClipUrl;
    const trimEndSecond =
      segment.source.endSecond === undefined
        ? sourceStart + segment.durationSeconds * playbackRate
        : segment.source.endSecond;
    const linkedGroupId = segment.source.sceneClipAudioUrl
      ? `materialized-scene-${segment.id}-${token}`
      : undefined;
    if (sourceUrl) {
      nextElements.push({
        detachedAudio: false,
        durationSeconds: segment.durationSeconds,
        hidden: false,
        id: `video-${segment.id}-${token}`,
        kind: "video",
        label: `Scene ${segment.order} video`,
        linkedGroupId,
        muted: false,
        playbackRate,
        sceneId: segment.sceneId,
        sourceDurationSeconds: Math.max(MIN_SMART_EDIT_CLIP_SECONDS, trimEndSecond - sourceStart),
        sourceUrl,
        startSecond: segmentStartSecond,
        trackId: "video-main",
        trimEndSecond,
        trimStartSecond: sourceStart,
        visualEffects: segment.visualEffects,
      });
    }
    if (segment.source.sceneClipAudioUrl) {
      const sourceAudioOffsetSeconds = clampInSegmentOffset(
        segment.sourceAudioStartOffsetSeconds ?? 0,
        segment.durationSeconds,
      );
      const sourceAudioDurationSeconds = clipDurationWithinSegment(
        segment.sourceAudioDurationSeconds,
        sourceAudioOffsetSeconds,
        segment.durationSeconds,
      );
      const audioTrimEndSecond =
        segment.source.endSecond === undefined
          ? sourceStart + sourceAudioDurationSeconds * playbackRate
          : Math.min(segment.source.endSecond, sourceStart + sourceAudioDurationSeconds * playbackRate);
      nextElements.push({
        audioFadeInSeconds: segment.sourceAudioFadeInSeconds ?? 0,
        audioFadeOutSeconds: segment.sourceAudioFadeOutSeconds ?? 0,
        audioVolume: segment.sourceAudioVolume ?? 1,
        audioVolumeKeyframes: audioVolumeKeyframes(
          segment.sourceAudioVolumeKeyframes,
          sourceAudioDurationSeconds,
        ),
        audioWaveform: segment.source.sceneClipAudioWaveform,
        detachedAudio: true,
        durationSeconds: sourceAudioDurationSeconds,
        hidden: false,
        id: `source-audio-${segment.id}-${token}`,
        kind: "audio",
        label: `Scene ${segment.order} audio`,
        linkedGroupId,
        muted: segment.sourceAudioMuted ?? false,
        playbackRate,
        sceneId: segment.sceneId,
        sourceDurationSeconds:
          segment.source.endSecond !== undefined
            ? Math.max(MIN_SMART_EDIT_CLIP_SECONDS, segment.source.endSecond - sourceStart)
            : undefined,
        sourceUrl: segment.source.sceneClipAudioUrl,
        startSecond: snapTimelineSeconds(segmentStartSecond + sourceAudioOffsetSeconds),
        trackId: "audio-source",
        trimEndSecond: audioTrimEndSecond,
        trimStartSecond: sourceStart,
      });
    }
    if (segment.subtitle.trim()) {
      const captionOffsetSeconds = clampInSegmentOffset(
        segment.captionStartOffsetSeconds ?? 0,
        segment.durationSeconds,
      );
      const captionDurationSeconds = clipDurationWithinSegment(
        segment.captionDurationSeconds,
        captionOffsetSeconds,
        segment.durationSeconds,
      );
      nextElements.push({
        detachedAudio: false,
        durationSeconds: captionDurationSeconds,
        hidden: segment.captionHidden ?? false,
        id: `text-${segment.id}-${token}`,
        kind: "text",
        label: segment.subtitle,
        muted: false,
        playbackRate: 1,
        sceneId: segment.sceneId,
        segmentId: segment.id,
        startSecond: snapTimelineSeconds(segmentStartSecond + captionOffsetSeconds),
        text: segment.subtitle,
        textColor: segment.captionTextColor,
        textFontSize: segment.captionTextFontSize,
        textPositionYPercent: segment.captionTextPositionYPercent,
        trackId: "text-copy",
        trimStartSecond: 0,
      });
    }
  }

  return withUpdatedTimelineElements(
    disabledPlan,
    nextElements,
    ensureTimelineTrack(
      {
        ...baseTimeline,
        tracks: ensureTimelineTrack(
          {
            ...baseTimeline,
            tracks: ensureTimelineTrack(baseTimeline, {
              hidden: false,
              id: "video-main",
              kind: "video",
              label: "Video",
              locked: false,
              muted: false,
            }),
          },
          {
            hidden: false,
            id: "audio-source",
            kind: "audio",
            label: "Source audio",
            locked: false,
            muted: false,
          },
        ),
      },
      {
        hidden: false,
        id: "text-copy",
        kind: "text",
        label: "Text",
        locked: false,
        muted: false,
      },
    ),
  );
};

export const updateSmartEditTimelineElement = (
  plan: SmartEditPlan,
  elementId: string,
  patch: SmartEditTimelineElementPatch,
): SmartEditPlan => {
  const baseTimeline = plan.timeline ?? buildSmartEditTimeline(plan);
  return withUpdatedTimelineElements(
    plan,
    baseTimeline.elements.map((element) =>
      element.id === elementId
        ? {
            ...element,
            ...patch,
            audioFadeInSeconds:
              patch.audioFadeInSeconds === undefined
                ? element.audioFadeInSeconds
                : clampAudioFade(patch.audioFadeInSeconds),
            audioFadeOutSeconds:
              patch.audioFadeOutSeconds === undefined
                ? element.audioFadeOutSeconds
                : clampAudioFade(patch.audioFadeOutSeconds),
            audioVolume:
              patch.audioVolume === undefined ? element.audioVolume : clampAudioVolume(patch.audioVolume),
            audioVolumeKeyframes:
              patch.audioVolumeKeyframes === undefined
                ? element.audioVolumeKeyframes
                : audioVolumeKeyframes(patch.audioVolumeKeyframes, element.durationSeconds),
            durationSeconds:
              patch.durationSeconds === undefined
                ? element.durationSeconds
                : clampSmartEditDuration(patch.durationSeconds),
            playbackRate:
              patch.playbackRate === undefined
                ? element.playbackRate
                : clampPlaybackRate(patch.playbackRate),
            startSecond:
              patch.startSecond === undefined
                ? element.startSecond
                : clampTimelineStart(snapTimelineSeconds(patch.startSecond)),
            textColor:
              patch.textColor === undefined
                ? element.textColor
                : normalizeTextColor(patch.textColor) ?? element.textColor,
            textFontSize:
              patch.textFontSize === undefined
                ? element.textFontSize
                : clampTextFontSize(patch.textFontSize),
            textPositionYPercent:
              patch.textPositionYPercent === undefined
                ? element.textPositionYPercent
                : clampTextPositionYPercent(patch.textPositionYPercent),
          }
        : element,
    ),
    baseTimeline.tracks,
  );
};

export const splitSmartEditTimelineElementAtPlayhead = (
  plan: SmartEditPlan,
  elementId: string,
  playheadSecond: number,
  splitToken = String(Date.now()),
): SmartEditPlan | undefined => {
  const baseTimeline = plan.timeline ?? buildSmartEditTimeline(plan);
  const targetElement = baseTimeline.elements.find((element) => element.id === elementId);
  if (!targetElement) {
    return undefined;
  }
  const splitSecond = snapTimelineSeconds(playheadSecond);
  const elementStart = clampTimelineStart(targetElement.startSecond);
  const elementEnd = snapTimelineSeconds(elementStart + targetElement.durationSeconds);
  if (
    splitSecond <= elementStart + MIN_SMART_EDIT_CLIP_SECONDS ||
    splitSecond >= elementEnd - MIN_SMART_EDIT_CLIP_SECONDS
  ) {
    return undefined;
  }
  const splitElements = splitPersistentTimelineElement(
    targetElement,
    splitSecond,
    targetElement.segmentId,
    splitToken,
  );
  return withUpdatedTimelineElements(
    plan,
    baseTimeline.elements.flatMap((element) =>
      element.id === targetElement.id ? splitElements : [element],
    ),
    baseTimeline.tracks,
  );
};

export const splitSmartEditTimelineElementsAtPlayhead = (
  plan: SmartEditPlan,
  elementIds: string[],
  playheadSecond: number,
  splitToken = String(Date.now()),
): SmartEditPlan | undefined => {
  const baseTimeline = plan.timeline ?? buildSmartEditTimeline(plan);
  const splitIds = expandedPersistentTimelineElementIds(baseTimeline, elementIds);
  if (splitIds.size === 0) {
    return undefined;
  }
  const splitSecond = snapTimelineSeconds(playheadSecond);
  let changed = false;
  const nextElements = baseTimeline.elements.flatMap((element) => {
    if (!splitIds.has(element.id) || isDerivedTimelineElement(element)) {
      return [element];
    }
    const elementStart = clampTimelineStart(element.startSecond);
    const elementEnd = snapTimelineSeconds(elementStart + element.durationSeconds);
    if (
      splitSecond <= elementStart + MIN_SMART_EDIT_CLIP_SECONDS ||
      splitSecond >= elementEnd - MIN_SMART_EDIT_CLIP_SECONDS
    ) {
      return [element];
    }
    changed = true;
    return splitPersistentTimelineElement(element, splitSecond, element.segmentId, splitToken);
  });
  return changed
    ? withUpdatedTimelineElements(plan, nextElements, baseTimeline.tracks)
    : undefined;
};

export const trimSmartEditTimelineElementAtPlayhead = (
  plan: SmartEditPlan,
  elementId: string,
  playheadSecond: number,
  side: "left" | "right",
  editMode: SmartEditTimelineEditMode = "magnetic",
): SmartEditPlan | undefined => {
  const baseTimeline = plan.timeline ?? buildSmartEditTimeline(plan);
  const targetElement = baseTimeline.elements.find((element) => element.id === elementId);
  if (!targetElement) {
    return undefined;
  }
  const splitSecond = snapTimelineSeconds(playheadSecond);
  const elementStart = clampTimelineStart(targetElement.startSecond);
  const elementEnd = snapTimelineSeconds(elementStart + targetElement.durationSeconds);
  if (
    splitSecond <= elementStart + MIN_SMART_EDIT_CLIP_SECONDS ||
    splitSecond >= elementEnd - MIN_SMART_EDIT_CLIP_SECONDS
  ) {
    return undefined;
  }
  const retainedElements = trimPersistentTimelineElementAtSecond(
    targetElement,
    splitSecond,
    side,
  );
  const removedGap: SmartEditRippleGap =
    side === "left"
      ? {
          endSecond: elementEnd,
          startSecond: splitSecond,
        }
      : {
          endSecond: splitSecond,
          startSecond: elementStart,
        };
  const nextElements =
    editMode === "ripple"
      ? shiftTimelineElementsByRippleGaps(
          baseTimeline.elements.flatMap((element) =>
            element.id === targetElement.id ? retainedElements : [element],
          ),
          [removedGap],
        )
      : baseTimeline.elements.flatMap((element) =>
          element.id === targetElement.id ? retainedElements : [element],
        );
  const nextSegments =
    editMode === "ripple"
      ? shiftSegmentsByRippleGaps(plan.segments, [removedGap])
      : plan.segments;
  return withUpdatedTimelineElements(
    {
      ...plan,
      segments: nextSegments,
    },
    nextElements,
    baseTimeline.tracks,
  );
};

export const trimSmartEditTimelineElementsAtPlayhead = (
  plan: SmartEditPlan,
  elementIds: string[],
  playheadSecond: number,
  side: "left" | "right",
  editMode: SmartEditTimelineEditMode = "magnetic",
): SmartEditPlan | undefined => {
  const baseTimeline = plan.timeline ?? buildSmartEditTimeline(plan);
  const trimIds = expandedPersistentTimelineElementIds(baseTimeline, elementIds);
  if (trimIds.size === 0) {
    return undefined;
  }
  const splitSecond = snapTimelineSeconds(playheadSecond);
  const removedGaps: SmartEditRippleGap[] = [];
  let changed = false;
  const retainedElements = baseTimeline.elements.flatMap((element) => {
    if (!trimIds.has(element.id) || isDerivedTimelineElement(element)) {
      return [element];
    }
    const elementStart = clampTimelineStart(element.startSecond);
    const elementEnd = snapTimelineSeconds(elementStart + element.durationSeconds);
    if (
      splitSecond <= elementStart + MIN_SMART_EDIT_CLIP_SECONDS ||
      splitSecond >= elementEnd - MIN_SMART_EDIT_CLIP_SECONDS
    ) {
      return [element];
    }
    changed = true;
    removedGaps.push(
      side === "left"
        ? {
            endSecond: elementEnd,
            startSecond: splitSecond,
          }
        : {
            endSecond: splitSecond,
            startSecond: elementStart,
          },
    );
    return trimPersistentTimelineElementAtSecond(element, splitSecond, side);
  });
  if (!changed) {
    return undefined;
  }
  const nextElements =
    editMode === "ripple"
      ? shiftTimelineElementsByRippleGaps(retainedElements, removedGaps)
      : retainedElements;
  const nextSegments =
    editMode === "ripple" ? shiftSegmentsByRippleGaps(plan.segments, removedGaps) : plan.segments;
  return withUpdatedTimelineElements(
    {
      ...plan,
      segments: nextSegments,
    },
    nextElements,
    baseTimeline.tracks,
  );
};

const resizePersistentTimelineElementEdge = (
  element: SmartEditTimelineElement,
  edge: "in" | "out",
  deltaSeconds: number,
): SmartEditTimelineElement | undefined => {
  const playbackRate = clampPlaybackRate(element.playbackRate ?? 1);
  const usesSourceTrim = element.kind === "video" || element.kind === "audio";
  const startSecond = clampTimelineStart(element.startSecond);
  const durationSeconds = Math.max(MIN_SMART_EDIT_CLIP_SECONDS, element.durationSeconds);
  const endSecond = snapTimelineSeconds(startSecond + durationSeconds);
  const trimStart = element.trimStartSecond ?? 0;
  const trimEnd = element.trimEndSecond ?? trimStart + durationSeconds * playbackRate;

  if (edge === "in") {
    const earliestStart = usesSourceTrim
      ? Math.max(0, startSecond - trimStart / playbackRate)
      : 0;
    const latestStart = Math.max(earliestStart, endSecond - MIN_SMART_EDIT_CLIP_SECONDS);
    const nextStart = Math.min(
      latestStart,
      Math.max(earliestStart, snapTimelineSeconds(startSecond + deltaSeconds)),
    );
    const actualDelta = snapTimelineSeconds(nextStart - startSecond);
    if (Math.abs(actualDelta) < 0.001) {
      return undefined;
    }
    const nextDuration = Math.max(
      MIN_SMART_EDIT_CLIP_SECONDS,
      snapTimelineSeconds(durationSeconds - actualDelta),
    );
    return {
      ...element,
      durationSeconds: nextDuration,
      startSecond: nextStart,
      ...(usesSourceTrim
        ? {
            trimEndSecond: trimEnd,
            trimStartSecond: Math.max(0, trimStart + actualDelta * playbackRate),
          }
        : {}),
    };
  }

  const nextDuration = Math.max(
    MIN_SMART_EDIT_CLIP_SECONDS,
    snapTimelineSeconds(durationSeconds + deltaSeconds),
  );
  if (Math.abs(nextDuration - durationSeconds) < 0.001) {
    return undefined;
  }
  return {
    ...element,
    durationSeconds: nextDuration,
    ...(usesSourceTrim
      ? {
          trimEndSecond: Math.max(
            trimStart + MIN_SMART_EDIT_CLIP_SECONDS * playbackRate,
            trimEnd + (nextDuration - durationSeconds) * playbackRate,
          ),
          trimStartSecond: trimStart,
        }
      : {}),
  };
};

const resizeSmartEditSegmentEdge = (
  segment: SmartEditSegment,
  startSecond: number,
  edge: "in" | "out",
  deltaSeconds: number,
): SmartEditSegment | undefined => {
  const playbackRate = clampPlaybackRate(segment.playbackRate ?? 1);
  const sourceStart = segment.source.startSecond ?? 0;
  const sourceEnd = segment.source.endSecond ?? sourceStart + segment.durationSeconds * playbackRate;
  if (edge === "in") {
    const earliestStart = Math.max(0, startSecond - sourceStart / playbackRate);
    const latestStart = Math.max(
      earliestStart,
      startSecond + segment.durationSeconds - MIN_SMART_EDIT_CLIP_SECONDS,
    );
    const nextStart = Math.min(
      latestStart,
      Math.max(earliestStart, snapTimelineSeconds(startSecond + deltaSeconds)),
    );
    const actualDelta = snapTimelineSeconds(nextStart - startSecond);
    if (Math.abs(actualDelta) < 0.001) {
      return undefined;
    }
    const nextSourceStart = Math.max(0, sourceStart + actualDelta * playbackRate);
    return {
      ...segment,
      durationSeconds: durationFromSourceRange(
        nextSourceStart,
        sourceEnd,
        playbackRate,
        segment.durationSeconds,
      ),
      source: {
        ...segment.source,
        endSecond: sourceEnd,
        startSecond: nextSourceStart,
      },
      timelineStartSecond: nextStart,
    };
  }

  const nextDuration = Math.max(
    MIN_SMART_EDIT_CLIP_SECONDS,
    snapTimelineSeconds(segment.durationSeconds + deltaSeconds),
  );
  if (Math.abs(nextDuration - segment.durationSeconds) < 0.001) {
    return undefined;
  }
  return {
    ...segment,
    durationSeconds: nextDuration,
    source: {
      ...segment.source,
      endSecond: Math.max(
        sourceStart + MIN_SMART_EDIT_CLIP_SECONDS * playbackRate,
        sourceEnd + (nextDuration - segment.durationSeconds) * playbackRate,
      ),
      startSecond: sourceStart,
    },
    timelineStartSecond: startSecond,
  };
};

export const linkedTimelineElementIds = (
  timeline: SmartEditTimeline,
  element: SmartEditTimelineElement,
): Set<string> => {
  if (!element.linkedGroupId) {
    return new Set([element.id]);
  }
  return new Set(
    timeline.elements
      .filter((candidate) => candidate.linkedGroupId === element.linkedGroupId)
      .map((candidate) => candidate.id),
  );
};

const slipPersistentTimelineElementSource = (
  element: SmartEditTimelineElement,
  deltaSeconds: number,
): SmartEditTimelineElement | undefined => {
  if (element.kind !== "video" && element.kind !== "audio") {
    return undefined;
  }
  const playbackRate = clampPlaybackRate(element.playbackRate ?? 1);
  const sourceSpanSeconds = snapTimelineSeconds(
    Math.max(MIN_SMART_EDIT_CLIP_SECONDS, element.durationSeconds) * playbackRate,
  );
  const trimStart = element.trimStartSecond ?? 0;
  const trimEnd = element.trimEndSecond ?? trimStart + sourceSpanSeconds;
  const sourceEndLimit = Math.max(
    sourceSpanSeconds,
    trimEnd,
    element.sourceDurationSeconds ?? 0,
  );
  const latestTrimStart = Math.max(0, sourceEndLimit - sourceSpanSeconds);
  const nextTrimStart = Math.min(
    latestTrimStart,
    Math.max(0, snapTimelineSeconds(trimStart + deltaSeconds)),
  );
  if (Math.abs(nextTrimStart - trimStart) < 0.001) {
    return undefined;
  }
  return {
    ...element,
    sourceDurationSeconds: sourceEndLimit,
    trimEndSecond: snapTimelineSeconds(nextTrimStart + sourceSpanSeconds),
    trimStartSecond: nextTrimStart,
  };
};

export const slipSmartEditTimelineElementSource = (
  plan: SmartEditPlan,
  elementId: string,
  deltaSeconds: number,
): SmartEditPlan => {
  const snappedDelta = snapTimelineSeconds(deltaSeconds);
  if (Math.abs(snappedDelta) < 0.001) {
    return plan;
  }
  const baseTimeline = plan.timeline ?? buildSmartEditTimeline(plan);
  const targetElement = baseTimeline.elements.find((element) => element.id === elementId);
  if (!targetElement || (targetElement.kind !== "video" && targetElement.kind !== "audio")) {
    return plan;
  }
  const slippedTarget = slipPersistentTimelineElementSource(targetElement, snappedDelta);
  if (!slippedTarget) {
    return plan;
  }
  const linkedIds = linkedTimelineElementIds(baseTimeline, targetElement);
  return withUpdatedTimelineElements(
    plan,
    baseTimeline.elements.map((element) => {
      if (element.id === targetElement.id) {
        return slippedTarget;
      }
      if (!linkedIds.has(element.id)) {
        return element;
      }
      return slipPersistentTimelineElementSource(element, snappedDelta) ?? element;
    }),
    baseTimeline.tracks,
  );
};

export const slipSmartEditTimelineElementsSource = (
  plan: SmartEditPlan,
  elementIds: string[],
  deltaSeconds: number,
): SmartEditPlan => {
  const snappedDelta = snapTimelineSeconds(deltaSeconds);
  if (elementIds.length === 0 || Math.abs(snappedDelta) < 0.001) {
    return plan;
  }
  const baseTimeline = plan.timeline ?? buildSmartEditTimeline(plan);
  const requestedIds = new Set(elementIds);
  const processedIds = new Set<string>();
  let nextPlan = plan;

  for (const element of baseTimeline.elements) {
    if (!requestedIds.has(element.id) || processedIds.has(element.id)) {
      continue;
    }
    if (element.kind !== "video" && element.kind !== "audio") {
      processedIds.add(element.id);
      continue;
    }
    const linkedIds = linkedTimelineElementIds(baseTimeline, element);
    linkedIds.forEach((linkedId) => processedIds.add(linkedId));
    nextPlan = slipSmartEditTimelineElementSource(nextPlan, element.id, snappedDelta);
  }

  return nextPlan;
};

export const unlinkSmartEditTimelineElementGroup = (
  plan: SmartEditPlan,
  elementId: string,
): SmartEditPlan => {
  const baseTimeline = plan.timeline ?? buildSmartEditTimeline(plan);
  const targetElement = baseTimeline.elements.find((element) => element.id === elementId);
  if (!targetElement?.linkedGroupId) {
    return plan;
  }
  const linkedGroupId = targetElement.linkedGroupId;
  return withUpdatedTimelineElements(
    plan,
    baseTimeline.elements.map((element) =>
      element.linkedGroupId === linkedGroupId
        ? {
            ...element,
            linkedGroupId: undefined,
          }
        : element,
    ),
    baseTimeline.tracks,
  );
};

export const relinkSmartEditTimelineElements = (
  plan: SmartEditPlan,
  elementIds: string[],
  token = `${Date.now()}`,
): SmartEditPlan => {
  const selectedIds = new Set(elementIds);
  if (selectedIds.size < 2) {
    return plan;
  }
  const baseTimeline = plan.timeline ?? buildSmartEditTimeline(plan);
  const selectedElements = baseTimeline.elements.filter((element) => selectedIds.has(element.id));
  const kinds = new Set(selectedElements.map((element) => element.kind));
  const sceneIds = new Set(selectedElements.map((element) => element.sceneId).filter(Boolean));
  if (
    selectedElements.length < 2 ||
    !kinds.has("video") ||
    !kinds.has("audio") ||
    sceneIds.size > 1
  ) {
    return plan;
  }
  const linkedGroupId = `linked-material-${token}`;
  return withUpdatedTimelineElements(
    plan,
    baseTimeline.elements.map((element) =>
      selectedIds.has(element.id)
        ? {
            ...element,
            linkedGroupId,
          }
        : element,
    ),
    baseTimeline.tracks,
  );
};

export const relinkSmartEditTimelineElementWithSceneMate = (
  plan: SmartEditPlan,
  elementId: string,
  token = `${Date.now()}`,
): SmartEditPlan => {
  const baseTimeline = plan.timeline ?? buildSmartEditTimeline(plan);
  const targetElement = baseTimeline.elements.find((element) => element.id === elementId);
  if (!targetElement || targetElement.linkedGroupId || !targetElement.sceneId) {
    return plan;
  }
  const targetKind = targetElement.kind;
  if (targetKind !== "video" && targetKind !== "audio") {
    return plan;
  }
  const mate = baseTimeline.elements.find(
    (element) =>
      element.id !== targetElement.id &&
      !element.linkedGroupId &&
      element.sceneId === targetElement.sceneId &&
      ((targetKind === "video" && element.kind === "audio") ||
        (targetKind === "audio" && element.kind === "video")),
  );
  return mate ? relinkSmartEditTimelineElements(plan, [targetElement.id, mate.id], token) : plan;
};

export const resizeSmartEditTrackClipEdge = (
  plan: SmartEditPlan,
  trackClip: Pick<SmartEditTrackSegment, "id" | "segmentId" | "trackId">,
  edge: "in" | "out",
  deltaSeconds: number,
): SmartEditPlan => {
  const snappedDelta = snapTimelineSeconds(deltaSeconds);
  if (Math.abs(snappedDelta) < 0.001) {
    return plan;
  }
  const baseTimeline = plan.timeline ?? buildSmartEditTimeline(plan);
  const targetElement = baseTimeline.elements.find((element) =>
    element.id === trackClip.id ||
    Boolean(
      trackClip.segmentId &&
        element.segmentId === trackClip.segmentId &&
        smartEditTrackIdForElement(element) === trackClip.trackId,
    ),
  );
  if (targetElement && !isDerivedTimelineElement(targetElement)) {
    const resizedElement = resizePersistentTimelineElementEdge(targetElement, edge, snappedDelta);
    if (!resizedElement) {
      return plan;
    }
    const linkedIds = linkedTimelineElementIds(baseTimeline, targetElement);
    return withUpdatedTimelineElements(
      plan,
      baseTimeline.elements.map((element) => {
        if (element.id === targetElement.id) {
          return resizedElement;
        }
        if (!linkedIds.has(element.id)) {
          return element;
        }
        return resizePersistentTimelineElementEdge(element, edge, snappedDelta) ?? element;
      }),
      baseTimeline.tracks,
    );
  }
  if (trackClip.trackId === "video" && trackClip.segmentId) {
    const currentStarts = timelineStartsForSegments(plan.segments);
    const targetSegment = plan.segments.find((segment) => segment.id === trackClip.segmentId);
    if (!targetSegment) {
      return plan;
    }
    const startSecond = currentStarts.get(targetSegment.id) ?? targetSegment.timelineStartSecond ?? 0;
    const resizedSegment = resizeSmartEditSegmentEdge(
      targetSegment,
      startSecond,
      edge,
      snappedDelta,
    );
    if (!resizedSegment) {
      return plan;
    }
    return withRebuiltTimeline({
      ...plan,
      segments: plan.segments.map((segment) =>
        segment.id === targetSegment.id
          ? resizedSegment
          : {
              ...segment,
              timelineStartSecond: clampTimelineStart(
                currentStarts.get(segment.id) ?? segment.timelineStartSecond ?? 0,
              ),
            },
      ),
    });
  }
  if (targetElement) {
    const resizedElement = resizePersistentTimelineElementEdge(targetElement, edge, snappedDelta);
    if (!resizedElement) {
      return plan;
    }
    const linkedIds = linkedTimelineElementIds(baseTimeline, targetElement);
    return withUpdatedTimelineElements(
      plan,
      baseTimeline.elements.map((element) => {
        if (element.id === targetElement.id) {
          return resizedElement;
        }
        if (!linkedIds.has(element.id)) {
          return element;
        }
        return resizePersistentTimelineElementEdge(element, edge, snappedDelta) ?? element;
      }),
      baseTimeline.tracks,
    );
  }
  return plan;
};

export const resizeSmartEditTimelineElementsEdge = (
  plan: SmartEditPlan,
  elementIds: string[],
  edge: "in" | "out",
  deltaSeconds: number,
  snapPointsOrPlayhead?: number | number[],
): SmartEditPlan => {
  const snappedDelta = snapTimelineSeconds(deltaSeconds);
  if (Math.abs(snappedDelta) < 0.001) {
    return plan;
  }
  const baseTimeline = plan.timeline ?? buildSmartEditTimeline(plan);
  const lockedTrackIds = new Set(
    baseTimeline.tracks.filter((track) => track.locked).map((track) => track.id),
  );
  const resizeIds = expandedPersistentTimelineElementIds(baseTimeline, elementIds);
  const resizableElements = baseTimeline.elements.filter(
    (element) => resizeIds.has(element.id) && !lockedTrackIds.has(element.trackId),
  );
  if (resizableElements.length === 0) {
    return plan;
  }
  const externalSnapPoints =
    typeof snapPointsOrPlayhead === "number"
      ? [snapPointsOrPlayhead]
      : Array.isArray(snapPointsOrPlayhead)
        ? snapPointsOrPlayhead
        : [];
  const snapPoints = [
    ...externalSnapPoints,
    ...baseTimeline.elements
      .filter((element) => !resizeIds.has(element.id))
      .flatMap((element) => [
        element.startSecond,
        snapTimelineSeconds(element.startSecond + element.durationSeconds),
      ]),
  ];
  const snappedEdgeDelta =
    snapPoints
      .flatMap((point) =>
        resizableElements.map((element) => {
          const currentEdge =
            edge === "in"
              ? element.startSecond
              : snapTimelineSeconds(element.startSecond + element.durationSeconds);
          const desiredEdge = snapTimelineSeconds(currentEdge + snappedDelta);
          return {
            delta: snapTimelineSeconds(point - currentEdge),
            distance: Math.abs(point - desiredEdge),
          };
        }),
      )
      .filter((candidate) => candidate.distance <= TIMELINE_EDGE_SNAP_SECONDS)
      .sort((left, right) => left.distance - right.distance)[0]?.delta ?? snappedDelta;
  const resizedById = new Map<string, SmartEditTimelineElement>();
  for (const element of resizableElements) {
    const resizedElement = resizePersistentTimelineElementEdge(element, edge, snappedEdgeDelta);
    if (!resizedElement) {
      return plan;
    }
    resizedById.set(element.id, resizedElement);
  }
  return withUpdatedTimelineElements(
    plan,
    baseTimeline.elements.map((element) => resizedById.get(element.id) ?? element),
    baseTimeline.tracks,
  );
};

export const removeSmartEditTimelineElementFromTimeline = (
  plan: SmartEditPlan,
  elementId: string,
  editMode: SmartEditTimelineEditMode = "magnetic",
): SmartEditPlan => {
  const baseTimeline = plan.timeline ?? buildSmartEditTimeline(plan);
  const targetElement = baseTimeline.elements.find((element) => element.id === elementId);
  if (!targetElement) {
    return plan;
  }
  const removeIds = linkedTimelineElementIds(baseTimeline, targetElement);
  const retainedElements = baseTimeline.elements.filter((element) => !removeIds.has(element.id));
  const removedGap = {
    endSecond: snapTimelineSeconds(targetElement.startSecond + targetElement.durationSeconds),
    startSecond: targetElement.startSecond,
  };
  const nextElements =
    editMode === "ripple"
      ? shiftTimelineElementsByRippleGaps(retainedElements, [removedGap])
      : retainedElements;
  const nextSegments =
    editMode === "ripple"
      ? shiftSegmentsByRippleGaps(plan.segments, [removedGap])
      : plan.segments;
  return withUpdatedTimelineElements(
    {
      ...plan,
      segments: nextSegments,
    },
    nextElements,
    baseTimeline.tracks,
  );
};

const expandedPersistentTimelineElementIds = (
  timeline: SmartEditTimeline,
  elementIds: string[],
): Set<string> => {
  const ids = new Set<string>();
  for (const elementId of elementIds) {
    const element = timeline.elements.find((candidate) => candidate.id === elementId);
    if (!element || isDerivedTimelineElement(element)) {
      continue;
    }
    for (const linkedId of linkedTimelineElementIds(timeline, element)) {
      ids.add(linkedId);
    }
  }
  return ids;
};

export const updateSmartEditTimelineElementsPlaybackRate = (
  plan: SmartEditPlan,
  elementIds: string[],
  playbackRate: number,
): SmartEditPlan => {
  const baseTimeline = plan.timeline ?? buildSmartEditTimeline(plan);
  const updateIds = expandedPersistentTimelineElementIds(baseTimeline, elementIds);
  if (updateIds.size === 0) {
    return plan;
  }
  const nextPlaybackRate = clampPlaybackRate(playbackRate);
  let changed = false;
  const nextElements = baseTimeline.elements.map((element) => {
    if (
      !updateIds.has(element.id) ||
      isDerivedTimelineElement(element) ||
      (element.kind !== "video" && element.kind !== "audio")
    ) {
      return element;
    }
    if (element.playbackRate === nextPlaybackRate) {
      return element;
    }
    changed = true;
    return {
      ...element,
      playbackRate: nextPlaybackRate,
    };
  });
  return changed ? withUpdatedTimelineElements(plan, nextElements, baseTimeline.tracks) : plan;
};

export const updateSmartEditTimelineElementsAudioProperties = (
  plan: SmartEditPlan,
  elementIds: string[],
  patch: {
    audioFadeInSeconds?: number;
    audioFadeOutSeconds?: number;
    audioVolume?: number;
  },
): SmartEditPlan => {
  const baseTimeline = plan.timeline ?? buildSmartEditTimeline(plan);
  const lockedTrackIds = new Set(
    baseTimeline.tracks.filter((track) => track.locked).map((track) => track.id),
  );
  const updateIds = expandedPersistentTimelineElementIds(baseTimeline, elementIds);
  if (updateIds.size === 0) {
    return plan;
  }
  let changed = false;
  const nextElements = baseTimeline.elements.map((element) => {
    if (
      !updateIds.has(element.id) ||
      isDerivedTimelineElement(element) ||
      lockedTrackIds.has(element.trackId) ||
      (element.kind !== "audio" && element.kind !== "bgm")
    ) {
      return element;
    }
    const nextElement: SmartEditTimeline["elements"][number] = { ...element };
    if (patch.audioVolume !== undefined) {
      nextElement.audioVolume = clampAudioVolume(patch.audioVolume);
    }
    if (patch.audioFadeInSeconds !== undefined) {
      nextElement.audioFadeInSeconds = clampAudioFade(patch.audioFadeInSeconds);
    }
    if (patch.audioFadeOutSeconds !== undefined) {
      nextElement.audioFadeOutSeconds = clampAudioFade(patch.audioFadeOutSeconds);
    }
    if (
      nextElement.audioVolume !== element.audioVolume ||
      nextElement.audioFadeInSeconds !== element.audioFadeInSeconds ||
      nextElement.audioFadeOutSeconds !== element.audioFadeOutSeconds
    ) {
      changed = true;
      return nextElement;
    }
    return element;
  });
  return changed ? withUpdatedTimelineElements(plan, nextElements, baseTimeline.tracks) : plan;
};

export const addSmartEditTimelineElementsAudioVolumeKeyframeAtPlayhead = (
  plan: SmartEditPlan,
  elementIds: string[],
  playheadSecond: number,
  volume?: number,
  token = `${Date.now()}`,
): SmartEditPlan => {
  const baseTimeline = plan.timeline ?? buildSmartEditTimeline(plan);
  const lockedTrackIds = new Set(
    baseTimeline.tracks.filter((track) => track.locked).map((track) => track.id),
  );
  const updateIds = expandedPersistentTimelineElementIds(baseTimeline, elementIds);
  if (updateIds.size === 0) {
    return plan;
  }
  let changed = false;
  const nextElements = baseTimeline.elements.map((element) => {
    const elementEndSecond = element.startSecond + element.durationSeconds;
    if (
      !updateIds.has(element.id) ||
      isDerivedTimelineElement(element) ||
      lockedTrackIds.has(element.trackId) ||
      (element.kind !== "audio" && element.kind !== "bgm") ||
      playheadSecond < element.startSecond ||
      playheadSecond > elementEndSecond
    ) {
      return element;
    }
    const timeSecond = clampVisualKeyframeTime(playheadSecond - element.startSecond, element.durationSeconds);
    const nextKeyframes = audioVolumeKeyframes(element.audioVolumeKeyframes, element.durationSeconds)
      .filter((keyframe) => Math.abs(keyframe.timeSecond - timeSecond) > 0.05)
      .concat({
        easing: "linear" as const,
        id: `audio-keyframe-${element.id}-${token}`,
        timeSecond,
        volume: clampAudioVolume(volume ?? element.audioVolume ?? 1),
      })
      .sort((left, right) => left.timeSecond - right.timeSecond);
    changed = true;
    return {
      ...element,
      audioVolumeKeyframes: nextKeyframes,
    };
  });
  return changed ? withUpdatedTimelineElements(plan, nextElements, baseTimeline.tracks) : plan;
};

export const updateSmartEditTimelineElementsState = (
  plan: SmartEditPlan,
  elementIds: string[],
  patch: {
    hidden?: boolean;
    muted?: boolean;
  },
): SmartEditPlan => {
  const baseTimeline = plan.timeline ?? buildSmartEditTimeline(plan);
  const updateIds = expandedPersistentTimelineElementIds(baseTimeline, elementIds);
  if (updateIds.size === 0) {
    return plan;
  }
  let changed = false;
  const nextElements = baseTimeline.elements.map((element) => {
    if (!updateIds.has(element.id) || isDerivedTimelineElement(element)) {
      return element;
    }
    const nextElement: SmartEditTimeline["elements"][number] = { ...element };
    if (patch.muted !== undefined && (element.kind === "audio" || element.kind === "bgm")) {
      nextElement.muted = patch.muted;
    }
    if (patch.hidden !== undefined && (element.kind === "video" || element.kind === "text")) {
      nextElement.hidden = patch.hidden;
    }
    if (nextElement.muted !== element.muted || nextElement.hidden !== element.hidden) {
      changed = true;
      return nextElement;
    }
    return element;
  });
  return changed ? withUpdatedTimelineElements(plan, nextElements, baseTimeline.tracks) : plan;
};

export const updateSmartEditTimelineElementsTextStyle = (
  plan: SmartEditPlan,
  elementIds: string[],
  patch: {
    textColor?: string;
    textFontSize?: number;
    textPositionYPercent?: number;
  },
): SmartEditPlan => {
  const baseTimeline = plan.timeline ?? buildSmartEditTimeline(plan);
  const lockedTrackIds = new Set(
    baseTimeline.tracks.filter((track) => track.locked).map((track) => track.id),
  );
  const updateIds = expandedPersistentTimelineElementIds(baseTimeline, elementIds);
  if (updateIds.size === 0) {
    return plan;
  }
  let changed = false;
  const nextElements = baseTimeline.elements.map((element) => {
    if (
      !updateIds.has(element.id) ||
      isDerivedTimelineElement(element) ||
      lockedTrackIds.has(element.trackId) ||
      element.kind !== "text"
    ) {
      return element;
    }
    const nextElement: SmartEditTimeline["elements"][number] = { ...element };
    if (patch.textColor !== undefined) {
      nextElement.textColor = normalizeTextColor(patch.textColor) ?? element.textColor;
    }
    if (patch.textFontSize !== undefined) {
      nextElement.textFontSize = clampTextFontSize(patch.textFontSize);
    }
    if (patch.textPositionYPercent !== undefined) {
      nextElement.textPositionYPercent = clampTextPositionYPercent(patch.textPositionYPercent);
    }
    if (
      nextElement.textColor !== element.textColor ||
      nextElement.textFontSize !== element.textFontSize ||
      nextElement.textPositionYPercent !== element.textPositionYPercent
    ) {
      changed = true;
      return nextElement;
    }
    return element;
  });
  return changed ? withUpdatedTimelineElements(plan, nextElements, baseTimeline.tracks) : plan;
};

export const mergeSmartEditTimelineTextElements = (
  plan: SmartEditPlan,
  elementIds: string[],
): SmartEditPlan => {
  const baseTimeline = plan.timeline ?? buildSmartEditTimeline(plan);
  const lockedTrackIds = new Set(
    baseTimeline.tracks.filter((track) => track.locked).map((track) => track.id),
  );
  const selectedIds = new Set(elementIds);
  const textElements = baseTimeline.elements
    .filter(
      (element) =>
        selectedIds.has(element.id) &&
        !isDerivedTimelineElement(element) &&
        !lockedTrackIds.has(element.trackId) &&
        element.kind === "text",
    )
    .sort((left, right) => left.startSecond - right.startSecond);
  if (textElements.length < 2) {
    return plan;
  }

  const firstElement = textElements[0]!;
  const mergeIds = new Set(textElements.map((element) => element.id));
  const startSecond = Math.min(...textElements.map((element) => element.startSecond));
  const endSecond = Math.max(
    ...textElements.map((element) => element.startSecond + element.durationSeconds),
  );
  const mergedText = textElements
    .map((element) => element.text?.trim() || element.label.trim())
    .filter(Boolean)
    .join("\n");
  const mergedElement: SmartEditTimelineElement = {
    ...firstElement,
    durationSeconds: clampSmartEditDuration(snapTimelineSeconds(endSecond - startSecond)),
    label: mergedText.split("\n").find(Boolean) ?? firstElement.label,
    startSecond,
    text: mergedText,
    trimEndSecond: undefined,
    trimStartSecond: 0,
  };
  const nextElements = [
    ...baseTimeline.elements.filter((element) => !mergeIds.has(element.id)),
    mergedElement,
  ].sort((left, right) =>
    left.trackId === right.trackId
      ? left.startSecond - right.startSecond
      : baseTimeline.tracks.findIndex((track) => track.id === left.trackId) -
        baseTimeline.tracks.findIndex((track) => track.id === right.trackId),
  );
  return withUpdatedTimelineElements(plan, nextElements, baseTimeline.tracks);
};

export const splitSmartEditTimelineTextElementByLines = (
  plan: SmartEditPlan,
  elementId: string,
  splitToken = String(Date.now()),
): SmartEditPlan => {
  const baseTimeline = plan.timeline ?? buildSmartEditTimeline(plan);
  const lockedTrackIds = new Set(
    baseTimeline.tracks.filter((track) => track.locked).map((track) => track.id),
  );
  const targetElement = baseTimeline.elements.find((element) => element.id === elementId);
  if (
    !targetElement ||
    targetElement.kind !== "text" ||
    isDerivedTimelineElement(targetElement) ||
    lockedTrackIds.has(targetElement.trackId)
  ) {
    return plan;
  }
  const lines = (targetElement.text ?? targetElement.label)
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2 || targetElement.durationSeconds < MIN_SMART_EDIT_CLIP_SECONDS * lines.length) {
    return plan;
  }

  const sliceDuration = snapTimelineSeconds(targetElement.durationSeconds / lines.length);
  const splitElements = lines.map((line, index): SmartEditTimelineElement => {
    const isLast = index === lines.length - 1;
    const startSecond = snapTimelineSeconds(targetElement.startSecond + sliceDuration * index);
    const durationSeconds = isLast
      ? snapTimelineSeconds(
          targetElement.startSecond + targetElement.durationSeconds - startSecond,
        )
      : sliceDuration;
    return {
      ...targetElement,
      durationSeconds: Math.max(MIN_SMART_EDIT_CLIP_SECONDS, durationSeconds),
      id: index === 0 ? targetElement.id : `${targetElement.id}-line-${splitToken}-${index + 1}`,
      label: line,
      startSecond,
      text: line,
      trimEndSecond: undefined,
      trimStartSecond: 0,
    };
  });
  return withUpdatedTimelineElements(
    plan,
    baseTimeline.elements.flatMap((element) =>
      element.id === targetElement.id ? splitElements : [element],
    ),
    baseTimeline.tracks,
  );
};

export const selectSmartEditTimelineElementIdsInBox = (
  plan: SmartEditPlan,
  box: {
    endSecond: number;
    startSecond: number;
    trackIds: SmartEditTrackId[];
  },
): string[] => {
  const timeline = plan.timeline ?? buildSmartEditTimeline(plan);
  const startSecond = Math.min(box.startSecond, box.endSecond);
  const endSecond = Math.max(box.startSecond, box.endSecond);
  const trackIds = new Set(box.trackIds);
  const trackOrder = new Map(box.trackIds.map((trackId, index) => [trackId, index]));
  if (endSecond - startSecond < 0.001 || trackIds.size === 0) {
    return [];
  }
  return timeline.elements
    .filter((element) => {
      if (isDerivedTimelineElement(element) || !trackIds.has(smartEditTrackIdForElement(element))) {
        return false;
      }
      return intervalsOverlap(
        startSecond,
        endSecond,
        element.startSecond,
        element.startSecond + element.durationSeconds,
      );
    })
    .sort((left, right) => {
      const leftTrack = smartEditTrackIdForElement(left);
      const rightTrack = smartEditTrackIdForElement(right);
      return leftTrack === rightTrack
        ? left.startSecond - right.startSecond
        : (trackOrder.get(leftTrack) ?? 0) - (trackOrder.get(rightTrack) ?? 0);
    })
    .map((element) => element.id);
};

export const normalizedSmartEditPreviewRange = (
  range: TimelinePreviewRangeState,
  durationSeconds: number,
): { endSecond: number; startSecond: number } | undefined => {
  if (range.inSecond === undefined || range.outSecond === undefined) {
    return undefined;
  }
  const duration = Math.max(0, snapTimelineSeconds(durationSeconds));
  const startSecond = Math.min(
    duration,
    Math.max(0, snapTimelineSeconds(Math.min(range.inSecond, range.outSecond))),
  );
  const endSecond = Math.min(
    duration,
    Math.max(0, snapTimelineSeconds(Math.max(range.inSecond, range.outSecond))),
  );
  return endSecond - startSecond >= MIN_SMART_EDIT_CLIP_SECONDS
    ? { endSecond, startSecond }
    : undefined;
};

export const selectSmartEditTrackClipIdsInRange = (
  tracks: SmartEditTrack[],
  range: { endSecond: number; startSecond: number },
  isTrackLocked: (trackId: SmartEditTrackId) => boolean = () => false,
): string[] =>
  tracks
    .flatMap((track) => track.segments)
    .filter((trackClip) => !isTrackLocked(trackClip.trackId))
    .filter((trackClip) =>
      intervalsOverlap(
        range.startSecond,
        range.endSecond,
        trackClip.startSecond,
        snapTimelineSeconds(trackClip.startSecond + trackClip.durationSeconds),
      ),
    )
    .sort((left, right) =>
      left.trackId === right.trackId
        ? left.startSecond - right.startSecond
        : smartEditTrackOrder(left.trackId) - smartEditTrackOrder(right.trackId),
    )
    .map((trackClip) => trackClip.id);

export const selectSmartEditTimelineElementIds = (plan: SmartEditPlan): string[] => {
  const timeline = plan.timeline ?? buildSmartEditTimeline(plan);
  const trackOrder = new Map(timeline.tracks.map((track, index) => [track.id, index]));
  const lockedTrackIds = new Set(
    timeline.tracks.filter((track) => track.locked).map((track) => track.id),
  );
  return timeline.elements
    .filter((element) => !isDerivedTimelineElement(element) && !lockedTrackIds.has(element.trackId))
    .sort((left, right) =>
      left.trackId === right.trackId
        ? left.startSecond - right.startSecond
        : (trackOrder.get(left.trackId) ?? 0) - (trackOrder.get(right.trackId) ?? 0),
    )
    .map((element) => element.id);
};

export const selectSmartEditTimelineElementIdsForTrack = (
  plan: SmartEditPlan,
  trackId: SmartEditTrackId,
): string[] => {
  const timeline = plan.timeline ?? buildSmartEditTimeline(plan);
  const lockedTrackIds = new Set(
    timeline.tracks.filter((track) => track.locked).map((track) => track.id),
  );
  return timeline.elements
    .filter(
      (element) =>
        !isDerivedTimelineElement(element) &&
        !lockedTrackIds.has(element.trackId) &&
        smartEditTrackIdForElement(element) === trackId,
    )
    .sort((left, right) => left.startSecond - right.startSecond)
    .map((element) => element.id);
};

export const removeSmartEditTimelineElementsFromTimeline = (
  plan: SmartEditPlan,
  elementIds: string[],
  editMode: SmartEditTimelineEditMode = "magnetic",
): SmartEditPlan => {
  const baseTimeline = plan.timeline ?? buildSmartEditTimeline(plan);
  const removeIds = expandedPersistentTimelineElementIds(baseTimeline, elementIds);
  if (removeIds.size === 0) {
    return plan;
  }
  const removedGaps = baseTimeline.elements
    .filter((element) => removeIds.has(element.id))
    .map((element) => ({
      endSecond: snapTimelineSeconds(element.startSecond + element.durationSeconds),
      startSecond: element.startSecond,
    }));
  const retainedElements = baseTimeline.elements.filter((element) => !removeIds.has(element.id));
  const nextElements =
    editMode === "ripple"
      ? shiftTimelineElementsByRippleGaps(retainedElements, removedGaps)
      : retainedElements;
  const nextSegments =
    editMode === "ripple"
      ? shiftSegmentsByRippleGaps(plan.segments, removedGaps)
      : plan.segments;
  return withUpdatedTimelineElements(
    {
      ...plan,
      segments: nextSegments,
    },
    nextElements,
    baseTimeline.tracks,
  );
};

export const cutSmartEditTimelineElementsInRange = (
  plan: SmartEditPlan,
  range: { endSecond: number; startSecond: number },
  elementIds?: string[],
  editMode: SmartEditTimelineEditMode = "magnetic",
  token = String(Date.now()),
): SmartEditPlan => {
  const baseTimeline = plan.timeline ?? buildSmartEditTimeline(plan);
  const lockedTrackIds = new Set(
    baseTimeline.tracks.filter((track) => track.locked).map((track) => track.id),
  );
  const explicitIds = elementIds && elementIds.length > 0
    ? expandedPersistentTimelineElementIds(baseTimeline, elementIds)
    : undefined;
  const rangeStart = snapTimelineSeconds(Math.min(range.startSecond, range.endSecond));
  const rangeEnd = snapTimelineSeconds(Math.max(range.startSecond, range.endSecond));
  if (rangeEnd - rangeStart < MIN_SMART_EDIT_CLIP_SECONDS) {
    return plan;
  }
  let changed = false;
  const nextElements = baseTimeline.elements.flatMap((element) => {
    const elementEnd = snapTimelineSeconds(element.startSecond + element.durationSeconds);
    const isEditableKind = element.kind === "audio" || element.kind === "text" || element.kind === "video";
    const shouldCut =
      isEditableKind &&
      !isDerivedTimelineElement(element) &&
      !lockedTrackIds.has(element.trackId) &&
      (explicitIds ? explicitIds.has(element.id) : true) &&
      intervalsOverlap(rangeStart, rangeEnd, element.startSecond, elementEnd);
    if (!shouldCut) {
      return [element];
    }
    const cutStart = Math.max(element.startSecond, rangeStart);
    const cutEnd = Math.min(elementEnd, rangeEnd);
    if (cutEnd - cutStart < MIN_SMART_EDIT_CLIP_SECONDS) {
      return [element];
    }
    const retained: SmartEditTimelineElement[] = [];
    const leftDuration = snapTimelineSeconds(cutStart - element.startSecond);
    const rightDuration = snapTimelineSeconds(elementEnd - cutEnd);
    if (leftDuration >= MIN_SMART_EDIT_CLIP_SECONDS) {
      retained.push(...trimPersistentTimelineElementAtSecond(element, cutStart, "left"));
    }
    if (rightDuration >= MIN_SMART_EDIT_CLIP_SECONDS) {
      retained.push(
        ...trimPersistentTimelineElementAtSecond(element, cutEnd, "right").map((rightElement) => ({
          ...rightElement,
          id: `${element.id}-range-${token}`,
          label: `${element.label} (range cut)`,
        })),
      );
    }
    changed = true;
    return retained;
  });
  if (!changed) {
    return plan;
  }
  const rippleGaps: SmartEditRippleGap[] = [
    {
      endSecond: rangeEnd,
      startSecond: rangeStart,
    },
  ];
  const rippledElements =
    editMode === "ripple"
      ? shiftTimelineElementsByRippleGaps(nextElements, rippleGaps)
      : nextElements;
  const nextSegments =
    editMode === "ripple"
      ? shiftSegmentsByRippleGaps(plan.segments, rippleGaps)
      : plan.segments;
  return withUpdatedTimelineElements(
    {
      ...plan,
      segments: nextSegments,
    },
    rippledElements,
    baseTimeline.tracks,
  );
};

export const moveSmartEditTimelineElementsOnTimeline = (
  plan: SmartEditPlan,
  elementIds: string[],
  deltaSeconds: number,
  editMode: SmartEditTimelineEditMode = "magnetic",
  playheadSecond?: number,
): SmartEditPlan => {
  const snappedDelta = snapTimelineSeconds(deltaSeconds);
  if (Math.abs(snappedDelta) < 0.001) {
    return plan;
  }
  const baseTimeline = plan.timeline ?? buildSmartEditTimeline(plan);
  const moveIds = expandedPersistentTimelineElementIds(baseTimeline, elementIds);
  if (moveIds.size === 0) {
    return plan;
  }
  const movingElements = baseTimeline.elements
    .filter((element) => moveIds.has(element.id))
    .sort((left, right) => left.startSecond - right.startSecond);
  const earliestStart = Math.min(...movingElements.map((element) => element.startSecond));
  const latestEnd = Math.max(
    ...movingElements.map((element) => snapTimelineSeconds(element.startSecond + element.durationSeconds)),
  );
  const blockItems = movingElements.map((element) => ({
    durationSeconds: element.durationSeconds,
    offsetSecond: snapTimelineSeconds(element.startSecond - earliestStart),
  }));
  const intervals = baseTimeline.elements
    .filter((element) => !moveIds.has(element.id))
    .map((element) => ({
      endSecond: snapTimelineSeconds(element.startSecond + element.durationSeconds),
      id: element.id,
      startSecond: clampTimelineStart(element.startSecond),
    }))
    .sort((left, right) => left.startSecond - right.startSecond);
  const desiredStart = clampTimelineStart(snapTimelineSeconds(earliestStart + snappedDelta));
  const nextStart =
    editMode === "magnetic"
      ? resolveTimelineBlockStart(
          intervals,
          blockItems,
          desiredStart,
          [
            ...(playheadSecond === undefined ? [] : [playheadSecond]),
            ...intervals.flatMap((interval) => [interval.startSecond, interval.endSecond]),
          ],
        )
      : desiredStart;
  const actualDelta = snapTimelineSeconds(nextStart - earliestStart);
  if (Math.abs(actualDelta) < 0.001) {
    return plan;
  }
  const movedElements = baseTimeline.elements.map((element) =>
    moveIds.has(element.id)
      ? {
          ...element,
          startSecond: clampTimelineStart(snapTimelineSeconds(element.startSecond + actualDelta)),
        }
      : element,
  );
  if (editMode === "insert") {
    const movedStart = nextStart;
    const movedEnd = snapTimelineSeconds(nextStart + latestEnd - earliestStart);
    const nextElements = movedElements.map((element) => {
      if (moveIds.has(element.id)) {
        return element;
      }
      if (element.startSecond + element.durationSeconds > movedStart + 0.001) {
        return {
          ...element,
          startSecond: snapTimelineSeconds(element.startSecond + movedEnd - movedStart),
        };
      }
      return element;
    });
    return withUpdatedTimelineElements(plan, nextElements, baseTimeline.tracks);
  }
  if (editMode === "overwrite") {
    const movedStart = nextStart;
    const movedEnd = snapTimelineSeconds(nextStart + latestEnd - earliestStart);
    return withUpdatedTimelineElements(
      plan,
      movedElements.filter(
        (element) =>
          moveIds.has(element.id) ||
          !intervalsOverlap(
            movedStart,
            movedEnd,
            element.startSecond,
            element.startSecond + element.durationSeconds,
          ),
      ),
      baseTimeline.tracks,
    );
  }
  return withUpdatedTimelineElements(plan, movedElements, baseTimeline.tracks);
};
