import type {
  PointerEvent as ReactPointerEvent,
  UIEvent as ReactUIEvent,
} from "react";
import {
  Link,
  MousePointer2,
  Plus,
  Scissors,
  Trash2,
  Unlink,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

import type { AppCopy } from "../../app/i18n";
import { formatTimelineTime } from "./SmartEditTimelineMath";
import type { PlayheadDragState } from "./SmartEditTimelineOperations";

type SmartEditTrackStackBookmark = {
  id: string;
  label: string;
  second: number;
};

type SmartEditNormalizedPreviewRange = {
  endSecond: number;
  startSecond: number;
};

interface SmartEditTrackStackHeaderProps {
  addTimelineBookmarkAtPlayhead: () => void;
  boundedPlayheadSeconds: number;
  copy: AppCopy["smartEdit"];
  finishPlayheadDrag: (event: ReactPointerEvent<HTMLElement>) => void;
  normalizedPreviewRange?: SmartEditNormalizedPreviewRange;
  playheadDrag?: PlayheadDragState;
  removeNearestTimelineBookmark: () => void;
  removeSelectedTrackClip: () => void;
  rulerTicks: number[];
  setPlayheadAndSeekPreview: (second: number) => void;
  setPlayheadDrag: (state: PlayheadDragState | undefined) => void;
  setTimelineZoom: (update: (current: number) => number) => void;
  setTrackScrollRef: (index: number) => (element: HTMLDivElement | null) => void;
  splitAtPlayhead: () => void;
  startPlayheadDrag: (event: ReactPointerEvent<HTMLElement>) => void;
  syncTrackStackScroll: (event: ReactUIEvent<HTMLDivElement>) => void;
  timelineBookmarks: SmartEditTrackStackBookmark[];
  timelineDropPreviewSecond?: number;
  timelineDurationSeconds: number;
  timelinePixelsPerSecond: number;
  timelineWidth: number;
  timelineZoom: number;
  updatePlayheadDrag: (event: ReactPointerEvent<HTMLElement>) => void;
}

export const SmartEditTrackStackHeader = ({
  addTimelineBookmarkAtPlayhead,
  boundedPlayheadSeconds,
  copy,
  finishPlayheadDrag,
  normalizedPreviewRange,
  playheadDrag,
  removeNearestTimelineBookmark,
  removeSelectedTrackClip,
  rulerTicks,
  setPlayheadAndSeekPreview,
  setPlayheadDrag,
  setTimelineZoom,
  setTrackScrollRef,
  splitAtPlayhead,
  startPlayheadDrag,
  syncTrackStackScroll,
  timelineBookmarks,
  timelineDropPreviewSecond,
  timelineDurationSeconds,
  timelinePixelsPerSecond,
  timelineWidth,
  timelineZoom,
  updatePlayheadDrag,
}: SmartEditTrackStackHeaderProps) => (
  <>
    <div className="smart-edit-opencut-timeline-tools" aria-label="Timeline tools">
      <span>
        <button type="button" aria-label="Select">
          <MousePointer2 size={16} aria-hidden="true" />
        </button>
        <button type="button" aria-label="Split at playhead" onClick={splitAtPlayhead}>
          <Scissors size={16} aria-hidden="true" />
        </button>
        <button type="button" aria-label="Link clips" disabled>
          <Link size={16} aria-hidden="true" />
        </button>
        <button type="button" aria-label="Unlink clips" disabled>
          <Unlink size={16} aria-hidden="true" />
        </button>
        <button type="button" aria-label="Delete selected" onClick={removeSelectedTrackClip}>
          <Trash2 size={16} aria-hidden="true" />
        </button>
        <button type="button" aria-label="Add bookmark" onClick={addTimelineBookmarkAtPlayhead}>
          <Plus size={16} aria-hidden="true" />
        </button>
        <button type="button" aria-label="Remove nearest bookmark" onClick={removeNearestTimelineBookmark}>
          <Trash2 size={16} aria-hidden="true" />
        </button>
      </span>
      <strong>{timelineBookmarks.length > 0 ? `${timelineBookmarks.length} bookmarks` : "Main scene"}</strong>
      <span>
        <button type="button" aria-label="Zoom out" onClick={() => setTimelineZoom((current) => Math.max(0.5, Number((current - 0.25).toFixed(2))))}>
          <ZoomOut size={16} aria-hidden="true" />
        </button>
        <input
          aria-label="Timeline zoom"
          max={3}
          min={0.5}
          step={0.25}
          type="range"
          value={timelineZoom}
          onChange={(event) => setTimelineZoom(() => Number(event.target.value))}
        />
        <button type="button" aria-label="Zoom in" onClick={() => setTimelineZoom((current) => Math.min(3, Number((current + 0.25).toFixed(2))))}>
          <ZoomIn size={16} aria-hidden="true" />
        </button>
      </span>
    </div>
    <div className="timeline-header">
      <h3>{copy.trackStack}</h3>
      <span>{copy.trackStackHint}</span>
    </div>
    <section className="smart-edit-track-ruler-row" aria-label={`${copy.trackStack} ${copy.playhead}`}>
      <div className="smart-edit-track-label smart-edit-track-ruler-label">
        <strong>{copy.playhead}</strong>
      </div>
      <div
        className="smart-edit-track-clips"
        ref={setTrackScrollRef(0)}
        onScroll={syncTrackStackScroll}
      >
        <div
          className="smart-edit-track-ruler"
          style={{ width: timelineWidth }}
          onPointerCancel={() => setPlayheadDrag(undefined)}
          onPointerDown={(event) => startPlayheadDrag(event)}
          onPointerMove={(event) => updatePlayheadDrag(event)}
          onPointerUp={(event) => finishPlayheadDrag(event)}
        >
          {rulerTicks.map((tick) => (
            <span
              key={`track-ruler-${tick}`}
              style={{ left: Math.min(tick, timelineDurationSeconds) * timelinePixelsPerSecond }}
            >
              {formatTimelineTime(tick)}
            </span>
          ))}
          {timelineBookmarks.map((bookmark) => (
            <button
              aria-label={`Go to bookmark ${bookmark.label}`}
              className="smart-edit-bookmark-marker"
              key={`track-${bookmark.id}`}
              style={{ left: bookmark.second * timelinePixelsPerSecond }}
              type="button"
              onClick={() => setPlayheadAndSeekPreview(bookmark.second)}
            />
          ))}
          {timelineDropPreviewSecond !== undefined ? (
            <span
              aria-hidden="true"
              className="smart-edit-drop-indicator"
              style={{ left: timelineDropPreviewSecond * timelinePixelsPerSecond }}
            />
          ) : null}
          <span
            aria-hidden="true"
            className={`smart-edit-track-playhead ${playheadDrag ? "dragging" : ""}`.trim()}
            style={{ left: boundedPlayheadSeconds * timelinePixelsPerSecond }}
          />
          {normalizedPreviewRange ? (
            <div
              aria-hidden="true"
              className="smart-edit-preview-range smart-edit-preview-range-ruler"
              style={{
                left: normalizedPreviewRange.startSecond * timelinePixelsPerSecond,
                width: Math.max(
                  4,
                  (normalizedPreviewRange.endSecond - normalizedPreviewRange.startSecond) *
                    timelinePixelsPerSecond,
                ),
              }}
            />
          ) : null}
        </div>
      </div>
    </section>
  </>
);
