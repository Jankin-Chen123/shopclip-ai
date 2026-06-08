import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from "react";
import type { SmartEditSegment } from "@shopclip/shared";

import type { AppCopy } from "../../app/i18n";
import {
  TRIM_NUDGE_SECONDS,
  formatTimelineTime,
  timelineRangeLabel,
} from "./SmartEditTimelineMath";
import type {
  PlayheadDragState,
  TimelineMoveDragState,
  TrimDragState,
} from "./SmartEditTimelineOperations";

type SmartEditLegacyTimelineBookmark = {
  id: string;
  label: string;
  second: number;
};

type SmartEditNormalizedPreviewRange = {
  endSecond: number;
  startSecond: number;
};

interface SmartEditLegacySegmentTimelineProps {
  boundedPlayheadSeconds: number;
  copy: AppCopy["smartEdit"];
  finishPlayheadDrag: (event: ReactPointerEvent<HTMLElement>) => void;
  finishTimelineMoveDrag: (event: ReactPointerEvent<HTMLElement>) => void;
  finishTrimDrag: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  hasSegments: boolean;
  mainTimelineScrollRef: RefObject<HTMLDivElement | null>;
  normalizedPreviewRange?: SmartEditNormalizedPreviewRange;
  nudgeSegmentTrim: (segmentId: string, edge: "in" | "out", deltaSeconds: number) => void;
  onSelectedSegmentChange: (segmentId: string | undefined) => void;
  openTimelineContextMenu: (
    event: ReactMouseEvent<HTMLElement>,
    target: { clipId?: string; segmentId?: string },
  ) => void;
  playheadDrag?: PlayheadDragState;
  rulerTicks: number[];
  selectTimelineSegment: (segmentId: string, event?: ReactMouseEvent<HTMLElement>) => void;
  selectedSegment?: SmartEditSegment;
  selectedSegmentIdSet: Set<string>;
  setPlayheadAndSeekPreview: (second: number) => void;
  setPlayheadDrag: (state: PlayheadDragState | undefined) => void;
  setTimelineMoveDrag: (state: TimelineMoveDragState | undefined) => void;
  setTrimDrag: (state: TrimDragState | undefined) => void;
  startPlayheadDrag: (event: ReactPointerEvent<HTMLElement>) => void;
  startTimelineMoveDrag: (event: ReactPointerEvent<HTMLElement>, segmentId: string) => void;
  startTrimDrag: (
    event: ReactPointerEvent<HTMLButtonElement>,
    segmentId: string,
    edge: "in" | "out",
  ) => void;
  suppressTimelineMoveClickRef: { current: boolean };
  suppressTrimClickRef: { current: boolean };
  timedTimelineSegments: Array<{ segment: SmartEditSegment; startSecond: number }>;
  timelineBookmarks: SmartEditLegacyTimelineBookmark[];
  timelineDurationSeconds: number;
  timelineMoveDrag?: TimelineMoveDragState;
  timelinePixelsPerSecond: number;
  timelineWidth: number;
  trimDrag?: TrimDragState;
  updatePlayheadDrag: (event: ReactPointerEvent<HTMLElement>) => void;
}

export const SmartEditLegacySegmentTimeline = ({
  boundedPlayheadSeconds,
  copy,
  finishPlayheadDrag,
  finishTimelineMoveDrag,
  finishTrimDrag,
  hasSegments,
  mainTimelineScrollRef,
  normalizedPreviewRange,
  nudgeSegmentTrim,
  onSelectedSegmentChange,
  openTimelineContextMenu,
  playheadDrag,
  rulerTicks,
  selectTimelineSegment,
  selectedSegment,
  selectedSegmentIdSet,
  setPlayheadAndSeekPreview,
  setPlayheadDrag,
  setTimelineMoveDrag,
  setTrimDrag,
  startPlayheadDrag,
  startTimelineMoveDrag,
  startTrimDrag,
  suppressTimelineMoveClickRef,
  suppressTrimClickRef,
  timedTimelineSegments,
  timelineBookmarks,
  timelineDurationSeconds,
  timelineMoveDrag,
  timelinePixelsPerSecond,
  timelineWidth,
  trimDrag,
  updatePlayheadDrag,
}: SmartEditLegacySegmentTimelineProps) => {
  if (!hasSegments) {
    return (
      <div className="empty-state compact">
        <strong>{copy.emptyTitle}</strong>
        <span>{copy.emptyBody}</span>
      </div>
    );
  }

  return (
    <div className="timeline-scroll" ref={mainTimelineScrollRef}>
      <div
        className="timeline-ruler"
        style={{ width: timelineWidth }}
        onPointerCancel={() => setPlayheadDrag(undefined)}
        onPointerDown={startPlayheadDrag}
        onPointerMove={updatePlayheadDrag}
        onPointerUp={finishPlayheadDrag}
      >
        {rulerTicks.map((tick) => (
          <span
            key={tick}
            style={{ left: Math.min(tick, timelineDurationSeconds) * timelinePixelsPerSecond }}
          >
            {formatTimelineTime(tick)}
          </span>
        ))}
        {timelineBookmarks.map((bookmark) => (
          <button
            aria-label={`Go to bookmark ${bookmark.label}`}
            className="smart-edit-bookmark-marker"
            key={bookmark.id}
            style={{ left: bookmark.second * timelinePixelsPerSecond }}
            type="button"
            onClick={() => setPlayheadAndSeekPreview(bookmark.second)}
          />
        ))}
      </div>
      <div
        className={`timeline-playhead ${playheadDrag ? "dragging" : ""}`.trim()}
        style={{ left: boundedPlayheadSeconds * timelinePixelsPerSecond }}
        onPointerCancel={() => setPlayheadDrag(undefined)}
        onPointerDown={startPlayheadDrag}
        onPointerMove={updatePlayheadDrag}
        onPointerUp={finishPlayheadDrag}
      />
      {normalizedPreviewRange ? (
        <div
          aria-hidden="true"
          className="timeline-preview-range"
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
            onContextMenu={(event) =>
              openTimelineContextMenu(event, {
                segmentId: segment.id,
              })
            }
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
  );
};
