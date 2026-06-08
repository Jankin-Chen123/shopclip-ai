import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent as ReactDragEvent } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { UIEvent as ReactUIEvent } from "react";
import type {
  AssetMetadata,
  AssetSlice,
  MediaSettings,
  RenderTask,
  SmartEditPlan,
  SmartEditResult,
  SmartEditSegment,
  SmartEditVisualEffect,
  TraceEvent,
} from "@shopclip/shared";
import type { AppCopy } from "../../app/i18n";
import {
  audioVolumeKeyframes,
  defaultVisualEffectAmount,
  effectsForSegment,
  previewMediaForSegment,
  sourceLabel,
  transformForSegment,
  trimSegmentSource,
  visualEffectKeyframes,
  visualEffectLabel,
  visualEffectsForSegment,
  visualKeyframesForSegment,
  type SmartEditVisualEffectType,
} from "./SmartEditSegmentUtils";
import {
  materializableSmartEditSegments,
  selectSmartEditSegment,
  selectedSmartEditSegmentIndex,
  selectSmartEditSegmentsById,
  selectSmartEditSegmentIdsWithToken,
  smartEditEnabledDurationSeconds,
  smartEditSelectedSourceLabel,
  smartEditTimelineDurationSeconds,
  sortSmartEditPlanSegments,
} from "./SmartEditSegmentDerivedState";
import {
  selectSmartEditTrackIdsInMarquee,
  smartEditSyncedScrollLeft,
  type SmartEditTrackId,
} from "./SmartEditTrackUtils";
import { SmartEditInspectorPanel } from "./SmartEditInspectorPanel";
import { SmartEditLegacySegmentTimeline } from "./SmartEditLegacySegmentTimeline";
import { SmartEditTimelineBatchToolbar } from "./SmartEditTimelineBatchToolbar";
import { SmartEditAssetTabRail } from "./SmartEditAssetTabRail";
import {
  SmartEditAssetBin,
  type SmartEditAssetTab,
} from "./SmartEditAssetBin";
import { SmartEditEditorChrome } from "./SmartEditEditorChrome";
import { SmartEditPreviewPane } from "./SmartEditPreviewPane";
import { SmartEditStatusStrip } from "./SmartEditStatusStrip";
import { SmartEditSrtCaptionControls } from "./SmartEditSrtCaptionControls";
import { SmartEditTimelineSection } from "./SmartEditTimelineSection";
import { SmartEditTrackStack } from "./SmartEditTrackStack";
import {
  buildSmartEditTrackClipDragPreview,
  buildSmartEditTrackClipTrimPreview,
  buildSmartEditTrackEditPoints,
  canRelinkSmartEditTimelineElement,
  findSmartEditTrackClip,
  findSelectedSmartEditTimelineElement,
  isSmartEditTimelineTrackLocked,
  isSmartEditTextTimelineMaterial,
  linkedSmartEditTimelineElements,
  selectEditableSmartEditTimelineMaterialIds,
  selectSmartEditTimelineElementIdsWithToken,
  selectSmartEditTimelineTextMaterialIds,
  selectSmartEditTrackClipIdsAtSecond,
  selectSmartEditTrackClipsById,
  selectSplitSmartEditTextElementIds,
  smartEditTimelineTextLineCount,
  smartEditTimelineTrackIdForTrack,
  smartEditTrackPresentationState,
} from "./SmartEditTrackDerivedState";
import {
  SmartEditTimelineToolbar,
  type SmartEditTimelineToolbarActions,
  type SmartEditTimelineToolbarState,
} from "./SmartEditTimelineToolbar";
import { useSmartEditTimelinePanelResize } from "./useSmartEditTimelinePanelResize";
import {
  addSmartEditTimelineElementsAudioVolumeKeyframeAtPlayhead,
  addSmartEditTimelineMediaElement,
  addSmartEditTimelineTextElement,
  addSmartEditTimelineVoiceElement,
  applySmartEditCommandHistoryRedo,
  applySmartEditCommandHistoryUndo,
  closeSmartEditTimelineGapAtPlayhead,
  copySmartEditSegmentsToClipboard,
  copySmartEditTimelineElementsToClipboard,
  createSmartEditCommandHistory,
  cutSmartEditTimelineElementsInRange,
  cutSmartEditTimelineElementsToClipboard,
  detachSmartEditSceneVideoToTimelineElement,
  detachSmartEditSourceAudioToTimelineElement,
  duplicateSmartEditSegmentOnTimeline,
  duplicateSmartEditSegmentsOnTimeline,
  duplicateSmartEditTimelineElementsOnTimeline,
  materializeSmartEditRenderedSegmentsToTimelineElements,
  mergeSmartEditTimelineTextElements,
  moveSmartEditSegmentOnTimelineWithMode,
  moveSmartEditTimelineElementsOnTimeline,
  moveSmartEditTrackClipOnTimeline,
  normalizedSmartEditPreviewRange,
  pasteSmartEditClipboardAtPlayhead,
  pasteSmartEditSegmentsAtPlayhead,
  pasteSmartEditTimelineClipboardAtPlayhead,
  previewSmartEditTrackClipTrimDrag,
  relinkSmartEditTimelineElementWithSceneMate,
  removeSmartEditSegmentsFromTimeline,
  removeSmartEditTimelineElementFromTimeline,
  removeSmartEditTimelineElementsFromTimeline,
  reorderSegments,
  replaceSegment,
  resizeSmartEditTimelineElementsEdge,
  resizeSmartEditTrackClipEdge,
  selectSmartEditTimelineElementIds,
  selectSmartEditTimelineElementIdsForTrack,
  selectSmartEditTimelineElementIdsInBox,
  selectSmartEditTrackClipIdsInRange,
  segmentTimelineBaseStart,
  slipSmartEditTimelineElementSource,
  slipSmartEditTimelineElementsSource,
  splitSmartEditSegmentOnTimeline,
  splitSmartEditTimelineElementAtPlayhead,
  splitSmartEditTimelineElementsAtPlayhead,
  splitSmartEditTimelineTextElementByLines,
  timelineStartsForSegments,
  timelineTrackSegments,
  trimSmartEditSegmentAtPlayhead,
  trimSmartEditTimelineElementAtPlayhead,
  trimSmartEditTimelineElementsAtPlayhead,
  unlinkSmartEditTimelineElementGroup,
  updateSmartEditTimelineElement,
  updateSmartEditTimelineElementsAudioProperties,
  updateSmartEditTimelineElementsPlaybackRate,
  updateSmartEditTimelineElementsState,
  updateSmartEditTimelineElementsTextStyle,
  updateSmartEditTimelineTrack,
  withRebuiltTimeline,
  type PlayheadDragState,
  type SmartEditClipboard,
  type SmartEditCommandHistory,
  type SmartEditTimelineEditMode,
  type SmartEditTimelineElementPatch,
  type SmartEditTimelineTrackPatch,
  type SmartEditTrack,
  type SmartEditTrackSegment,
  type TimelineMoveDragState,
  type TimelinePreviewRangeState,
  type TrackBoxSelectDragState,
  type TrackClipMoveDragState,
  type TrackClipTrimDragState,
  type TrimDragState,
} from "./SmartEditTimelineOperations";
import {
  MIN_SMART_EDIT_CLIP_SECONDS,
  TIMELINE_BASE_PX_PER_SECOND,
  TIMELINE_SNAP_SECONDS,
  clampAudioVolume,
  clampPercentOffset,
  clampPlaybackRate,
  clampSmartEditDuration,
  clampTimelineStart,
  clampVisualKeyframeTime,
  clipDurationWithinSegment,
  formatTimelineTime,
  playheadSecondsFromTimelinePointer,
  snapTimelineSeconds,
  timelineRulerTicks,
} from "./SmartEditTimelineMath";
import { useSmartEditSrtCaptions } from "./useSmartEditSrtCaptions";
import { handleSmartEditKeyboardShortcut } from "./SmartEditKeyboardShortcuts";

export {
  playheadSecondsFromTimelinePointer,
  smartEditTimelineKeyboardNudgeSeconds,
} from "./SmartEditTimelineMath";
export {
  selectSmartEditTrackIdsInMarquee,
  smartEditSyncedScrollLeft,
} from "./SmartEditTrackUtils";

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

const ENABLE_ADVANCED_VISUAL_CONTROLS = false;

type SmartEditTimelineBookmark = {
  id: string;
  label: string;
  second: number;
};

type SmartEditContextMenuState = {
  clipId?: string;
  segmentId?: string;
  x: number;
  y: number;
};

export {
  addSmartEditTimelineElementsAudioVolumeKeyframeAtPlayhead,
  addSmartEditTimelineMediaElement,
  addSmartEditTimelineTextElement,
  addSmartEditTimelineVoiceElement,
  applySmartEditCommandHistoryRedo,
  applySmartEditCommandHistoryUndo,
  closeSmartEditTimelineGapAtPlayhead,
  copySmartEditSegmentsToClipboard,
  copySmartEditTimelineElementsToClipboard,
  createSmartEditCommandHistory,
  cutSmartEditTimelineElementsInRange,
  cutSmartEditTimelineElementsToClipboard,
  detachSmartEditSceneVideoToTimelineElement,
  detachSmartEditSourceAudioToTimelineElement,
  duplicateSmartEditSegmentOnTimeline,
  duplicateSmartEditSegmentsOnTimeline,
  duplicateSmartEditTimelineElementsOnTimeline,
  exportSmartEditTimelineCaptionsToSrt,
  importSmartEditSrtCaptionsToTimeline,
  materializeSmartEditRenderedSegmentsToTimelineElements,
  mergeSmartEditTimelineTextElements,
  moveSmartEditSegmentOnTimeline,
  moveSmartEditSegmentOnTimelineWithMode,
  moveSmartEditTimelineElementsOnTimeline,
  moveSmartEditTrackClipOnTimeline,
  normalizedSmartEditPreviewRange,
  pasteSmartEditClipboardAtPlayhead,
  pasteSmartEditSegmentsAtPlayhead,
  pasteSmartEditTimelineClipboardAtPlayhead,
  previewSmartEditTrackClipDrag,
  previewSmartEditTrackClipTrimDrag,
  relinkSmartEditTimelineElementWithSceneMate,
  relinkSmartEditTimelineElements,
  removeSmartEditSegmentsFromTimeline,
  removeSmartEditTimelineElementFromTimeline,
  removeSmartEditTimelineElementsFromTimeline,
  resizeSmartEditTimelineElementsEdge,
  resizeSmartEditTrackClipEdge,
  selectSmartEditTimelineElementIds,
  selectSmartEditTimelineElementIdsForTrack,
  selectSmartEditTimelineElementIdsInBox,
  selectSmartEditTrackClipIdsInRange,
  slipSmartEditTimelineElementSource,
  slipSmartEditTimelineElementsSource,
  splitSmartEditSegmentOnTimeline,
  splitSmartEditTimelineElementAtPlayhead,
  splitSmartEditTimelineElementsAtPlayhead,
  splitSmartEditTimelineTextElementByLines,
  trimSmartEditSegmentAtPlayhead,
  trimSmartEditTimelineElementAtPlayhead,
  trimSmartEditTimelineElementsAtPlayhead,
  unlinkSmartEditTimelineElementGroup,
  updateSmartEditTimelineElement,
  updateSmartEditTimelineElementsAudioProperties,
  updateSmartEditTimelineElementsPlaybackRate,
  updateSmartEditTimelineElementsState,
  updateSmartEditTimelineElementsTextStyle,
  updateSmartEditTimelineTrack,
} from "./SmartEditTimelineOperations";

export const SmartEditPanel = ({
  assets,
  assetSlices,
  copy,
  error,
  isEditing,
  isRefreshing,
  mediaSettings,
  onMediaSettingsChange,
  onPlanChange,
  onSelectedSegmentChange,
  renderTask,
  result,
  selectedSegmentId,
}: SmartEditPanelProps) => {
  const previewRef = useRef<HTMLVideoElement | null>(null);
  const suppressTrimClickRef = useRef(false);
  const suppressTimelineMoveClickRef = useRef(false);
  const isSyncingTrackScrollRef = useRef(false);
  const mainTimelineScrollRef = useRef<HTMLDivElement | null>(null);
  const trackScrollRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [historyPlanId, setHistoryPlanId] = useState<string | undefined>();
  const [commandHistory, setCommandHistory] = useState<SmartEditCommandHistory>(() =>
    createSmartEditCommandHistory(),
  );
  const [selectedSegmentIds, setSelectedSegmentIds] = useState<string[]>([]);
  const [selectedTrackClipId, setSelectedTrackClipId] = useState<string | undefined>();
  const [selectedTrackClipIds, setSelectedTrackClipIds] = useState<string[]>([]);
  const [smartEditClipboard, setSmartEditClipboard] = useState<SmartEditClipboard | undefined>();
  const [activeAssetTab, setActiveAssetTab] = useState<SmartEditAssetTab>("media");
  const [trackClipMoveDrag, setTrackClipMoveDrag] = useState<TrackClipMoveDragState | undefined>();
  const [trackClipTrimDrag, setTrackClipTrimDrag] = useState<TrackClipTrimDragState | undefined>();
  const [playheadDrag, setPlayheadDrag] = useState<PlayheadDragState | undefined>();
  const [trackBoxSelectDrag, setTrackBoxSelectDrag] = useState<TrackBoxSelectDragState | undefined>();
  const [timelineMoveDrag, setTimelineMoveDrag] = useState<TimelineMoveDragState | undefined>();
  const [timelineEditMode, setTimelineEditMode] = useState<SmartEditTimelineEditMode>("magnetic");
  const [trimDrag, setTrimDrag] = useState<TrimDragState | undefined>();
  const [playheadSeconds, setPlayheadSeconds] = useState(0);
  const [previewRange, setPreviewRange] = useState<TimelinePreviewRangeState>({});
  const [previewRangeLoopEnabled, setPreviewRangeLoopEnabled] = useState(false);
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [timelineBookmarks, setTimelineBookmarks] = useState<SmartEditTimelineBookmark[]>([]);
  const [timelineContextMenu, setTimelineContextMenu] = useState<SmartEditContextMenuState | undefined>();
  const [timelineDropPreviewSecond, setTimelineDropPreviewSecond] = useState<number | undefined>();
  const { isPanelResizing, startPanelResize, timelinePanelHeight } =
    useSmartEditTimelinePanelResize();
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
      setPlayheadDrag(undefined);
      setTrackBoxSelectDrag(undefined);
      setTimelineMoveDrag(undefined);
      setTrimDrag(undefined);
      setTimelineBookmarks([]);
      setTimelineContextMenu(undefined);
      setTimelineDropPreviewSecond(undefined);
      setSmartEditClipboard(undefined);
      setPlayheadSeconds(0);
      setPreviewRange({});
      setPreviewRangeLoopEnabled(false);
      resetSrtCaptionsState();
    }
  }, [historyPlanId, plan?.id]);
  const sortedSegments = useMemo(
    () => sortSmartEditPlanSegments(plan),
    [plan],
  );
  const selectedSegment = selectSmartEditSegment(sortedSegments, selectedSegmentId);
  const materializableSegments = useMemo(
    () => materializableSmartEditSegments(sortedSegments),
    [sortedSegments],
  );
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
  const enabledDurationSeconds = smartEditEnabledDurationSeconds(sortedSegments);
  const timelineDurationSeconds = smartEditTimelineDurationSeconds(sortedSegments);
  const boundedPlayheadSeconds = Math.min(playheadSeconds, timelineDurationSeconds);
  const timelinePixelsPerSecond = TIMELINE_BASE_PX_PER_SECOND * timelineZoom;
  const timelineWidth = Math.max(720, timelineDurationSeconds * timelinePixelsPerSecond);
  const normalizedPreviewRange = useMemo(
    () => normalizedSmartEditPreviewRange(previewRange, timelineDurationSeconds),
    [previewRange, timelineDurationSeconds],
  );
  const previewRangeLabel = normalizedPreviewRange
    ? `${formatTimelineTime(normalizedPreviewRange.startSecond)}-${formatTimelineTime(normalizedPreviewRange.endSecond)}`
    : copy.previewRangeNotSet;
  const setPreviewCurrentTime = (seconds: number) => {
    const preview = previewRef.current;
    if (!preview || !Number.isFinite(preview.duration)) {
      return;
    }
    const nextTime = Math.max(0, Math.min(seconds, preview.duration));
    if (Math.abs(preview.currentTime - nextTime) > 0.05) {
      preview.currentTime = nextTime;
    }
  };
  const scrollContainerPlayheadIntoView = (
    container: HTMLDivElement | null,
    seconds: number,
  ) => {
    if (!container || container.clientWidth <= 0 || container.scrollWidth <= container.clientWidth) {
      return;
    }
    const playheadX = seconds * timelinePixelsPerSecond;
    const guard = Math.min(180, Math.max(80, container.clientWidth * 0.24));
    const visibleStart = container.scrollLeft + guard;
    const visibleEnd = container.scrollLeft + container.clientWidth - guard;
    if (playheadX >= visibleStart && playheadX <= visibleEnd) {
      return;
    }
    const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth);
    const nextScrollLeft = Math.max(
      0,
      Math.min(playheadX - container.clientWidth / 2, maxScrollLeft),
    );
    if (Math.abs(container.scrollLeft - nextScrollLeft) > 1) {
      container.scrollLeft = nextScrollLeft;
    }
  };
  const scrollPlayheadIntoView = (seconds: number) => {
    window.requestAnimationFrame(() => {
      scrollContainerPlayheadIntoView(mainTimelineScrollRef.current, seconds);
      for (const container of trackScrollRefs.current) {
        scrollContainerPlayheadIntoView(container, seconds);
      }
    });
  };
  const setPlayheadAndSeekPreview = (seconds: number) => {
    const nextSecond = Math.min(timelineDurationSeconds, Math.max(0, snapTimelineSeconds(seconds)));
    setPlayheadSeconds(nextSecond);
    setPreviewCurrentTime(nextSecond);
    scrollPlayheadIntoView(nextSecond);
  };
  const setPlayheadFromPreviewTime = (seconds: number) => {
    const nextSecond = Math.min(timelineDurationSeconds, Math.max(0, snapTimelineSeconds(seconds)));
    setPlayheadSeconds((current) =>
      Math.abs(current - nextSecond) > 0.05 ? nextSecond : current,
    );
    scrollPlayheadIntoView(nextSecond);
  };
  const selectedTransform = selectedSegment ? transformForSegment(selectedSegment) : undefined;
  const addTimelineBookmarkAtPlayhead = () => {
    const second = snapTimelineSeconds(boundedPlayheadSeconds);
    setTimelineBookmarks((current) => {
      if (current.some((bookmark) => Math.abs(bookmark.second - second) < TIMELINE_SNAP_SECONDS)) {
        return current;
      }
      return [
        ...current,
        {
          id: `bookmark-${Date.now()}`,
          label: formatTimelineTime(second),
          second,
        },
      ].sort((left, right) => left.second - right.second);
    });
  };
  const removeNearestTimelineBookmark = () => {
    setTimelineBookmarks((current) => {
      if (current.length === 0) {
        return current;
      }
      const nearest = current.reduce((closest, bookmark) =>
        Math.abs(bookmark.second - boundedPlayheadSeconds) < Math.abs(closest.second - boundedPlayheadSeconds)
          ? bookmark
          : closest,
      );
      return current.filter((bookmark) => bookmark.id !== nearest.id);
    });
  };
  const openTimelineContextMenu = (
    event: ReactMouseEvent,
    params: { clipId?: string; segmentId?: string } = {},
  ) => {
    event.preventDefault();
    if (params.clipId) {
      setSelectedTrackClipId(params.clipId);
      setSelectedTrackClipIds([params.clipId]);
    }
    if (params.segmentId) {
      setSelectedSegmentIds([params.segmentId]);
      onSelectedSegmentChange(params.segmentId);
    }
    setTimelineContextMenu({
      ...params,
      x: event.clientX,
      y: event.clientY,
    });
  };
  const closeTimelineContextMenu = () => setTimelineContextMenu(undefined);
  const nudgeSelectedTransform = (delta: { offsetXPercent?: number; offsetYPercent?: number }) => {
    updateSelectedSegment((segment) => {
      const transform = transformForSegment(segment);
      return {
        ...segment,
        transform: {
          ...transform,
          offsetXPercent: clampPercentOffset(transform.offsetXPercent + (delta.offsetXPercent ?? 0)),
          offsetYPercent: clampPercentOffset(transform.offsetYPercent + (delta.offsetYPercent ?? 0)),
        },
      };
    });
  };
  const assetDropSecondForEvent = (event: ReactDragEvent<HTMLElement>): number => {
    const stackElement = event.currentTarget.closest(".smart-edit-track-stack") as HTMLElement | null;
    const targetElement = stackElement?.querySelector(".smart-edit-track-clips") as HTMLElement | null;
    const rect = targetElement?.getBoundingClientRect();
    if (!rect || !Number.isFinite(rect.left)) {
      return boundedPlayheadSeconds;
    }
    const x = Math.max(0, event.clientX - rect.left + (targetElement?.scrollLeft ?? 0));
    return clampTimelineStart(snapTimelineSeconds(x / timelinePixelsPerSecond));
  };
  const handleAssetDragStart = (event: ReactDragEvent, assetId: string) => {
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData("application/x-shopclip-asset-id", assetId);
    event.dataTransfer.setData("text/plain", assetId);
  };
  const handleTimelineAssetDragOver = (event: ReactDragEvent<HTMLElement>) => {
    if (!event.dataTransfer.types.includes("application/x-shopclip-asset-id")) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setTimelineDropPreviewSecond(assetDropSecondForEvent(event));
  };
  const handleTimelineAssetDrop = (event: ReactDragEvent<HTMLElement>) => {
    const assetId = event.dataTransfer.getData("application/x-shopclip-asset-id");
    if (!assetId || !plan) {
      return;
    }
    const asset = assets.find((candidate) => candidate.id === assetId);
    if (!asset) {
      return;
    }
    event.preventDefault();
    const dropSecond = assetDropSecondForEvent(event);
    const nextPlan = addSmartEditTimelineMediaElement(plan, asset, dropSecond);
    if (nextPlan === plan) {
      return;
    }
    const addedElement = nextPlan.timeline?.elements.at(-1);
    commitPlanChange(nextPlan, { label: "Drop media asset" });
    if (addedElement) {
      selectTimelineMaterialIds([addedElement.id]);
    }
    setPlayheadAndSeekPreview(dropSecond);
    setTimelineDropPreviewSecond(undefined);
  };
  const togglePreviewPlayback = (): boolean => {
    const preview = previewRef.current;
    if (!preview) {
      return false;
    }
    if (preview.paused) {
      const range = normalizedPreviewRange;
      const startSecond =
        range &&
        (boundedPlayheadSeconds < range.startSecond - 0.001 ||
          boundedPlayheadSeconds >= range.endSecond - 0.001)
          ? range.startSecond
          : boundedPlayheadSeconds;
      setPlayheadSeconds(startSecond);
      setPreviewCurrentTime(startSecond);
      void preview.play();
    } else {
      preview.pause();
    }
    return true;
  };
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
  const selectedSegmentIndex = selectedSmartEditSegmentIndex(sortedSegments, selectedSegment);
  const selectedSourceLabel = smartEditSelectedSourceLabel(selectedSegment, assets);
  const selectedSegmentIdSet = useMemo(() => new Set(selectedSegmentIds), [selectedSegmentIds]);
  const selectedBatchSegments = selectSmartEditSegmentsById(
    sortedSegments,
    selectedSegmentIdSet,
  );
  const audioLabel = plan?.audio.bgmTrack ?? mediaSettings.bgmTrack;
  const trackSegments = useMemo(
    () => timelineTrackSegments(plan, assets, renderTask),
    [assets, plan, renderTask],
  );
  const trackEditPoints = useMemo(
    () => buildSmartEditTrackEditPoints(timelineDurationSeconds, trackSegments),
    [timelineDurationSeconds, trackSegments],
  );
  const selectedTrackClip = useMemo(
    () => findSmartEditTrackClip(trackSegments, selectedTrackClipId),
    [selectedTrackClipId, trackSegments],
  );
  const selectedTrackClipIdSet = useMemo(
    () => new Set(selectedTrackClipIds),
    [selectedTrackClipIds],
  );
  const selectedBatchTrackClips = useMemo(
    () => selectSmartEditTrackClipsById(trackSegments, selectedTrackClipIdSet),
    [selectedTrackClipIdSet, trackSegments],
  );
  const hasSelectedTextTimelineMaterials = selectedBatchTrackClips.some(
    isSmartEditTextTimelineMaterial,
  );
  const selectedTextTimelineMaterialCount = selectedBatchTrackClips.filter(
    isSmartEditTextTimelineMaterial,
  ).length;
  const trackClipDragPreview = useMemo(
    () =>
      buildSmartEditTrackClipDragPreview({
        boundedPlayheadSeconds,
        selectedTrackClipIdSet,
        selectedTrackClipIds,
        timelinePixelsPerSecond,
        trackClipMoveDrag,
        trackSegments,
      }),
    [boundedPlayheadSeconds, selectedTrackClipIdSet, selectedTrackClipIds, timelinePixelsPerSecond, trackClipMoveDrag, trackSegments],
  );
  const trackClipTrimPreview = useMemo(
    () =>
      buildSmartEditTrackClipTrimPreview({
        boundedPlayheadSeconds,
        selectedBatchTrackClips,
        selectedTrackClipIdSet,
        selectedTrackClipIds,
        timelinePixelsPerSecond,
        trackClipTrimDrag,
        trackSegments,
      }),
    [
      boundedPlayheadSeconds,
      selectedBatchTrackClips,
      selectedTrackClipIdSet,
      selectedTrackClipIds,
      timelinePixelsPerSecond,
      trackClipTrimDrag,
      trackSegments,
    ],
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
    () => findSelectedSmartEditTimelineElement(plan, selectedTrackClip),
    [plan, selectedTrackClip],
  );
  const selectedTimelineTextLineCount = smartEditTimelineTextLineCount(selectedTimelineElement);
  const selectedLinkedElements = useMemo(
    () => linkedSmartEditTimelineElements(plan, selectedTimelineElement),
    [plan, selectedTimelineElement],
  );
  const canRelinkSelectedTimelineElement = useMemo(
    () => canRelinkSmartEditTimelineElement(plan, selectedTimelineElement),
    [plan, selectedTimelineElement],
  );
  const trackLabels = {
    bgm: copy.bgmTrack,
    caption: copy.captionTrack,
    sourceAudio: copy.sourceAudioTrack,
    video: copy.videoTrack,
    voice: copy.voiceTrack,
  } as const;
  const timelineTrackIdForTrack = smartEditTimelineTrackIdForTrack;
  const trackPresentationState = (track: SmartEditTrack) =>
    smartEditTrackPresentationState({ plan, track });
  const isTimelineTrackLocked = (trackId: SmartEditTrackId): boolean =>
    isSmartEditTimelineTrackLocked(plan, trackId);
  const commandHistoryLabel = (label: string): string =>
    Object.prototype.hasOwnProperty.call(copy.historyActions, label)
      ? copy.historyActions[label as keyof typeof copy.historyActions]
      : label;

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

  const clearSelectedTrackClips = () => {
    setSelectedTrackClipId(undefined);
    setSelectedTrackClipIds([]);
  };

  const selectTimelineMaterialIds = (ids: string[], activeId = ids.at(-1)) => {
    setSelectedTrackClipIds(ids);
    setSelectedTrackClipId(activeId);
    setSelectedSegmentIds([]);
    onSelectedSegmentChange(undefined);
  };

  const {
    exportSrtCaptions,
    importSrtCaptions,
    resetSrtCaptionsState,
    srtImportText,
    srtStatusMessage,
    setSrtImportText,
  } = useSmartEditSrtCaptions({
    copy,
    onPlanChange: (nextPlan, options) => commitPlanChange(nextPlan, options),
    plan,
  });

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
      selectTimelineMaterialIds([detachedElement.id]);
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
      selectTimelineMaterialIds([detachedElement.id]);
    }
  };

  const materializeRenderedScenes = () => {
    if (!plan || materializableSegments.length === 0) {
      return;
    }
    const token = String(Date.now());
    const selectedMaterializableIds = materializableSegments
      .filter((segment) => selectedSegmentIds.includes(segment.id))
      .map((segment) => segment.id);
    const targetSegmentIds =
      selectedMaterializableIds.length > 0
        ? selectedMaterializableIds
        : materializableSegments.map((segment) => segment.id);
    const nextPlan = materializeSmartEditRenderedSegmentsToTimelineElements(
      plan,
      targetSegmentIds,
      token,
    );
    if (nextPlan === plan) {
      return;
    }
    const addedIds =
      nextPlan.timeline?.elements
        .map((element) => element.id)
        .filter((id) => id.endsWith(`-${token}`)) ?? [];
    commitPlanChange(nextPlan, { label: "Materialize rendered scenes" });
    selectTimelineMaterialIds(addedIds);
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
        selectTimelineMaterialIds(
          trackClips.slice(start, end + 1).map((candidate) => candidate.id),
          trackClip.id,
        );
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
    selectTimelineMaterialIds(timelineElementIds);
    return true;
  };

  const selectTimelineTrackMaterials = (trackId: SmartEditTrackId) => {
    if (!plan) {
      return;
    }
    const selectedIds = selectSmartEditTimelineElementIdsForTrack(plan, trackId);
    if (selectedIds.length === 0) {
      clearSelectedTrackClips();
      setSelectedSegmentIds([]);
      onSelectedSegmentChange(undefined);
      return;
    }
    selectTimelineMaterialIds(selectedIds);
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
    setPlayheadAndSeekPreview(Math.min(boundedPlayheadSeconds, nextPlan.targetDurationSeconds));
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

  const playheadSecondsForPointerEvent = (event: ReactPointerEvent<HTMLElement>): number => {
    const timelineScroll =
      (event.currentTarget.closest(".timeline-scroll") as HTMLElement | null) ??
      (event.currentTarget.closest(".smart-edit-track-clips") as HTMLElement | null);
    const timelineSurface = timelineScroll?.querySelector<HTMLElement>(
      ".timeline-ruler, .smart-edit-track-ruler, .smart-edit-track-lane",
    );
    const timelineRect = (timelineSurface ?? event.currentTarget).getBoundingClientRect();
    return playheadSecondsFromTimelinePointer({
      clientX: event.clientX,
      durationSeconds: timelineDurationSeconds,
      pixelsPerSecond: timelinePixelsPerSecond,
      scrollLeft: timelineScroll?.scrollLeft ?? 0,
      timelineLeft: timelineRect.left,
    });
  };

  const updatePlayheadFromPointer = (event: ReactPointerEvent<HTMLElement>) => {
    setPlayheadAndSeekPreview(playheadSecondsForPointerEvent(event));
  };

  const jumpPlayheadToEditPoint = (direction: "previous" | "next") => {
    const threshold = boundedPlayheadSeconds + (direction === "next" ? 0.05 : -0.05);
    const nextPoint =
      direction === "next"
        ? trackEditPoints.find((point) => point > threshold)
        : [...trackEditPoints].reverse().find((point) => point < threshold);
    setPlayheadAndSeekPreview(nextPoint ?? (direction === "next" ? timelineDurationSeconds : 0));
  };

  const setTrackScrollRef = (index: number) => (element: HTMLDivElement | null) => {
    trackScrollRefs.current[index] = element;
  };

  const syncTrackStackScroll = (event: ReactUIEvent<HTMLDivElement>) => {
    if (isSyncingTrackScrollRef.current) {
      return;
    }
    const source = event.currentTarget;
    isSyncingTrackScrollRef.current = true;
    for (const target of trackScrollRefs.current) {
      if (!target || target === source) {
        continue;
      }
      const nextScrollLeft = smartEditSyncedScrollLeft({
        clientWidth: target.clientWidth,
        scrollLeft: source.scrollLeft,
        scrollWidth: target.scrollWidth,
      });
      if (Math.abs(target.scrollLeft - nextScrollLeft) > 0.5) {
        target.scrollLeft = nextScrollLeft;
      }
    }
    isSyncingTrackScrollRef.current = false;
  };

  const startPlayheadDrag = (event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setPlayheadDrag({ pointerId: event.pointerId });
    updatePlayheadFromPointer(event);
  };

  const updatePlayheadDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (!playheadDrag || playheadDrag.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    updatePlayheadFromPointer(event);
  };

  const finishPlayheadDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (!playheadDrag || playheadDrag.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    updatePlayheadFromPointer(event);
    setPlayheadDrag(undefined);
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
    const selectedResizeIds =
      selectedTrackClipIds.length > 1 && selectedTrackClipIdSet.has(trackClip.id)
        ? selectedTrackClipIds
        : [];
    const shouldResizeSelectedBatch =
      selectedResizeIds.length > 1 &&
      selectedBatchTrackClips.every(
        (selectedClip) =>
          !selectedClip.segmentId &&
          selectedClip.trackId !== "bgm" &&
          !isTimelineTrackLocked(selectedClip.trackId),
      );
    const nextPlan = shouldResizeSelectedBatch
      ? resizeSmartEditTimelineElementsEdge(plan, selectedResizeIds, edge, deltaSeconds, boundedPlayheadSeconds)
      : resizeSmartEditTrackClipEdge(plan, trackClip, edge, deltaSeconds);
    if (nextPlan === plan) {
      return;
    }
    commitPlanChange(nextPlan, {
      label: shouldResizeSelectedBatch
        ? edge === "in"
          ? "Trim selected materials in"
          : "Trim selected materials out"
        : edge === "in"
          ? `Trim ${trackClip.trackId} in`
          : `Trim ${trackClip.trackId} out`,
    });
    setSelectedTrackClipId(trackClip.id);
    setSelectedTrackClipIds(shouldResizeSelectedBatch ? selectedResizeIds : [trackClip.id]);
    setSelectedSegmentIds(
      shouldResizeSelectedBatch ? [] : trackClip.segmentId ? [trackClip.segmentId] : [],
    );
    if (!shouldResizeSelectedBatch && trackClip.segmentId) {
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
    if (selectedTrackClipIdSet.has(trackClip.id) && selectedTrackClipIds.length > 1) {
      setSelectedTrackClipId(trackClip.id);
    } else {
      selectTrackClip(trackClip, event);
    }
    setTrackClipTrimDrag({
      currentClientX: event.clientX,
      edge,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      trackClip,
    });
  };

  const updateTrackClipTrimDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!trackClipTrimDrag || trackClipTrimDrag.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setTrackClipTrimDrag({
      ...trackClipTrimDrag,
      currentClientX: event.clientX,
    });
  };

  const finishTrackClipTrimDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!trackClipTrimDrag || trackClipTrimDrag.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const snapPoints = [
      boundedPlayheadSeconds,
      ...trackSegments
        .flatMap((track) => track.segments)
        .filter((segment) => !selectedTrackClipIdSet.has(segment.id))
        .flatMap((segment) => [
          segment.startSecond,
          snapTimelineSeconds(segment.startSecond + segment.durationSeconds),
        ]),
    ];
    const preview = previewSmartEditTrackClipTrimDrag({
      currentClientX: event.clientX,
      edge: trackClipTrimDrag.edge,
      pixelsPerSecond: timelinePixelsPerSecond,
      snapPoints,
      startClientX: trackClipTrimDrag.startClientX,
      trackClip: trackClipTrimDrag.trackClip,
    });
    setTrackClipTrimDrag(undefined);
    if (!preview) {
      return;
    }
    const deltaSeconds =
      trackClipTrimDrag.edge === "in"
        ? preview.startSecond - trackClipTrimDrag.trackClip.startSecond
        : preview.durationSeconds - trackClipTrimDrag.trackClip.durationSeconds;
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
      setPlayheadAndSeekPreview(playheadSecondsForPointerEvent(event));
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
      clearSelectedTrackClips();
      return;
    }
    selectTimelineMaterialIds(selectedIds);
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
      clearSelectedTrackClips();
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
    clearSelectedTrackClips();
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
    selectEditableSmartEditTimelineMaterialIds(
      selectedBatchTrackClips,
      isTimelineTrackLocked,
    );

  const selectTrackClipsAtPlayhead = () => {
    const selectedIds = selectSmartEditTrackClipIdsAtSecond({
      isTrackLocked: isTimelineTrackLocked,
      playheadSecond: boundedPlayheadSeconds,
      trackSegments,
    });
    if (selectedIds.length === 0) {
      clearSelectedTrackClips();
      return;
    }
    selectTimelineMaterialIds(selectedIds);
  };

  const setPreviewRangePoint = (point: "in" | "out") => {
    const nextSecond = Math.min(timelineDurationSeconds, Math.max(0, boundedPlayheadSeconds));
    setPreviewRange((current) => ({
      ...current,
      [point === "in" ? "inSecond" : "outSecond"]: nextSecond,
    }));
  };

  const clearPreviewRange = () => {
    setPreviewRange({});
    setPreviewRangeLoopEnabled(false);
  };

  const selectTrackClipsInPreviewRange = () => {
    if (!normalizedPreviewRange) {
      return;
    }
    const selectedIds = selectSmartEditTrackClipIdsInRange(
      trackSegments,
      normalizedPreviewRange,
      isTimelineTrackLocked,
    );
    if (selectedIds.length === 0) {
      clearSelectedTrackClips();
      return;
    }
    selectTimelineMaterialIds(selectedIds);
  };

  const cutTimelineMaterialsInPreviewRange = () => {
    if (!plan || !normalizedPreviewRange) {
      return;
    }
    const selectedTimelineMaterialIds = selectedEditableTimelineMaterialIds();
    const nextPlan = cutSmartEditTimelineElementsInRange(
      plan,
      normalizedPreviewRange,
      selectedTimelineMaterialIds.length > 0 ? selectedTimelineMaterialIds : undefined,
      timelineEditMode,
    );
    if (nextPlan === plan) {
      return;
    }
    commitPlanChange(nextPlan, { label: `Cut preview range (${timelineEditMode})` });
    clearSelectedTrackClips();
    setSelectedSegmentIds([]);
    onSelectedSegmentChange(undefined);
    setPlayheadAndSeekPreview(normalizedPreviewRange.startSecond);
  };

  const alignSelectedTimelineMaterialsToPlayhead = (edge: "start" | "end") => {
    if (!plan) {
      return;
    }
    const selectedTimelineMaterialIds = selectedEditableTimelineMaterialIds();
    if (selectedTimelineMaterialIds.length === 0) {
      return;
    }
    const selectedIds = new Set(selectedTimelineMaterialIds);
    const selectedTimelineMaterials = selectedBatchTrackClips.filter((trackClip) =>
      selectedIds.has(trackClip.id),
    );
    if (selectedTimelineMaterials.length === 0) {
      return;
    }
    const anchorSecond =
      edge === "start"
        ? Math.min(...selectedTimelineMaterials.map((trackClip) => trackClip.startSecond))
        : Math.max(
            ...selectedTimelineMaterials.map((trackClip) =>
              snapTimelineSeconds(trackClip.startSecond + trackClip.durationSeconds),
            ),
          );
    const nextPlan = moveSmartEditTimelineElementsOnTimeline(
      plan,
      selectedTimelineMaterialIds,
      boundedPlayheadSeconds - anchorSecond,
      timelineEditMode,
      boundedPlayheadSeconds,
    );
    if (nextPlan === plan) {
      return;
    }
    commitPlanChange(nextPlan, {
      label:
        edge === "start"
          ? `Align selected materials start (${timelineEditMode})`
          : `Align selected materials end (${timelineEditMode})`,
    });
  };

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
    const duplicatedIds = selectSmartEditTimelineElementIdsWithToken(
      nextPlan.timeline?.elements,
      selectedTimelineMaterialIds,
      duplicateToken,
    );
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

  const slipSelectedTimelineMaterialsSource = (deltaSeconds: number) => {
    if (!plan) {
      return;
    }
    const selectedTimelineMaterialIds = selectedEditableTimelineMaterialIds();
    if (selectedTimelineMaterialIds.length === 0) {
      return;
    }
    const nextPlan = slipSmartEditTimelineElementsSource(
      plan,
      selectedTimelineMaterialIds,
      deltaSeconds,
    );
    if (nextPlan === plan) {
      return;
    }
    commitPlanChange(nextPlan, { label: "Slip selected material sources" });
  };

  const updateSelectedTimelineMaterialAudio = (
    patch: {
      audioFadeInSeconds?: number;
      audioFadeOutSeconds?: number;
      audioVolume?: number;
    },
    label: string,
  ) => {
    if (!plan) {
      return;
    }
    const selectedTimelineMaterialIds = selectedEditableTimelineMaterialIds();
    if (selectedTimelineMaterialIds.length === 0) {
      return;
    }
    const nextPlan = updateSmartEditTimelineElementsAudioProperties(
      plan,
      selectedTimelineMaterialIds,
      patch,
    );
    if (nextPlan === plan) {
      return;
    }
    commitPlanChange(nextPlan, { label });
  };

  const addSelectedTimelineMaterialAudioKeyframes = () => {
    if (!plan) {
      return;
    }
    const selectedTimelineMaterialIds = selectedEditableTimelineMaterialIds();
    if (selectedTimelineMaterialIds.length === 0) {
      return;
    }
    const nextPlan = addSmartEditTimelineElementsAudioVolumeKeyframeAtPlayhead(
      plan,
      selectedTimelineMaterialIds,
      boundedPlayheadSeconds,
    );
    if (nextPlan === plan) {
      return;
    }
    commitPlanChange(nextPlan, { label: "Add selected audio volume keyframes" });
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

  const updateSelectedTimelineMaterialTextStyle = (
    patch: {
      textColor?: string;
      textFontSize?: number;
      textPositionYPercent?: number;
    },
    label: string,
  ) => {
    if (!plan) {
      return;
    }
    const selectedTimelineMaterialIds = selectedEditableTimelineMaterialIds();
    if (selectedTimelineMaterialIds.length === 0) {
      return;
    }
    const nextPlan = updateSmartEditTimelineElementsTextStyle(
      plan,
      selectedTimelineMaterialIds,
      patch,
    );
    if (nextPlan === plan) {
      return;
    }
    commitPlanChange(nextPlan, { label });
  };

  const splitSelectedTimelineTextMaterialByLines = () => {
    if (!plan || !selectedTimelineElement || selectedTimelineElement.kind !== "text") {
      return;
    }
    const nextPlan = splitSmartEditTimelineTextElementByLines(
      plan,
      selectedTimelineElement.id,
      `lines-${Date.now()}`,
    );
    if (nextPlan === plan) {
      return;
    }
    commitPlanChange(nextPlan, { label: "Split text clip by lines" });
    const splitIds = selectSplitSmartEditTextElementIds(
      nextPlan.timeline?.elements,
      selectedTimelineElement.id,
    );
    if (splitIds.length > 0) {
      selectTimelineMaterialIds(splitIds, splitIds[0]);
    }
  };

  const mergeSelectedTimelineTextMaterials = () => {
    if (!plan) {
      return;
    }
    const selectedTimelineTextMaterialIds =
      selectSmartEditTimelineTextMaterialIds(selectedBatchTrackClips);
    if (selectedTimelineTextMaterialIds.length < 2) {
      return;
    }
    const nextPlan = mergeSmartEditTimelineTextElements(plan, selectedTimelineTextMaterialIds);
    if (nextPlan === plan) {
      return;
    }
    commitPlanChange(nextPlan, { label: "Merge selected text clips" });
    selectTimelineMaterialIds([selectedTimelineTextMaterialIds[0]!], selectedTimelineTextMaterialIds[0]);
  };

  const duplicateSelectedSegments = () => {
    if (!plan || selectedBatchSegments.length === 0) {
      return;
    }
    const duplicateToken = `batch-${Date.now()}`;
    const selectedIds = selectedBatchSegments.map((segment) => segment.id);
    const nextPlan = duplicateSmartEditSegmentsOnTimeline(plan, selectedIds, duplicateToken);
    commitPlanChange(nextPlan, { label: "Duplicate selected clips" });
    const duplicateIds = selectSmartEditSegmentIdsWithToken(
      nextPlan.segments,
      selectedIds,
      duplicateToken,
    );
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
    const pastedIds = selectSmartEditSegmentIdsWithToken(
      nextPlan.segments,
      selectedIds,
      duplicateToken,
    );
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
      const pastedIds = selectSmartEditTimelineElementIdsWithToken(
        nextPlan.timeline?.elements,
        smartEditClipboard.timelineItems.map((item) => item.element.id),
        duplicateToken,
      );
      if (pastedIds.length > 0) {
        selectTimelineMaterialIds(pastedIds);
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
    const pastedIds = selectSmartEditSegmentIdsWithToken(
      nextPlan.segments,
      sourceIds,
      duplicateToken,
    );
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
  const timelineToolbarState: SmartEditTimelineToolbarState = {
    boundedPlayheadSeconds,
    commandHistory,
    commandHistoryLabel,
    hasMaterializableSegments: materializableSegments.length > 0,
    hasPlan: Boolean(plan),
    hasSelectedEditableMaterials: selectedEditableTimelineMaterialIds().length > 0,
    hasSmartEditClipboard: Boolean(smartEditClipboard),
    normalizedPreviewRange,
    previewRange,
    previewRangeLabel,
    previewRangeLoopEnabled,
    timelineDurationSeconds,
    timelineEditMode,
  };
  const timelineToolbarActions: SmartEditTimelineToolbarActions = {
    addTextElementAtPlayhead,
    addVoiceElementAtPlayhead,
    alignSelectedTimelineMaterialsToPlayhead,
    clearPreviewRange,
    closeGapAtPlayhead,
    cutTimelineMaterialsInPreviewRange,
    jumpPlayheadToEditPoint,
    materializeRenderedScenes,
    pasteClipboardAtPlayhead,
    redoPlanChange,
    selectTrackClipsAtPlayhead,
    selectTrackClipsInPreviewRange,
    setPlayheadAndSeekPreview,
    setPreviewRangeLoopEnabled,
    setPreviewRangePoint,
    setTimelineEditMode,
    setTimelineZoom,
    splitAtPlayhead,
    trimAtPlayhead,
    undoPlanChange,
  };

  return (
    <section
      className="panel smart-edit-panel"
      aria-label="Smart edit timeline editor"
      onKeyDown={(event) =>
        handleSmartEditKeyboardShortcut(
          event,
          {
            selectedSegment,
            selectedTrackClip,
          },
          {
            clearMultiSelection,
            copySelectedSegmentsToLocalClipboard,
            cutSelectedTimelineMaterialsToLocalClipboard,
            jumpPlayheadToEditPoint,
            moveSelectedTrackClips,
            pasteClipboardAtPlayhead,
            redoPlanChange,
            removeSelectedSegment,
            removeSelectedTrackClip,
            selectAllSegments,
            selectAllTimelineElements,
            selectByOffset,
            setPreviewRangePoint,
            splitAtPlayhead,
            togglePreviewPlayback,
            trimAtPlayhead,
            undoPlanChange,
          },
        )
      }
    >
      <div className="panel-heading smart-edit-heading">
        <SmartEditAssetTabRail
          activeAssetTab={activeAssetTab}
          onAssetTabChange={setActiveAssetTab}
        />
        <SmartEditEditorChrome
          exportUrl={result?.exportUrl}
          isBusy={isEditing || isRefreshing}
        />
      </div>

      {error ? (
        <p className="inline-error" role="alert">
          {error}
        </p>
      ) : null}

      <SmartEditStatusStrip
        audioLabel={audioLabel}
        copy={copy}
        enabledDurationSeconds={enabledDurationSeconds}
        selectedBatchSegmentCount={selectedBatchSegments.length}
        selectedSegmentIndex={selectedSegmentIndex}
        selectedSourceLabel={selectedSourceLabel}
        sortedSegmentCount={sortedSegments.length}
        timelineDurationSeconds={timelineDurationSeconds}
      />

      <div className="smart-edit-grid">
        <SmartEditAssetBin
          activeAssetTab={activeAssetTab}
          assetSlices={assetSlices}
          assets={assets}
          copy={copy}
          enabledDurationSeconds={enabledDurationSeconds}
          handleAssetDragStart={handleAssetDragStart}
          mediaSettings={mediaSettings}
          onMediaSettingsChange={onMediaSettingsChange}
          selectedSegment={selectedSegment}
          selectedSegmentIdSet={selectedSegmentIdSet}
          selectTimelineSegment={selectTimelineSegment}
          sortedSegments={sortedSegments}
          timedTimelineSegments={timedTimelineSegments}
          timelineDurationSeconds={timelineDurationSeconds}
          trackSegments={trackSegments}
        />

        <SmartEditPreviewPane
          boundedPlayheadSeconds={boundedPlayheadSeconds}
          copy={copy}
          normalizedPreviewRange={normalizedPreviewRange}
          nudgeSelectedTransform={nudgeSelectedTransform}
          previewRangeLoopEnabled={previewRangeLoopEnabled}
          previewRef={previewRef}
          result={result}
          selectedPreviewMedia={selectedPreviewMedia}
          selectedSegment={selectedSegment}
          selectedSegmentLabel={selectedSegment ? selectedSegment.subtitle || sourceLabel(selectedSegment, assets) : "-"}
          selectedTransform={selectedTransform}
          setPlayheadFromPreviewTime={setPlayheadFromPreviewTime}
          setPreviewCurrentTime={setPreviewCurrentTime}
          timelineDurationSeconds={timelineDurationSeconds}
          togglePreviewPlayback={togglePreviewPlayback}
        />

        <SmartEditInspectorPanel
          addSegmentAudioVolumeKeyframeAtPlayhead={addSegmentAudioVolumeKeyframeAtPlayhead}
          addTimelineElementAudioVolumeKeyframeAtPlayhead={
            addTimelineElementAudioVolumeKeyframeAtPlayhead
          }
          addVisualEffectAmountKeyframe={addVisualEffectAmountKeyframe}
          addVisualEffectToSelectedSegment={addVisualEffectToSelectedSegment}
          addVisualKeyframeAtPlayhead={addVisualKeyframeAtPlayhead}
          assets={assets}
          canRelinkSelectedTimelineElement={canRelinkSelectedTimelineElement}
          copy={copy}
          copySelectedSegmentsToLocalClipboard={copySelectedSegmentsToLocalClipboard}
          detachSelectedSceneVideo={detachSelectedSceneVideo}
          detachSelectedSourceAudio={detachSelectedSourceAudio}
          duplicateSelectedSegment={duplicateSelectedSegment}
          enableAdvancedVisualControls={ENABLE_ADVANCED_VISUAL_CONTROLS}
          hasPlan={Boolean(plan)}
          linkedElementCount={selectedLinkedElements.length}
          minTimelineElementDurationSeconds={MIN_SMART_EDIT_CLIP_SECONDS}
          moveSelectedSegmentEarlier={() =>
            plan && selectedSegment
              ? commitPlanChange(reorderSegments(plan, selectedSegment.id, "earlier"), {
                  label: "Move clip earlier",
                })
              : undefined
          }
          moveSelectedSegmentLater={() =>
            plan && selectedSegment
              ? commitPlanChange(reorderSegments(plan, selectedSegment.id, "later"), {
                  label: "Move clip later",
                })
              : undefined
          }
          moveVisualEffectOnSelectedSegment={moveVisualEffectOnSelectedSegment}
          relinkSelectedTimelineElementGroup={relinkSelectedTimelineElementGroup}
          removeSegmentAudioVolumeKeyframe={removeSegmentAudioVolumeKeyframe}
          removeSelectedSegment={removeSelectedSegment}
          removeSelectedTrackClip={removeSelectedTrackClip}
          removeTimelineElementAudioVolumeKeyframe={removeTimelineElementAudioVolumeKeyframe}
          removeVisualEffectAmountKeyframe={removeVisualEffectAmountKeyframe}
          removeVisualEffectFromSelectedSegment={removeVisualEffectFromSelectedSegment}
          removeVisualKeyframe={removeVisualKeyframe}
          selectedBatchSegmentCount={selectedBatchSegments.length}
          selectedSegment={selectedSegment}
          selectedSlices={selectedSlices}
          selectedTimelineElement={selectedTimelineElement}
          selectedTimelineTextLineCount={selectedTimelineTextLineCount}
          selectedTrackClip={selectedTrackClip}
          slipSelectedTimelineElementSource={slipSelectedTimelineElementSource}
          sortedSegmentCount={sortedSegments.length}
          splitSelectedSegment={splitSelectedSegment}
          splitSelectedTimelineTextMaterialByLines={splitSelectedTimelineTextMaterialByLines}
          trackLabels={trackLabels}
          unlinkSelectedTimelineElementGroup={unlinkSelectedTimelineElementGroup}
          updateSelectedSegment={updateSelectedSegment}
          updateSelectedSegmentTimelineStart={updateSelectedSegmentTimelineStart}
          updateSelectedTimelineElement={updateSelectedTimelineElement}
          updateTrackClipSegment={updateTrackClipSegment}
          updateVisualEffectOnSelectedSegment={updateVisualEffectOnSelectedSegment}
        />
      </div>

      <SmartEditTimelineSection copy={copy}>
        <SmartEditTimelineToolbar
          actions={timelineToolbarActions}
          copy={copy}
          state={timelineToolbarState}
        />
        <SmartEditSrtCaptionControls
          canExport={Boolean(plan)}
          copy={copy}
          importText={srtImportText}
          statusMessage={srtStatusMessage}
          onExport={exportSrtCaptions}
          onImport={importSrtCaptions}
          onImportTextChange={setSrtImportText}
        />
        <SmartEditTimelineBatchToolbar
          addSelectedTimelineMaterialAudioKeyframes={addSelectedTimelineMaterialAudioKeyframes}
          alignSelectedTimelineMaterialsToPlayhead={alignSelectedTimelineMaterialsToPlayhead}
          clearMultiSelection={clearMultiSelection}
          copy={copy}
          copySelectedSegmentsToLocalClipboard={copySelectedSegmentsToLocalClipboard}
          cutSelectedTimelineMaterialsToLocalClipboard={cutSelectedTimelineMaterialsToLocalClipboard}
          duplicateSelectedSegments={duplicateSelectedSegments}
          duplicateSelectedTimelineMaterials={duplicateSelectedTimelineMaterials}
          hasSelectedTextTimelineMaterials={hasSelectedTextTimelineMaterials}
          mergeSelectedTimelineTextMaterials={mergeSelectedTimelineTextMaterials}
          moveSelectedTrackClips={moveSelectedTrackClips}
          pasteSelectedSegmentsAtPlayhead={pasteSelectedSegmentsAtPlayhead}
          removeSelectedTrackClip={removeSelectedTrackClip}
          removeSegments={removeSegments}
          selectAllSegments={selectAllSegments}
          selectedBatchSegments={selectedBatchSegments}
          selectedBatchTrackClips={selectedBatchTrackClips}
          selectedSegmentIds={selectedSegmentIds}
          selectedTextTimelineMaterialCount={selectedTextTimelineMaterialCount}
          slipSelectedTimelineMaterialsSource={slipSelectedTimelineMaterialsSource}
          sortedSegmentsCount={sortedSegments.length}
          updateSelectedSegments={updateSelectedSegments}
          updateSelectedTimelineMaterialAudio={updateSelectedTimelineMaterialAudio}
          updateSelectedTimelineMaterialSpeed={updateSelectedTimelineMaterialSpeed}
          updateSelectedTimelineMaterialState={updateSelectedTimelineMaterialState}
          updateSelectedTimelineMaterialTextStyle={updateSelectedTimelineMaterialTextStyle}
        />
        <SmartEditLegacySegmentTimeline
          boundedPlayheadSeconds={boundedPlayheadSeconds}
          copy={copy}
          finishPlayheadDrag={finishPlayheadDrag}
          finishTimelineMoveDrag={finishTimelineMoveDrag}
          finishTrimDrag={finishTrimDrag}
          hasSegments={sortedSegments.length > 0}
          mainTimelineScrollRef={mainTimelineScrollRef}
          normalizedPreviewRange={normalizedPreviewRange}
          nudgeSegmentTrim={nudgeSegmentTrim}
          onSelectedSegmentChange={onSelectedSegmentChange}
          openTimelineContextMenu={openTimelineContextMenu}
          playheadDrag={playheadDrag}
          rulerTicks={rulerTicks}
          selectedSegment={selectedSegment}
          selectedSegmentIdSet={selectedSegmentIdSet}
          selectTimelineSegment={selectTimelineSegment}
          setPlayheadAndSeekPreview={setPlayheadAndSeekPreview}
          setPlayheadDrag={setPlayheadDrag}
          setTimelineMoveDrag={setTimelineMoveDrag}
          setTrimDrag={setTrimDrag}
          startPlayheadDrag={startPlayheadDrag}
          startTimelineMoveDrag={startTimelineMoveDrag}
          startTrimDrag={startTrimDrag}
          suppressTimelineMoveClickRef={suppressTimelineMoveClickRef}
          suppressTrimClickRef={suppressTrimClickRef}
          timedTimelineSegments={timedTimelineSegments}
          timelineBookmarks={timelineBookmarks}
          timelineDurationSeconds={timelineDurationSeconds}
          timelineMoveDrag={timelineMoveDrag}
          timelinePixelsPerSecond={timelinePixelsPerSecond}
          timelineWidth={timelineWidth}
          trimDrag={trimDrag}
          updatePlayheadDrag={updatePlayheadDrag}
        />
      </SmartEditTimelineSection>

      <div
        aria-label="Resize timeline panel"
        className={`smart-edit-panel-resize-handle ${isPanelResizing ? "dragging" : ""}`.trim()}
        role="separator"
        tabIndex={0}
        onPointerDown={(event) => {
          event.preventDefault();
          startPanelResize(event.clientY);
        }}
      />

      <SmartEditTrackStack
        addTimelineBookmarkAtPlayhead={addTimelineBookmarkAtPlayhead}
        boundedPlayheadSeconds={boundedPlayheadSeconds}
        closeTimelineContextMenu={closeTimelineContextMenu}
        copy={copy}
        copySelectedSegmentsToLocalClipboard={copySelectedSegmentsToLocalClipboard}
        duplicateSelectedSegment={duplicateSelectedSegment}
        duplicateSelectedTimelineMaterials={duplicateSelectedTimelineMaterials}
        finishPlayheadDrag={finishPlayheadDrag}
        finishTrackBoxSelectDrag={finishTrackBoxSelectDrag}
        finishTrackClipMoveDrag={finishTrackClipMoveDrag}
        finishTrackClipTrimDrag={finishTrackClipTrimDrag}
        handleTimelineAssetDragOver={handleTimelineAssetDragOver}
        handleTimelineAssetDrop={handleTimelineAssetDrop}
        normalizedPreviewRange={normalizedPreviewRange}
        openTimelineContextMenu={openTimelineContextMenu}
        playheadDrag={playheadDrag}
        removeNearestTimelineBookmark={removeNearestTimelineBookmark}
        removeSelectedSegment={removeSelectedSegment}
        removeSelectedTrackClip={removeSelectedTrackClip}
        rulerTicks={rulerTicks}
        selectedSegment={selectedSegment}
        selectedSegmentIdSet={selectedSegmentIdSet}
        selectedTrackClipId={selectedTrackClipId}
        selectedTrackClipIdSet={selectedTrackClipIdSet}
        selectTimelineTrackMaterials={selectTimelineTrackMaterials}
        selectTrackClip={selectTrackClip}
        setPlayheadAndSeekPreview={setPlayheadAndSeekPreview}
        setPlayheadDrag={setPlayheadDrag}
        setTimelineDropPreviewSecond={setTimelineDropPreviewSecond}
        setTimelineZoom={setTimelineZoom}
        setTrackBoxSelectDrag={setTrackBoxSelectDrag}
        setTrackClipMoveDrag={setTrackClipMoveDrag}
        setTrackClipTrimDrag={setTrackClipTrimDrag}
        setTrackScrollRef={setTrackScrollRef}
        splitAtPlayhead={splitAtPlayhead}
        startPlayheadDrag={startPlayheadDrag}
        startTrackBoxSelectDrag={startTrackBoxSelectDrag}
        startTrackClipMoveDrag={startTrackClipMoveDrag}
        startTrackClipTrimDrag={startTrackClipTrimDrag}
        suppressTimelineMoveClickRef={suppressTimelineMoveClickRef}
        syncTrackStackScroll={syncTrackStackScroll}
        timelineBookmarks={timelineBookmarks}
        timelineContextMenu={timelineContextMenu}
        timelineDropPreviewSecond={timelineDropPreviewSecond}
        timelineDurationSeconds={timelineDurationSeconds}
        timelinePanelHeight={timelinePanelHeight}
        timelinePixelsPerSecond={timelinePixelsPerSecond}
        timelineWidth={timelineWidth}
        timelineZoom={timelineZoom}
        trackBoxSelectDrag={trackBoxSelectDrag}
        trackBoxSelectTrackIdSet={trackBoxSelectTrackIdSet}
        trackClipDragPreview={trackClipDragPreview}
        trackClipMoveDrag={trackClipMoveDrag}
        trackClipTrimDrag={trackClipTrimDrag}
        trackClipTrimPreview={trackClipTrimPreview}
        trackLabels={trackLabels}
        trackPresentationState={trackPresentationState}
        trackSegments={trackSegments}
        trimTrackClipEdge={trimTrackClipEdge}
        updatePlayheadDrag={updatePlayheadDrag}
        updateTimelineTrackState={updateTimelineTrackState}
        updateTrackBoxSelectDrag={updateTrackBoxSelectDrag}
        updateTrackClipMoveDrag={updateTrackClipMoveDrag}
        updateTrackClipTrimDrag={updateTrackClipTrimDrag}
      />

    </section>
  );
};
