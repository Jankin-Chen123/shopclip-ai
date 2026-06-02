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
import { Loader2, RefreshCw, Scissors, SkipBack, SkipForward } from "lucide-react";

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
  const selectedSlices = selectedSegment?.source.assetId
    ? assetSlices.filter((slice) => slice.assetId === selectedSegment.source.assetId)
    : [];

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
              <label>
                {copy.duration}
                <input
                  max={15}
                  min={0.5}
                  step={0.5}
                  type="number"
                  value={selectedSegment.durationSeconds}
                  onChange={(event) =>
                    updateSelectedSegment((segment) => ({
                      ...segment,
                      durationSeconds: Number(event.target.value),
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
                <strong>{segment.order}</strong>
                <span>{segment.subtitle}</span>
                <small>
                  {segment.durationSeconds}s · {segment.transition}
                  {!segment.enabled ? ` · ${copy.disabled}` : ""}
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
