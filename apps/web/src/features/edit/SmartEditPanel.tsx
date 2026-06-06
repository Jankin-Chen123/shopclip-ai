import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type {
  AssetMetadata,
  AssetSlice,
  MediaSettings,
  RenderTask,
  SmartEditAudioWaveform,
  SmartEditAudioVolumeKeyframe,
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
  Lock,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Scissors,
  SkipBack,
  SkipForward,
  Trash2,
  Unlock,
  Link,
  Unlink,
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
const ENABLE_ADVANCED_VISUAL_CONTROLS = false;

export const smartEditTimelineKeyboardNudgeSeconds = (
  key: string,
  shiftKey: boolean,
): number | undefined => {
  const delta = shiftKey ? 1 : TRIM_NUDGE_SECONDS;
  if (key === "ArrowLeft") {
    return -delta;
  }
  if (key === "ArrowRight") {
    return delta;
  }
  return undefined;
};

const clampSmartEditDuration = (durationSeconds: number): number =>
  Number.isFinite(durationSeconds)
    ? Math.max(MIN_SMART_EDIT_CLIP_SECONDS, Math.min(MAX_SMART_EDIT_CLIP_SECONDS, durationSeconds))
    : MIN_SMART_EDIT_CLIP_SECONDS;

const clampPlaybackRate = (playbackRate: number): number =>
  Math.max(0.25, Math.min(4, playbackRate || 1));

const clampTextFontSize = (fontSize: number): number =>
  Number.isFinite(fontSize) ? Math.max(12, Math.min(72, Math.round(fontSize))) : 42;

const clampTextPositionYPercent = (positionPercent: number): number =>
  Number.isFinite(positionPercent) ? Math.max(8, Math.min(92, positionPercent)) : 12;

const normalizeTextColor = (color: string | undefined): string | undefined => {
  const normalized = color?.trim();
  return normalized && /^#[0-9a-fA-F]{6}$/u.test(normalized) ? normalized.toLowerCase() : undefined;
};

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

const clampAudioVolume = (volume: number): number =>
  Number.isFinite(volume) ? Number(Math.max(0, Math.min(4, volume)).toFixed(2)) : 1;

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

const audioVolumeKeyframes = (
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

const withRebuiltTimeline = (plan: SmartEditPlan): SmartEditPlan => {
  const timeline = mergePersistentTimelineWithDerivedSegments(plan, buildSmartEditTimeline(plan));
  return {
    ...plan,
    targetDurationSeconds: timelineDurationForElements(timeline) ?? planDurationSeconds(plan.segments),
    timeline,
  };
};

type SmartEditRippleGap = {
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
    .sort((left, right) => left.startSecond - right.startSecond);

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

const shiftTimelineElementsByRippleGaps = (
  elements: SmartEditTimeline["elements"],
  gaps: SmartEditRippleGap[],
): SmartEditTimeline["elements"] =>
  normalizedRippleGaps(gaps).length === 0
    ? elements
    : elements.map((element) => ({
        ...element,
        startSecond: rippleTimelineStart(element.startSecond, gaps),
      }));

const shiftSegmentsByRippleGaps = (
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

const trimPersistentTimelineElementAtSecond = (
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

export type SmartEditTimelineEditMode = "magnetic" | "insert" | "overwrite" | "ripple";

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
  trimStartSecond?: number;
  waveform?: SmartEditAudioWaveform;
};

type SmartEditTimelineElementPatch = Partial<
  Pick<
    SmartEditTimelineElement,
    | "audioFadeInSeconds"
    | "audioFadeOutSeconds"
    | "audioVolume"
    | "audioVolumeKeyframes"
    | "durationSeconds"
    | "hidden"
    | "label"
    | "muted"
    | "playbackRate"
    | "startSecond"
    | "text"
    | "textColor"
    | "textFontSize"
    | "textPositionYPercent"
    | "trimEndSecond"
    | "trimStartSecond"
  >
>;

type SmartEditTimelineTrackPatch = Partial<
  Pick<SmartEditTimeline["tracks"][number], "hidden" | "locked" | "muted">
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
  currentClientX: number;
  pointerId: number;
  startClientX: number;
  trackClip: SmartEditTrackSegment;
};

type TrackClipTrimDragState = {
  edge: "in" | "out";
  pointerId: number;
  startClientX: number;
  trackClip: SmartEditTrackSegment;
};

type TrackBoxSelectDragState = {
  currentClientX: number;
  currentClientY: number;
  currentLaneX: number;
  currentTimelineY: number;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startLaneX: number;
  startTimelineY: number;
  trackId: SmartEditTrackId;
  trackRows: Array<{
    bottom: number;
    locked: boolean;
    top: number;
    trackId: SmartEditTrackId;
  }>;
};

export type SmartEditClipboard = {
  items: Array<{
    elements?: SmartEditTimeline["elements"];
    segment: SmartEditSegment;
    startSecond: number;
  }>;
  timelineItems?: Array<{
    element: SmartEditTimelineElement;
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
  "ripple",
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

type SmartEditSrtCue = {
  durationSeconds: number;
  startSecond: number;
  text: string;
};

const parseSrtTimestampSeconds = (input: string): number => {
  const match = input.trim().replace(",", ".").match(/^(\d{2}):(\d{2}):(\d{2})\.(\d{1,3})$/);
  if (!match) {
    return Number.NaN;
  }
  const [, hours, minutes, seconds, milliseconds] = match;
  return (
    Number.parseInt(hours ?? "0", 10) * 3600 +
    Number.parseInt(minutes ?? "0", 10) * 60 +
    Number.parseInt(seconds ?? "0", 10) +
    Number.parseInt((milliseconds ?? "0").padEnd(3, "0"), 10) / 1000
  );
};

const parseSmartEditSrtCues = (input: string): SmartEditSrtCue[] => {
  const normalized = input.replace(/\r\n?/g, "\n").trim();
  if (!normalized) {
    return [];
  }
  return normalized
    .split(/\n{2,}/)
    .flatMap((block): SmartEditSrtCue[] => {
      const lines = block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      const timestampIndex = lines.findIndex((line) => line.includes("-->"));
      if (timestampIndex < 0) {
        return [];
      }
      const timestampLine = lines[timestampIndex] ?? "";
      const [rawStart, rawEnd] = timestampLine.split(/\s*-->\s*/);
      if (!rawStart || !rawEnd) {
        return [];
      }
      const startSecond = parseSrtTimestampSeconds(rawStart);
      const endSecond = parseSrtTimestampSeconds(rawEnd.split(/\s+/)[0] ?? "");
      const text = lines.slice(timestampIndex + 1).join("\n").trim();
      if (!text || !Number.isFinite(startSecond) || !Number.isFinite(endSecond) || endSecond <= startSecond) {
        return [];
      }
      return [
        {
          durationSeconds: Number((endSecond - startSecond).toFixed(3)),
          startSecond: Number(startSecond.toFixed(3)),
          text,
        },
      ];
    });
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

const linkedTimelineElementIds = (
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

export const selectSmartEditTrackIdsInMarquee = (
  trackRows: Array<{
    bottom: number;
    locked?: boolean;
    top: number;
    trackId: SmartEditTrackId;
  }>,
  range: {
    endY: number;
    startY: number;
  },
): SmartEditTrackId[] => {
  const startY = Math.min(range.startY, range.endY);
  const endY = Math.max(range.startY, range.endY);
  if (endY - startY < 1) {
    return trackRows
      .filter((row) => !row.locked && startY >= row.top && startY <= row.bottom)
      .sort((left, right) => left.top - right.top)
      .map((row) => row.trackId);
  }
  return trackRows
    .filter((row) => !row.locked && intervalsOverlap(startY, endY, row.top, row.bottom))
    .sort((left, right) => left.top - right.top)
    .map((row) => row.trackId);
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

export const previewSmartEditTrackClipDrag = ({
  currentClientX,
  pixelsPerSecond,
  selectedIds,
  startClientX,
  trackClip,
  trackClips,
}: {
  currentClientX: number;
  pixelsPerSecond: number;
  selectedIds: string[];
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
  return sourceClips.map((candidate) => ({
    durationSeconds: candidate.durationSeconds,
    id: candidate.id,
    startSecond: clampTimelineStart(snapTimelineSeconds(candidate.startSecond + clampedDeltaSeconds)),
    trackId: candidate.trackId,
  }));
};

export const moveSmartEditTrackClipOnTimeline = (
  plan: SmartEditPlan,
  trackClip: Pick<SmartEditTrackSegment, "id" | "segmentId" | "trackId">,
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

const waveformBucketsForClip = (
  waveform: SmartEditAudioWaveform | undefined,
  trimStartSecond: number | undefined,
  durationSeconds: number,
): SmartEditAudioWaveform["buckets"] => {
  if (!waveform?.buckets.length) {
    return [];
  }
  const startSecond = Math.max(0, trimStartSecond ?? 0);
  const endSecond = Math.min(waveform.durationSeconds, startSecond + Math.max(0, durationSeconds));
  const buckets = waveform.buckets.filter((bucket) => {
    const bucketEndSecond = bucket.startSecond + bucket.durationSeconds;
    return bucketEndSecond > startSecond && bucket.startSecond < endSecond;
  });
  return buckets.length > 0 ? buckets : waveform.buckets.slice(0, Math.min(24, waveform.buckets.length));
};

const SmartEditWaveformStrip = ({ segment }: { segment: SmartEditTrackSegment }) => {
  const buckets = waveformBucketsForClip(
    segment.waveform,
    segment.trimStartSecond,
    segment.durationSeconds,
  ).slice(0, 96);

  if (buckets.length === 0) {
    return null;
  }

  return (
    <div
      aria-label={`Waveform RMS preview for ${segment.title}`}
      className="smart-edit-waveform"
      title="Waveform RMS preview"
    >
      {buckets.map((bucket) => (
        <i
          className={`smart-edit-waveform-bar ${bucket.peak >= 0.98 ? "clipped" : ""}`.trim()}
          key={`${segment.id}-${bucket.index}`}
          style={{ height: `${Math.max(12, Math.round(bucket.rms * 92))}%` }}
        />
      ))}
    </div>
  );
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
          trimStartSecond: element.trimStartSecond,
          title: element.label,
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
  const [selectedTrackClipIds, setSelectedTrackClipIds] = useState<string[]>([]);
  const [smartEditClipboard, setSmartEditClipboard] = useState<SmartEditClipboard | undefined>();
  const [trackClipMoveDrag, setTrackClipMoveDrag] = useState<TrackClipMoveDragState | undefined>();
  const [trackClipTrimDrag, setTrackClipTrimDrag] = useState<TrackClipTrimDragState | undefined>();
  const [trackBoxSelectDrag, setTrackBoxSelectDrag] = useState<TrackBoxSelectDragState | undefined>();
  const [timelineMoveDrag, setTimelineMoveDrag] = useState<TimelineMoveDragState | undefined>();
  const [timelineEditMode, setTimelineEditMode] = useState<SmartEditTimelineEditMode>("magnetic");
  const [trimDrag, setTrimDrag] = useState<TrimDragState | undefined>();
  const [playheadSeconds, setPlayheadSeconds] = useState(0);
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [srtImportText, setSrtImportText] = useState("");
  const [srtImportMessage, setSrtImportMessage] = useState<string | undefined>();
  const plan = result?.plan;

  useEffect(() => {
    if (plan?.id !== historyPlanId) {
      setHistoryPlanId(plan?.id);
      setCommandHistory(createSmartEditCommandHistory());
      setSelectedSegmentIds([]);
      setSelectedTrackClipId(undefined);
      setSelectedTrackClipIds([]);
      setTrackClipMoveDrag(undefined);
      setTrackClipTrimDrag(undefined);
      setTrackBoxSelectDrag(undefined);
      setTimelineMoveDrag(undefined);
      setTrimDrag(undefined);
      setSmartEditClipboard(undefined);
      setPlayheadSeconds(0);
      setSrtImportText("");
      setSrtImportMessage(undefined);
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
  const selectedTrackClipIdSet = useMemo(
    () => new Set(selectedTrackClipIds),
    [selectedTrackClipIds],
  );
  const selectedBatchTrackClips = useMemo(
    () =>
      trackSegments
        .flatMap((track) => track.segments)
        .filter((trackClip) => selectedTrackClipIdSet.has(trackClip.id)),
    [selectedTrackClipIdSet, trackSegments],
  );
  const trackClipDragPreview = useMemo(
    () =>
      trackClipMoveDrag
        ? previewSmartEditTrackClipDrag({
            currentClientX: trackClipMoveDrag.currentClientX,
            pixelsPerSecond: timelinePixelsPerSecond,
            selectedIds: selectedTrackClipIds,
            startClientX: trackClipMoveDrag.startClientX,
            trackClip: trackClipMoveDrag.trackClip,
            trackClips: trackSegments.flatMap((track) => track.segments),
          })
        : [],
    [selectedTrackClipIds, timelinePixelsPerSecond, trackClipMoveDrag, trackSegments],
  );
  const trackBoxSelectTrackIdSet = useMemo(
    () =>
      new Set(
        trackBoxSelectDrag
          ? selectSmartEditTrackIdsInMarquee(trackBoxSelectDrag.trackRows, {
              endY: trackBoxSelectDrag.currentTimelineY,
              startY: trackBoxSelectDrag.startTimelineY,
            })
          : [],
      ),
    [trackBoxSelectDrag],
  );
  const selectedTimelineElement = useMemo(
    () => plan?.timeline?.elements.find((element) => element.id === selectedTrackClip?.id),
    [plan, selectedTrackClip],
  );
  const selectedLinkedElements = useMemo(() => {
    if (!plan?.timeline || !selectedTimelineElement?.linkedGroupId) {
      return [];
    }
    return plan.timeline.elements.filter(
      (element) => element.linkedGroupId === selectedTimelineElement.linkedGroupId,
    );
  }, [plan?.timeline, selectedTimelineElement]);
  const canRelinkSelectedTimelineElement = useMemo(() => {
    if (
      !plan?.timeline ||
      !selectedTimelineElement ||
      selectedTimelineElement.linkedGroupId ||
      !selectedTimelineElement.sceneId ||
      (selectedTimelineElement.kind !== "video" && selectedTimelineElement.kind !== "audio")
    ) {
      return false;
    }
    return plan.timeline.elements.some(
      (element) =>
        element.id !== selectedTimelineElement.id &&
        !element.linkedGroupId &&
        element.sceneId === selectedTimelineElement.sceneId &&
        ((selectedTimelineElement.kind === "video" && element.kind === "audio") ||
          (selectedTimelineElement.kind === "audio" && element.kind === "video")),
    );
  }, [plan?.timeline, selectedTimelineElement]);
  const trackLabels = {
    bgm: copy.bgmTrack,
    caption: copy.captionTrack,
    sourceAudio: copy.sourceAudioTrack,
    video: copy.videoTrack,
    voice: copy.voiceTrack,
  } as const;
  const timelineTrackIdForTrack = (trackId: SmartEditTrackId): string =>
    trackId === "sourceAudio"
      ? "audio-source"
      : trackId === "caption"
        ? "text-copy"
        : trackId === "video"
          ? "video-main"
          : trackId === "bgm"
            ? "bgm-bed"
            : "voiceover";
  const timelineTrackForTrack = (trackId: SmartEditTrackId) =>
    (plan?.timeline ?? (plan ? buildSmartEditTimeline(plan) : undefined))?.tracks.find(
      (track) => track.id === timelineTrackIdForTrack(trackId),
    );
  const isTimelineTrackLocked = (trackId: SmartEditTrackId): boolean =>
    timelineTrackForTrack(trackId)?.locked ?? false;

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
      setSelectedTrackClipIds([addedElement.id]);
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
      setSelectedTrackClipIds([addedElement.id]);
      setSelectedSegmentIds([]);
    }
  };

  const importSrtCaptions = () => {
    if (!plan) {
      return;
    }
    const beforeCount = plan.timeline?.elements.filter((element) => element.id.startsWith("srt-")).length ?? 0;
    const nextPlan = importSmartEditSrtCaptionsToTimeline(
      plan,
      srtImportText,
      `import-${Date.now()}`,
    );
    const afterCount = nextPlan.timeline?.elements.filter((element) => element.id.startsWith("srt-")).length ?? 0;
    const importedCount = Math.max(0, afterCount - beforeCount);
    if (nextPlan === plan || importedCount === 0) {
      setSrtImportMessage("No valid SRT captions found.");
      return;
    }
    commitPlanChange(nextPlan, { label: "Import SRT captions" });
    setSrtImportText("");
    setSrtImportMessage(`Imported ${importedCount} captions.`);
  };

  const detachSelectedSourceAudio = () => {
    if (!plan || !selectedTrackClip?.segmentId || selectedTrackClip.trackId !== "sourceAudio") {
      return;
    }
    const nextPlan = detachSmartEditSourceAudioToTimelineElement(
      plan,
      selectedTrackClip.segmentId,
      `${Date.now()}`,
    );
    if (nextPlan === plan) {
      return;
    }
    const detachedElement = nextPlan.timeline?.elements.at(-1);
    commitPlanChange(nextPlan, { label: "Detach source audio" });
    if (detachedElement) {
      setSelectedTrackClipId(detachedElement.id);
      setSelectedTrackClipIds([detachedElement.id]);
      setSelectedSegmentIds([]);
      onSelectedSegmentChange(undefined);
    }
  };

  const detachSelectedSceneVideo = () => {
    if (!plan || !selectedTrackClip?.segmentId || selectedTrackClip.trackId !== "video") {
      return;
    }
    const nextPlan = detachSmartEditSceneVideoToTimelineElement(
      plan,
      selectedTrackClip.segmentId,
      `${Date.now()}`,
    );
    if (nextPlan === plan) {
      return;
    }
    const detachedElement = nextPlan.timeline?.elements.at(-1);
    commitPlanChange(nextPlan, { label: "Detach scene video" });
    if (detachedElement) {
      setSelectedTrackClipId(detachedElement.id);
      setSelectedTrackClipIds([detachedElement.id]);
      setSelectedSegmentIds([]);
      onSelectedSegmentChange(undefined);
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
        setSelectedTrackClipIds([]);
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
      setSelectedTrackClipIds([]);
      onSelectedSegmentChange(segmentId);
      return;
    }
    setSelectedSegmentIds([segmentId]);
    setSelectedTrackClipId(undefined);
    setSelectedTrackClipIds([]);
    onSelectedSegmentChange(segmentId);
  };

  const selectTrackClip = (
    trackClip: SmartEditTrackSegment,
    event?: Pick<ReactMouseEvent<HTMLElement> | ReactPointerEvent<HTMLElement>, "ctrlKey" | "metaKey" | "shiftKey">,
  ) => {
    const trackClips = trackSegments.flatMap((track) => track.segments);
    if (event?.shiftKey && selectedTrackClipIds.length > 0) {
      const anchorIndex = trackClips.findIndex(
        (candidate) => candidate.id === selectedTrackClipIds[selectedTrackClipIds.length - 1],
      );
      const targetIndex = trackClips.findIndex((candidate) => candidate.id === trackClip.id);
      if (anchorIndex >= 0 && targetIndex >= 0) {
        const [start, end] =
          anchorIndex < targetIndex ? [anchorIndex, targetIndex] : [targetIndex, anchorIndex];
        setSelectedTrackClipIds(trackClips.slice(start, end + 1).map((candidate) => candidate.id));
        setSelectedTrackClipId(trackClip.id);
        setSelectedSegmentIds([]);
        onSelectedSegmentChange(undefined);
        return;
      }
    }
    if (event?.ctrlKey || event?.metaKey) {
      setSelectedTrackClipIds((current) => {
        const currentSet = new Set(current);
        if (currentSet.has(trackClip.id) && currentSet.size > 1) {
          currentSet.delete(trackClip.id);
        } else {
          currentSet.add(trackClip.id);
        }
        return trackClips.map((candidate) => candidate.id).filter((id) => currentSet.has(id));
      });
      setSelectedTrackClipId(trackClip.id);
      setSelectedSegmentIds([]);
      onSelectedSegmentChange(undefined);
      return;
    }
    setSelectedTrackClipId(trackClip.id);
    setSelectedTrackClipIds([trackClip.id]);
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
    setSelectedTrackClipIds([]);
    onSelectedSegmentChange(sortedSegments[0]?.id);
  };

  const selectAllTimelineElements = (): boolean => {
    if (!plan) {
      return false;
    }
    const timelineElementIds = selectSmartEditTimelineElementIds(plan);
    if (timelineElementIds.length === 0) {
      return false;
    }
    setSelectedTrackClipIds(timelineElementIds);
    setSelectedTrackClipId(timelineElementIds.at(-1));
    setSelectedSegmentIds([]);
    onSelectedSegmentChange(undefined);
    return true;
  };

  const clearMultiSelection = () => {
    if (selectedBatchTrackClips.length > 0) {
      setSelectedTrackClipIds(selectedTrackClipId ? [selectedTrackClipId] : []);
      return;
    }
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
    const nextPlan = removeSmartEditSegmentsFromTimeline(
      plan,
      segmentIds,
      timelineEditMode,
    );
    if (nextPlan === plan || nextPlan.segments.length === sortedSegments.length) {
      return;
    }
    commitPlanChange(nextPlan, {
      label:
        segmentIds.length > 1
          ? `Remove selected clips (${timelineEditMode})`
          : `Remove clip (${timelineEditMode})`,
    });
    const nextSelectedId = nextPlan.segments[Math.min(selectedSegmentIndex - 1, nextPlan.segments.length - 1)]?.id;
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

  const moveSelectedTrackClips = (deltaSeconds: number) => {
    if (!plan || selectedBatchTrackClips.length < 1) {
      return;
    }
    const movableClips = selectedBatchTrackClips.filter(
      (trackClip) => !trackClip.segmentId && !isTimelineTrackLocked(trackClip.trackId),
    );
    if (movableClips.length < 1) {
      return;
    }
    const nextPlan = moveSmartEditTimelineElementsOnTimeline(
      plan,
      movableClips.map((trackClip) => trackClip.id),
      deltaSeconds,
      timelineEditMode,
      boundedPlayheadSeconds,
    );
    if (nextPlan === plan) {
      return;
    }
    commitPlanChange(nextPlan, { label: `Move selected materials (${timelineEditMode})` });
  };

  const updateTimelineTrackState = (
    trackId: SmartEditTrackId,
    patch: SmartEditTimelineTrackPatch,
    label: string,
  ) => {
    if (!plan) {
      return;
    }
    const nextPlan = updateSmartEditTimelineTrack(plan, timelineTrackIdForTrack(trackId), patch);
    if (nextPlan === plan) {
      return;
    }
    commitPlanChange(nextPlan, { label });
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

  const addSegmentAudioVolumeKeyframeAtPlayhead = (trackId: "sourceAudio" | "voice") => {
    if (!plan || !selectedSegment) {
      return;
    }
    const selectedStart = segmentTimelineBaseStart(plan, selectedSegment.id);
    const clipStartSecond =
      selectedTrackClip?.startSecond ??
      selectedStart +
        (trackId === "sourceAudio"
          ? selectedSegment.sourceAudioStartOffsetSeconds ?? 0
          : selectedSegment.voiceoverStartOffsetSeconds ?? 0);
    const clipDurationSeconds =
      trackId === "sourceAudio"
        ? clipDurationWithinSegment(
            selectedSegment.sourceAudioDurationSeconds,
            selectedSegment.sourceAudioStartOffsetSeconds,
            selectedSegment.durationSeconds,
          )
        : clipDurationWithinSegment(
            selectedSegment.voiceoverDurationSeconds,
            selectedSegment.voiceoverStartOffsetSeconds,
            selectedSegment.durationSeconds,
          );
    const timeSecond = clampVisualKeyframeTime(
      boundedPlayheadSeconds - clipStartSecond,
      clipDurationSeconds,
    );
    const token = `${Date.now()}`;
    commitPlanChange(replaceSegment(plan, selectedSegment.id, (segment) => {
      if (trackId === "sourceAudio") {
        const keyframes = audioVolumeKeyframes(
          segment.sourceAudioVolumeKeyframes,
          clipDurationSeconds,
        ).filter((keyframe) => Math.abs(keyframe.timeSecond - timeSecond) > 0.05);
        return {
          ...segment,
          sourceAudioVolumeKeyframes: [
            ...keyframes,
            {
              easing: "linear" as const,
              id: `${segment.id}-source-volume-kf-${token}`,
              timeSecond,
              volume: clampAudioVolume(segment.sourceAudioVolume ?? 1),
            },
          ].sort((left, right) => left.timeSecond - right.timeSecond),
        };
      }
      const keyframes = audioVolumeKeyframes(
        segment.voiceoverVolumeKeyframes,
        clipDurationSeconds,
      ).filter((keyframe) => Math.abs(keyframe.timeSecond - timeSecond) > 0.05);
      return {
        ...segment,
        voiceoverVolumeKeyframes: [
          ...keyframes,
          {
            easing: "linear" as const,
            id: `${segment.id}-voice-volume-kf-${token}`,
            timeSecond,
            volume: clampAudioVolume(segment.voiceoverVolume ?? 1),
          },
        ].sort((left, right) => left.timeSecond - right.timeSecond),
      };
    }), { label: "Add audio volume keyframe" });
  };

  const removeSegmentAudioVolumeKeyframe = (
    trackId: "sourceAudio" | "voice",
    keyframeId: string,
  ) => {
    if (!plan || !selectedSegment) {
      return;
    }
    commitPlanChange(replaceSegment(plan, selectedSegment.id, (segment) =>
      trackId === "sourceAudio"
        ? {
            ...segment,
            sourceAudioVolumeKeyframes: audioVolumeKeyframes(
              segment.sourceAudioVolumeKeyframes,
              segment.durationSeconds,
            ).filter((keyframe) => keyframe.id !== keyframeId),
          }
        : {
            ...segment,
            voiceoverVolumeKeyframes: audioVolumeKeyframes(
              segment.voiceoverVolumeKeyframes,
              segment.durationSeconds,
            ).filter((keyframe) => keyframe.id !== keyframeId),
          },
    ), { label: "Remove audio volume keyframe" });
  };

  const addTimelineElementAudioVolumeKeyframeAtPlayhead = () => {
    if (!selectedTimelineElement) {
      return;
    }
    const timeSecond = clampVisualKeyframeTime(
      boundedPlayheadSeconds - selectedTimelineElement.startSecond,
      selectedTimelineElement.durationSeconds,
    );
    const token = `${Date.now()}`;
    const keyframes = audioVolumeKeyframes(
      selectedTimelineElement.audioVolumeKeyframes,
      selectedTimelineElement.durationSeconds,
    ).filter((keyframe) => Math.abs(keyframe.timeSecond - timeSecond) > 0.05);
    updateSelectedTimelineElement({
      audioVolumeKeyframes: [
        ...keyframes,
        {
          easing: "linear" as const,
          id: `${selectedTimelineElement.id}-volume-kf-${token}`,
          timeSecond,
          volume: clampAudioVolume(selectedTimelineElement.audioVolume ?? 1),
        },
      ].sort((left, right) => left.timeSecond - right.timeSecond),
    });
  };

  const removeTimelineElementAudioVolumeKeyframe = (keyframeId: string) => {
    if (!selectedTimelineElement) {
      return;
    }
    updateSelectedTimelineElement({
      audioVolumeKeyframes: audioVolumeKeyframes(
        selectedTimelineElement.audioVolumeKeyframes,
        selectedTimelineElement.durationSeconds,
      ).filter((keyframe) => keyframe.id !== keyframeId),
    });
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

  const slipSelectedTimelineElementSource = (deltaSeconds: number) => {
    if (!plan || !selectedTimelineElement) {
      return;
    }
    const nextPlan = slipSmartEditTimelineElementSource(
      plan,
      selectedTimelineElement.id,
      deltaSeconds,
    );
    if (nextPlan === plan) {
      return;
    }
    commitPlanChange(nextPlan, {
      label: `Slip ${selectedTrackClip?.trackId ?? "timeline"} source`,
    });
  };

  const unlinkSelectedTimelineElementGroup = () => {
    if (!plan || !selectedTimelineElement?.linkedGroupId) {
      return;
    }
    const nextPlan = unlinkSmartEditTimelineElementGroup(plan, selectedTimelineElement.id);
    if (nextPlan === plan) {
      return;
    }
    commitPlanChange(nextPlan, { label: "Unlink scene material group" });
    setSelectedTrackClipId(selectedTimelineElement.id);
  };

  const relinkSelectedTimelineElementGroup = () => {
    if (!plan || !selectedTimelineElement) {
      return;
    }
    const nextPlan = relinkSmartEditTimelineElementWithSceneMate(
      plan,
      selectedTimelineElement.id,
      `${Date.now()}`,
    );
    if (nextPlan === plan) {
      return;
    }
    commitPlanChange(nextPlan, { label: "Relink scene material group" });
    setSelectedTrackClipId(selectedTimelineElement.id);
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
    const selectedTimelineMaterialIds = selectedEditableTimelineMaterialIds();
    if (selectedTimelineMaterialIds.length > 1) {
      const splitToken = String(Date.now());
      const nextPlan = splitSmartEditTimelineElementsAtPlayhead(
        plan,
        selectedTimelineMaterialIds,
        boundedPlayheadSeconds,
        splitToken,
      );
      if (nextPlan) {
        const rightElementIds =
          nextPlan.timeline?.elements
            .map((element) => element.id)
            .filter((id) =>
              selectedTimelineMaterialIds.some((sourceId) => id === `${sourceId}-split-${splitToken}`),
            ) ?? [];
        commitPlanChange(nextPlan, { label: "Split selected materials at playhead" });
        if (rightElementIds.length > 0) {
          setSelectedTrackClipId(rightElementIds[0]);
          setSelectedTrackClipIds(rightElementIds);
        }
        return;
      }
    }
    if (
      selectedTrackClip &&
      boundedPlayheadSeconds > selectedTrackClip.startSecond &&
      boundedPlayheadSeconds < selectedTrackClip.startSecond + selectedTrackClip.durationSeconds
    ) {
      if (selectedTrackClip.trackId !== "video") {
        const splitToken = String(Date.now());
        const nextPlan = splitSmartEditTimelineElementAtPlayhead(
          plan,
          selectedTrackClip.id,
          boundedPlayheadSeconds,
          splitToken,
        );
        if (nextPlan) {
          const rightElementId = `${selectedTrackClip.id}-split-${splitToken}`;
          commitPlanChange(nextPlan, { label: `Split ${selectedTrackClip.trackId} material` });
          setSelectedTrackClipId(rightElementId);
          setSelectedSegmentIds(selectedTrackClip.segmentId ? [selectedTrackClip.segmentId] : []);
          return;
        }
      }
      if (selectedTrackClip.segmentId) {
        const targetSegment = plan.segments.find((segment) => segment.id === selectedTrackClip.segmentId);
        if (targetSegment) {
          const rightId = splitSegmentAtOffset(
            targetSegment,
            boundedPlayheadSeconds - selectedTrackClip.startSecond,
          );
          if (rightId) {
            onSelectedSegmentChange(rightId);
          }
          return;
        }
      }
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

  const trimAtPlayhead = (side: "left" | "right") => {
    if (!plan) {
      return;
    }
    const selectedTimelineMaterialIds = selectedEditableTimelineMaterialIds();
    if (selectedTimelineMaterialIds.length > 1) {
      const nextPlan = trimSmartEditTimelineElementsAtPlayhead(
        plan,
        selectedTimelineMaterialIds,
        boundedPlayheadSeconds,
        side,
        timelineEditMode,
      );
      if (nextPlan) {
        commitPlanChange(nextPlan, {
          label:
            side === "left"
              ? "Trim selected materials right at playhead"
              : "Trim selected materials left at playhead",
        });
        setSelectedTrackClipIds(
          selectedTimelineMaterialIds.filter((id) =>
            nextPlan.timeline?.elements.some((element) => element.id === id),
          ),
        );
        return;
      }
    }
    if (
      selectedTrackClip &&
      boundedPlayheadSeconds > selectedTrackClip.startSecond &&
      boundedPlayheadSeconds < selectedTrackClip.startSecond + selectedTrackClip.durationSeconds
    ) {
      if (selectedTrackClip.trackId !== "video") {
        const nextPlan = trimSmartEditTimelineElementAtPlayhead(
          plan,
          selectedTrackClip.id,
          boundedPlayheadSeconds,
          side,
          timelineEditMode,
        );
        if (nextPlan) {
          commitPlanChange(nextPlan, {
            label:
              side === "left"
                ? `Trim ${selectedTrackClip.trackId} right at playhead`
                : `Trim ${selectedTrackClip.trackId} left at playhead`,
          });
          setSelectedTrackClipId(selectedTrackClip.id);
          setSelectedSegmentIds(selectedTrackClip.segmentId ? [selectedTrackClip.segmentId] : []);
          return;
        }
      }
      if (selectedTrackClip.segmentId) {
        const targetSegment = plan.segments.find((segment) => segment.id === selectedTrackClip.segmentId);
        if (targetSegment) {
          const nextPlan = trimSmartEditSegmentAtPlayhead(
            plan,
            targetSegment.id,
            boundedPlayheadSeconds - selectedTrackClip.startSecond,
            side,
            timelineEditMode,
          );
          if (nextPlan) {
            commitPlanChange(nextPlan, {
              label: side === "left" ? "Trim right at playhead" : "Trim left at playhead",
            });
            onSelectedSegmentChange(targetSegment.id);
            setSelectedSegmentIds([targetSegment.id]);
            return;
          }
        }
      }
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
    const nextPlan = trimSmartEditSegmentAtPlayhead(
      plan,
      target.segment.id,
      boundedPlayheadSeconds - target.startSecond,
      side,
      timelineEditMode,
    );
    if (!nextPlan) {
      return;
    }
    commitPlanChange(nextPlan, {
      label: side === "left" ? "Trim left at playhead" : "Trim right at playhead",
    });
    onSelectedSegmentChange(target.segment.id);
    setSelectedSegmentIds([target.segment.id]);
  };

  const closeGapAtPlayhead = () => {
    if (!plan) {
      return;
    }
    const nextPlan = closeSmartEditTimelineGapAtPlayhead(plan, boundedPlayheadSeconds);
    if (nextPlan === plan) {
      return;
    }
    commitPlanChange(nextPlan, { label: "Close timeline gap" });
    setPlayheadSeconds((current) => Math.min(current, nextPlan.targetDurationSeconds));
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
    if (trackClip.trackId === "bgm" || isTimelineTrackLocked(trackClip.trackId)) {
      selectTrackClip(trackClip, event);
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    if (selectedTrackClipIdSet.has(trackClip.id) && selectedTrackClipIds.length > 1) {
      setSelectedTrackClipId(trackClip.id);
    } else {
      selectTrackClip(trackClip, event);
    }
    setTrackClipMoveDrag({
      currentClientX: event.clientX,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      trackClip,
    });
  };

  const updateTrackClipMoveDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (!trackClipMoveDrag || trackClipMoveDrag.pointerId !== event.pointerId) {
      return;
    }
    setTrackClipMoveDrag((current) =>
      current ? { ...current, currentClientX: event.clientX } : current,
    );
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
    const selectedMoveIds =
      selectedTrackClipIds.length > 1 && selectedTrackClipIdSet.has(trackClipMoveDrag.trackClip.id)
        ? selectedTrackClipIds
        : [];
    const nextPlan =
      selectedMoveIds.length > 1 &&
      selectedBatchTrackClips.every((trackClip) => !trackClip.segmentId && !isTimelineTrackLocked(trackClip.trackId))
        ? moveSmartEditTimelineElementsOnTimeline(
            plan,
            selectedMoveIds,
            deltaSeconds,
            timelineEditMode,
            boundedPlayheadSeconds,
          )
        : moveSmartEditTrackClipOnTimeline(
            plan,
            trackClipMoveDrag.trackClip,
            deltaSeconds,
            timelineEditMode,
            boundedPlayheadSeconds,
          );
    commitPlanChange(nextPlan, {
      label:
        selectedMoveIds.length > 1
          ? `Move selected materials (${timelineEditMode})`
          : `Move ${trackClipMoveDrag.trackClip.trackId} material`,
    });
  };

  const trimTrackClipEdge = (
    trackClip: SmartEditTrackSegment,
    edge: "in" | "out",
    deltaSeconds: number,
  ) => {
    if (!plan || trackClip.trackId === "bgm" || isTimelineTrackLocked(trackClip.trackId)) {
      return;
    }
    const nextPlan = resizeSmartEditTrackClipEdge(plan, trackClip, edge, deltaSeconds);
    if (nextPlan === plan) {
      return;
    }
    commitPlanChange(nextPlan, {
      label: edge === "in" ? `Trim ${trackClip.trackId} in` : `Trim ${trackClip.trackId} out`,
    });
    setSelectedTrackClipId(trackClip.id);
    setSelectedTrackClipIds([trackClip.id]);
    setSelectedSegmentIds(trackClip.segmentId ? [trackClip.segmentId] : []);
    if (trackClip.segmentId) {
      onSelectedSegmentChange(trackClip.segmentId);
    } else {
      onSelectedSegmentChange(undefined);
    }
  };

  const startTrackClipTrimDrag = (
    event: ReactPointerEvent<HTMLButtonElement>,
    trackClip: SmartEditTrackSegment,
    edge: "in" | "out",
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (trackClip.trackId === "bgm" || isTimelineTrackLocked(trackClip.trackId)) {
      selectTrackClip(trackClip, event);
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    selectTrackClip(trackClip, event);
    setTrackClipTrimDrag({
      edge,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      trackClip,
    });
  };

  const finishTrackClipTrimDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!trackClipTrimDrag || trackClipTrimDrag.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const deltaSeconds = snapTimelineSeconds(
      (event.clientX - trackClipTrimDrag.startClientX) / timelinePixelsPerSecond,
    );
    setTrackClipTrimDrag(undefined);
    if (Math.abs(deltaSeconds) < 0.001) {
      return;
    }
    suppressTimelineMoveClickRef.current = true;
    window.setTimeout(() => {
      suppressTimelineMoveClickRef.current = false;
    }, 0);
    trimTrackClipEdge(trackClipTrimDrag.trackClip, trackClipTrimDrag.edge, deltaSeconds);
  };

  const startTrackBoxSelectDrag = (
    event: ReactPointerEvent<HTMLDivElement>,
    trackId: SmartEditTrackId,
  ) => {
    if (!plan || event.target !== event.currentTarget || isTimelineTrackLocked(trackId)) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const laneRect = event.currentTarget.getBoundingClientRect();
    const laneScroller = event.currentTarget.parentElement;
    const laneX = event.clientX - laneRect.left + (laneScroller?.scrollLeft ?? 0);
    const stackElement = event.currentTarget.closest(".smart-edit-track-stack") as HTMLElement | null;
    const stackRect = stackElement?.getBoundingClientRect();
    const trackRows = trackSegments.map((track) => {
      const trackRowElement = stackElement?.querySelector<HTMLElement>(
        `.smart-edit-track-row[data-track-id="${track.id}"]`,
      );
      const trackRowRect = trackRowElement?.getBoundingClientRect() ?? laneRect;
      return {
        bottom: stackRect ? trackRowRect.bottom - stackRect.top : trackRowRect.bottom,
        locked: isTimelineTrackLocked(track.id),
        top: stackRect ? trackRowRect.top - stackRect.top : trackRowRect.top,
        trackId: track.id,
      };
    });
    const timelineY = stackRect ? event.clientY - stackRect.top : event.clientY;
    setTrackBoxSelectDrag({
      currentClientX: event.clientX,
      currentClientY: event.clientY,
      currentLaneX: laneX,
      currentTimelineY: timelineY,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startLaneX: laneX,
      startTimelineY: timelineY,
      trackId,
      trackRows,
    });
  };

  const updateTrackBoxSelectDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!trackBoxSelectDrag || trackBoxSelectDrag.pointerId !== event.pointerId) {
      return;
    }
    const laneRect = event.currentTarget.getBoundingClientRect();
    const laneScroller = event.currentTarget.parentElement;
    const laneX = event.clientX - laneRect.left + (laneScroller?.scrollLeft ?? 0);
    const stackElement = event.currentTarget.closest(".smart-edit-track-stack") as HTMLElement | null;
    const stackRect = stackElement?.getBoundingClientRect();
    const timelineY = stackRect ? event.clientY - stackRect.top : event.clientY;
    setTrackBoxSelectDrag((current) =>
      current
        ? {
            ...current,
            currentClientX: event.clientX,
            currentClientY: event.clientY,
            currentLaneX: laneX,
            currentTimelineY: timelineY,
          }
        : current,
    );
  };

  const finishTrackBoxSelectDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!plan || !trackBoxSelectDrag || trackBoxSelectDrag.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    const startX = Math.min(trackBoxSelectDrag.startLaneX, trackBoxSelectDrag.currentLaneX);
    const endX = Math.max(trackBoxSelectDrag.startLaneX, trackBoxSelectDrag.currentLaneX);
    setTrackBoxSelectDrag(undefined);
    if (endX - startX < 8) {
      return;
    }
    const startSecond = snapTimelineSeconds(startX / timelinePixelsPerSecond);
    const endSecond = snapTimelineSeconds(endX / timelinePixelsPerSecond);
    const selectedIds = selectSmartEditTimelineElementIdsInBox(plan, {
      endSecond,
      startSecond,
      trackIds: selectSmartEditTrackIdsInMarquee(trackBoxSelectDrag.trackRows, {
        endY: trackBoxSelectDrag.currentTimelineY,
        startY: trackBoxSelectDrag.startTimelineY,
      }),
    });
    if (selectedIds.length === 0) {
      setSelectedTrackClipId(undefined);
      setSelectedTrackClipIds([]);
      return;
    }
    setSelectedTrackClipIds(selectedIds);
    setSelectedTrackClipId(selectedIds.at(-1));
    setSelectedSegmentIds([]);
    onSelectedSegmentChange(undefined);
  };

  const removeSelectedSegment = () => {
    if (!selectedSegment) {
      return;
    }
    removeSegments(selectedBatchSegments.length > 1 ? selectedSegmentIds : [selectedSegment.id]);
  };

  const removeSelectedTrackClip = () => {
    if (!plan || !selectedTrackClip) {
      return;
    }
    if (isTimelineTrackLocked(selectedTrackClip.trackId)) {
      return;
    }
    const selectedRemovableTrackClips =
      selectedBatchTrackClips.length > 1 &&
      selectedBatchTrackClips.every((trackClip) => !trackClip.segmentId && !isTimelineTrackLocked(trackClip.trackId))
        ? selectedBatchTrackClips
        : [];
    if (selectedRemovableTrackClips.length > 1) {
      const nextPlan = removeSmartEditTimelineElementsFromTimeline(
        plan,
        selectedRemovableTrackClips.map((trackClip) => trackClip.id),
        timelineEditMode,
      );
      if (nextPlan === plan) {
        return;
      }
      commitPlanChange(nextPlan, {
        label: `Remove selected materials (${timelineEditMode})`,
      });
      setSelectedTrackClipId(undefined);
      setSelectedTrackClipIds([]);
      setSelectedSegmentIds([]);
      onSelectedSegmentChange(undefined);
      return;
    }
    if (selectedTrackClip.trackId === "video" && selectedTrackClip.segmentId) {
      removeSegments([selectedTrackClip.segmentId]);
      return;
    }
    const nextPlan = removeSmartEditTimelineElementFromTimeline(
      plan,
      selectedTrackClip.id,
      timelineEditMode,
    );
    if (nextPlan === plan) {
      return;
    }
    commitPlanChange(nextPlan, { label: `Remove ${selectedTrackClip.trackId} material (${timelineEditMode})` });
    setSelectedTrackClipId(undefined);
    setSelectedTrackClipIds([]);
    if (selectedTrackClip.segmentId) {
      setSelectedSegmentIds([selectedTrackClip.segmentId]);
      onSelectedSegmentChange(selectedTrackClip.segmentId);
    } else {
      setSelectedSegmentIds([]);
      onSelectedSegmentChange(undefined);
    }
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
    if (!plan) {
      return;
    }
    const selectedTimelineMaterialIds = selectedBatchTrackClips
      .filter((trackClip) => !trackClip.segmentId && !isTimelineTrackLocked(trackClip.trackId))
      .map((trackClip) => trackClip.id);
    if (selectedTimelineMaterialIds.length > 0) {
      setSmartEditClipboard(copySmartEditTimelineElementsToClipboard(plan, selectedTimelineMaterialIds));
      return;
    }
    if (selectedBatchSegments.length === 0) {
      return;
    }
    setSmartEditClipboard(
      copySmartEditSegmentsToClipboard(
        plan,
        selectedBatchSegments.map((segment) => segment.id),
      ),
    );
  };

  const selectedEditableTimelineMaterialIds = () =>
    selectedBatchTrackClips
      .filter((trackClip) => !trackClip.segmentId && !isTimelineTrackLocked(trackClip.trackId))
      .map((trackClip) => trackClip.id);

  const cutSelectedTimelineMaterialsToLocalClipboard = () => {
    if (!plan) {
      return;
    }
    const selectedTimelineMaterialIds = selectedEditableTimelineMaterialIds();
    if (selectedTimelineMaterialIds.length === 0) {
      return;
    }
    const cut = cutSmartEditTimelineElementsToClipboard(
      plan,
      selectedTimelineMaterialIds,
      timelineEditMode,
    );
    if (!cut.clipboard || cut.plan === plan) {
      return;
    }
    setSmartEditClipboard(cut.clipboard);
    commitPlanChange(cut.plan, { label: `Cut selected materials (${timelineEditMode})` });
    setSelectedTrackClipId(undefined);
    setSelectedTrackClipIds([]);
  };

  const duplicateSelectedTimelineMaterials = () => {
    if (!plan) {
      return;
    }
    const selectedTimelineMaterialIds = selectedEditableTimelineMaterialIds();
    if (selectedTimelineMaterialIds.length === 0) {
      return;
    }
    const duplicateToken = `material-${Date.now()}`;
    const nextPlan = duplicateSmartEditTimelineElementsOnTimeline(
      plan,
      selectedTimelineMaterialIds,
      duplicateToken,
      timelineEditMode,
    );
    if (nextPlan === plan) {
      return;
    }
    commitPlanChange(nextPlan, { label: `Duplicate selected materials (${timelineEditMode})` });
    const duplicatedIds =
      nextPlan.timeline?.elements
        .map((element) => element.id)
        .filter((id) =>
          selectedTimelineMaterialIds.some((sourceId) => id.startsWith(`${sourceId}-${duplicateToken}-`)),
        ) ?? [];
    if (duplicatedIds.length > 0) {
      setSelectedTrackClipId(duplicatedIds[0]);
      setSelectedTrackClipIds(duplicatedIds);
    }
  };

  const updateSelectedTimelineMaterialSpeed = (playbackRate: number) => {
    if (!plan) {
      return;
    }
    const selectedTimelineMaterialIds = selectedEditableTimelineMaterialIds();
    if (selectedTimelineMaterialIds.length === 0) {
      return;
    }
    const nextPlan = updateSmartEditTimelineElementsPlaybackRate(
      plan,
      selectedTimelineMaterialIds,
      playbackRate,
    );
    if (nextPlan === plan) {
      return;
    }
    commitPlanChange(nextPlan, { label: `Set selected material speed ${clampPlaybackRate(playbackRate)}x` });
  };

  const updateSelectedTimelineMaterialState = (patch: { hidden?: boolean; muted?: boolean }) => {
    if (!plan) {
      return;
    }
    const selectedTimelineMaterialIds = selectedEditableTimelineMaterialIds();
    if (selectedTimelineMaterialIds.length === 0) {
      return;
    }
    const nextPlan = updateSmartEditTimelineElementsState(plan, selectedTimelineMaterialIds, patch);
    if (nextPlan === plan) {
      return;
    }
    const label =
      patch.muted !== undefined
        ? patch.muted
          ? "Mute selected materials"
          : "Unmute selected materials"
        : patch.hidden
          ? "Hide selected materials"
          : "Show selected materials";
    commitPlanChange(nextPlan, { label });
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
    if (smartEditClipboard.timelineItems?.length) {
      const nextPlan = pasteSmartEditTimelineClipboardAtPlayhead(
        plan,
        smartEditClipboard,
        boundedPlayheadSeconds,
        duplicateToken,
        timelineEditMode,
      );
      commitPlanChange(nextPlan, { label: `Paste copied materials (${timelineEditMode})` });
      const pastedIds = nextPlan.timeline?.elements
        .map((element) => element.id)
        .filter((id) =>
          smartEditClipboard.timelineItems?.some((item) =>
            id.startsWith(`${item.element.id}-${duplicateToken}-`),
          ),
        ) ?? [];
      if (pastedIds.length > 0) {
        setSelectedTrackClipIds(pastedIds);
        setSelectedTrackClipId(pastedIds.at(-1));
        setSelectedSegmentIds([]);
        onSelectedSegmentChange(undefined);
      }
      return;
    }
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
        if (isCommandKey && event.key.toLowerCase() === "x") {
          event.preventDefault();
          cutSelectedTimelineMaterialsToLocalClipboard();
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
          if (!selectedSegment && selectAllTimelineElements()) {
            return;
          }
          selectAllSegments();
          return;
        }
        if (!isCommandKey && event.key.toLowerCase() === "s") {
          event.preventDefault();
          splitAtPlayhead();
          return;
        }
        if (!isCommandKey && event.key.toLowerCase() === "q") {
          event.preventDefault();
          trimAtPlayhead("right");
          return;
        }
        if (!isCommandKey && event.key.toLowerCase() === "w") {
          event.preventDefault();
          trimAtPlayhead("left");
          return;
        }
        const keyboardNudgeSeconds = smartEditTimelineKeyboardNudgeSeconds(event.key, event.shiftKey);
        if (keyboardNudgeSeconds !== undefined && selectedTrackClip && !selectedTrackClip.segmentId) {
          event.preventDefault();
          moveSelectedTrackClips(keyboardNudgeSeconds);
          return;
        }
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          selectByOffset(-1);
          return;
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          selectByOffset(1);
          return;
        }
        if (event.key === "Delete" && selectedTrackClip) {
          event.preventDefault();
          removeSelectedTrackClip();
          return;
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
                      Audio volume
                      <input
                        min={0}
                        max={4}
                        step={0.05}
                        type="number"
                        value={selectedSegment.sourceAudioVolume ?? 1}
                        onChange={(event) =>
                          updateTrackClipSegment(selectedTrackClip, (segment) => ({
                            ...segment,
                            sourceAudioVolume: clampAudioVolume(Number(event.target.value)),
                          }))
                        }
                      />
                    </label>
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
                  {selectedSegment.source.sceneClipAudioUrl ? (
                    <Button icon={<Volume2 size={16} />} onClick={detachSelectedSourceAudio}>
                      Detach audio
                    </Button>
                  ) : null}
                  <div className="smart-edit-effect-keyframes">
                    <div className="smart-edit-section-header">
                      <h6>Audio volume keyframes</h6>
                      <Button onClick={() => addSegmentAudioVolumeKeyframeAtPlayhead("sourceAudio")}>
                        Add volume keyframe
                      </Button>
                    </div>
                    {audioVolumeKeyframes(
                      selectedSegment.sourceAudioVolumeKeyframes,
                      clipDurationWithinSegment(
                        selectedSegment.sourceAudioDurationSeconds,
                        selectedSegment.sourceAudioStartOffsetSeconds,
                        selectedSegment.durationSeconds,
                      ),
                    ).length > 0 ? (
                      <div className="smart-edit-mini-keyframe-list">
                        {audioVolumeKeyframes(
                          selectedSegment.sourceAudioVolumeKeyframes,
                          clipDurationWithinSegment(
                            selectedSegment.sourceAudioDurationSeconds,
                            selectedSegment.sourceAudioStartOffsetSeconds,
                            selectedSegment.durationSeconds,
                          ),
                        ).map((keyframe) => (
                          <article className="smart-edit-mini-keyframe-row" key={keyframe.id}>
                            <span>{keyframe.timeSecond.toFixed(1)}s</span>
                            <strong>{keyframe.volume.toFixed(2)}</strong>
                            <button
                              type="button"
                              onClick={() => removeSegmentAudioVolumeKeyframe("sourceAudio", keyframe.id)}
                            >
                              Delete
                            </button>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <small>No audio volume keyframes.</small>
                    )}
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
                      Voice volume
                      <input
                        min={0}
                        max={4}
                        step={0.05}
                        type="number"
                        value={selectedSegment.voiceoverVolume ?? 1}
                        onChange={(event) =>
                          updateTrackClipSegment(selectedTrackClip, (segment) => ({
                            ...segment,
                            voiceoverVolume: clampAudioVolume(Number(event.target.value)),
                          }))
                        }
                      />
                    </label>
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
                  <div className="smart-edit-effect-keyframes">
                    <div className="smart-edit-section-header">
                      <h6>Voice volume keyframes</h6>
                      <Button onClick={() => addSegmentAudioVolumeKeyframeAtPlayhead("voice")}>
                        Add volume keyframe
                      </Button>
                    </div>
                    {audioVolumeKeyframes(
                      selectedSegment.voiceoverVolumeKeyframes,
                      clipDurationWithinSegment(
                        selectedSegment.voiceoverDurationSeconds,
                        selectedSegment.voiceoverStartOffsetSeconds,
                        selectedSegment.durationSeconds,
                      ),
                    ).length > 0 ? (
                      <div className="smart-edit-mini-keyframe-list">
                        {audioVolumeKeyframes(
                          selectedSegment.voiceoverVolumeKeyframes,
                          clipDurationWithinSegment(
                            selectedSegment.voiceoverDurationSeconds,
                            selectedSegment.voiceoverStartOffsetSeconds,
                            selectedSegment.durationSeconds,
                          ),
                        ).map((keyframe) => (
                          <article className="smart-edit-mini-keyframe-row" key={keyframe.id}>
                            <span>{keyframe.timeSecond.toFixed(1)}s</span>
                            <strong>{keyframe.volume.toFixed(2)}</strong>
                            <button
                              type="button"
                              onClick={() => removeSegmentAudioVolumeKeyframe("voice", keyframe.id)}
                            >
                              Delete
                            </button>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <small>No voice volume keyframes.</small>
                    )}
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
                {selectedTimelineElement.linkedGroupId ? (
                  <small>Linked group: {selectedLinkedElements.length} clips</small>
                ) : (
                  <small>Unlinked material</small>
                )}
              </div>
              {selectedTimelineElement.kind === "video" || selectedTimelineElement.kind === "audio" ? (
                <div className="smart-edit-linked-actions">
                  {selectedTimelineElement.linkedGroupId ? (
                    <Button icon={<Unlink size={16} />} onClick={unlinkSelectedTimelineElementGroup}>
                      Unlink audio/video
                    </Button>
                  ) : (
                    <Button
                      disabled={!canRelinkSelectedTimelineElement}
                      icon={<Link size={16} />}
                      onClick={relinkSelectedTimelineElementGroup}
                    >
                      Relink scene material
                    </Button>
                  )}
                </div>
              ) : null}
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
              {selectedTimelineElement.kind === "video" || selectedTimelineElement.kind === "audio" ? (
                <div className="smart-edit-trim-grid">
                  <label>
                    Source in
                    <input
                      min={0}
                      step={0.1}
                      type="number"
                      value={selectedTimelineElement.trimStartSecond ?? 0}
                      onChange={(event) =>
                        slipSelectedTimelineElementSource(
                          Number(event.target.value) - (selectedTimelineElement.trimStartSecond ?? 0),
                        )
                      }
                    />
                  </label>
                  <label>
                    Source out
                    <input
                      readOnly
                      type="number"
                      value={
                        selectedTimelineElement.trimEndSecond ??
                        (selectedTimelineElement.trimStartSecond ?? 0) +
                          selectedTimelineElement.durationSeconds *
                            clampPlaybackRate(selectedTimelineElement.playbackRate ?? 1)
                      }
                    />
                  </label>
                  <div className="smart-edit-linked-actions">
                    <Button
                      icon={<SkipBack size={16} />}
                      onClick={() => slipSelectedTimelineElementSource(-TRIM_NUDGE_SECONDS)}
                    >
                      -0.1s
                    </Button>
                    <Button
                      icon={<SkipForward size={16} />}
                      onClick={() => slipSelectedTimelineElementSource(TRIM_NUDGE_SECONDS)}
                    >
                      +0.1s
                    </Button>
                  </div>
                </div>
              ) : null}
              {selectedTimelineElement.kind === "audio" ? (
                <>
                  <div className="smart-edit-trim-grid">
                    <label>
                      Speed
                      <input
                        min={0.25}
                        max={4}
                        step={0.25}
                        type="number"
                        value={selectedTimelineElement.playbackRate ?? 1}
                        onChange={(event) =>
                          updateSelectedTimelineElement({
                            playbackRate: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      Audio volume
                      <input
                        min={0}
                        max={4}
                        step={0.05}
                        type="number"
                        value={selectedTimelineElement.audioVolume ?? 1}
                        onChange={(event) =>
                          updateSelectedTimelineElement({
                            audioVolume: Number(event.target.value),
                          })
                        }
                      />
                    </label>
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
                  <div className="smart-edit-effect-keyframes">
                    <div className="smart-edit-section-header">
                      <h6>Audio volume keyframes</h6>
                      <Button onClick={addTimelineElementAudioVolumeKeyframeAtPlayhead}>
                        Add volume keyframe
                      </Button>
                    </div>
                    {audioVolumeKeyframes(
                      selectedTimelineElement.audioVolumeKeyframes,
                      selectedTimelineElement.durationSeconds,
                    ).length > 0 ? (
                      <div className="smart-edit-mini-keyframe-list">
                        {audioVolumeKeyframes(
                          selectedTimelineElement.audioVolumeKeyframes,
                          selectedTimelineElement.durationSeconds,
                        ).map((keyframe) => (
                          <article className="smart-edit-mini-keyframe-row" key={keyframe.id}>
                            <span>{keyframe.timeSecond.toFixed(1)}s</span>
                            <strong>{keyframe.volume.toFixed(2)}</strong>
                            <button
                              type="button"
                              onClick={() => removeTimelineElementAudioVolumeKeyframe(keyframe.id)}
                            >
                              Delete
                            </button>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <small>No audio volume keyframes.</small>
                    )}
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
              {selectedTimelineElement.kind === "text" ? (
                <div className="smart-edit-trim-grid">
                  <label>
                    Text size
                    <input
                      min={12}
                      max={72}
                      step={1}
                      type="number"
                      value={selectedTimelineElement.textFontSize ?? 42}
                      onChange={(event) =>
                        updateSelectedTimelineElement({
                          textFontSize: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    Text position
                    <input
                      min={8}
                      max={92}
                      step={1}
                      type="number"
                      value={selectedTimelineElement.textPositionYPercent ?? 12}
                      onChange={(event) =>
                        updateSelectedTimelineElement({
                          textPositionYPercent: Number(event.target.value),
                        })
                      }
                    />
                  </label>
                  <label>
                    Text color
                    <input
                      type="color"
                      value={selectedTimelineElement.textColor ?? "#ffffff"}
                      onChange={(event) =>
                        updateSelectedTimelineElement({
                          textColor: event.target.value,
                        })
                      }
                    />
                  </label>
                </div>
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
              <Button
                icon={<Trash2 size={16} />}
                onClick={removeSelectedTrackClip}
              >
                {copy.deleteTimelineElement}
              </Button>
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
                {selectedTrackClip?.trackId === "video" &&
                (selectedSegment.source.sceneClipVideoOnlyUrl || selectedSegment.source.sceneClipUrl) ? (
                  <Button icon={<Film size={16} />} onClick={detachSelectedSceneVideo}>
                    Detach video
                  </Button>
                ) : null}
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
              {ENABLE_ADVANCED_VISUAL_CONTROLS ? (
                <>
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
                </>
              ) : null}
              <section className="smart-edit-inspector-section">
                <div className="smart-edit-section-header">
                  <h4>Audio volume envelopes</h4>
                </div>
                <div className="smart-edit-trim-grid">
                  <label>
                    Source audio volume
                    <input
                      min={0}
                      max={4}
                      step={0.05}
                      type="number"
                      value={selectedSegment.sourceAudioVolume ?? 1}
                      onChange={(event) =>
                        updateSelectedSegment((segment) => ({
                          ...segment,
                          sourceAudioVolume: clampAudioVolume(Number(event.target.value)),
                        }))
                      }
                    />
                  </label>
                  <label>
                    Voice volume
                    <input
                      min={0}
                      max={4}
                      step={0.05}
                      type="number"
                      value={selectedSegment.voiceoverVolume ?? 1}
                      onChange={(event) =>
                        updateSelectedSegment((segment) => ({
                          ...segment,
                          voiceoverVolume: clampAudioVolume(Number(event.target.value)),
                        }))
                      }
                    />
                  </label>
                </div>
                <div className="smart-edit-effect-keyframes">
                  <div className="smart-edit-section-header">
                    <h6>Source audio volume keyframes</h6>
                    <Button onClick={() => addSegmentAudioVolumeKeyframeAtPlayhead("sourceAudio")}>
                      Add volume keyframe
                    </Button>
                  </div>
                  {audioVolumeKeyframes(
                    selectedSegment.sourceAudioVolumeKeyframes,
                    selectedSegment.sourceAudioDurationSeconds ?? selectedSegment.durationSeconds,
                  ).length > 0 ? (
                    <div className="smart-edit-mini-keyframe-list">
                      {audioVolumeKeyframes(
                        selectedSegment.sourceAudioVolumeKeyframes,
                        selectedSegment.sourceAudioDurationSeconds ?? selectedSegment.durationSeconds,
                      ).map((keyframe) => (
                        <article className="smart-edit-mini-keyframe-row" key={keyframe.id}>
                          <span>{keyframe.timeSecond.toFixed(1)}s</span>
                          <strong>{keyframe.volume.toFixed(2)}</strong>
                          <button
                            type="button"
                            onClick={() => removeSegmentAudioVolumeKeyframe("sourceAudio", keyframe.id)}
                          >
                            Delete
                          </button>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <small>No source audio volume keyframes.</small>
                  )}
                </div>
                <div className="smart-edit-effect-keyframes">
                  <div className="smart-edit-section-header">
                    <h6>Voice volume keyframes</h6>
                    <Button onClick={() => addSegmentAudioVolumeKeyframeAtPlayhead("voice")}>
                      Add volume keyframe
                    </Button>
                  </div>
                  {audioVolumeKeyframes(
                    selectedSegment.voiceoverVolumeKeyframes,
                    selectedSegment.voiceoverDurationSeconds ?? selectedSegment.durationSeconds,
                  ).length > 0 ? (
                    <div className="smart-edit-mini-keyframe-list">
                      {audioVolumeKeyframes(
                        selectedSegment.voiceoverVolumeKeyframes,
                        selectedSegment.voiceoverDurationSeconds ?? selectedSegment.durationSeconds,
                      ).map((keyframe) => (
                        <article className="smart-edit-mini-keyframe-row" key={keyframe.id}>
                          <span>{keyframe.timeSecond.toFixed(1)}s</span>
                          <strong>{keyframe.volume.toFixed(2)}</strong>
                          <button
                            type="button"
                            onClick={() => removeSegmentAudioVolumeKeyframe("voice", keyframe.id)}
                          >
                            Delete
                          </button>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <small>No voice volume keyframes.</small>
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
            icon={<Scissors size={16} />}
            onClick={() => trimAtPlayhead("right")}
          >
            {copy.trimLeftAtPlayhead}
          </Button>
          <Button
            disabled={!plan}
            icon={<Scissors size={16} />}
            onClick={() => trimAtPlayhead("left")}
          >
            {copy.trimRightAtPlayhead}
          </Button>
          <Button
            disabled={!plan}
            icon={<SkipBack size={16} />}
            onClick={closeGapAtPlayhead}
          >
            {copy.closeGapAtPlayhead}
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
        <details className="timeline-srt-import">
          <summary>
            <strong>Import SRT captions</strong>
            <span>{srtImportMessage ?? "Paste subtitles into the text track"}</span>
          </summary>
          <div className="timeline-srt-import-body">
            <textarea
              aria-label="SRT caption text"
              placeholder={"1\n00:00:01,000 --> 00:00:02,500\nCaption text"}
              rows={5}
              value={srtImportText}
              onChange={(event) => {
                setSrtImportText(event.target.value);
                setSrtImportMessage(undefined);
              }}
            />
            <Button
              disabled={!plan || !srtImportText.trim()}
              icon={<Plus size={16} />}
              onClick={importSrtCaptions}
            >
              Import captions
            </Button>
          </div>
        </details>
        {selectedBatchTrackClips.length > 1 ? (
          <div className="timeline-batch-toolbar" aria-label={copy.batchActions}>
            <strong>{copy.selectedCount(selectedBatchTrackClips.length)}</strong>
            <Button
              icon={<SkipBack size={16} />}
              onClick={() => moveSelectedTrackClips(-TRIM_NUDGE_SECONDS)}
            >
              -0.1s
            </Button>
            <Button
              icon={<SkipForward size={16} />}
              onClick={() => moveSelectedTrackClips(TRIM_NUDGE_SECONDS)}
            >
              +0.1s
            </Button>
            <Button icon={<Copy size={16} />} onClick={copySelectedSegmentsToLocalClipboard}>
              {copy.copySelected}
            </Button>
            <Button icon={<Scissors size={16} />} onClick={cutSelectedTimelineMaterialsToLocalClipboard}>
              {copy.cutSelected}
            </Button>
            <Button icon={<Copy size={16} />} onClick={duplicateSelectedTimelineMaterials}>
              {copy.duplicateSelected}
            </Button>
            <Button onClick={() => updateSelectedTimelineMaterialSpeed(0.5)}>0.5x</Button>
            <Button onClick={() => updateSelectedTimelineMaterialSpeed(1)}>1x</Button>
            <Button onClick={() => updateSelectedTimelineMaterialSpeed(2)}>2x</Button>
            <Button onClick={() => updateSelectedTimelineMaterialState({ muted: true })}>
              {copy.muteSelected}
            </Button>
            <Button onClick={() => updateSelectedTimelineMaterialState({ muted: false })}>
              {copy.unmuteSelected}
            </Button>
            <Button onClick={() => updateSelectedTimelineMaterialState({ hidden: true })}>
              {copy.hideSelectedMaterials}
            </Button>
            <Button onClick={() => updateSelectedTimelineMaterialState({ hidden: false })}>
              {copy.showSelectedMaterials}
            </Button>
            <Button icon={<Trash2 size={16} />} onClick={removeSelectedTrackClip}>
              {copy.deleteSelected}
            </Button>
            <Button onClick={clearMultiSelection}>{copy.clearSelection}</Button>
          </div>
        ) : selectedBatchSegments.length > 1 ? (
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
          {trackSegments.map((track) => {
            const timelineTrack = timelineTrackForTrack(track.id);
            const trackMuted = timelineTrack?.muted ?? track.segments.every((segment) => segment.muted);
            const trackHidden = timelineTrack?.hidden ?? track.segments.every((segment) => segment.hidden);
            const trackLocked = timelineTrack?.locked ?? false;
            const canMuteTrack = track.id === "sourceAudio" || track.id === "voice" || track.id === "bgm";
            const canHideTrack = track.id === "video" || track.id === "caption";
            return (
            <section
              className="smart-edit-track-row"
              data-track-id={track.id}
              key={track.id}
              aria-label={trackLabels[track.id]}
            >
              <div className="smart-edit-track-label">
                <strong>{trackLabels[track.id]}</strong>
                {canMuteTrack && track.segments.length > 0 ? (
                  <button
                    type="button"
                    onClick={() =>
                      updateTimelineTrackState(track.id, { muted: !trackMuted }, trackMuted ? "Unmute track" : "Mute track")
                    }
                  >
                    {trackMuted ? (
                      <Volume2 size={14} />
                    ) : (
                      <VolumeX size={14} />
                    )}
                    <span>
                      {trackMuted ? copy.unmuteTrack : copy.muteTrack}
                    </span>
                  </button>
                ) : null}
                {canHideTrack && track.segments.length > 0 ? (
                  <button
                    type="button"
                    onClick={() =>
                      updateTimelineTrackState(track.id, { hidden: !trackHidden }, trackHidden ? "Show track" : "Hide track")
                    }
                  >
                    {trackHidden ? (
                      <Eye size={14} />
                    ) : (
                      <EyeOff size={14} />
                    )}
                    <span>
                      {trackHidden ? copy.showCaptionTrack : copy.hideCaptionTrack}
                    </span>
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() =>
                    updateTimelineTrackState(
                      track.id,
                      { locked: !trackLocked },
                      trackLocked ? "Unlock track" : "Lock track",
                    )
                  }
                >
                  {trackLocked ? <Unlock size={14} /> : <Lock size={14} />}
                  <span>{trackLocked ? "Unlock" : "Lock"}</span>
                </button>
              </div>
              <div className="smart-edit-track-clips">
                <div
                  className={`smart-edit-track-lane ${
                    trackBoxSelectTrackIdSet.has(track.id) ? "box-selecting" : ""
                  }`.trim()}
                  style={{ width: timelineWidth }}
                  onPointerCancel={() => setTrackBoxSelectDrag(undefined)}
                  onPointerDown={(event) => startTrackBoxSelectDrag(event, track.id)}
                  onPointerMove={updateTrackBoxSelectDrag}
                  onPointerUp={finishTrackBoxSelectDrag}
                >
                  {trackBoxSelectTrackIdSet.has(track.id) && trackBoxSelectDrag ? (
                    <span
                      className="smart-edit-track-box-selection"
                      style={{
                        left: Math.min(
                          trackBoxSelectDrag.startLaneX,
                          trackBoxSelectDrag.currentLaneX,
                        ),
                        width: Math.abs(
                          trackBoxSelectDrag.currentLaneX - trackBoxSelectDrag.startLaneX,
                        ),
                      }}
                    />
                  ) : null}
                  {trackClipDragPreview
                    .filter((preview) => preview.trackId === track.id)
                    .map((preview) => (
                      <span
                        aria-hidden="true"
                        className="smart-edit-track-clip-ghost"
                        key={`ghost-${preview.id}`}
                        style={{
                          left: preview.startSecond * timelinePixelsPerSecond,
                          width: Math.max(116, preview.durationSeconds * timelinePixelsPerSecond),
                        }}
                      />
                    ))}
                  {track.segments.map((segment) => (
                    <article
                      className={`smart-edit-track-clip ${
                        segment.segmentId === selectedSegment?.id ? "active" : ""
                      } ${
                        segment.segmentId && selectedSegmentIdSet.has(segment.segmentId) ? "selected" : ""
                      } ${
                        selectedTrackClipId === segment.id ? "track-selected" : ""
                      } ${
                        selectedTrackClipIdSet.has(segment.id) && selectedTrackClipId !== segment.id
                          ? "track-multi-selected"
                          : ""
                      } ${
                        trackClipMoveDrag?.trackClip.id === segment.id ? "moving" : ""
                      } ${
                        trackClipTrimDrag?.trackClip.id === segment.id ? "trimming" : ""
                      } ${segment.muted ? "muted" : ""} ${segment.hidden ? "hidden" : ""} ${
                        trackLocked ? "locked" : ""
                      }`.trim()}
                      key={segment.id}
                      role="button"
                      style={{
                        left: segment.startSecond * timelinePixelsPerSecond,
                        width: Math.max(116, segment.durationSeconds * timelinePixelsPerSecond),
                      }}
                      tabIndex={0}
                      onClick={(event) => {
                        if (suppressTimelineMoveClickRef.current) {
                          return;
                        }
                        selectTrackClip(segment, event);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          selectTrackClip(segment);
                        }
                      }}
                      onPointerCancel={() => {
                        setTrackClipMoveDrag(undefined);
                        setTrackClipTrimDrag(undefined);
                      }}
                      onPointerDown={(event) => startTrackClipMoveDrag(event, segment)}
                      onPointerMove={updateTrackClipMoveDrag}
                      onPointerUp={finishTrackClipMoveDrag}
                    >
                      {segment.trackId !== "bgm" ? (
                        <button
                          aria-label={`Trim ${trackLabels[track.id]} in`}
                          className={`smart-edit-track-trim-handle left ${
                            trackClipTrimDrag?.trackClip.id === segment.id &&
                            trackClipTrimDrag.edge === "in"
                              ? "dragging"
                              : ""
                          }`.trim()}
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            if (suppressTimelineMoveClickRef.current) {
                              return;
                            }
                            trimTrackClipEdge(segment, "in", TRIM_NUDGE_SECONDS);
                          }}
                          onDragStart={(event) => event.preventDefault()}
                          onPointerCancel={() => setTrackClipTrimDrag(undefined)}
                          onPointerDown={(event) => startTrackClipTrimDrag(event, segment, "in")}
                          onPointerUp={finishTrackClipTrimDrag}
                        />
                      ) : null}
                      <span>{segment.range}</span>
                      <b>{segment.title}</b>
                      {segment.waveform ? <SmartEditWaveformStrip segment={segment} /> : null}
                      <small>{segment.meta}</small>
                      {segment.trackId !== "bgm" ? (
                        <button
                          aria-label={`Trim ${trackLabels[track.id]} out`}
                          className={`smart-edit-track-trim-handle right ${
                            trackClipTrimDrag?.trackClip.id === segment.id &&
                            trackClipTrimDrag.edge === "out"
                              ? "dragging"
                              : ""
                          }`.trim()}
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            if (suppressTimelineMoveClickRef.current) {
                              return;
                            }
                            trimTrackClipEdge(segment, "out", -TRIM_NUDGE_SECONDS);
                          }}
                          onDragStart={(event) => event.preventDefault()}
                          onPointerCancel={() => setTrackClipTrimDrag(undefined)}
                          onPointerDown={(event) => startTrackClipTrimDrag(event, segment, "out")}
                          onPointerUp={finishTrackClipTrimDrag}
                        />
                      ) : null}
                    </article>
                  ))}
                </div>
              </div>
            </section>
            );
          })}
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
