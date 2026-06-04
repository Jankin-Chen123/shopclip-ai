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
  Math.round(seconds / TIMELINE_SNAP_SECONDS) * TIMELINE_SNAP_SECONDS;

const planDurationSeconds = (segments: SmartEditSegment[]): number =>
  Math.min(
    600,
    Math.max(
      1,
      segments
        .filter((segment) => segment.enabled)
        .reduce((sum, segment) => sum + segment.durationSeconds, 0),
    ),
  );

const buildSmartEditTimeline = (plan: SmartEditPlan): SmartEditTimeline => {
  const enabledSegments = [...plan.segments]
    .filter((segment) => segment.enabled)
    .sort((left, right) => left.order - right.order);
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
    const startSecond = cursor;
    const durationSeconds = segment.durationSeconds;
    const sourceStart = segment.source.startSecond ?? 0;
    const sourceEnd = segment.source.endSecond;
    cursor += durationSeconds;
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

type SmartEditTrackId = "video" | "caption" | "sourceAudio" | "voice" | "bgm";

type SmartEditTrackSegment = {
  id: string;
  segmentId?: string;
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
          title: clip.material?.text || clip.subtitle,
        })),
      },
    ];
  }

  const enabledSegments = [...plan.segments]
    .filter((segment) => segment.enabled)
    .sort((left, right) => left.order - right.order);

  let cursor = 0;
  const timedSegments = enabledSegments.map((segment) => {
    const startSecond = cursor;
    cursor += segment.durationSeconds;
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
    }));
  const tracks: SmartEditTrack[] = [
    { id: "video", segments: videoSegments },
    { id: "caption", segments: captionSegments },
    { id: "voice", segments: voiceSegments },
  ];

  if (plan.audio.bgmTrack !== "none") {
    tracks.push({
      id: "bgm",
      segments: [
        {
          id: "bgm-bed",
          title: plan.audio.bgmTrack,
          range: timelineRangeLabel(0, cursor),
          meta: plan.audio.targetLanguage ?? "project audio",
          durationSeconds: Math.max(1, cursor),
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
  const [draggedSegmentId, setDraggedSegmentId] = useState<string | undefined>();
  const [historyPlanId, setHistoryPlanId] = useState<string | undefined>();
  const [redoStack, setRedoStack] = useState<SmartEditPlan[]>([]);
  const [selectedSegmentIds, setSelectedSegmentIds] = useState<string[]>([]);
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
  const timelineDurationSeconds = Math.max(1, enabledDurationSeconds);
  const boundedPlayheadSeconds = Math.min(playheadSeconds, timelineDurationSeconds);
  const timelinePixelsPerSecond = TIMELINE_BASE_PX_PER_SECOND * timelineZoom;
  const timelineWidth = Math.max(720, timelineDurationSeconds * timelinePixelsPerSecond);
  const rulerTicks = useMemo(
    () => timelineRulerTicks(timelineDurationSeconds),
    [timelineDurationSeconds],
  );
  const timedTimelineSegments = useMemo(() => {
    let cursor = 0;
    return sortedSegments.map((segment) => {
      const startSecond = cursor;
      if (segment.enabled) {
        cursor += segment.durationSeconds;
      }
      return {
        segment,
        startSecond,
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
      onSelectedSegmentChange(segmentId);
      return;
    }
    setSelectedSegmentIds([segmentId]);
    onSelectedSegmentChange(segmentId);
  };

  const selectAllSegments = () => {
    if (sortedSegments.length === 0) {
      return;
    }
    setSelectedSegmentIds(sortedSegments.map((segment) => segment.id));
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
      source:
        sourceMid !== undefined
          ? { ...selectedSegment.source, startSecond: sourceMid, endSecond: sourceEnd }
          : selectedSegment.source,
      subtitle: `${selectedSegment.subtitle} (split)`,
    };
    sorted.splice(index, 1, firstSegment, secondSegment);
    commitPlanChange(withRebuiltTimeline({
      ...plan,
      segments: sorted.map((segment, segmentIndex) => ({
        ...segment,
        order: segmentIndex + 1,
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
        source: {
          ...targetSegment.source,
          endSecond: sourceEnd,
          startSecond: sourceMid,
        },
        subtitle: `${targetSegment.subtitle} (split)`,
      },
    );
    commitPlanChange(withRebuiltTimeline({
      ...plan,
      segments: sorted.map((segment, segmentIndex) => ({
        ...segment,
        order: segmentIndex + 1,
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

  const removeSelectedSegment = () => {
    if (!selectedSegment) {
      return;
    }
    removeSegments(selectedBatchSegments.length > 1 ? selectedSegmentIds : [selectedSegment.id]);
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
                    segment.enabled ? "" : "disabled"
                  }`.trim()}
                  draggable
                  key={segment.id}
                  role="button"
                  style={{
                    width: Math.max(96, segment.durationSeconds * timelinePixelsPerSecond),
                  }}
                  tabIndex={0}
                  onClick={(event) => selectTimelineSegment(segment.id, event)}
                  onDragEnd={() => setDraggedSegmentId(undefined)}
                  onDragOver={(event) => event.preventDefault()}
                  onDragStart={() => setDraggedSegmentId(segment.id)}
                  onDrop={() => {
                    if (!plan || !draggedSegmentId || draggedSegmentId === segment.id) {
                      return;
                    }
                    const sorted = [...plan.segments].sort((left, right) => left.order - right.order);
                    const from = sorted.findIndex((candidate) => candidate.id === draggedSegmentId);
                    const to = sorted.findIndex((candidate) => candidate.id === segment.id);
                    if (from < 0 || to < 0) {
                      return;
                    }
                    const [moved] = sorted.splice(from, 1);
                    sorted.splice(to, 0, moved!);
                    commitPlanChange(withRebuiltTimeline({
                      ...plan,
                      segments: sorted.map((candidate, index) => ({
                        ...candidate,
                        order: index + 1,
                      })),
                    }));
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      selectTimelineSegment(segment.id);
                    }
                  }}
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
                    } ${segment.muted ? "muted" : ""} ${segment.hidden ? "hidden" : ""}`.trim()}
                    key={segment.id}
                    role={segment.segmentId ? "button" : undefined}
                    style={{ flexGrow: Math.max(1, segment.durationSeconds) }}
                    tabIndex={segment.segmentId ? 0 : undefined}
                    onClick={() => {
                      if (segment.segmentId) {
                        selectTimelineSegment(segment.segmentId);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (segment.segmentId && (event.key === "Enter" || event.key === " ")) {
                        event.preventDefault();
                        selectTimelineSegment(segment.segmentId);
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
