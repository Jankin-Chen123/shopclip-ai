import { useMemo, useRef, useState } from "react";
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
  RefreshCw,
  Scissors,
  SkipBack,
  SkipForward,
  Trash2,
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

const clampSmartEditDuration = (durationSeconds: number): number =>
  Number.isFinite(durationSeconds)
    ? Math.max(MIN_SMART_EDIT_CLIP_SECONDS, Math.min(MAX_SMART_EDIT_CLIP_SECONDS, durationSeconds))
    : MIN_SMART_EDIT_CLIP_SECONDS;

const clampPlaybackRate = (playbackRate: number): number =>
  Math.max(0.25, Math.min(4, playbackRate || 1));

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
      hidden: false,
      id: `${segment.id}-text`,
      kind: "text",
      label: segment.subtitle,
      muted: false,
      playbackRate: 1,
      sceneId: segment.sceneId,
      segmentId: segment.id,
      startSecond,
      text: segment.subtitle,
      trackId: "text-copy",
      trimStartSecond: 0,
    });
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

type SmartEditTrackId = "video" | "caption" | "voice" | "bgm";

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

const timelineTrackSegments = (
  plan: SmartEditPlan | undefined,
  assets: AssetMetadata[],
  renderTask?: RenderTask,
): SmartEditTrack[] => {
  if (plan?.timeline?.elements?.length) {
    return plan.timeline.tracks.map((track) => ({
      id: (track.kind === "audio" ? "voice" : track.kind === "text" ? "caption" : track.kind) as SmartEditTrackId,
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
        id: "voice",
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
      range: timelineRangeLabel(startSecond, segment.durationSeconds),
      meta: segment.transition,
      durationSeconds: segment.durationSeconds,
    }));
  const voiceSegments = timedSegments
    .filter(({ segment }) => segment.voiceover.trim().length > 0)
    .map(({ segment, startSecond }) => ({
      id: `${segment.id}-voice`,
      segmentId: segment.id,
      title: segment.voiceover,
      range: timelineRangeLabel(startSecond, segment.durationSeconds),
      meta: plan.audio.voice,
      durationSeconds: segment.durationSeconds,
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
  const [draggedSegmentId, setDraggedSegmentId] = useState<string | undefined>();
  const plan = result?.plan;
  const sortedSegments = useMemo(
    () => [...(plan?.segments ?? [])].sort((left, right) => left.order - right.order),
    [plan],
  );
  const selectedSegment =
    sortedSegments.find((segment) => segment.id === selectedSegmentId) ?? sortedSegments[0];
  const selectedPreviewMedia = previewMediaForSegment(selectedSegment, assets);
  const selectedSlices = selectedSegment?.source.assetId
    ? assetSlices.filter((slice) => slice.assetId === selectedSegment.source.assetId)
    : [];
  const enabledSegments = sortedSegments.filter((segment) => segment.enabled);
  const enabledDurationSeconds = enabledSegments.reduce(
    (total, segment) => total + segment.durationSeconds,
    0,
  );
  const selectedSegmentIndex = selectedSegment
    ? sortedSegments.findIndex((segment) => segment.id === selectedSegment.id) + 1
    : 0;
  const selectedSourceLabel = selectedSegment ? sourceLabel(selectedSegment, assets) : "-";
  const audioLabel = plan?.audio.bgmTrack ?? mediaSettings.bgmTrack;
  const trackSegments = useMemo(
    () => timelineTrackSegments(plan, assets, renderTask),
    [assets, plan, renderTask],
  );
  const trackLabels = {
    bgm: copy.bgmTrack,
    caption: copy.captionTrack,
    video: copy.videoTrack,
    voice: copy.voiceTrack,
  } as const;

  const updateSelectedSegment = (update: (segment: SmartEditSegment) => SmartEditSegment) => {
    if (!plan || !selectedSegment) {
      return;
    }
    onPlanChange(replaceSegment(plan, selectedSegment.id, update));
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
    onPlanChange(withRebuiltTimeline({
      ...plan,
      segments: sorted.map((segment, segmentIndex) => ({
        ...segment,
        order: segmentIndex + 1,
      })),
    }));
    onSelectedSegmentChange(secondSegment.id);
  };

  const removeSelectedSegment = () => {
    if (!plan || !selectedSegment || sortedSegments.length <= 1) {
      return;
    }
    const nextSegments = sortedSegments
      .filter((segment) => segment.id !== selectedSegment.id)
      .map((segment, index) => ({
        ...segment,
        order: index + 1,
      }));
    onPlanChange(withRebuiltTimeline({
      ...plan,
      segments: nextSegments,
    }));
    onSelectedSegmentChange(nextSegments[Math.min(selectedSegmentIndex - 1, nextSegments.length - 1)]?.id);
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
            {selectedSegmentIndex > 0 ? `${selectedSegmentIndex} / ${sortedSegments.length}` : "-"}
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
                  onClick={() => onPlanChange(reorderSegments(plan, selectedSegment.id, "earlier"))}
                >
                  {copy.moveEarlier}
                </Button>
                <Button
                  icon={<SkipForward size={16} />}
                  onClick={() => onPlanChange(reorderSegments(plan, selectedSegment.id, "later"))}
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
        {sortedSegments.length > 0 ? (
          <div className="timeline-track">
            {sortedSegments.map((segment) => (
              <button
                aria-pressed={selectedSegment?.id === segment.id}
                className={`${selectedSegment?.id === segment.id ? "active" : ""} ${
                  segment.enabled ? "" : "disabled"
                }`.trim()}
                draggable
                key={segment.id}
                style={{ flexGrow: Math.max(1, segment.durationSeconds) }}
                type="button"
                onClick={() => onSelectedSegmentChange(segment.id)}
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
                  onPlanChange(withRebuiltTimeline({
                    ...plan,
                    segments: sorted.map((candidate, index) => ({
                      ...candidate,
                      order: index + 1,
                    })),
                  }));
                }}
              >
                <strong>
                  {selectedSegment?.id === segment.id ? copy.selected : segment.order}
                </strong>
                <span>{segment.subtitle}</span>
                <small>
                  {segment.durationSeconds}s - {segment.transition}
                  {!segment.enabled ? ` - ${copy.disabled}` : ""}
                </small>
              </button>
            ))}
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
              <strong>{trackLabels[track.id]}</strong>
              <div className="smart-edit-track-clips">
                {track.segments.map((segment) => (
                  <article
                    className={`smart-edit-track-clip ${
                      segment.segmentId === selectedSegment?.id ? "active" : ""
                    } ${segment.muted ? "muted" : ""} ${segment.hidden ? "hidden" : ""}`.trim()}
                    key={segment.id}
                    role={segment.segmentId ? "button" : undefined}
                    style={{ flexGrow: Math.max(1, segment.durationSeconds) }}
                    tabIndex={segment.segmentId ? 0 : undefined}
                    onClick={() => {
                      if (segment.segmentId) {
                        onSelectedSegmentChange(segment.segmentId);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (segment.segmentId && (event.key === "Enter" || event.key === " ")) {
                        event.preventDefault();
                        onSelectedSegmentChange(segment.segmentId);
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
