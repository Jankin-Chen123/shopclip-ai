import { useMemo, useRef, useState } from "react";
import type {
  AssetMetadata,
  AssetSlice,
  MediaSettings,
  SmartEditPlan,
  SmartEditResult,
  SmartEditSegment,
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
  result?: SmartEditResult;
  selectedSegmentId?: string;
  targetLanguage: string;
  traceEvents: TraceEvent[];
  onTargetLanguageChange: (value: string) => void;
}

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
  return {
    ...plan,
    segments: sorted.map((segment, segmentIndex) => ({
      ...segment,
      order: segmentIndex + 1,
    })),
  };
};

const replaceSegment = (
  plan: SmartEditPlan,
  segmentId: string,
  update: (segment: SmartEditSegment) => SmartEditSegment,
): SmartEditPlan => ({
  ...plan,
  segments: plan.segments.map((segment) => (segment.id === segmentId ? update(segment) : segment)),
});

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

type SmartEditTrackId = "video" | "caption" | "voice" | "bgm";

type SmartEditTrackSegment = {
  id: string;
  title: string;
  range: string;
  meta: string;
  durationSeconds: number;
};

type SmartEditTrack = {
  id: SmartEditTrackId;
  segments: SmartEditTrackSegment[];
};

const timelineTrackSegments = (
  plan: SmartEditPlan | undefined,
  assets: AssetMetadata[],
): SmartEditTrack[] => {
  if (!plan) {
    return [];
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
    title: sourceLabel(segment, assets),
    range: timelineRangeLabel(startSecond, segment.durationSeconds),
    meta: sourceRangeLabel(segment),
    durationSeconds: segment.durationSeconds,
  }));
  const captionSegments = timedSegments
    .filter(({ segment }) => segment.subtitle.trim().length > 0)
    .map(({ segment, startSecond }) => ({
      id: `${segment.id}-caption`,
      title: segment.subtitle,
      range: timelineRangeLabel(startSecond, segment.durationSeconds),
      meta: segment.transition,
      durationSeconds: segment.durationSeconds,
    }));
  const voiceSegments = timedSegments
    .filter(({ segment }) => segment.voiceover.trim().length > 0)
    .map(({ segment, startSecond }) => ({
      id: `${segment.id}-voice`,
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
  const trackSegments = useMemo(() => timelineTrackSegments(plan, assets), [assets, plan]);
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
          updateSelectedSegment((segment) => ({ ...segment, enabled: false }));
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
              </div>
              <section className="smart-edit-inspector-section">
                <h4>{copy.timingAndSource}</h4>
                <label>
                  {copy.duration}
                  <input
                    max={12}
                    min={4}
                    step={1}
                    type="number"
                    value={selectedSegment.durationSeconds}
                    onChange={(event) =>
                      updateSelectedSegment((segment) => ({
                        ...segment,
                        durationSeconds: Math.max(4, Math.min(12, Number(event.target.value))),
                      }))
                    }
                  />
                </label>
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
                  onPlanChange({
                    ...plan,
                    segments: sorted.map((candidate, index) => ({
                      ...candidate,
                      order: index + 1,
                    })),
                  });
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
                    className="smart-edit-track-clip"
                    key={segment.id}
                    style={{ flexGrow: Math.max(1, segment.durationSeconds) }}
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
