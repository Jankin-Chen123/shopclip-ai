import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from "react";

import { SmartEditAudioKeyframeMarkers } from "./SmartEditAudioKeyframeMarkers";
import type { AppCopy } from "../../app/i18n";
import { SmartEditTextStyleStrip } from "./SmartEditTextStyleStrip";
import type { SmartEditTrackId } from "./SmartEditTrackUtils";
import { SmartEditWaveformStrip } from "./SmartEditWaveformStrip";
import { TRIM_NUDGE_SECONDS } from "./SmartEditTimelineMath";
import type {
  SmartEditTrackSegment,
  TrackClipMoveDragState,
  TrackClipTrimDragState,
} from "./SmartEditTimelineOperations";
import type { SmartEditSegment } from "@shopclip/shared";

interface SmartEditTrackClipCardProps {
  copy: AppCopy["smartEdit"];
  finishTrackClipMoveDrag: (event: ReactPointerEvent<HTMLElement>) => void;
  finishTrackClipTrimDrag: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  openTimelineContextMenu: (
    event: ReactMouseEvent<HTMLElement>,
    target: { clipId?: string; segmentId?: string },
  ) => void;
  segment: SmartEditTrackSegment;
  selectTrackClip: (segment: SmartEditTrackSegment, event?: ReactMouseEvent<HTMLElement>) => void;
  selectedSegment?: SmartEditSegment;
  selectedSegmentIdSet: Set<string>;
  selectedTrackClipId?: string;
  selectedTrackClipIdSet: Set<string>;
  setTrackClipMoveDrag: (state: TrackClipMoveDragState | undefined) => void;
  setTrackClipTrimDrag: (state: TrackClipTrimDragState | undefined) => void;
  startTrackClipMoveDrag: (
    event: ReactPointerEvent<HTMLElement>,
    segment: SmartEditTrackSegment,
  ) => void;
  startTrackClipTrimDrag: (
    event: ReactPointerEvent<HTMLButtonElement>,
    segment: SmartEditTrackSegment,
    edge: "in" | "out",
  ) => void;
  suppressTimelineMoveClickRef: { current: boolean };
  timelinePixelsPerSecond: number;
  trackClipMoveDrag?: TrackClipMoveDragState;
  trackClipTrimDrag?: TrackClipTrimDragState;
  trackLabels: Record<SmartEditTrackId, string>;
  trackLocked: boolean;
  trimTrackClipEdge: (segment: SmartEditTrackSegment, edge: "in" | "out", deltaSeconds: number) => void;
  updateTrackClipMoveDrag: (event: ReactPointerEvent<HTMLElement>) => void;
  updateTrackClipTrimDrag: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}

export const SmartEditTrackClipCard = ({
  copy,
  finishTrackClipMoveDrag,
  finishTrackClipTrimDrag,
  openTimelineContextMenu,
  segment,
  selectTrackClip,
  selectedSegment,
  selectedSegmentIdSet,
  selectedTrackClipId,
  selectedTrackClipIdSet,
  setTrackClipMoveDrag,
  setTrackClipTrimDrag,
  startTrackClipMoveDrag,
  startTrackClipTrimDrag,
  suppressTimelineMoveClickRef,
  timelinePixelsPerSecond,
  trackClipMoveDrag,
  trackClipTrimDrag,
  trackLabels,
  trackLocked,
  trimTrackClipEdge,
  updateTrackClipMoveDrag,
  updateTrackClipTrimDrag,
}: SmartEditTrackClipCardProps) => (
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
    onContextMenu={(event) =>
      openTimelineContextMenu(event, {
        clipId: segment.id,
        segmentId: segment.segmentId,
      })
    }
  >
    {segment.trackId !== "bgm" ? (
      <button
        aria-label={`Trim ${trackLabels[segment.trackId]} in`}
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
        onPointerMove={updateTrackClipTrimDrag}
        onPointerUp={finishTrackClipTrimDrag}
      />
    ) : null}
    <span>{segment.range}</span>
    <b>{segment.title}</b>
    {segment.waveform ? <SmartEditWaveformStrip segment={segment} /> : null}
    {segment.trackId === "sourceAudio" || segment.trackId === "voice" || segment.trackId === "bgm" ? (
      <SmartEditAudioKeyframeMarkers
        label={copy.audioVolumeKeyframesTitle}
        segment={segment}
      />
    ) : null}
    {segment.trackId === "caption" ? <SmartEditTextStyleStrip segment={segment} /> : null}
    <small>{segment.meta}</small>
    {segment.trackId !== "bgm" ? (
      <button
        aria-label={`Trim ${trackLabels[segment.trackId]} out`}
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
        onPointerMove={updateTrackClipTrimDrag}
        onPointerUp={finishTrackClipTrimDrag}
      />
    ) : null}
  </article>
);
