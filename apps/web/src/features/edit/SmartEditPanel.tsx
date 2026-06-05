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
  SmartEditVisualEffect,
  TraceEvent,
} from "@shopclip/shared";
import {
  ArrowDown,
  ArrowUp,
  Clock3,
  Copy,
  Film,
  Loader2,
  Music2,
  Plus,
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

const clipDurationWithinSegment = (
  durationSeconds: number | undefined,
  startOffsetSeconds: number | undefined,
  segmentDurationSeconds: number,
): number => {
  const offsetSeconds = clampInSegmentOffset(startOffsetSeconds ?? 0, segmentDurationSeconds);
  const maxDuration = Math.max(MIN_SMART_EDIT_CLIP_SECONDS, segmentDurationSeconds - offsetSeconds);
  return Number.isFinite(durationSeconds ?? Number.NaN)
    ? Math.max(MIN_SMART_EDIT_CLIP_SECONDS, Math.min(maxDuration, durationSeconds!))
    : maxDuration;
};

const clampClipDurationWithinSegment = (
  durationSeconds: number,
  startOffsetSeconds: number | undefined,
  segmentDurationSeconds: number,
): number => clipDurationWithinSegment(durationSeconds, startOffsetSeconds, segmentDurationSeconds);

const clampTimelineStart = (startSecond: number): number =>
  Number.isFinite(startSecond) ? Math.max(0, Math.min(600, startSecond)) : 0;

const clampTransformScale = (scale: number): number =>
  Number.isFinite(scale) ? Math.max(0.1, Math.min(4, scale)) : 1;

const clampRotationDegrees = (degrees: number): number =>
  Number.isFinite(degrees) ? Math.max(-180, Math.min(180, degrees)) : 0;

const clampPercentOffset = (percent: number): number =>
  Number.isFinite(percent) ? Math.max(-100, Math.min(100, percent)) : 0;

const clampOpacity = (opacity: number): number =>
  Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : 1;

const clampBlur = (blur: number): number =>
  Number.isFinite(blur) ? Math.max(0, Math.min(20, blur)) : 0;

const clampSharpen = (sharpen: number): number =>
  Number.isFinite(sharpen) ? Math.max(0, Math.min(2, sharpen)) : 0;

const clampEffectFade = (seconds: number): number =>
  Number.isFinite(seconds) ? Math.max(0, Math.min(5, seconds)) : 0;

const clampAudioFade = (seconds: number): number =>
  Number.isFinite(seconds) ? Number(Math.max(0, Math.min(10, seconds)).toFixed(2)) : 0;

const clampVisualKeyframeTime = (seconds: number, durationSeconds: number): number =>
  Number.isFinite(seconds)
    ? Math.max(0, Math.min(Math.max(0, durationSeconds), Number(seconds.toFixed(3))))
    : 0;

const transformForSegment = (segment: SmartEditSegment) => ({
  offsetXPercent: clampPercentOffset(segment.transform?.offsetXPercent ?? 0),
  offsetYPercent: clampPercentOffset(segment.transform?.offsetYPercent ?? 0),
  opacity: clampOpacity(segment.transform?.opacity ?? 1),
  rotateDegrees: clampRotationDegrees(segment.transform?.rotateDegrees ?? 0),
  scale: clampTransformScale(segment.transform?.scale ?? 1),
});

const effectsForSegment = (segment: SmartEditSegment) => ({
  blur: clampBlur(segment.effects?.blur ?? 0),
  fadeInSeconds: clampEffectFade(segment.effects?.fadeInSeconds ?? 0),
  fadeOutSeconds: clampEffectFade(segment.effects?.fadeOutSeconds ?? 0),
  sharpen: clampSharpen(segment.effects?.sharpen ?? 0),
});

const visualMaskForSegment = (segment: SmartEditSegment) => ({
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

const clampMaskPercentInput = (value: string, fallback: number, min: number) => {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? Math.max(min, Math.min(100, parsedValue)) : fallback;
};

type SmartEditVisualEffectType = SmartEditVisualEffect["type"];

const visualEffectOptions: Array<{ label: string; type: SmartEditVisualEffectType }> = [
  { label: "Blur", type: "blur" },
  { label: "Sharpen", type: "sharpen" },
  { label: "Brightness", type: "brightness" },
  { label: "Contrast", type: "contrast" },
  { label: "Saturation", type: "saturation" },
  { label: "Vignette", type: "vignette" },
];

const visualEffectLabel = (type: SmartEditVisualEffectType): string =>
  visualEffectOptions.find((option) => option.type === type)?.label ?? type;

const defaultVisualEffectAmount = (type: SmartEditVisualEffectType): number => {
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

const clampVisualEffectAmount = (type: SmartEditVisualEffectType, amount: number): number => {
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

const visualEffectsForSegment = (segment: SmartEditSegment): SmartEditVisualEffect[] =>
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
      amount: clampVisualEffectAmount(effect.type, effect.params?.amount ?? defaultVisualEffectAmount(effect.type)),
      radius: Math.max(0, Math.min(20, effect.params?.radius ?? 4)),
    },
    type: effect.type,
  }));

const visualKeyframesForSegment = (segment: SmartEditSegment) =>
  [...(segment.visualKeyframes ?? [])].sort((left, right) => left.timeSecond - right.timeSecond);

const visualEffectKeyframes = (effect: SmartEditVisualEffect) =>
  [...(effect.keyframes ?? [])].sort((left, right) => left.timeSecond - right.timeSecond);

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

type SmartEditTrackId = "video" | "caption" | "sourceAudio" | "voice" | "bgm";

const smartEditTrackIdForTimelineTrack = (
  track: Pick<SmartEditTimeline["tracks"][number], "id" | "kind">,
): SmartEditTrackId =>
  (track.id === "audio-source"
    ? "sourceAudio"
    : track.kind === "audio"
      ? "voice"
      : track.kind === "text"
        ? "caption"
        : track.kind) as SmartEditTrackId;

const smartEditTrackIdForElement = (
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

const timelineDurationForElements = (timeline: SmartEditTimeline | undefined): number | undefined => {
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

const isDerivedTimelineElement = (element: SmartEditTimeline["elements"][number]): boolean =>
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

const mergePersistentTimelineWithDerivedSegments = (
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

const segmentTimelineBaseStart = (
  plan: SmartEditPlan,
  segmentId: string,
  fallbackStarts = timelineStartsForSegments(plan.segments),
): number => {
  const videoElement = plan.timeline?.elements.find(
    (element) => element.segmentId === segmentId && smartEditTrackIdForElement(element) === "video",
  );
  return clampTimelineStart(videoElement?.startSecond ?? fallbackStarts.get(segmentId) ?? 0);
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

const withRebuiltTimeline = (plan: SmartEditPlan): SmartEditPlan => {
  const timeline = mergePersistentTimelineWithDerivedSegments(plan, buildSmartEditTimeline(plan));
  return {
    ...plan,
    targetDurationSeconds: timelineDurationForElements(timeline) ?? planDurationSeconds(plan.segments),
    timeline,
  };
};

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

type SmartEditTimelineElement = SmartEditTimeline["elements"][number];

const splitPersistentTimelineElement = (
  element: SmartEditTimelineElement,
  splitSecond: number,
  rightSegmentId: string,
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

export type SmartEditTimelineEditMode = "magnetic" | "insert" | "overwrite";

type SmartEditTrackSegment = {
  id: string;
  segmentId?: string;
  trackId: SmartEditTrackId;
  title: string;
  range: string;
  meta: string;
  durationSeconds: number;
  startSecond: number;
  muted?: boolean;
  hidden?: boolean;
};

type SmartEditTimelineElementPatch = Partial<
  Pick<
    SmartEditTimelineElement,
    | "audioFadeInSeconds"
    | "audioFadeOutSeconds"
    | "durationSeconds"
    | "hidden"
    | "label"
    | "muted"
    | "startSecond"
    | "text"
  >
>;

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

type TrackClipMoveDragState = {
  pointerId: number;
  startClientX: number;
  trackClip: SmartEditTrackSegment;
};

export type SmartEditClipboard = {
  items: Array<{
    elements?: SmartEditTimeline["elements"];
    segment: SmartEditSegment;
    startSecond: number;
  }>;
};

export type SmartEditCommandHistoryEntry = {
  after: SmartEditPlan;
  before: SmartEditPlan;
  label: string;
};

export class SmartEditCommandHistory {
  constructor(
    readonly undoStack: SmartEditCommandHistoryEntry[] = [],
    readonly redoStack: SmartEditCommandHistoryEntry[] = [],
  ) {}

  record(before: SmartEditPlan, after: SmartEditPlan, label: string): SmartEditCommandHistory {
    if (before === after) {
      return this;
    }
    return new SmartEditCommandHistory(
      [...this.undoStack.slice(-(MAX_PLAN_HISTORY_LENGTH - 1)), { after, before, label }],
      [],
    );
  }

  undoLabel(): string {
    const entry = this.undoStack.at(-1);
    return entry ? `Undo ${entry.label}` : "Undo";
  }

  redoLabel(): string {
    const entry = this.redoStack.at(-1);
    return entry ? `Redo ${entry.label}` : "Redo";
  }
}

export const createSmartEditCommandHistory = (): SmartEditCommandHistory =>
  new SmartEditCommandHistory();

export const applySmartEditCommandHistoryUndo = (
  history: SmartEditCommandHistory,
  currentPlan: SmartEditPlan,
): { history: SmartEditCommandHistory; plan: SmartEditPlan } | undefined => {
  const entry = history.undoStack.at(-1);
  if (!entry) {
    return undefined;
  }
  return {
    history: new SmartEditCommandHistory(
      history.undoStack.slice(0, -1),
      [...history.redoStack.slice(-(MAX_PLAN_HISTORY_LENGTH - 1)), { ...entry, after: currentPlan }],
    ),
    plan: entry.before,
  };
};

export const applySmartEditCommandHistoryRedo = (
  history: SmartEditCommandHistory,
  currentPlan: SmartEditPlan,
): { history: SmartEditCommandHistory; plan: SmartEditPlan } | undefined => {
  const entry = history.redoStack.at(-1);
  if (!entry) {
    return undefined;
  }
  return {
    history: new SmartEditCommandHistory(
      [...history.undoStack.slice(-(MAX_PLAN_HISTORY_LENGTH - 1)), { ...entry, before: currentPlan }],
      history.redoStack.slice(0, -1),
    ),
    plan: entry.after,
  };
};

const smartEditTimelineEditModes: SmartEditTimelineEditMode[] = [
  "magnetic",
  "insert",
  "overwrite",
];

const ensureTimelineTrack = (
  timeline: SmartEditTimeline,
  track: SmartEditTimeline["tracks"][number],
): SmartEditTimeline["tracks"] =>
  timeline.tracks.some((existingTrack) => existingTrack.id === track.id)
    ? timeline.tracks
    : [...timeline.tracks, track];

const withUpdatedTimelineElements = (
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

const updateSmartEditTimelineElement = (
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
            durationSeconds:
              patch.durationSeconds === undefined
                ? element.durationSeconds
                : clampSmartEditDuration(patch.durationSeconds),
            startSecond:
              patch.startSecond === undefined
                ? element.startSecond
                : clampTimelineStart(snapTimelineSeconds(patch.startSecond)),
          }
        : element,
    ),
    baseTimeline.tracks,
  );
};

export const moveSmartEditTrackClipOnTimeline = (
  plan: SmartEditPlan,
  trackClip: Pick<SmartEditTrackSegment, "id" | "segmentId" | "trackId">,
  deltaSeconds: number,
  editMode: SmartEditTimelineEditMode = "magnetic",
  playheadSecond?: number,
): SmartEditPlan => {
  if (!trackClip.segmentId) {
    if (!plan.timeline?.elements.length) {
      return plan;
    }
    const targetElement = plan.timeline.elements.find((element) => element.id === trackClip.id);
    if (!targetElement) {
      return plan;
    }
    return updateSmartEditTimelineElement(plan, targetElement.id, {
      startSecond: targetElement.startSecond + deltaSeconds,
    });
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
            };
          }
          if (trackClip.trackId === "caption") {
            return {
              ...segment,
              captionDurationSeconds: targetElement.durationSeconds,
              captionHidden: targetElement.hidden,
              captionStartOffsetSeconds: nextOffset,
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

const timelineTrackSegments = (
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
          trackId: smartEditTrackIdForTimelineTrack(track),
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
        muted: segment.sourceAudioMuted ?? false,
        trackId: "sourceAudio" as const,
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
  const [commandHistory, setCommandHistory] = useState<SmartEditCommandHistory>(() =>
    createSmartEditCommandHistory(),
  );
  const [selectedSegmentIds, setSelectedSegmentIds] = useState<string[]>([]);
  const [selectedTrackClipId, setSelectedTrackClipId] = useState<string | undefined>();
  const [smartEditClipboard, setSmartEditClipboard] = useState<SmartEditClipboard | undefined>();
  const [trackClipMoveDrag, setTrackClipMoveDrag] = useState<TrackClipMoveDragState | undefined>();
  const [timelineMoveDrag, setTimelineMoveDrag] = useState<TimelineMoveDragState | undefined>();
  const [timelineEditMode, setTimelineEditMode] = useState<SmartEditTimelineEditMode>("magnetic");
  const [trimDrag, setTrimDrag] = useState<TrimDragState | undefined>();
  const [playheadSeconds, setPlayheadSeconds] = useState(0);
  const [timelineZoom, setTimelineZoom] = useState(1);
  const plan = result?.plan;

  useEffect(() => {
    if (plan?.id !== historyPlanId) {
      setHistoryPlanId(plan?.id);
      setCommandHistory(createSmartEditCommandHistory());
      setSelectedSegmentIds([]);
      setSelectedTrackClipId(undefined);
      setSmartEditClipboard(undefined);
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
  const selectedTimelineElement = useMemo(
    () => plan?.timeline?.elements.find((element) => element.id === selectedTrackClip?.id),
    [plan, selectedTrackClip],
  );
  const trackLabels = {
    bgm: copy.bgmTrack,
    caption: copy.captionTrack,
    sourceAudio: copy.sourceAudioTrack,
    video: copy.videoTrack,
    voice: copy.voiceTrack,
  } as const;

  const commitPlanChange = (
    nextPlan: SmartEditPlan,
    options: { label?: string; recordHistory?: boolean } = {},
  ) => {
    if (options.recordHistory !== false && plan && nextPlan !== plan) {
      setCommandHistory((current) =>
        current.record(plan, nextPlan, options.label ?? "Edit timeline"),
      );
    }
    onPlanChange(nextPlan);
  };

  const addVoiceElementAtPlayhead = () => {
    if (!plan) {
      return;
    }
    const nextPlan = addSmartEditTimelineVoiceElement(plan, boundedPlayheadSeconds);
    const addedElement = nextPlan.timeline?.elements.at(-1);
    commitPlanChange(nextPlan, { label: "Add voice clip" });
    if (addedElement) {
      setSelectedTrackClipId(addedElement.id);
      setSelectedSegmentIds([]);
    }
  };

  const addTextElementAtPlayhead = () => {
    if (!plan) {
      return;
    }
    const nextPlan = addSmartEditTimelineTextElement(plan, boundedPlayheadSeconds);
    const addedElement = nextPlan.timeline?.elements.at(-1);
    commitPlanChange(nextPlan, { label: "Add text clip" });
    if (addedElement) {
      setSelectedTrackClipId(addedElement.id);
      setSelectedSegmentIds([]);
    }
  };

  const undoPlanChange = () => {
    if (!plan) {
      return;
    }
    const result = applySmartEditCommandHistoryUndo(commandHistory, plan);
    if (!result) {
      return;
    }
    setCommandHistory(result.history);
    onPlanChange(result.plan);
    onSelectedSegmentChange(result.plan.segments[0]?.id);
  };

  const redoPlanChange = () => {
    if (!plan) {
      return;
    }
    const result = applySmartEditCommandHistoryRedo(commandHistory, plan);
    if (!result) {
      return;
    }
    setCommandHistory(result.history);
    onPlanChange(result.plan);
    onSelectedSegmentChange(result.plan.segments[0]?.id);
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
    } else {
      setSelectedSegmentIds([]);
      onSelectedSegmentChange(undefined);
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
    }), { label: segmentIds.length > 1 ? "Remove selected clips" : "Remove clip" });
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
    }), { label: "Batch edit clips" });
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
    }), { label: muted ? "Mute source audio track" : "Unmute source audio track" });
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
    }), { label: hidden ? "Hide caption track" : "Show caption track" });
  };

  const updateSelectedSegment = (update: (segment: SmartEditSegment) => SmartEditSegment) => {
    if (!plan || !selectedSegment) {
      return;
    }
    commitPlanChange(replaceSegment(plan, selectedSegment.id, update), { label: "Edit segment" });
  };

  const addVisualKeyframeAtPlayhead = () => {
    if (!plan || !selectedSegment) {
      return;
    }
    const selectedStart = segmentTimelineBaseStart(plan, selectedSegment.id);
    const timeSecond = clampVisualKeyframeTime(
      boundedPlayheadSeconds - selectedStart,
      selectedSegment.durationSeconds,
    );
    const token = `${Date.now()}`;
    commitPlanChange(replaceSegment(plan, selectedSegment.id, (segment) => {
      const keyframes = visualKeyframesForSegment(segment).filter(
        (keyframe) => Math.abs(keyframe.timeSecond - timeSecond) > 0.05,
      );
      return {
        ...segment,
        visualKeyframes: [
          ...keyframes,
          {
            easing: "linear" as const,
            effects: effectsForSegment(segment),
            id: `${segment.id}-visual-kf-${token}`,
            timeSecond,
            transform: transformForSegment(segment),
          },
        ].sort((left, right) => left.timeSecond - right.timeSecond),
      };
    }), { label: "Add visual keyframe" });
  };

  const removeVisualKeyframe = (keyframeId: string) => {
    if (!plan || !selectedSegment) {
      return;
    }
    commitPlanChange(replaceSegment(plan, selectedSegment.id, (segment) => ({
      ...segment,
      visualKeyframes: visualKeyframesForSegment(segment).filter((keyframe) => keyframe.id !== keyframeId),
    })), { label: "Remove visual keyframe" });
  };

  const addVisualEffectToSelectedSegment = (type: SmartEditVisualEffectType) => {
    if (!plan || !selectedSegment) {
      return;
    }
    const token = `${Date.now()}`;
    commitPlanChange(replaceSegment(plan, selectedSegment.id, (segment) => ({
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
    })), { label: `Add ${visualEffectLabel(type)} effect` });
  };

  const updateVisualEffectOnSelectedSegment = (
    effectId: string,
    update: (effect: SmartEditVisualEffect) => SmartEditVisualEffect,
    label: string,
  ) => {
    if (!plan || !selectedSegment) {
      return;
    }
    commitPlanChange(replaceSegment(plan, selectedSegment.id, (segment) => ({
      ...segment,
      visualEffects: visualEffectsForSegment(segment).map((effect) =>
        effect.id === effectId ? update(effect) : effect,
      ),
    })), { label });
  };

  const removeVisualEffectFromSelectedSegment = (effectId: string) => {
    if (!plan || !selectedSegment) {
      return;
    }
    commitPlanChange(replaceSegment(plan, selectedSegment.id, (segment) => ({
      ...segment,
      visualEffects: visualEffectsForSegment(segment).filter((effect) => effect.id !== effectId),
    })), { label: "Remove visual effect" });
  };

  const moveVisualEffectOnSelectedSegment = (effectId: string, direction: -1 | 1) => {
    if (!plan || !selectedSegment) {
      return;
    }
    commitPlanChange(replaceSegment(plan, selectedSegment.id, (segment) => {
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
    }), { label: "Reorder visual effects" });
  };

  const addVisualEffectAmountKeyframe = (effectId: string) => {
    if (!plan || !selectedSegment) {
      return;
    }
    const selectedStart = segmentTimelineBaseStart(plan, selectedSegment.id);
    const timeSecond = clampVisualKeyframeTime(
      boundedPlayheadSeconds - selectedStart,
      selectedSegment.durationSeconds,
    );
    const token = `${Date.now()}`;
    commitPlanChange(replaceSegment(plan, selectedSegment.id, (segment) => ({
      ...segment,
      visualEffects: visualEffectsForSegment(segment).map((effect) => {
        if (effect.id !== effectId) {
          return effect;
        }
        return {
          ...effect,
          keyframes: [
            ...visualEffectKeyframes(effect).filter(
              (keyframe) => Math.abs(keyframe.timeSecond - timeSecond) > 0.05,
            ),
            {
              easing: "linear" as const,
              id: `${effect.id}-amount-kf-${token}`,
              param: "amount" as const,
              timeSecond,
              value: effect.params.amount,
            },
          ].sort((left, right) => left.timeSecond - right.timeSecond),
        };
      }),
    })), { label: "Add effect amount keyframe" });
  };

  const removeVisualEffectAmountKeyframe = (effectId: string, keyframeId: string) => {
    if (!plan || !selectedSegment) {
      return;
    }
    commitPlanChange(replaceSegment(plan, selectedSegment.id, (segment) => ({
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
    })), { label: "Remove effect amount keyframe" });
  };

  const updateTrackClipSegment = (
    trackClip: SmartEditTrackSegment | undefined,
    update: (segment: SmartEditSegment) => SmartEditSegment,
  ) => {
    if (!plan || !trackClip?.segmentId) {
      return;
    }
    commitPlanChange(replaceSegment(plan, trackClip.segmentId, update), {
      label: `Edit ${trackClip.trackId} material`,
    });
  };

  const updateSelectedTimelineElement = (patch: SmartEditTimelineElementPatch) => {
    if (!plan || !selectedTimelineElement) {
      return;
    }
    commitPlanChange(updateSmartEditTimelineElement(plan, selectedTimelineElement.id, patch), {
      label: `Edit ${selectedTrackClip?.trackId ?? "timeline"} material`,
    });
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
    }), { label: "Move clip" });
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
    }), { label: "Split clip" });
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
    const splitToken = String(Date.now());
    const rightId = `${targetSegment.id}-split-${splitToken}`;
    const splitPlan = splitSmartEditSegmentOnTimeline(
      plan,
      targetSegment.id,
      offsetSeconds,
      splitToken,
    );
    if (!splitPlan) {
      return undefined;
    }
    commitPlanChange(splitPlan, { label: "Split clip at playhead" });
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
    ), { label: edge === "in" ? "Trim clip in" : "Trim clip out" });
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
    ), { label: trimDrag.edge === "in" ? "Trim clip in" : "Trim clip out" });
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
    commitPlanChange(moveSmartEditSegmentOnTimelineWithMode(
      plan,
      timelineMoveDrag.segmentId,
      deltaSeconds,
      timelineEditMode,
      boundedPlayheadSeconds,
    ), { label: `Move clip (${timelineEditMode})` });
  };

  const startTrackClipMoveDrag = (
    event: ReactPointerEvent<HTMLElement>,
    trackClip: SmartEditTrackSegment,
  ) => {
    if (trackClip.trackId === "bgm") {
      selectTrackClip(trackClip);
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    selectTrackClip(trackClip);
    setTrackClipMoveDrag({
      pointerId: event.pointerId,
      startClientX: event.clientX,
      trackClip,
    });
  };

  const finishTrackClipMoveDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (!plan || !trackClipMoveDrag || trackClipMoveDrag.pointerId !== event.pointerId) {
      return;
    }
    const deltaSeconds = snapTimelineSeconds(
      (event.clientX - trackClipMoveDrag.startClientX) / timelinePixelsPerSecond,
    );
    setTrackClipMoveDrag(undefined);
    if (Math.abs(deltaSeconds) < 0.001) {
      return;
    }
    suppressTimelineMoveClickRef.current = true;
    window.setTimeout(() => {
      suppressTimelineMoveClickRef.current = false;
    }, 0);
    const nextPlan = moveSmartEditTrackClipOnTimeline(
      plan,
      trackClipMoveDrag.trackClip,
      deltaSeconds,
      timelineEditMode,
      boundedPlayheadSeconds,
    );
    commitPlanChange(nextPlan, { label: `Move ${trackClipMoveDrag.trackClip.trackId} material` });
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
    commitPlanChange(nextPlan, { label: "Duplicate clip" });
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
    commitPlanChange(nextPlan, { label: "Duplicate selected clips" });
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
      timelineEditMode,
    );
    commitPlanChange(nextPlan, { label: `Paste selected clips (${timelineEditMode})` });
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
      timelineEditMode,
    );
    commitPlanChange(nextPlan, { label: `Paste copied clips (${timelineEditMode})` });
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
                <>
                  <label>
                    Audio start
                    <input
                      min={0}
                      max={Math.max(0, selectedSegment.durationSeconds - 0.1)}
                      step={0.1}
                      type="number"
                      value={selectedSegment.sourceAudioStartOffsetSeconds ?? 0}
                      onChange={(event) =>
                        updateTrackClipSegment(selectedTrackClip, (segment) => ({
                          ...segment,
                          sourceAudioStartOffsetSeconds: clampInSegmentOffset(
                            Number(event.target.value),
                            segment.durationSeconds,
                          ),
                        }))
                      }
                    />
                  </label>
                  <label>
                    Audio duration
                    <input
                      min={MIN_SMART_EDIT_CLIP_SECONDS}
                      max={Math.max(
                        MIN_SMART_EDIT_CLIP_SECONDS,
                        selectedSegment.durationSeconds - (selectedSegment.sourceAudioStartOffsetSeconds ?? 0),
                      )}
                      step={0.1}
                      type="number"
                      value={clipDurationWithinSegment(
                        selectedSegment.sourceAudioDurationSeconds,
                        selectedSegment.sourceAudioStartOffsetSeconds,
                        selectedSegment.durationSeconds,
                      )}
                      onChange={(event) =>
                        updateTrackClipSegment(selectedTrackClip, (segment) => ({
                          ...segment,
                          sourceAudioDurationSeconds: clampClipDurationWithinSegment(
                            Number(event.target.value),
                            segment.sourceAudioStartOffsetSeconds,
                            segment.durationSeconds,
                          ),
                        }))
                      }
                    />
                  </label>
                  <div className="smart-edit-trim-grid">
                    <label>
                      Audio fade in
                      <input
                        min={0}
                        max={10}
                        step={0.1}
                        type="number"
                        value={selectedSegment.sourceAudioFadeInSeconds ?? 0}
                        onChange={(event) =>
                          updateTrackClipSegment(selectedTrackClip, (segment) => ({
                            ...segment,
                            sourceAudioFadeInSeconds: clampAudioFade(Number(event.target.value)),
                          }))
                        }
                      />
                    </label>
                    <label>
                      Audio fade out
                      <input
                        min={0}
                        max={10}
                        step={0.1}
                        type="number"
                        value={selectedSegment.sourceAudioFadeOutSeconds ?? 0}
                        onChange={(event) =>
                          updateTrackClipSegment(selectedTrackClip, (segment) => ({
                            ...segment,
                            sourceAudioFadeOutSeconds: clampAudioFade(Number(event.target.value)),
                          }))
                        }
                      />
                    </label>
                  </div>
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
                </>
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
                  <label>
                    Caption duration
                    <input
                      min={MIN_SMART_EDIT_CLIP_SECONDS}
                      max={Math.max(
                        MIN_SMART_EDIT_CLIP_SECONDS,
                        selectedSegment.durationSeconds - (selectedSegment.captionStartOffsetSeconds ?? 0),
                      )}
                      step={0.1}
                      type="number"
                      value={clipDurationWithinSegment(
                        selectedSegment.captionDurationSeconds,
                        selectedSegment.captionStartOffsetSeconds,
                        selectedSegment.durationSeconds,
                      )}
                      onChange={(event) =>
                        updateTrackClipSegment(selectedTrackClip, (segment) => ({
                          ...segment,
                          captionDurationSeconds: clampClipDurationWithinSegment(
                            Number(event.target.value),
                            segment.captionStartOffsetSeconds,
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
                  <label>
                    Voice duration
                    <input
                      min={MIN_SMART_EDIT_CLIP_SECONDS}
                      max={Math.max(
                        MIN_SMART_EDIT_CLIP_SECONDS,
                        selectedSegment.durationSeconds - (selectedSegment.voiceoverStartOffsetSeconds ?? 0),
                      )}
                      step={0.1}
                      type="number"
                      value={clipDurationWithinSegment(
                        selectedSegment.voiceoverDurationSeconds,
                        selectedSegment.voiceoverStartOffsetSeconds,
                        selectedSegment.durationSeconds,
                      )}
                      onChange={(event) =>
                        updateTrackClipSegment(selectedTrackClip, (segment) => ({
                          ...segment,
                          voiceoverDurationSeconds: clampClipDurationWithinSegment(
                            Number(event.target.value),
                            segment.voiceoverStartOffsetSeconds,
                            segment.durationSeconds,
                          ),
                        }))
                      }
                    />
                  </label>
                  <div className="smart-edit-trim-grid">
                    <label>
                      Voice fade in
                      <input
                        min={0}
                        max={10}
                        step={0.1}
                        type="number"
                        value={selectedSegment.voiceoverFadeInSeconds ?? 0}
                        onChange={(event) =>
                          updateTrackClipSegment(selectedTrackClip, (segment) => ({
                            ...segment,
                            voiceoverFadeInSeconds: clampAudioFade(Number(event.target.value)),
                          }))
                        }
                      />
                    </label>
                    <label>
                      Voice fade out
                      <input
                        min={0}
                        max={10}
                        step={0.1}
                        type="number"
                        value={selectedSegment.voiceoverFadeOutSeconds ?? 0}
                        onChange={(event) =>
                          updateTrackClipSegment(selectedTrackClip, (segment) => ({
                            ...segment,
                            voiceoverFadeOutSeconds: clampAudioFade(Number(event.target.value)),
                          }))
                        }
                      />
                    </label>
                  </div>
                </>
              ) : null}
            </section>
          ) : null}
          {selectedTrackClip && !selectedTrackClip.segmentId && selectedTimelineElement && plan ? (
            <section className="smart-edit-inspector-section track-clip-inspector">
              <h4>{copy.trackClipInspector}</h4>
              <div className="smart-edit-track-clip-summary">
                <strong>{selectedTimelineElement.label}</strong>
                <span>{trackLabels[selectedTrackClip.trackId]}</span>
                <small>{selectedTrackClip.range}</small>
              </div>
              <label>
                {selectedTrackClip.trackId === "voice" ? copy.voiceover : copy.subtitle}
                <textarea
                  rows={3}
                  value={selectedTimelineElement.text ?? selectedTimelineElement.label}
                  onChange={(event) =>
                    updateSelectedTimelineElement({
                      label: event.target.value || selectedTimelineElement.label,
                      text: event.target.value,
                    })
                  }
                />
              </label>
              <label>
                {copy.timelineElementStart}
                <input
                  min={0}
                  step={0.1}
                  type="number"
                  value={selectedTimelineElement.startSecond}
                  onChange={(event) =>
                    updateSelectedTimelineElement({ startSecond: Number(event.target.value) })
                  }
                />
              </label>
              <label>
                {copy.timelineElementDuration}
                <input
                  min={MIN_SMART_EDIT_CLIP_SECONDS}
                  step={0.1}
                  type="number"
                  value={selectedTimelineElement.durationSeconds}
                  onChange={(event) =>
                    updateSelectedTimelineElement({ durationSeconds: Number(event.target.value) })
                  }
                />
              </label>
              {selectedTimelineElement.kind === "audio" ? (
                <>
                  <div className="smart-edit-trim-grid">
                    <label>
                      Audio fade in
                      <input
                        min={0}
                        max={10}
                        step={0.1}
                        type="number"
                        value={selectedTimelineElement.audioFadeInSeconds ?? 0}
                        onChange={(event) =>
                          updateSelectedTimelineElement({
                            audioFadeInSeconds: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      Audio fade out
                      <input
                        min={0}
                        max={10}
                        step={0.1}
                        type="number"
                        value={selectedTimelineElement.audioFadeOutSeconds ?? 0}
                        onChange={(event) =>
                          updateSelectedTimelineElement({
                            audioFadeOutSeconds: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                  </div>
                  <label className="toggle-row">
                    <input
                      checked={selectedTimelineElement.muted ?? false}
                      type="checkbox"
                      onChange={(event) =>
                        updateSelectedTimelineElement({ muted: event.target.checked })
                      }
                    />
                    {selectedTimelineElement.muted ? copy.unmuteSelected : copy.muteSelected}
                  </label>
                </>
              ) : null}
              <label className="toggle-row">
                <input
                  checked={selectedTimelineElement.hidden ?? false}
                  type="checkbox"
                  onChange={(event) =>
                    updateSelectedTimelineElement({ hidden: event.target.checked })
                  }
                />
                {selectedTimelineElement.hidden ? copy.showTimelineElement : copy.hideTimelineElement}
              </label>
            </section>
          ) : null}
          {selectedSegment && plan ? (
            <>
              <div className="segment-inspector-actions">
                <Button
                  icon={<SkipBack size={16} />}
                  onClick={() =>
                    commitPlanChange(reorderSegments(plan, selectedSegment.id, "earlier"), {
                      label: "Move clip earlier",
                    })
                  }
                >
                  {copy.moveEarlier}
                </Button>
                <Button
                  icon={<SkipForward size={16} />}
                  onClick={() =>
                    commitPlanChange(reorderSegments(plan, selectedSegment.id, "later"), {
                      label: "Move clip later",
                    })
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
                <h4>Visual transform</h4>
                <div className="smart-edit-trim-grid">
                  <label>
                    Scale
                    <input
                      max={4}
                      min={0.1}
                      step={0.05}
                      type="number"
                      value={selectedSegment.transform?.scale ?? 1}
                      onChange={(event) =>
                        updateSelectedSegment((segment) => ({
                          ...segment,
                          transform: {
                            ...transformForSegment(segment),
                            scale: clampTransformScale(Number(event.target.value)),
                          },
                        }))
                      }
                    />
                  </label>
                  <label>
                    Rotation
                    <input
                      max={180}
                      min={-180}
                      step={1}
                      type="number"
                      value={selectedSegment.transform?.rotateDegrees ?? 0}
                      onChange={(event) =>
                        updateSelectedSegment((segment) => ({
                          ...segment,
                          transform: {
                            ...transformForSegment(segment),
                            rotateDegrees: clampRotationDegrees(Number(event.target.value)),
                          },
                        }))
                      }
                    />
                  </label>
                  <label>
                    Offset X
                    <input
                      max={100}
                      min={-100}
                      step={1}
                      type="number"
                      value={selectedSegment.transform?.offsetXPercent ?? 0}
                      onChange={(event) =>
                        updateSelectedSegment((segment) => ({
                          ...segment,
                          transform: {
                            ...transformForSegment(segment),
                            offsetXPercent: clampPercentOffset(Number(event.target.value)),
                          },
                        }))
                      }
                    />
                  </label>
                  <label>
                    Offset Y
                    <input
                      max={100}
                      min={-100}
                      step={1}
                      type="number"
                      value={selectedSegment.transform?.offsetYPercent ?? 0}
                      onChange={(event) =>
                        updateSelectedSegment((segment) => ({
                          ...segment,
                          transform: {
                            ...transformForSegment(segment),
                            offsetYPercent: clampPercentOffset(Number(event.target.value)),
                          },
                        }))
                      }
                    />
                  </label>
                </div>
                <label>
                  Opacity
                  <input
                    max={1}
                    min={0}
                    step={0.05}
                    type="number"
                    value={selectedSegment.transform?.opacity ?? 1}
                    onChange={(event) =>
                      updateSelectedSegment((segment) => ({
                        ...segment,
                        transform: {
                          ...transformForSegment(segment),
                          opacity: clampOpacity(Number(event.target.value)),
                        },
                      }))
                    }
                  />
                </label>
              </section>
              <section className="smart-edit-inspector-section">
                <h4>Visual effects</h4>
                <div className="smart-edit-trim-grid">
                  <label>
                    Blur
                    <input
                      max={20}
                      min={0}
                      step={0.1}
                      type="number"
                      value={selectedSegment.effects?.blur ?? 0}
                      onChange={(event) =>
                        updateSelectedSegment((segment) => ({
                          ...segment,
                          effects: {
                            ...effectsForSegment(segment),
                            blur: clampBlur(Number(event.target.value)),
                          },
                        }))
                      }
                    />
                  </label>
                  <label>
                    Sharpen
                    <input
                      max={2}
                      min={0}
                      step={0.1}
                      type="number"
                      value={selectedSegment.effects?.sharpen ?? 0}
                      onChange={(event) =>
                        updateSelectedSegment((segment) => ({
                          ...segment,
                          effects: {
                            ...effectsForSegment(segment),
                            sharpen: clampSharpen(Number(event.target.value)),
                          },
                        }))
                      }
                    />
                  </label>
                  <label>
                    Fade in
                    <input
                      max={5}
                      min={0}
                      step={0.1}
                      type="number"
                      value={selectedSegment.effects?.fadeInSeconds ?? 0}
                      onChange={(event) =>
                        updateSelectedSegment((segment) => ({
                          ...segment,
                          effects: {
                            ...effectsForSegment(segment),
                            fadeInSeconds: clampEffectFade(Number(event.target.value)),
                          },
                        }))
                      }
                    />
                  </label>
                  <label>
                    Fade out
                    <input
                      max={5}
                      min={0}
                      step={0.1}
                      type="number"
                      value={selectedSegment.effects?.fadeOutSeconds ?? 0}
                      onChange={(event) =>
                        updateSelectedSegment((segment) => ({
                          ...segment,
                          effects: {
                            ...effectsForSegment(segment),
                            fadeOutSeconds: clampEffectFade(Number(event.target.value)),
                          },
                        }))
                      }
                    />
                  </label>
                </div>
                <div className="smart-edit-section-header">
                  <h5>Effect stack</h5>
                  <label>
                    Add effect
                    <select
                      value=""
                      onChange={(event) => {
                        if (!event.target.value) {
                          return;
                        }
                        addVisualEffectToSelectedSegment(event.target.value as SmartEditVisualEffectType);
                        event.currentTarget.value = "";
                      }}
                    >
                      <option value="">Choose</option>
                      {visualEffectOptions.map((option) => (
                        <option key={option.type} value={option.type}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="smart-edit-keyframe-list">
                  {visualEffectsForSegment(selectedSegment).length > 0 ? (
                    visualEffectsForSegment(selectedSegment).map((effect, index, effects) => (
                      <div className="smart-edit-keyframe-row" key={effect.id}>
                        <div>
                          <strong>{visualEffectLabel(effect.type)}</strong>
                          <span>
                            {effect.enabled ? "Enabled" : "Disabled"} · Amount{" "}
                            {effect.params.amount.toFixed(2)}
                          </span>
                        </div>
                        <label className="smart-edit-checkbox-label">
                          <input
                            checked={effect.enabled}
                            type="checkbox"
                            onChange={(event) =>
                              updateVisualEffectOnSelectedSegment(
                                effect.id,
                                (currentEffect) => ({
                                  ...currentEffect,
                                  enabled: event.target.checked,
                                }),
                                event.target.checked ? "Enable visual effect" : "Disable visual effect",
                              )
                            }
                          />
                          On
                        </label>
                        <label>
                          Amount
                          <input
                            max={effect.type === "blur" ? 20 : effect.type === "sharpen" ? 2 : effect.type === "brightness" ? 1 : effect.type === "vignette" ? 1 : 3}
                            min={effect.type === "brightness" ? -1 : 0}
                            step={0.05}
                            type="number"
                            value={effect.params.amount}
                            onChange={(event) =>
                              updateVisualEffectOnSelectedSegment(
                                effect.id,
                                (currentEffect) => ({
                                  ...currentEffect,
                                  params: {
                                    ...currentEffect.params,
                                    amount: clampVisualEffectAmount(
                                      currentEffect.type,
                                      Number(event.target.value),
                                    ),
                                  },
                                }),
                                "Update visual effect params",
                              )
                            }
                          />
                        </label>
                        <div className="smart-edit-effect-keyframes">
                          <div className="smart-edit-section-header">
                            <h6>Amount keyframes</h6>
                            <Button onClick={() => addVisualEffectAmountKeyframe(effect.id)}>
                              Add amount keyframe
                            </Button>
                          </div>
                          {visualEffectKeyframes(effect).length > 0 ? (
                            <div className="smart-edit-mini-keyframe-list">
                              {visualEffectKeyframes(effect).map((keyframe) => (
                                <article className="smart-edit-mini-keyframe-row" key={keyframe.id}>
                                  <span>{keyframe.timeSecond.toFixed(1)}s</span>
                                  <strong>{keyframe.value.toFixed(2)}</strong>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      removeVisualEffectAmountKeyframe(effect.id, keyframe.id)
                                    }
                                  >
                                    Delete
                                  </button>
                                </article>
                              ))}
                            </div>
                          ) : (
                            <small>No amount keyframes.</small>
                          )}
                        </div>
                        <div className="smart-edit-row-actions">
                          <Button
                            disabled={index === 0}
                            icon={<ArrowUp size={14} />}
                            onClick={() => moveVisualEffectOnSelectedSegment(effect.id, -1)}
                          >
                            Up
                          </Button>
                          <Button
                            disabled={index === effects.length - 1}
                            icon={<ArrowDown size={14} />}
                            onClick={() => moveVisualEffectOnSelectedSegment(effect.id, 1)}
                          >
                            Down
                          </Button>
                          <Button
                            icon={<Trash2 size={14} />}
                            onClick={() => removeVisualEffectFromSelectedSegment(effect.id)}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="empty-state">No stacked effects.</p>
                  )}
                </div>
              </section>
              <section className="smart-edit-inspector-section">
                <h4>Visual mask</h4>
                <div className="smart-edit-trim-grid">
                  <label>
                    Mask type
                    <select
                      value={selectedSegment.visualMask?.type ?? "none"}
                      onChange={(event) =>
                        updateSelectedSegment((segment) => ({
                          ...segment,
                          visualMask:
                            event.target.value === "none"
                              ? undefined
                              : {
                                  ...visualMaskForSegment(segment),
                                  type: event.target.value as "rectangle" | "ellipse",
                                },
                        }))
                      }
                    >
                      <option value="none">None</option>
                      <option value="rectangle">Rectangle</option>
                      <option value="ellipse">Ellipse</option>
                    </select>
                  </label>
                  <label className="smart-edit-checkbox-label">
                    <input
                      checked={selectedSegment.visualMask?.inverted ?? false}
                      type="checkbox"
                      onChange={(event) =>
                        updateSelectedSegment((segment) => ({
                          ...segment,
                          visualMask: {
                            ...visualMaskForSegment(segment),
                            inverted: event.target.checked,
                          },
                        }))
                      }
                    />
                    Invert mask
                  </label>
                  <label>
                    Mask X
                    <input
                      max={100}
                      min={0}
                      step={1}
                      type="number"
                      value={selectedSegment.visualMask?.xPercent ?? 50}
                      onChange={(event) =>
                        updateSelectedSegment((segment) => ({
                          ...segment,
                          visualMask: {
                            ...visualMaskForSegment(segment),
                            xPercent: clampMaskPercentInput(event.target.value, 50, 0),
                          },
                        }))
                      }
                    />
                  </label>
                  <label>
                    Mask Y
                    <input
                      max={100}
                      min={0}
                      step={1}
                      type="number"
                      value={selectedSegment.visualMask?.yPercent ?? 50}
                      onChange={(event) =>
                        updateSelectedSegment((segment) => ({
                          ...segment,
                          visualMask: {
                            ...visualMaskForSegment(segment),
                            yPercent: clampMaskPercentInput(event.target.value, 50, 0),
                          },
                        }))
                      }
                    />
                  </label>
                  <label>
                    Mask W
                    <input
                      max={100}
                      min={1}
                      step={1}
                      type="number"
                      value={selectedSegment.visualMask?.widthPercent ?? 80}
                      onChange={(event) =>
                        updateSelectedSegment((segment) => ({
                          ...segment,
                          visualMask: {
                            ...visualMaskForSegment(segment),
                            widthPercent: clampMaskPercentInput(event.target.value, 80, 1),
                          },
                        }))
                      }
                    />
                  </label>
                  <label>
                    Mask H
                    <input
                      max={100}
                      min={1}
                      step={1}
                      type="number"
                      value={selectedSegment.visualMask?.heightPercent ?? 80}
                      onChange={(event) =>
                        updateSelectedSegment((segment) => ({
                          ...segment,
                          visualMask: {
                            ...visualMaskForSegment(segment),
                            heightPercent: clampMaskPercentInput(event.target.value, 80, 1),
                          },
                        }))
                      }
                    />
                  </label>
                </div>
              </section>
              <section className="smart-edit-inspector-section">
                <div className="smart-edit-section-header">
                  <h4>Visual keyframes</h4>
                  <Button onClick={addVisualKeyframeAtPlayhead}>Add keyframe</Button>
                </div>
                <div className="smart-edit-keyframe-list">
                  {visualKeyframesForSegment(selectedSegment).length > 0 ? (
                    visualKeyframesForSegment(selectedSegment).map((keyframe) => (
                      <article className="smart-edit-keyframe-row" key={keyframe.id}>
                        <div>
                          <strong>{keyframe.timeSecond.toFixed(1)}s</strong>
                          <span>
                            Scale {keyframe.transform.scale.toFixed(2)} · Opacity{" "}
                            {keyframe.transform.opacity.toFixed(2)}
                          </span>
                          <small>
                            X {keyframe.transform.offsetXPercent.toFixed(0)} / Y{" "}
                            {keyframe.transform.offsetYPercent.toFixed(0)}
                          </small>
                        </div>
                        <button type="button" onClick={() => removeVisualKeyframe(keyframe.id)}>
                          Delete
                        </button>
                      </article>
                    ))
                  ) : (
                    <p className="empty-state">No visual keyframes.</p>
                  )}
                </div>
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
            disabled={commandHistory.undoStack.length === 0}
            icon={<RotateCcw size={16} />}
            onClick={undoPlanChange}
          >
            {commandHistory.undoLabel()}
          </Button>
          <Button
            disabled={commandHistory.redoStack.length === 0}
            icon={<RotateCw size={16} />}
            onClick={redoPlanChange}
          >
            {commandHistory.redoLabel()}
          </Button>
          <div className="timeline-edit-mode-toggle" aria-label={copy.editMode}>
            {smartEditTimelineEditModes.map((mode) => (
              <button
                aria-pressed={timelineEditMode === mode}
                className={timelineEditMode === mode ? "active" : ""}
                key={mode}
                type="button"
                onClick={() => setTimelineEditMode(mode)}
              >
                {copy.editModes[mode]}
              </button>
            ))}
          </div>
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
            disabled={!plan}
            icon={<Plus size={16} />}
            onClick={addVoiceElementAtPlayhead}
          >
            {copy.addVoiceClip}
          </Button>
          <Button
            disabled={!plan}
            icon={<Plus size={16} />}
            onClick={addTextElementAtPlayhead}
          >
            {copy.addTextClip}
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
                <div className="smart-edit-track-lane" style={{ width: timelineWidth }}>
                  {track.segments.map((segment) => (
                    <article
                      className={`smart-edit-track-clip ${
                        segment.segmentId === selectedSegment?.id ? "active" : ""
                      } ${
                        segment.segmentId && selectedSegmentIdSet.has(segment.segmentId) ? "selected" : ""
                      } ${
                        selectedTrackClipId === segment.id ? "track-selected" : ""
                      } ${
                        trackClipMoveDrag?.trackClip.id === segment.id ? "moving" : ""
                      } ${segment.muted ? "muted" : ""} ${segment.hidden ? "hidden" : ""}`.trim()}
                      key={segment.id}
                      role="button"
                      style={{
                        left: segment.startSecond * timelinePixelsPerSecond,
                        width: Math.max(116, segment.durationSeconds * timelinePixelsPerSecond),
                      }}
                      tabIndex={0}
                      onClick={() => {
                        if (suppressTimelineMoveClickRef.current) {
                          return;
                        }
                        selectTrackClip(segment);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          selectTrackClip(segment);
                        }
                      }}
                      onPointerCancel={() => setTrackClipMoveDrag(undefined)}
                      onPointerDown={(event) => startTrackClipMoveDrag(event, segment)}
                      onPointerUp={finishTrackClipMoveDrag}
                    >
                      <span>{segment.range}</span>
                      <b>{segment.title}</b>
                      <small>{segment.meta}</small>
                    </article>
                  ))}
                </div>
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
