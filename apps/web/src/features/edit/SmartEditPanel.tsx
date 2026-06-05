import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type {
  AssetMetadata,
  AssetSlice,
  MediaSettings,
  RenderTask,
  SmartEditPlan,
  SmartEditResult,
  SmartEditSegment,
  SmartEditTimeline,
  TraceEvent,
} from "@shopclip/shared";
import {
  Clock3,
  Copy,
  Film,
  Loader2,
  Music2,
  Eye,
  EyeOff,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Scissors,
  SkipBack,
  SkipForward,
  Trash2,
  Volume2,
  VolumeX,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import type { AppCopy } from "../../app/i18n";
import { Button } from "../../components/ui/Button";

interface SmartEditPanelProps {
  assets: AssetMetadata[];
  assetSlices: AssetSlice[];
  copy: AppCopy["smartEdit"];
  disabled: boolean;
  error?: string;
  instructions: string;
  isEditing: boolean;
  isRefreshing: boolean;
  mediaSettings: MediaSettings;
  onInstructionsChange: (value: string) => void;
  onMediaSettingsChange: (settings: MediaSettings) => void;
  onPlanChange: (plan: SmartEditPlan) => void;
  onRefreshSegment: () => void;
  onSelectedSegmentChange: (segmentId: string | undefined) => void;
  onStartSmartEdit: () => void;
  renderTask?: RenderTask;
  result?: SmartEditResult;
  selectedSegmentId?: string;
  targetLanguage: string;
  traceEvents: TraceEvent[];
  onTargetLanguageChange: (value: string) => void;
}

const MIN_SMART_EDIT_CLIP_SECONDS = 0.25;
const MAX_SMART_EDIT_CLIP_SECONDS = 120;
const TIMELINE_BASE_PX_PER_SECOND = 34;
const TRIM_NUDGE_SECONDS = 0.1;
const MAX_PLAN_HISTORY_LENGTH = 40;
const TIMELINE_SNAP_SECONDS = 0.1;
const TIMELINE_EDGE_SNAP_SECONDS = 0.2;

const clampSmartEditDuration = (durationSeconds: number): number =>
  Number.isFinite(durationSeconds)
    ? Math.max(MIN_SMART_EDIT_CLIP_SECONDS, Math.min(MAX_SMART_EDIT_CLIP_SECONDS, durationSeconds))
    : MIN_SMART_EDIT_CLIP_SECONDS;

const clampPlaybackRate = (playbackRate: number): number =>
  Math.max(0.25, Math.min(4, playbackRate || 1));

const clampInSegmentOffset = (offsetSeconds: number, durationSeconds: number): number =>
  Number.isFinite(offsetSeconds)
    ? Math.max(0, Math.min(Math.max(0, durationSeconds - 0.1), offsetSeconds))
    : 0;

const clampTimelineStart = (startSecond: number): number =>
  Number.isFinite(startSecond) ? Math.max(0, Math.min(600, startSecond)) : 0;

const durationFromSourceRange = (
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

const sourceLabel = (segment: SmartEditSegment, assets: AssetMetadata[]) => {
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

const previewMediaForSegment = (
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

const reorderSegments = (
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

const replaceSegment = (
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

const trimSegmentSource = (
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

const formatTimelineTime = (seconds: number): string => {
  const boundedSeconds = Math.max(0, seconds);
  const minutes = Math.floor(boundedSeconds / 60);
  const remainingSeconds = boundedSeconds - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${remainingSeconds.toFixed(1).padStart(4, "0")}`;
};

const sourceRangeLabel = (segment: SmartEditSegment): string => {
  if (segment.source.startSecond === undefined) {
    return "source full";
  }
  const end = segment.source.endSecond ?? segment.source.startSecond + segment.durationSeconds;
  return `source ${formatTimelineTime(segment.source.startSecond)}-${formatTimelineTime(end)}`;
};

const timelineRangeLabel = (startSecond: number, durationSeconds: number): string =>
  `${formatTimelineTime(startSecond)}-${formatTimelineTime(startSecond + durationSeconds)}`;

const timelineRulerStep = (durationSeconds: number): number => {
  if (durationSeconds <= 15) {
    return 1;
  }
  if (durationSeconds <= 45) {
    return 5;
  }
  if (durationSeconds <= 120) {
    return 10;
  }
  return 30;
};

const timelineRulerTicks = (durationSeconds: number): number[] => {
  const step = timelineRulerStep(durationSeconds);
  const ticks: number[] = [];
  for (let time = 0; time <= durationSeconds + 0.001; time += step) {
    ticks.push(Number(time.toFixed(1)));
  }
  if (ticks.at(-1) !== durationSeconds) {
    ticks.push(durationSeconds);
  }
  return ticks;
};

const snapTimelineSeconds = (seconds: number): number =>
  Number((Math.round(seconds / TIMELINE_SNAP_SECONDS) * TIMELINE_SNAP_SECONDS).toFixed(3));

type SmartEditTimelineInterval = {
  endSecond: number;
  id: string;
  startSecond: number;
};

const isTextEditingTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLTextAreaElement ||
  target instanceof HTMLSelectElement ||
  (target instanceof HTMLElement && target.isContentEditable);

const planDurationSeconds = (segments: SmartEditSegment[]): number =>
  Math.min(
    600,
    Math.max(
      1,
      timelineDurationForSegments(segments),
    ),
  );

const timelineDurationForSegments = (segments: SmartEditSegment[]): number => {
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

const buildSmartEditTimeline = (plan: SmartEditPlan): SmartEditTimeline => {
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
      elements.push({
        detachedAudio: true,
        durationSeconds,
        hidden: false,
        id: `${segment.id}-audio`,
        kind: "audio",
        label: `Scene ${segment.order} audio`,
        muted: segment.sourceAudioMuted ?? false,
        playbackRate: segment.playbackRate ?? 1,
        sceneId: segment.sceneId,
        segmentId: segment.id,
        sourceUrl: segment.source.sceneClipAudioUrl,
        startSecond,
        trackId: "audio-source",
        trimEndSecond: sourceEnd,
        trimStartSecond: sourceStart,
      });
    }
    elements.push({
      detachedAudio: false,
      durationSeconds,
      hidden: segment.captionHidden ?? false,
      id: `${segment.id}-text`,
      kind: "text",
      label: segment.subtitle,
      muted: false,
      playbackRate: 1,
      sceneId: segment.sceneId,
      segmentId: segment.id,
      startSecond: startSecond + (segment.captionStartOffsetSeconds ?? 0),
      text: segment.subtitle,
      trackId: "text-copy",
      trimStartSecond: 0,
    });
    if (segment.voiceover.trim()) {
      elements.push({
        detachedAudio: false,
        durationSeconds: Math.max(0.1, durationSeconds - (segment.voiceoverStartOffsetSeconds ?? 0)),
        hidden: false,
        id: `${segment.id}-voice`,
        kind: "audio",
        label: segment.voiceover,
        muted: false,
        playbackRate: 1,
        sceneId: segment.sceneId,
        segmentId: segment.id,
        startSecond: startSecond + (segment.voiceoverStartOffsetSeconds ?? 0),
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

const withRebuiltTimeline = (plan: SmartEditPlan): SmartEditPlan => ({
  ...plan,
  targetDurationSeconds: planDurationSeconds(plan.segments),
  timeline: buildSmartEditTimeline(plan),
});

const timelineStartsForSegments = (segments: SmartEditSegment[]): Map<string, number> => {
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

const timelineIntervalsForSegments = (
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

const intervalsOverlap = (
  leftStart: number,
  leftEnd: number,
  rightStart: number,
  rightEnd: number,
): boolean => leftStart < rightEnd - 0.001 && leftEnd > rightStart + 0.001;

const resolveTimelineBlockStart = (
  intervals: SmartEditTimelineInterval[],
  blockItems: Array<{ durationSeconds: number; offsetSecond: number }>,
  desiredStart: number,
  snapPoints: number[] = [],
): number => {
  if (blockItems.length === 0) {
    return clampTimelineStart(snapTimelineSeconds(desiredStart));
  }

  const nearbySnapPoint = snapPoints
    .map((point) => clampTimelineStart(snapTimelineSeconds(point)))
    .filter((point) => Math.abs(point - desiredStart) <= TIMELINE_EDGE_SNAP_SECONDS)
    .sort((left, right) => Math.abs(left - desiredStart) - Math.abs(right - desiredStart))[0];
  const snappedDesired = clampTimelineStart(snapTimelineSeconds(nearbySnapPoint ?? desiredStart));
  const rawCandidates = [
    snappedDesired,
    ...snapPoints,
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

export const moveSmartEditSegmentOnTimeline = (
  plan: SmartEditPlan,
  segmentId: string,
  deltaSeconds: number,
  playheadSecond?: number,
): SmartEditPlan => {
  const currentStarts = timelineStartsForSegments(plan.segments);
  const currentStart = currentStarts.get(segmentId);
  const targetSegment = plan.segments.find((segment) => segment.id === segmentId);
  if (currentStart === undefined || !targetSegment) {
    return plan;
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
    ...plan,
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
  const targetStart = resolveTimelineBlockStart(
    intervals,
    sourceSegments.map((segment) => ({
      durationSeconds: segment.durationSeconds,
      offsetSecond: (currentStarts.get(segment.id) ?? 0) - earliestStart,
    })),
    playheadSecond,
    [playheadSecond, ...intervals.flatMap((interval) => [interval.startSecond, interval.endSecond])],
  );
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

  return withRebuiltTimeline({
    ...plan,
    segments: [...sortedSegments, ...pastedSegments].map((segment, index) => ({
      ...segment,
      order: index + 1,
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
): SmartEditPlan => {
  if (!clipboard || clipboard.items.length === 0) {
    return plan;
  }
  const sortedSegments = [...plan.segments].sort((left, right) => left.order - right.order);
  const currentStarts = timelineStartsForSegments(plan.segments);
  const earliestStart = Math.min(...clipboard.items.map((item) => item.startSecond));
  const intervals = timelineIntervalsForSegments(sortedSegments, currentStarts);
  const targetStart = resolveTimelineBlockStart(
    intervals,
    clipboard.items.map((item) => ({
      durationSeconds: item.segment.durationSeconds,
      offsetSecond: item.startSecond - earliestStart,
    })),
    playheadSecond,
    [playheadSecond, ...intervals.flatMap((interval) => [interval.startSecond, interval.endSecond])],
  );
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

  return withRebuiltTimeline({
    ...plan,
    segments: [...sortedSegments, ...pastedSegments].map((segment, index) => ({
      ...segment,
      order: index + 1,
      timelineStartSecond: pastedStarts.has(segment.id)
        ? pastedStarts.get(segment.id)!
        : clampTimelineStart(currentStarts.get(segment.id) ?? segment.timelineStartSecond ?? 0),
    })),
  });
};

type SmartEditTrackId = "video" | "caption" | "sourceAudio" | "voice" | "bgm";

type SmartEditTrackSegment = {
  id: string;
  segmentId?: string;
  trackId: SmartEditTrackId;
  title: string;
  range: string;
  meta: string;
  durationSeconds: number;
  muted?: boolean;
  hidden?: boolean;
};

type SmartEditTrack = {
  id: SmartEditTrackId;
  segments: SmartEditTrackSegment[];
};

type TrimDragState = {
  edge: "in" | "out";
  pointerId: number;
  segmentId: string;
  startClientX: number;
};

type TimelineMoveDragState = {
  pointerId: number;
  segmentId: string;
  startClientX: number;
};

export type SmartEditClipboard = {
  items: Array<{
    segment: SmartEditSegment;
    startSecond: number;
  }>;
};

const timelineTrackSegments = (
  plan: SmartEditPlan | undefined,
  assets: AssetMetadata[],
  renderTask?: RenderTask,
): SmartEditTrack[] => {
  if (plan?.timeline?.elements?.length) {
    return plan.timeline.tracks.map((track) => ({
      id: (track.id === "audio-source"
        ? "sourceAudio"
        : track.kind === "audio"
          ? "voice"
          : track.kind === "text"
            ? "caption"
            : track.kind) as SmartEditTrackId,
      segments: plan.timeline!.elements
        .filter((element) => element.trackId === track.id)
        .map((element) => ({
          durationSeconds: element.durationSeconds,
          hidden: element.hidden,
          id: element.id,
          meta: `${element.playbackRate}x - trim ${formatTimelineTime(
            element.trimStartSecond,
          )}${element.trimEndSecond ? `-${formatTimelineTime(element.trimEndSecond)}` : ""}`,
          muted: element.muted,
          range: timelineRangeLabel(element.startSecond, element.durationSeconds),
          segmentId: element.segmentId,
          trackId: (track.id === "audio-source"
            ? "sourceAudio"
            : track.kind === "audio"
              ? "voice"
              : track.kind === "text"
                ? "caption"
                : track.kind) as SmartEditTrackId,
          title: element.label,
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
            trackId: "sourceAudio",
            title: `Scene ${clip.order} audio`,
          })),
      },
      {
        id: "caption",
        segments: timedClips.map(({ clip, duration, startSecond }) => ({
          durationSeconds: duration,
          id: `${clip.sceneId}-text`,
          meta: "storyboard text",
          range: timelineRangeLabel(startSecond, duration),
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
    trackId: "video" as const,
  }));
  const sourceAudioSegments = timedSegments
    .filter(({ segment }) => segment.source.sceneClipAudioUrl)
    .map(({ segment, startSecond }) => ({
      id: `${segment.id}-audio`,
      segmentId: segment.id,
      title: `Scene ${segment.order} audio`,
      range: timelineRangeLabel(startSecond, segment.durationSeconds),
      meta: segment.sourceAudioMuted ? "muted source audio" : "source audio material",
      durationSeconds: segment.durationSeconds,
      muted: segment.sourceAudioMuted ?? false,
      trackId: "sourceAudio" as const,
    }));
  const captionSegments = timedSegments
    .filter(({ segment }) => segment.subtitle.trim().length > 0)
    .map(({ segment, startSecond }) => ({
      id: `${segment.id}-caption`,
      segmentId: segment.id,
      title: segment.subtitle,
      range: timelineRangeLabel(
        startSecond + (segment.captionStartOffsetSeconds ?? 0),
        Math.max(0.1, segment.durationSeconds - (segment.captionStartOffsetSeconds ?? 0)),
      ),
      meta: segment.transition,
      durationSeconds: Math.max(0.1, segment.durationSeconds - (segment.captionStartOffsetSeconds ?? 0)),
      hidden: segment.captionHidden ?? false,
      trackId: "caption" as const,
    }));
  const voiceSegments = timedSegments
    .filter(({ segment }) => segment.voiceover.trim().length > 0)
    .map(({ segment, startSecond }) => ({
      id: `${segment.id}-voice`,
      segmentId: segment.id,
      title: segment.voiceover,
      range: timelineRangeLabel(
        startSecond + (segment.voiceoverStartOffsetSeconds ?? 0),
        Math.max(0.1, segment.durationSeconds - (segment.voiceoverStartOffsetSeconds ?? 0)),
      ),
      meta: plan.audio.voice,
      durationSeconds: Math.max(0.1, segment.durationSeconds - (segment.voiceoverStartOffsetSeconds ?? 0)),
      trackId: "voice" as const,
    }));
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
          trackId: "bgm",
        },
      ],
    });
  }

  return tracks;
};

export const SmartEditPanel = ({
  assets,
  assetSlices,
  copy,
  disabled,
  error,
  instructions,
  isEditing,
  isRefreshing,
  mediaSettings,
  onInstructionsChange,
  onMediaSettingsChange,
  onPlanChange,
  onRefreshSegment,
  onSelectedSegmentChange,
  onStartSmartEdit,
  renderTask,
  result,
  selectedSegmentId,
  targetLanguage,
  traceEvents,
  onTargetLanguageChange,
}: SmartEditPanelProps) => {
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const suppressTrimClickRef = useRef(false);
  const suppressTimelineMoveClickRef = useRef(false);
  const [historyPlanId, setHistoryPlanId] = useState<string | undefined>();
  const [redoStack, setRedoStack] = useState<SmartEditPlan[]>([]);
  const [selectedSegmentIds, setSelectedSegmentIds] = useState<string[]>([]);
  const [selectedTrackClipId, setSelectedTrackClipId] = useState<string | undefined>();
  const [smartEditClipboard, setSmartEditClipboard] = useState<SmartEditClipboard | undefined>();
  const [timelineMoveDrag, setTimelineMoveDrag] = useState<TimelineMoveDragState | undefined>();
  const [trimDrag, setTrimDrag] = useState<TrimDragState | undefined>();
  const [undoStack, setUndoStack] = useState<SmartEditPlan[]>([]);
  const [playheadSeconds, setPlayheadSeconds] = useState(0);
  const [timelineZoom, setTimelineZoom] = useState(1);
  const plan = result?.plan;

  useEffect(() => {
    if (plan?.id !== historyPlanId) {
      setHistoryPlanId(plan?.id);
      setRedoStack([]);
      setSelectedSegmentIds([]);
      setSelectedTrackClipId(undefined);
      setSmartEditClipboard(undefined);
      setUndoStack([]);
      setPlayheadSeconds(0);
    }
  }, [historyPlanId, plan?.id]);
  const sortedSegments = useMemo(
    () => [...(plan?.segments ?? [])].sort((left, right) => left.order - right.order),
    [plan],
  );
  const selectedSegment =
    sortedSegments.find((segment) => segment.id === selectedSegmentId) ?? sortedSegments[0];
  useEffect(() => {
    if (!selectedSegment) {
      setSelectedSegmentIds([]);
      return;
    }
    setSelectedSegmentIds((current) => {
      const validIds = new Set(sortedSegments.map((segment) => segment.id));
      const next = current.filter((id) => validIds.has(id));
      return next.length > 0 ? next : [selectedSegment.id];
    });
  }, [selectedSegment, sortedSegments]);
  const selectedPreviewMedia = previewMediaForSegment(selectedSegment, assets);
  const selectedSlices = selectedSegment?.source.assetId
    ? assetSlices.filter((slice) => slice.assetId === selectedSegment.source.assetId)
    : [];
  const enabledSegments = sortedSegments.filter((segment) => segment.enabled);
  const enabledDurationSeconds = enabledSegments.reduce(
    (total, segment) => total + segment.durationSeconds,
    0,
  );
  const timelineDurationSeconds = Math.max(1, timelineDurationForSegments(sortedSegments));
  const boundedPlayheadSeconds = Math.min(playheadSeconds, timelineDurationSeconds);
  const timelinePixelsPerSecond = TIMELINE_BASE_PX_PER_SECOND * timelineZoom;
  const timelineWidth = Math.max(720, timelineDurationSeconds * timelinePixelsPerSecond);
  const rulerTicks = useMemo(
    () => timelineRulerTicks(timelineDurationSeconds),
    [timelineDurationSeconds],
  );
  const timedTimelineSegments = useMemo(() => {
    const currentStarts = timelineStartsForSegments(sortedSegments);
    return sortedSegments.map((segment) => {
      return {
        segment,
        startSecond: currentStarts.get(segment.id) ?? 0,
      };
    });
  }, [sortedSegments]);
  const selectedSegmentIndex = selectedSegment
    ? sortedSegments.findIndex((segment) => segment.id === selectedSegment.id) + 1
    : 0;
  const selectedSourceLabel = selectedSegment ? sourceLabel(selectedSegment, assets) : "-";
  const selectedSegmentIdSet = useMemo(() => new Set(selectedSegmentIds), [selectedSegmentIds]);
  const selectedBatchSegments = sortedSegments.filter((segment) => selectedSegmentIdSet.has(segment.id));
  const audioLabel = plan?.audio.bgmTrack ?? mediaSettings.bgmTrack;
  const trackSegments = useMemo(
    () => timelineTrackSegments(plan, assets, renderTask),
    [assets, plan, renderTask],
  );
  const selectedTrackClip = useMemo(
    () =>
      trackSegments
        .flatMap((track) => track.segments)
        .find((trackClip) => trackClip.id === selectedTrackClipId),
    [selectedTrackClipId, trackSegments],
  );
  const trackLabels = {
    bgm: copy.bgmTrack,
    caption: copy.captionTrack,
    sourceAudio: copy.sourceAudioTrack,
    video: copy.videoTrack,
    voice: copy.voiceTrack,
  } as const;

  const commitPlanChange = (nextPlan: SmartEditPlan, options: { recordHistory?: boolean } = {}) => {
    if (options.recordHistory !== false && plan && nextPlan !== plan) {
      setUndoStack((current) => [...current.slice(-(MAX_PLAN_HISTORY_LENGTH - 1)), plan]);
      setRedoStack([]);
    }
    onPlanChange(nextPlan);
  };

  const undoPlanChange = () => {
    if (!plan || undoStack.length === 0) {
      return;
    }
    const previousPlan = undoStack.at(-1)!;
    setUndoStack((current) => current.slice(0, -1));
    setRedoStack((current) => [...current.slice(-(MAX_PLAN_HISTORY_LENGTH - 1)), plan]);
    onPlanChange(previousPlan);
    onSelectedSegmentChange(previousPlan.segments[0]?.id);
  };

  const redoPlanChange = () => {
    if (!plan || redoStack.length === 0) {
      return;
    }
    const nextPlan = redoStack.at(-1)!;
    setRedoStack((current) => current.slice(0, -1));
    setUndoStack((current) => [...current.slice(-(MAX_PLAN_HISTORY_LENGTH - 1)), plan]);
    onPlanChange(nextPlan);
    onSelectedSegmentChange(nextPlan.segments[0]?.id);
  };

  const selectTimelineSegment = (
    segmentId: string,
    event?: ReactMouseEvent<HTMLElement>,
  ) => {
    const isToggle = Boolean(event?.ctrlKey || event?.metaKey);
    const isRange = Boolean(event?.shiftKey);
    if (isRange && selectedSegment) {
      const anchorIndex = sortedSegments.findIndex((segment) => segment.id === selectedSegment.id);
      const targetIndex = sortedSegments.findIndex((segment) => segment.id === segmentId);
      if (anchorIndex >= 0 && targetIndex >= 0) {
        const [start, end] =
          anchorIndex < targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
        setSelectedSegmentIds(sortedSegments.slice(start, end + 1).map((segment) => segment.id));
        setSelectedTrackClipId(undefined);
        onSelectedSegmentChange(segmentId);
        return;
      }
    }
    if (isToggle) {
      setSelectedSegmentIds((current) => {
        const currentSet = new Set(current);
        if (currentSet.has(segmentId) && currentSet.size > 1) {
          currentSet.delete(segmentId);
        } else {
          currentSet.add(segmentId);
        }
        return sortedSegments
          .map((segment) => segment.id)
          .filter((id) => currentSet.has(id));
      });
      setSelectedTrackClipId(undefined);
      onSelectedSegmentChange(segmentId);
      return;
    }
    setSelectedSegmentIds([segmentId]);
    setSelectedTrackClipId(undefined);
    onSelectedSegmentChange(segmentId);
  };

  const selectTrackClip = (trackClip: SmartEditTrackSegment) => {
    setSelectedTrackClipId(trackClip.id);
    if (trackClip.segmentId) {
      setSelectedSegmentIds([trackClip.segmentId]);
      onSelectedSegmentChange(trackClip.segmentId);
    }
  };

  const selectAllSegments = () => {
    if (sortedSegments.length === 0) {
      return;
    }
    setSelectedSegmentIds(sortedSegments.map((segment) => segment.id));
    setSelectedTrackClipId(undefined);
    onSelectedSegmentChange(sortedSegments[0]?.id);
  };

  const clearMultiSelection = () => {
    if (!selectedSegment) {
      setSelectedSegmentIds([]);
      return;
    }
    setSelectedSegmentIds([selectedSegment.id]);
  };

  const removeSegments = (segmentIds: string[]) => {
    if (!plan || segmentIds.length === 0 || sortedSegments.length <= 1) {
      return;
    }
    const removeIdSet = new Set(segmentIds);
    const nextSegments = sortedSegments
      .filter((segment) => !removeIdSet.has(segment.id))
      .map((segment, index) => ({
        ...segment,
        order: index + 1,
      }));
    if (nextSegments.length === 0 || nextSegments.length === sortedSegments.length) {
      return;
    }
    commitPlanChange(withRebuiltTimeline({
      ...plan,
      segments: nextSegments,
    }));
    const nextSelectedId = nextSegments[Math.min(selectedSegmentIndex - 1, nextSegments.length - 1)]?.id;
    onSelectedSegmentChange(nextSelectedId);
    setSelectedSegmentIds(nextSelectedId ? [nextSelectedId] : []);
  };

  const updateSelectedSegments = (
    update: (segment: SmartEditSegment) => SmartEditSegment,
  ) => {
    if (!plan || selectedBatchSegments.length === 0) {
      return;
    }
    const selectedIds = new Set(selectedBatchSegments.map((segment) => segment.id));
    commitPlanChange(withRebuiltTimeline({
      ...plan,
      segments: plan.segments.map((segment) => (selectedIds.has(segment.id) ? update(segment) : segment)),
    }));
  };

  const setSourceAudioTrackMuted = (muted: boolean) => {
    if (!plan) {
      return;
    }
    commitPlanChange(withRebuiltTimeline({
      ...plan,
      segments: plan.segments.map((segment) => ({
        ...segment,
        sourceAudioMuted: muted,
      })),
    }));
  };

  const setCaptionTrackHidden = (hidden: boolean) => {
    if (!plan) {
      return;
    }
    commitPlanChange(withRebuiltTimeline({
      ...plan,
      segments: plan.segments.map((segment) => ({
        ...segment,
        captionHidden: hidden,
      })),
    }));
  };

  const updateSelectedSegment = (update: (segment: SmartEditSegment) => SmartEditSegment) => {
    if (!plan || !selectedSegment) {
      return;
    }
    commitPlanChange(replaceSegment(plan, selectedSegment.id, update));
  };

  const updateTrackClipSegment = (
    trackClip: SmartEditTrackSegment | undefined,
    update: (segment: SmartEditSegment) => SmartEditSegment,
  ) => {
    if (!plan || !trackClip?.segmentId) {
      return;
    }
    commitPlanChange(replaceSegment(plan, trackClip.segmentId, update));
  };

  const updateSelectedSegmentTimelineStart = (nextStartSecond: number) => {
    if (!plan || !selectedSegment) {
      return;
    }
    const currentStarts = new Map(
      timedTimelineSegments.map(({ segment, startSecond }) => [segment.id, startSecond]),
    );
    commitPlanChange(withRebuiltTimeline({
      ...plan,
      segments: plan.segments.map((segment) => ({
        ...segment,
        timelineStartSecond:
          segment.id === selectedSegment.id
            ? clampTimelineStart(nextStartSecond)
            : clampTimelineStart(currentStarts.get(segment.id) ?? segment.timelineStartSecond ?? 0),
      })),
    }));
  };

  const splitSelectedSegment = () => {
    if (
      !plan ||
      !selectedSegment ||
      selectedSegment.durationSeconds < MIN_SMART_EDIT_CLIP_SECONDS * 2
    ) {
      return;
    }
    const sorted = [...plan.segments].sort((left, right) => left.order - right.order);
    const index = sorted.findIndex((segment) => segment.id === selectedSegment.id);
    if (index < 0) {
      return;
    }
    const firstDuration = clampSmartEditDuration(selectedSegment.durationSeconds / 2);
    const secondDuration = clampSmartEditDuration(selectedSegment.durationSeconds - firstDuration);
    const sourceStart = selectedSegment.source.startSecond;
    const sourceEnd = selectedSegment.source.endSecond;
    const sourceMid =
      sourceStart !== undefined && sourceEnd !== undefined
        ? sourceStart + (sourceEnd - sourceStart) / 2
        : undefined;
    const firstSegment: SmartEditSegment = {
      ...selectedSegment,
      durationSeconds: firstDuration,
      source:
        sourceMid !== undefined
          ? { ...selectedSegment.source, endSecond: sourceMid }
          : selectedSegment.source,
    };
    const secondSegment: SmartEditSegment = {
      ...selectedSegment,
      durationSeconds: secondDuration,
      id: `${selectedSegment.id}-split-${Date.now()}`,
      timelineStartSecond:
        clampTimelineStart(selectedSegment.timelineStartSecond ?? 0) + firstDuration,
      source:
        sourceMid !== undefined
          ? { ...selectedSegment.source, startSecond: sourceMid, endSecond: sourceEnd }
          : selectedSegment.source,
      subtitle: `${selectedSegment.subtitle} (split)`,
    };
    sorted.splice(index, 1, firstSegment, secondSegment);
    const currentStarts = new Map(
      timedTimelineSegments.map(({ segment, startSecond }) => [segment.id, startSecond]),
    );
    const selectedStart = clampTimelineStart(currentStarts.get(selectedSegment.id) ?? 0);
    commitPlanChange(withRebuiltTimeline({
      ...plan,
      segments: sorted.map((segment, segmentIndex) => ({
        ...segment,
        order: segmentIndex + 1,
        timelineStartSecond:
          segment.id === selectedSegment.id
            ? selectedStart
            : segment.id === secondSegment.id
              ? selectedStart + firstDuration
              : clampTimelineStart(currentStarts.get(segment.id) ?? segment.timelineStartSecond ?? 0),
      })),
    }));
    onSelectedSegmentChange(secondSegment.id);
  };

  const splitSegmentAtOffset = (
    targetSegment: SmartEditSegment,
    offsetSeconds: number,
  ): string | undefined => {
    if (
      !plan ||
      offsetSeconds < MIN_SMART_EDIT_CLIP_SECONDS ||
      targetSegment.durationSeconds - offsetSeconds < MIN_SMART_EDIT_CLIP_SECONDS
    ) {
      return undefined;
    }
    const sorted = [...plan.segments].sort((left, right) => left.order - right.order);
    const index = sorted.findIndex((segment) => segment.id === targetSegment.id);
    if (index < 0) {
      return undefined;
    }
    const playbackRate = clampPlaybackRate(targetSegment.playbackRate ?? 1);
    const firstDuration = clampSmartEditDuration(offsetSeconds);
    const secondDuration = clampSmartEditDuration(targetSegment.durationSeconds - offsetSeconds);
    const sourceStart = targetSegment.source.startSecond ?? 0;
    const sourceEnd =
      targetSegment.source.endSecond ?? sourceStart + targetSegment.durationSeconds * playbackRate;
    const sourceMid = Math.min(sourceEnd, sourceStart + firstDuration * playbackRate);
    const rightId = `${targetSegment.id}-split-${Date.now()}`;
    sorted.splice(
      index,
      1,
      {
        ...targetSegment,
        durationSeconds: firstDuration,
        source: {
          ...targetSegment.source,
          endSecond: sourceMid,
          startSecond: sourceStart,
        },
      },
      {
        ...targetSegment,
        durationSeconds: secondDuration,
        id: rightId,
        timelineStartSecond: clampTimelineStart(targetSegment.timelineStartSecond ?? 0) + firstDuration,
        source: {
          ...targetSegment.source,
          endSecond: sourceEnd,
          startSecond: sourceMid,
        },
        subtitle: `${targetSegment.subtitle} (split)`,
      },
    );
    const currentStarts = new Map(
      timedTimelineSegments.map(({ segment, startSecond }) => [segment.id, startSecond]),
    );
    const targetStart = clampTimelineStart(currentStarts.get(targetSegment.id) ?? 0);
    commitPlanChange(withRebuiltTimeline({
      ...plan,
      segments: sorted.map((segment, segmentIndex) => ({
        ...segment,
        order: segmentIndex + 1,
        timelineStartSecond:
          segment.id === targetSegment.id
            ? targetStart
            : segment.id === rightId
              ? targetStart + firstDuration
              : clampTimelineStart(currentStarts.get(segment.id) ?? segment.timelineStartSecond ?? 0),
      })),
    }));
    return rightId;
  };

  const splitAtPlayhead = () => {
    if (!plan) {
      return;
    }
    const target = timedTimelineSegments.find(
      ({ segment, startSecond }) =>
        segment.enabled &&
        boundedPlayheadSeconds > startSecond &&
        boundedPlayheadSeconds < startSecond + segment.durationSeconds,
    );
    if (!target) {
      return;
    }
    const rightId = splitSegmentAtOffset(
      target.segment,
      boundedPlayheadSeconds - target.startSecond,
    );
    if (rightId) {
      onSelectedSegmentChange(rightId);
    }
  };

  const nudgeSegmentTrim = (
    segmentId: string,
    edge: "in" | "out",
    deltaSeconds: number,
  ) => {
    if (!plan) {
      return;
    }
    commitPlanChange(replaceSegment(plan, segmentId, (segment) =>
      trimSegmentSource(segment, edge, deltaSeconds),
    ));
  };

  const startTrimDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    segmentId: string,
    edge: "in" | "out",
  ) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    onSelectedSegmentChange(segmentId);
    setTrimDrag({
      edge,
      pointerId: event.pointerId,
      segmentId,
      startClientX: event.clientX,
    });
  };

  const finishTrimDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!plan || !trimDrag || trimDrag.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const targetSegment = plan.segments.find((segment) => segment.id === trimDrag.segmentId);
    if (!targetSegment) {
      setTrimDrag(undefined);
      return;
    }
    const timelineDeltaSeconds = snapTimelineSeconds(
      (event.clientX - trimDrag.startClientX) / timelinePixelsPerSecond,
    );
    const sourceDeltaSeconds =
      timelineDeltaSeconds * clampPlaybackRate(targetSegment.playbackRate ?? 1);
    setTrimDrag(undefined);
    if (Math.abs(sourceDeltaSeconds) < 0.001) {
      return;
    }
    suppressTrimClickRef.current = true;
    window.setTimeout(() => {
      suppressTrimClickRef.current = false;
    }, 0);
    commitPlanChange(replaceSegment(plan, trimDrag.segmentId, (segment) =>
      trimSegmentSource(segment, trimDrag.edge, sourceDeltaSeconds),
    ));
  };

  const startTimelineMoveDrag = (
    event: ReactPointerEvent<HTMLElement>,
    segmentId: string,
  ) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    selectTimelineSegment(segmentId, event);
    setTimelineMoveDrag({
      pointerId: event.pointerId,
      segmentId,
      startClientX: event.clientX,
    });
  };

  const finishTimelineMoveDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (!plan || !timelineMoveDrag || timelineMoveDrag.pointerId !== event.pointerId) {
      return;
    }
    const deltaSeconds = snapTimelineSeconds(
      (event.clientX - timelineMoveDrag.startClientX) / timelinePixelsPerSecond,
    );
    setTimelineMoveDrag(undefined);
    if (Math.abs(deltaSeconds) < 0.001) {
      return;
    }
    suppressTimelineMoveClickRef.current = true;
    window.setTimeout(() => {
      suppressTimelineMoveClickRef.current = false;
    }, 0);
    commitPlanChange(moveSmartEditSegmentOnTimeline(
      plan,
      timelineMoveDrag.segmentId,
      deltaSeconds,
      boundedPlayheadSeconds,
    ));
  };

  const removeSelectedSegment = () => {
    if (!selectedSegment) {
      return;
    }
    removeSegments(selectedBatchSegments.length > 1 ? selectedSegmentIds : [selectedSegment.id]);
  };

  const duplicateSelectedSegment = () => {
    if (!plan || !selectedSegment) {
      return;
    }
    const duplicateToken = `copy-${Date.now()}`;
    const nextPlan = duplicateSmartEditSegmentOnTimeline(
      plan,
      selectedSegment.id,
      duplicateToken,
    );
    commitPlanChange(nextPlan);
    const duplicateSegment = nextPlan.segments.find(
      (segment) => segment.id === `${selectedSegment.id}-${duplicateToken}`,
    );
    if (duplicateSegment) {
      onSelectedSegmentChange(duplicateSegment.id);
      setSelectedSegmentIds([duplicateSegment.id]);
    }
  };

  const copySelectedSegmentsToLocalClipboard = () => {
    if (!plan || selectedBatchSegments.length === 0) {
      return;
    }
    setSmartEditClipboard(
      copySmartEditSegmentsToClipboard(
        plan,
        selectedBatchSegments.map((segment) => segment.id),
      ),
    );
  };

  const duplicateSelectedSegments = () => {
    if (!plan || selectedBatchSegments.length === 0) {
      return;
    }
    const duplicateToken = `batch-${Date.now()}`;
    const selectedIds = selectedBatchSegments.map((segment) => segment.id);
    const nextPlan = duplicateSmartEditSegmentsOnTimeline(plan, selectedIds, duplicateToken);
    commitPlanChange(nextPlan);
    const duplicateIds = nextPlan.segments
      .map((segment) => segment.id)
      .filter((id) => selectedIds.some((sourceId) => id.startsWith(`${sourceId}-${duplicateToken}-`)));
    if (duplicateIds.length > 0) {
      setSelectedSegmentIds(duplicateIds);
      onSelectedSegmentChange(duplicateIds[0]);
    }
  };

  const pasteSelectedSegmentsAtPlayhead = () => {
    if (!plan || selectedBatchSegments.length === 0) {
      return;
    }
    const duplicateToken = `paste-${Date.now()}`;
    const selectedIds = selectedBatchSegments.map((segment) => segment.id);
    const nextPlan = pasteSmartEditSegmentsAtPlayhead(
      plan,
      selectedIds,
      boundedPlayheadSeconds,
      duplicateToken,
    );
    commitPlanChange(nextPlan);
    const pastedIds = nextPlan.segments
      .map((segment) => segment.id)
      .filter((id) => selectedIds.some((sourceId) => id.startsWith(`${sourceId}-${duplicateToken}-`)));
    if (pastedIds.length > 0) {
      setSelectedSegmentIds(pastedIds);
      onSelectedSegmentChange(pastedIds[0]);
    }
  };

  const pasteClipboardAtPlayhead = () => {
    if (!plan || !smartEditClipboard) {
      return;
    }
    const duplicateToken = `clip-${Date.now()}`;
    const nextPlan = pasteSmartEditClipboardAtPlayhead(
      plan,
      smartEditClipboard,
      boundedPlayheadSeconds,
      duplicateToken,
    );
    commitPlanChange(nextPlan);
    const sourceIds = smartEditClipboard.items.map((item) => item.segment.id);
    const pastedIds = nextPlan.segments
      .map((segment) => segment.id)
      .filter((id) => sourceIds.some((sourceId) => id.startsWith(`${sourceId}-${duplicateToken}-`)));
    if (pastedIds.length > 0) {
      setSelectedSegmentIds(pastedIds);
      onSelectedSegmentChange(pastedIds[0]);
    }
  };

  const selectByOffset = (offset: number) => {
    if (sortedSegments.length === 0) {
      return;
    }
    const currentIndex = Math.max(
      0,
      sortedSegments.findIndex((segment) => segment.id === selectedSegment?.id),
    );
    const nextIndex = Math.max(0, Math.min(sortedSegments.length - 1, currentIndex + offset));
    onSelectedSegmentChange(sortedSegments[nextIndex]?.id);
  };

  return (
    <section
      className="panel smart-edit-panel"
      aria-labelledby="smart-edit-title"
      onKeyDown={(event) => {
        const isCommandKey = event.ctrlKey || event.metaKey;
        if (isTextEditingTarget(event.target)) {
          return;
        }
        if (isCommandKey && event.key.toLowerCase() === "c") {
          event.preventDefault();
          copySelectedSegmentsToLocalClipboard();
          return;
        }
        if (isCommandKey && event.key.toLowerCase() === "v") {
          event.preventDefault();
          pasteClipboardAtPlayhead();
          return;
        }
        if (isCommandKey && event.key.toLowerCase() === "z") {
          event.preventDefault();
          if (event.shiftKey) {
            redoPlanChange();
          } else {
            undoPlanChange();
          }
          return;
        }
        if (isCommandKey && event.key.toLowerCase() === "y") {
          event.preventDefault();
          redoPlanChange();
          return;
        }
        if (isCommandKey && event.key.toLowerCase() === "a") {
          event.preventDefault();
          selectAllSegments();
          return;
        }
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          selectByOffset(-1);
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          selectByOffset(1);
        }
        if (event.key === "Delete" && selectedSegment) {
          event.preventDefault();
          removeSelectedSegment();
        }
      }}
    >
      <div className="panel-heading smart-edit-heading">
        <div>
          <p className="eyebrow">{copy.step}</p>
          <h2 id="smart-edit-title">{copy.title}</h2>
          <p>{copy.intro}</p>
        </div>
        <div className="smart-edit-actions">
          <Button
            disabled={disabled || isEditing}
            icon={isEditing ? <Loader2 className="spin" size={18} /> : <Scissors size={18} />}
            onClick={onStartSmartEdit}
            variant="primary"
          >
            {isEditing ? copy.generating : copy.start}
          </Button>
          <Button
            disabled={disabled || isRefreshing || !result || !selectedSegment}
            icon={isRefreshing ? <Loader2 className="spin" size={18} /> : <RefreshCw size={18} />}
            onClick={onRefreshSegment}
          >
            {isRefreshing ? copy.refreshing : copy.refresh}
          </Button>
        </div>
      </div>

      {error ? (
        <p className="inline-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="smart-edit-status-strip" aria-label={copy.editorSummary}>
        <div>
          <Clock3 size={16} />
          <span>{copy.enabledCut}</span>
          <strong>{enabledDurationSeconds}s</strong>
        </div>
        <div>
          <Clock3 size={16} />
          <span>{copy.timelineTotal}</span>
          <strong>{timelineDurationSeconds.toFixed(1)}s</strong>
        </div>
        <div>
          <Film size={16} />
          <span>{copy.selectedSegment}</span>
          <strong>
            {selectedBatchSegments.length > 1
              ? copy.selectedCount(selectedBatchSegments.length)
              : selectedSegmentIndex > 0
                ? `${selectedSegmentIndex} / ${sortedSegments.length}`
                : "-"}
          </strong>
        </div>
        <div>
          <Scissors size={16} />
          <span>{copy.source}</span>
          <strong>{selectedSourceLabel}</strong>
        </div>
        <div>
          <Music2 size={16} />
          <span>{copy.audio}</span>
          <strong>{audioLabel}</strong>
        </div>
      </div>

      <details className="smart-edit-settings-panel">
        <summary>
          <span>
            <strong>{copy.editSettings}</strong>
            <small>{copy.instructions}</small>
          </span>
        </summary>
        <div className="smart-edit-controls">
          <label>
            {copy.targetLanguage}
            <input
              placeholder="zh-CN / en-US"
              value={targetLanguage}
              onChange={(event) => onTargetLanguageChange(event.target.value)}
            />
          </label>
          <label>
            {copy.bgm}
            <select
              value={mediaSettings.bgmTrack}
              onChange={(event) =>
                onMediaSettingsChange({
                  ...mediaSettings,
                  bgmTrack: event.target.value as MediaSettings["bgmTrack"],
                })
              }
            >
              <option value="none">None</option>
              <option value="creator-pop">Creator pop</option>
              <option value="soft-lift">Soft lift</option>
              <option value="tech-pulse">Tech pulse</option>
            </select>
          </label>
          <label className="smart-edit-instructions">
            {copy.instructions}
            <textarea
              rows={2}
              value={instructions}
              onChange={(event) => onInstructionsChange(event.target.value)}
            />
          </label>
        </div>
      </details>

      <div className="smart-edit-grid">
        <div className="smart-edit-preview">
          <h3>{copy.previewTitle}</h3>
          {result?.previewUrl ? (
            <video
              controls
              playsInline
              preload="metadata"
              ref={previewRef}
              src={result.previewUrl}
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === " ") {
                  event.preventDefault();
                  if (previewRef.current?.paused) {
                    void previewRef.current.play();
                  } else {
                    previewRef.current?.pause();
                  }
                }
              }}
            >
              <a href={result.previewUrl}>{result.previewUrl}</a>
            </video>
          ) : (
            <div className="empty-state compact">
              <strong>{copy.emptyTitle}</strong>
              <span>{copy.noPreview}</span>
            </div>
          )}
          <small>{copy.reused}</small>
          <div className="smart-edit-live-preview" aria-label={copy.segmentPreview}>
            <h4>{copy.segmentPreview}</h4>
            {selectedSegment && selectedPreviewMedia ? (
              <div className="smart-edit-live-frame">
                {selectedPreviewMedia.kind === "video" ? (
                  <video
                    aria-label={selectedPreviewMedia.label}
                    controls
                    muted
                    playsInline
                    preload="metadata"
                    src={selectedPreviewMedia.url}
                  />
                ) : (
                  <img alt={selectedPreviewMedia.label} src={selectedPreviewMedia.url} />
                )}
                <p>{selectedSegment.subtitle}</p>
              </div>
            ) : (
              <div className="empty-state compact">
                <strong>{copy.emptyTitle}</strong>
                <span>{copy.noSegmentPreview}</span>
              </div>
            )}
          </div>
        </div>

        <div className="smart-edit-inspector">
          <h3>{copy.inspector}</h3>
          {selectedTrackClip && selectedSegment && plan ? (
            <section className="smart-edit-inspector-section track-clip-inspector">
              <h4>{copy.trackClipInspector}</h4>
              <div className="smart-edit-track-clip-summary">
                <strong>{selectedTrackClip.title}</strong>
                <span>{trackLabels[selectedTrackClip.trackId]}</span>
                <small>{selectedTrackClip.range}</small>
              </div>
              {selectedTrackClip.trackId === "sourceAudio" ? (
                <label className="toggle-row">
                  <input
                    checked={selectedSegment.sourceAudioMuted ?? false}
                    type="checkbox"
                    onChange={(event) =>
                      updateTrackClipSegment(selectedTrackClip, (segment) => ({
                        ...segment,
                        sourceAudioMuted: event.target.checked,
                      }))
                    }
                  />
                  {selectedSegment.sourceAudioMuted ? copy.unmuteSelected : copy.muteSelected}
                </label>
              ) : null}
              {selectedTrackClip.trackId === "caption" ? (
                <>
                  <label>
                    {copy.subtitle}
                    <textarea
                      rows={2}
                      value={selectedSegment.subtitle}
                      onChange={(event) =>
                        updateTrackClipSegment(selectedTrackClip, (segment) => ({
                          ...segment,
                          subtitle: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    {copy.captionStart}
                    <input
                      min={0}
                      max={Math.max(0, selectedSegment.durationSeconds - 0.1)}
                      step={0.1}
                      type="number"
                      value={selectedSegment.captionStartOffsetSeconds ?? 0}
                      onChange={(event) =>
                        updateTrackClipSegment(selectedTrackClip, (segment) => ({
                          ...segment,
                          captionStartOffsetSeconds: clampInSegmentOffset(
                            Number(event.target.value),
                            segment.durationSeconds,
                          ),
                        }))
                      }
                    />
                  </label>
                  <label className="toggle-row">
                    <input
                      checked={!selectedSegment.captionHidden}
                      type="checkbox"
                      onChange={(event) =>
                        updateTrackClipSegment(selectedTrackClip, (segment) => ({
                          ...segment,
                          captionHidden: !event.target.checked,
                        }))
                      }
                    />
                    {selectedSegment.captionHidden ? copy.showCaption : copy.hideCaption}
                  </label>
                </>
              ) : null}
              {selectedTrackClip.trackId === "voice" ? (
                <>
                  <label>
                    {copy.voiceover}
                    <textarea
                      rows={2}
                      value={selectedSegment.voiceover}
                      onChange={(event) =>
                        updateTrackClipSegment(selectedTrackClip, (segment) => ({
                          ...segment,
                          voiceover: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <label>
                    {copy.voiceoverStart}
                    <input
                      min={0}
                      max={Math.max(0, selectedSegment.durationSeconds - 0.1)}
                      step={0.1}
                      type="number"
                      value={selectedSegment.voiceoverStartOffsetSeconds ?? 0}
                      onChange={(event) =>
                        updateTrackClipSegment(selectedTrackClip, (segment) => ({
                          ...segment,
                          voiceoverStartOffsetSeconds: clampInSegmentOffset(
                            Number(event.target.value),
                            segment.durationSeconds,
                          ),
                        }))
                      }
                    />
                  </label>
                </>
              ) : null}
            </section>
          ) : null}
          {selectedSegment && plan ? (
            <>
              <div className="segment-inspector-actions">
                <Button
                  icon={<SkipBack size={16} />}
                  onClick={() =>
                    commitPlanChange(reorderSegments(plan, selectedSegment.id, "earlier"))
                  }
                >
                  {copy.moveEarlier}
                </Button>
                <Button
                  icon={<SkipForward size={16} />}
                  onClick={() =>
                    commitPlanChange(reorderSegments(plan, selectedSegment.id, "later"))
                  }
                >
                  {copy.moveLater}
                </Button>
                <Button
                  disabled={selectedSegment.durationSeconds < MIN_SMART_EDIT_CLIP_SECONDS * 2}
                  icon={<Scissors size={16} />}
                  onClick={splitSelectedSegment}
                >
                  Split
                </Button>
                <Button
                  icon={<Copy size={16} />}
                  onClick={copySelectedSegmentsToLocalClipboard}
                >
                  {copy.copySelected}
                </Button>
                <Button
                  icon={<Copy size={16} />}
                  onClick={duplicateSelectedSegment}
                >
                  {copy.duplicateSegment}
                </Button>
                <Button
                  disabled={sortedSegments.length <= 1}
                  icon={<Trash2 size={16} />}
                  onClick={removeSelectedSegment}
                >
                  Remove
                </Button>
              </div>
              <section className="smart-edit-inspector-section">
                <h4>{copy.timingAndSource}</h4>
                <label>
                  {copy.duration}
                  <input
                    max={MAX_SMART_EDIT_CLIP_SECONDS}
                    min={MIN_SMART_EDIT_CLIP_SECONDS}
                    step={0.1}
                    type="number"
                    value={selectedSegment.durationSeconds}
                    onChange={(event) =>
                      updateSelectedSegment((segment) => ({
                        ...segment,
                        durationSeconds: clampSmartEditDuration(Number(event.target.value)),
                      }))
                    }
                  />
                </label>
                <label>
                  {copy.timelineStart}
                  <input
                    max={600}
                    min={0}
                    step={0.1}
                    type="number"
                    value={selectedSegment.timelineStartSecond ?? 0}
                    onChange={(event) =>
                      updateSelectedSegmentTimelineStart(Number(event.target.value))
                    }
                  />
                </label>
                <label>
                  Speed
                  <input
                    max={4}
                    min={0.25}
                    step={0.25}
                    type="number"
                    value={selectedSegment.playbackRate ?? 1}
                    onChange={(event) => {
                      const nextPlaybackRate = clampPlaybackRate(Number(event.target.value));
                      updateSelectedSegment((segment) => ({
                        ...segment,
                        durationSeconds: durationFromSourceRange(
                          segment.source.startSecond ?? 0,
                          segment.source.endSecond,
                          nextPlaybackRate,
                          segment.durationSeconds,
                        ),
                        playbackRate: nextPlaybackRate,
                      }));
                    }}
                  />
                </label>
                <label className="smart-edit-checkbox-label">
                  <input
                    checked={selectedSegment.sourceAudioMuted ?? false}
                    type="checkbox"
                    onChange={(event) =>
                      updateSelectedSegment((segment) => ({
                        ...segment,
                        sourceAudioMuted: event.target.checked,
                      }))
                    }
                  />
                  Mute original audio
                </label>
                <div className="smart-edit-trim-grid">
                  <label>
                    Source in
                    <input
                      min={0}
                      step={0.1}
                      type="number"
                      value={selectedSegment.source.startSecond ?? 0}
                      onChange={(event) => {
                        const nextStart = Math.max(0, Number(event.target.value) || 0);
                        updateSelectedSegment((segment) => {
                          const playbackRate = clampPlaybackRate(segment.playbackRate ?? 1);
                          const currentEnd =
                            segment.source.endSecond ??
                            nextStart + segment.durationSeconds * playbackRate;
                          const nextEnd =
                            currentEnd > nextStart
                              ? currentEnd
                              : nextStart + MIN_SMART_EDIT_CLIP_SECONDS * playbackRate;
                          return {
                            ...segment,
                            durationSeconds: durationFromSourceRange(
                              nextStart,
                              nextEnd,
                              playbackRate,
                              segment.durationSeconds,
                            ),
                            source: {
                              ...segment.source,
                              endSecond: nextEnd,
                              startSecond: nextStart,
                            },
                          };
                        });
                      }}
                    />
                  </label>
                  <label>
                    Source out
                    <input
                      min={0}
                      step={0.1}
                      type="number"
                      value={
                        selectedSegment.source.endSecond ??
                        (selectedSegment.source.startSecond ?? 0) +
                          selectedSegment.durationSeconds *
                            clampPlaybackRate(selectedSegment.playbackRate ?? 1)
                      }
                      onChange={(event) => {
                        const sourceStart = selectedSegment.source.startSecond ?? 0;
                        const minEnd =
                          sourceStart +
                          MIN_SMART_EDIT_CLIP_SECONDS *
                            clampPlaybackRate(selectedSegment.playbackRate ?? 1);
                        const nextEnd = Math.max(minEnd, Number(event.target.value) || minEnd);
                        updateSelectedSegment((segment) => ({
                          ...segment,
                          durationSeconds: durationFromSourceRange(
                            segment.source.startSecond ?? 0,
                            nextEnd,
                            segment.playbackRate,
                            segment.durationSeconds,
                          ),
                          source: {
                            ...segment.source,
                            endSecond: nextEnd,
                          },
                        }));
                      }}
                    />
                  </label>
                </div>
                <label>
                  {copy.transition}
                  <select
                    value={selectedSegment.transition}
                    onChange={(event) =>
                      updateSelectedSegment((segment) => ({
                        ...segment,
                        transition: event.target.value as SmartEditSegment["transition"],
                      }))
                    }
                  >
                    <option value="cut">Cut</option>
                    <option value="fade">Fade</option>
                    <option value="crossfade">Crossfade</option>
                    <option value="wipe">Wipe</option>
                  </select>
                </label>
                <label>
                  {copy.source}
                  <select
                    value={selectedSegment.source.assetId ?? ""}
                    onChange={(event) => {
                      const asset = assets.find((candidate) => candidate.id === event.target.value);
                      if (!asset) {
                        return;
                      }
                      updateSelectedSegment((segment) => ({
                        ...segment,
                        assetTags: asset.tags,
                        source:
                          asset.type === "video"
                            ? {
                                assetId: asset.id,
                                kind: "video-slice",
                              }
                            : {
                                assetId: asset.id,
                                imageUrl: asset.url,
                                kind: "image-asset",
                              },
                      }));
                    }}
                  >
                    <option value="">{sourceLabel(selectedSegment, assets)}</option>
                    {assets.map((asset) => (
                      <option key={asset.id} value={asset.id}>
                        {asset.name}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedSlices.length > 0 ? (
                <label>
                  Slice
                  <select
                    value={selectedSegment.source.sliceId ?? ""}
                    onChange={(event) => {
                      const slice = selectedSlices.find(
                        (candidate) => candidate.id === event.target.value,
                      );
                      if (!slice) {
                        return;
                      }
                      updateSelectedSegment((segment) => ({
                        ...segment,
                        source: {
                          ...segment.source,
                          assetId: slice.assetId,
                          endSecond: slice.endSecond,
                          kind: "video-slice",
                          sliceId: slice.id,
                          startSecond: slice.startSecond,
                        },
                      }));
                    }}
                  >
                    <option value="">Auto slice</option>
                    {selectedSlices.map((slice) => (
                      <option key={slice.id} value={slice.id}>
                        {slice.startSecond}-{slice.endSecond}s
                      </option>
                    ))}
                  </select>
                </label>
                ) : null}
              </section>
              <section className="smart-edit-inspector-section">
                <h4>{copy.copyAndVoice}</h4>
                <label>
                  {copy.subtitle}
                  <textarea
                    rows={2}
                    value={selectedSegment.subtitle}
                    onChange={(event) =>
                      updateSelectedSegment((segment) => ({
                        ...segment,
                        subtitle: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  {copy.voiceover}
                  <textarea
                    rows={2}
                    value={selectedSegment.voiceover}
                    onChange={(event) =>
                      updateSelectedSegment((segment) => ({
                        ...segment,
                        voiceover: event.target.value,
                      }))
                    }
                  />
                </label>
                <div className="smart-edit-trim-grid">
                  <label>
                    {copy.captionStart}
                    <input
                      min={0}
                      max={Math.max(0, selectedSegment.durationSeconds - 0.1)}
                      step={0.1}
                      type="number"
                      value={selectedSegment.captionStartOffsetSeconds ?? 0}
                      onChange={(event) =>
                        updateSelectedSegment((segment) => ({
                          ...segment,
                          captionStartOffsetSeconds: clampInSegmentOffset(
                            Number(event.target.value),
                            segment.durationSeconds,
                          ),
                        }))
                      }
                    />
                  </label>
                  <label>
                    {copy.voiceoverStart}
                    <input
                      min={0}
                      max={Math.max(0, selectedSegment.durationSeconds - 0.1)}
                      step={0.1}
                      type="number"
                      value={selectedSegment.voiceoverStartOffsetSeconds ?? 0}
                      onChange={(event) =>
                        updateSelectedSegment((segment) => ({
                          ...segment,
                          voiceoverStartOffsetSeconds: clampInSegmentOffset(
                            Number(event.target.value),
                            segment.durationSeconds,
                          ),
                        }))
                      }
                    />
                  </label>
                </div>
              </section>
              <section className="smart-edit-inspector-section">
                <h4>{copy.segmentState}</h4>
                <label className="toggle-row">
                  <input
                    checked={selectedSegment.enabled}
                    type="checkbox"
                    onChange={(event) =>
                      updateSelectedSegment((segment) => ({
                        ...segment,
                        enabled: event.target.checked,
                      }))
                    }
                  />
                  {selectedSegment.enabled ? copy.disable : copy.enable}
                </label>
                <label className="toggle-row">
                  <input
                    checked={!selectedSegment.captionHidden}
                    type="checkbox"
                    onChange={(event) =>
                      updateSelectedSegment((segment) => ({
                        ...segment,
                        captionHidden: !event.target.checked,
                      }))
                    }
                  />
                  {selectedSegment.captionHidden ? copy.showCaption : copy.hideCaption}
                </label>
              </section>
            </>
          ) : (
            <div className="empty-state compact">
              <strong>{copy.emptyTitle}</strong>
              <span>{copy.emptyBody}</span>
            </div>
          )}
        </div>
      </div>

      <div className="smart-edit-timeline" aria-label={copy.timeline}>
        <div className="timeline-header">
          <h3>{copy.timeline}</h3>
          <span>{copy.deleteHint}</span>
        </div>
        <div className="timeline-toolbar" aria-label={copy.timelineControls}>
          <Button
            disabled={undoStack.length === 0}
            icon={<RotateCcw size={16} />}
            onClick={undoPlanChange}
          >
            {copy.undo}
          </Button>
          <Button
            disabled={redoStack.length === 0}
            icon={<RotateCw size={16} />}
            onClick={redoPlanChange}
          >
            {copy.redo}
          </Button>
          <Button
            icon={<ZoomOut size={16} />}
            onClick={() => setTimelineZoom((current) => Math.max(0.5, Number((current - 0.25).toFixed(2))))}
          >
            {copy.zoomOut}
          </Button>
          <label>
            {copy.playhead}
            <input
              max={timelineDurationSeconds}
              min={0}
              step={0.1}
              type="range"
              value={boundedPlayheadSeconds}
              onChange={(event) => setPlayheadSeconds(Number(event.target.value))}
            />
          </label>
          <strong>{formatTimelineTime(boundedPlayheadSeconds)}</strong>
          <Button
            disabled={!plan}
            icon={<Scissors size={16} />}
            onClick={splitAtPlayhead}
          >
            {copy.splitAtPlayhead}
          </Button>
          <Button
            disabled={!smartEditClipboard}
            icon={<Copy size={16} />}
            onClick={pasteClipboardAtPlayhead}
          >
            {copy.pasteClipboardAtPlayhead}
          </Button>
          <Button
            icon={<ZoomIn size={16} />}
            onClick={() => setTimelineZoom((current) => Math.min(3, Number((current + 0.25).toFixed(2))))}
          >
            {copy.zoomIn}
          </Button>
        </div>
        {selectedBatchSegments.length > 1 ? (
          <div className="timeline-batch-toolbar" aria-label={copy.batchActions}>
            <strong>{copy.selectedCount(selectedBatchSegments.length)}</strong>
            <Button onClick={() => updateSelectedSegments((segment) => ({ ...segment, enabled: true }))}>
              {copy.enableSelected}
            </Button>
            <Button onClick={() => updateSelectedSegments((segment) => ({ ...segment, enabled: false }))}>
              {copy.disableSelected}
            </Button>
            <Button onClick={() => updateSelectedSegments((segment) => ({ ...segment, sourceAudioMuted: true }))}>
              {copy.muteSelected}
            </Button>
            <Button onClick={() => updateSelectedSegments((segment) => ({ ...segment, sourceAudioMuted: false }))}>
              {copy.unmuteSelected}
            </Button>
            <Button onClick={() => updateSelectedSegments((segment) => ({ ...segment, captionHidden: true }))}>
              {copy.hideCaptionsSelected}
            </Button>
            <Button onClick={() => updateSelectedSegments((segment) => ({ ...segment, captionHidden: false }))}>
              {copy.showCaptionsSelected}
            </Button>
            <Button icon={<Copy size={16} />} onClick={copySelectedSegmentsToLocalClipboard}>
              {copy.copySelected}
            </Button>
            <Button icon={<Copy size={16} />} onClick={duplicateSelectedSegments}>
              {copy.duplicateSelected}
            </Button>
            <Button icon={<Copy size={16} />} onClick={pasteSelectedSegmentsAtPlayhead}>
              {copy.pasteSelectedAtPlayhead}
            </Button>
            <Button
              disabled={selectedBatchSegments.length >= sortedSegments.length}
              icon={<Trash2 size={16} />}
              onClick={() => removeSegments(selectedSegmentIds)}
            >
              {copy.deleteSelected}
            </Button>
            <Button onClick={clearMultiSelection}>{copy.clearSelection}</Button>
          </div>
        ) : (
          <div className="timeline-selection-hint">
            <span>{copy.multiSelectHint}</span>
            <button type="button" onClick={selectAllSegments}>
              {copy.selectAll}
            </button>
          </div>
        )}
        {sortedSegments.length > 0 ? (
          <div className="timeline-scroll">
            <div className="timeline-ruler" style={{ width: timelineWidth }}>
              {rulerTicks.map((tick) => (
                <span
                  key={tick}
                  style={{ left: Math.min(tick, timelineDurationSeconds) * timelinePixelsPerSecond }}
                >
                  {formatTimelineTime(tick)}
                </span>
              ))}
            </div>
            <div
              className="timeline-playhead"
              style={{ left: boundedPlayheadSeconds * timelinePixelsPerSecond }}
            />
            <div className="timeline-track" style={{ width: timelineWidth }}>
              {timedTimelineSegments.map(({ segment, startSecond }) => (
                <article
                  aria-label={`${copy.selectedSegment} ${segment.order}`}
                  aria-pressed={selectedSegmentIdSet.has(segment.id)}
                  className={`${selectedSegment?.id === segment.id ? "active" : ""} ${
                    selectedSegmentIdSet.has(segment.id) ? "selected" : ""
                  } ${
                    timelineMoveDrag?.segmentId === segment.id ? "moving" : ""
                  } ${
                    segment.enabled ? "" : "disabled"
                  }`.trim()}
                  key={segment.id}
                  role="button"
                  style={{
                    left: startSecond * timelinePixelsPerSecond,
                    width: Math.max(96, segment.durationSeconds * timelinePixelsPerSecond),
                  }}
                  tabIndex={0}
                  onClick={(event) => {
                    if (suppressTimelineMoveClickRef.current) {
                      return;
                    }
                    selectTimelineSegment(segment.id, event);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      selectTimelineSegment(segment.id);
                    }
                  }}
                  onPointerCancel={() => setTimelineMoveDrag(undefined)}
                  onPointerDown={(event) => startTimelineMoveDrag(event, segment.id)}
                  onPointerUp={finishTimelineMoveDrag}
                >
                  <button
                    aria-label={copy.trimIn}
                    className={`timeline-trim-handle left ${
                      trimDrag?.segmentId === segment.id && trimDrag.edge === "in" ? "dragging" : ""
                    }`.trim()}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (suppressTrimClickRef.current) {
                        return;
                      }
                      onSelectedSegmentChange(segment.id);
                      nudgeSegmentTrim(segment.id, "in", TRIM_NUDGE_SECONDS);
                    }}
                    onDragStart={(event) => event.preventDefault()}
                    onPointerCancel={() => setTrimDrag(undefined)}
                    onPointerDown={(event) => startTrimDrag(event, segment.id, "in")}
                    onPointerUp={finishTrimDrag}
                  />
                  <strong>
                    {selectedSegment?.id === segment.id ? copy.selected : segment.order}
                  </strong>
                  <span>{segment.subtitle}</span>
                  <small>
                    {timelineRangeLabel(startSecond, segment.durationSeconds)} / {segment.durationSeconds.toFixed(1)}s
                    {!segment.enabled ? ` - ${copy.disabled}` : ""}
                  </small>
                  <button
                    aria-label={copy.trimOut}
                    className={`timeline-trim-handle right ${
                      trimDrag?.segmentId === segment.id && trimDrag.edge === "out" ? "dragging" : ""
                    }`.trim()}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (suppressTrimClickRef.current) {
                        return;
                      }
                      onSelectedSegmentChange(segment.id);
                      nudgeSegmentTrim(segment.id, "out", -TRIM_NUDGE_SECONDS);
                    }}
                    onDragStart={(event) => event.preventDefault()}
                    onPointerCancel={() => setTrimDrag(undefined)}
                    onPointerDown={(event) => startTrimDrag(event, segment.id, "out")}
                    onPointerUp={finishTrimDrag}
                  />
                </article>
              ))}
            </div>
          </div>
        ) : (
          <div className="empty-state compact">
            <strong>{copy.emptyTitle}</strong>
            <span>{copy.emptyBody}</span>
          </div>
        )}
      </div>

      {trackSegments.length > 0 ? (
        <div className="smart-edit-track-stack" aria-label={copy.trackStack}>
          <div className="timeline-header">
            <h3>{copy.trackStack}</h3>
            <span>{copy.trackStackHint}</span>
          </div>
          {trackSegments.map((track) => (
            <section className="smart-edit-track-row" key={track.id} aria-label={trackLabels[track.id]}>
              <div className="smart-edit-track-label">
                <strong>{trackLabels[track.id]}</strong>
                {track.id === "sourceAudio" && track.segments.length > 0 ? (
                  <button
                    type="button"
                    onClick={() =>
                      setSourceAudioTrackMuted(!track.segments.every((segment) => segment.muted))
                    }
                  >
                    {track.segments.every((segment) => segment.muted) ? (
                      <Volume2 size={14} />
                    ) : (
                      <VolumeX size={14} />
                    )}
                    <span>
                      {track.segments.every((segment) => segment.muted)
                        ? copy.unmuteTrack
                        : copy.muteTrack}
                    </span>
                  </button>
                ) : null}
                {track.id === "caption" && track.segments.length > 0 ? (
                  <button
                    type="button"
                    onClick={() =>
                      setCaptionTrackHidden(!track.segments.every((segment) => segment.hidden))
                    }
                  >
                    {track.segments.every((segment) => segment.hidden) ? (
                      <Eye size={14} />
                    ) : (
                      <EyeOff size={14} />
                    )}
                    <span>
                      {track.segments.every((segment) => segment.hidden)
                        ? copy.showCaptionTrack
                        : copy.hideCaptionTrack}
                    </span>
                  </button>
                ) : null}
              </div>
              <div className="smart-edit-track-clips">
                {track.segments.map((segment) => (
                  <article
                    className={`smart-edit-track-clip ${
                      segment.segmentId === selectedSegment?.id ? "active" : ""
                    } ${
                      segment.segmentId && selectedSegmentIdSet.has(segment.segmentId) ? "selected" : ""
                    } ${
                      selectedTrackClipId === segment.id ? "track-selected" : ""
                    } ${segment.muted ? "muted" : ""} ${segment.hidden ? "hidden" : ""}`.trim()}
                    key={segment.id}
                    role="button"
                    style={{ flexGrow: Math.max(1, segment.durationSeconds) }}
                    tabIndex={0}
                    onClick={() => {
                      selectTrackClip(segment);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        selectTrackClip(segment);
                      }
                    }}
                  >
                    <span>{segment.range}</span>
                    <b>{segment.title}</b>
                    <small>{segment.meta}</small>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : null}

      {traceEvents.length > 0 ? (
        <div className="smart-edit-trace">
          <h3>{copy.traceTitle}</h3>
          {traceEvents.map((event) => (
            <article key={event.id}>
              <strong>{event.step}</strong>
              <span>{event.message}</span>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
};
