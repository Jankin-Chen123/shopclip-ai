import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  UIEvent as ReactUIEvent,
} from "react";
import type { SmartEditSegment } from "@shopclip/shared";
import {
  Check,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Volume2,
  VolumeX,
} from "lucide-react";

import type { AppCopy } from "../../app/i18n";
import { SmartEditTrackClipCard } from "./SmartEditTrackClipCard";
import type { SmartEditTrackId } from "./SmartEditTrackUtils";
import type {
  SmartEditTimelineTrackPatch,
  SmartEditTrack,
  SmartEditTrackSegment,
  TrackBoxSelectDragState,
  TrackClipMoveDragState,
  TrackClipTrimDragState,
} from "./SmartEditTimelineOperations";

type SmartEditNormalizedPreviewRange = {
  endSecond: number;
  startSecond: number;
};

interface SmartEditTrackRowProps {
  boundedPlayheadSeconds: number;
  copy: AppCopy["smartEdit"];
  finishTrackBoxSelectDrag: (event: ReactPointerEvent<HTMLDivElement>) => void;
  finishTrackClipMoveDrag: (event: ReactPointerEvent<HTMLElement>) => void;
  finishTrackClipTrimDrag: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  index: number;
  normalizedPreviewRange?: SmartEditNormalizedPreviewRange;
  openTimelineContextMenu: (
    event: ReactMouseEvent<HTMLElement>,
    target: { clipId?: string; segmentId?: string },
  ) => void;
  selectTimelineTrackMaterials: (trackId: SmartEditTrackId) => void;
  selectTrackClip: (segment: SmartEditTrackSegment, event?: ReactMouseEvent<HTMLElement>) => void;
  selectableTrackMaterialCount: number;
  selectedSegment?: SmartEditSegment;
  selectedSegmentIdSet: Set<string>;
  selectedTrackClipId?: string;
  selectedTrackClipIdSet: Set<string>;
  setTrackBoxSelectDrag: (state: TrackBoxSelectDragState | undefined) => void;
  setTrackClipMoveDrag: (state: TrackClipMoveDragState | undefined) => void;
  setTrackClipTrimDrag: (state: TrackClipTrimDragState | undefined) => void;
  setTrackScrollRef: (index: number) => (element: HTMLDivElement | null) => void;
  startTrackBoxSelectDrag: (
    event: ReactPointerEvent<HTMLDivElement>,
    trackId: SmartEditTrackId,
  ) => void;
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
  syncTrackStackScroll: (event: ReactUIEvent<HTMLDivElement>) => void;
  timelineDropPreviewSecond?: number;
  timelinePixelsPerSecond: number;
  timelineWidth: number;
  track: SmartEditTrack;
  trackBoxSelectDrag?: TrackBoxSelectDragState;
  trackBoxSelectTrackIdSet: Set<SmartEditTrackId>;
  trackClipDragPreview: Array<Pick<SmartEditTrackSegment, "durationSeconds" | "id" | "startSecond" | "trackId">>;
  trackClipMoveDrag?: TrackClipMoveDragState;
  trackClipTrimDrag?: TrackClipTrimDragState;
  trackClipTrimPreview: Array<Pick<SmartEditTrackSegment, "durationSeconds" | "id" | "startSecond" | "trackId">>;
  trackHidden: boolean;
  trackLabels: Record<SmartEditTrackId, string>;
  trackLocked: boolean;
  trackMuted: boolean;
  trimTrackClipEdge: (segment: SmartEditTrackSegment, edge: "in" | "out", deltaSeconds: number) => void;
  updateTimelineTrackState: (
    trackId: SmartEditTrackId,
    patch: SmartEditTimelineTrackPatch,
    label: string,
  ) => void;
  updateTrackBoxSelectDrag: (event: ReactPointerEvent<HTMLDivElement>) => void;
  updateTrackClipMoveDrag: (event: ReactPointerEvent<HTMLElement>) => void;
  updateTrackClipTrimDrag: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}

export const SmartEditTrackRow = ({
  boundedPlayheadSeconds,
  copy,
  finishTrackBoxSelectDrag,
  finishTrackClipMoveDrag,
  finishTrackClipTrimDrag,
  index,
  normalizedPreviewRange,
  openTimelineContextMenu,
  selectTimelineTrackMaterials,
  selectTrackClip,
  selectableTrackMaterialCount,
  selectedSegment,
  selectedSegmentIdSet,
  selectedTrackClipId,
  selectedTrackClipIdSet,
  setTrackBoxSelectDrag,
  setTrackClipMoveDrag,
  setTrackClipTrimDrag,
  setTrackScrollRef,
  startTrackBoxSelectDrag,
  startTrackClipMoveDrag,
  startTrackClipTrimDrag,
  suppressTimelineMoveClickRef,
  syncTrackStackScroll,
  timelineDropPreviewSecond,
  timelinePixelsPerSecond,
  timelineWidth,
  track,
  trackBoxSelectDrag,
  trackBoxSelectTrackIdSet,
  trackClipDragPreview,
  trackClipMoveDrag,
  trackClipTrimDrag,
  trackClipTrimPreview,
  trackHidden,
  trackLabels,
  trackLocked,
  trackMuted,
  trimTrackClipEdge,
  updateTimelineTrackState,
  updateTrackBoxSelectDrag,
  updateTrackClipMoveDrag,
  updateTrackClipTrimDrag,
}: SmartEditTrackRowProps) => {
  const canMuteTrack = track.id === "sourceAudio" || track.id === "voice" || track.id === "bgm";
  const canHideTrack = track.id === "video" || track.id === "caption";

  return (
    <section
      className="smart-edit-track-row"
      data-track-id={track.id}
      aria-label={trackLabels[track.id]}
    >
      <div className="smart-edit-track-label">
        <strong>{trackLabels[track.id]}</strong>
        <button
          disabled={selectableTrackMaterialCount === 0}
          type="button"
          onClick={() => selectTimelineTrackMaterials(track.id)}
        >
          <Check size={14} />
          <span>{copy.selectTrackMaterials}</span>
        </button>
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
      <div
        className="smart-edit-track-clips"
        ref={setTrackScrollRef(index + 1)}
        onScroll={syncTrackStackScroll}
      >
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
          <span
            aria-hidden="true"
            className="smart-edit-track-playhead lane-playhead"
            style={{ left: boundedPlayheadSeconds * timelinePixelsPerSecond }}
          />
          {timelineDropPreviewSecond !== undefined ? (
            <span
              aria-hidden="true"
              className="smart-edit-drop-indicator lane-drop-indicator"
              style={{ left: timelineDropPreviewSecond * timelinePixelsPerSecond }}
            />
          ) : null}
          {normalizedPreviewRange ? (
            <div
              aria-hidden="true"
              className="smart-edit-preview-range"
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
          {[...trackClipDragPreview, ...trackClipTrimPreview]
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
            <SmartEditTrackClipCard
              copy={copy}
              finishTrackClipMoveDrag={finishTrackClipMoveDrag}
              finishTrackClipTrimDrag={finishTrackClipTrimDrag}
              key={segment.id}
              openTimelineContextMenu={openTimelineContextMenu}
              segment={segment}
              selectedSegment={selectedSegment}
              selectedSegmentIdSet={selectedSegmentIdSet}
              selectedTrackClipId={selectedTrackClipId}
              selectedTrackClipIdSet={selectedTrackClipIdSet}
              selectTrackClip={selectTrackClip}
              setTrackClipMoveDrag={setTrackClipMoveDrag}
              setTrackClipTrimDrag={setTrackClipTrimDrag}
              startTrackClipMoveDrag={startTrackClipMoveDrag}
              startTrackClipTrimDrag={startTrackClipTrimDrag}
              suppressTimelineMoveClickRef={suppressTimelineMoveClickRef}
              timelinePixelsPerSecond={timelinePixelsPerSecond}
              trackClipMoveDrag={trackClipMoveDrag}
              trackClipTrimDrag={trackClipTrimDrag}
              trackLabels={trackLabels}
              trackLocked={trackLocked}
              trimTrackClipEdge={trimTrackClipEdge}
              updateTrackClipMoveDrag={updateTrackClipMoveDrag}
              updateTrackClipTrimDrag={updateTrackClipTrimDrag}
            />
          ))}
        </div>
      </div>
    </section>
  );
};
