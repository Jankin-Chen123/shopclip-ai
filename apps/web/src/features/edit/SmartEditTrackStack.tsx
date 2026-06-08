import type {
  DragEvent as ReactDragEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  UIEvent as ReactUIEvent,
} from "react";
import type { SmartEditSegment } from "@shopclip/shared";

import type { AppCopy } from "../../app/i18n";
import type { SmartEditTrackId } from "./SmartEditTrackUtils";
import { SmartEditTimelineContextMenu } from "./SmartEditTimelineContextMenu";
import type {
  PlayheadDragState,
  SmartEditTimelineTrackPatch,
  SmartEditTrack,
  SmartEditTrackSegment,
  TrackBoxSelectDragState,
  TrackClipMoveDragState,
  TrackClipTrimDragState,
} from "./SmartEditTimelineOperations";
import { SmartEditTrackRow } from "./SmartEditTrackRow";
import { SmartEditTrackStackHeader } from "./SmartEditTrackStackHeader";

type SmartEditNormalizedPreviewRange = {
  endSecond: number;
  startSecond: number;
};

type SmartEditTrackStackBookmark = {
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

type SmartEditTrackPresentationState = {
  locked: boolean;
  hidden: boolean;
  muted: boolean;
  selectableTrackMaterialCount: number;
};

interface SmartEditTrackStackProps {
  addTimelineBookmarkAtPlayhead: () => void;
  boundedPlayheadSeconds: number;
  closeTimelineContextMenu: () => void;
  copy: AppCopy["smartEdit"];
  copySelectedSegmentsToLocalClipboard: () => void;
  duplicateSelectedSegment: () => void;
  duplicateSelectedTimelineMaterials: () => void;
  finishPlayheadDrag: (event: ReactPointerEvent<HTMLElement>) => void;
  finishTrackBoxSelectDrag: (event: ReactPointerEvent<HTMLDivElement>) => void;
  finishTrackClipMoveDrag: (event: ReactPointerEvent<HTMLElement>) => void;
  finishTrackClipTrimDrag: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  handleTimelineAssetDragOver: (event: ReactDragEvent<HTMLDivElement>) => void;
  handleTimelineAssetDrop: (event: ReactDragEvent<HTMLDivElement>) => void;
  normalizedPreviewRange?: SmartEditNormalizedPreviewRange;
  openTimelineContextMenu: (
    event: ReactMouseEvent<HTMLElement>,
    target: { clipId?: string; segmentId?: string },
  ) => void;
  playheadDrag?: PlayheadDragState;
  removeNearestTimelineBookmark: () => void;
  removeSelectedSegment: () => void;
  removeSelectedTrackClip: () => void;
  rulerTicks: number[];
  selectTimelineTrackMaterials: (trackId: SmartEditTrackId) => void;
  selectTrackClip: (segment: SmartEditTrackSegment, event?: ReactMouseEvent<HTMLElement>) => void;
  selectedSegment?: SmartEditSegment;
  selectedSegmentIdSet: Set<string>;
  selectedTrackClipId?: string;
  selectedTrackClipIdSet: Set<string>;
  setPlayheadAndSeekPreview: (second: number) => void;
  setPlayheadDrag: (state: PlayheadDragState | undefined) => void;
  setTimelineDropPreviewSecond: (second: number | undefined) => void;
  setTimelineZoom: (update: (current: number) => number) => void;
  setTrackBoxSelectDrag: (state: TrackBoxSelectDragState | undefined) => void;
  setTrackClipMoveDrag: (state: TrackClipMoveDragState | undefined) => void;
  setTrackClipTrimDrag: (state: TrackClipTrimDragState | undefined) => void;
  setTrackScrollRef: (index: number) => (element: HTMLDivElement | null) => void;
  splitAtPlayhead: () => void;
  startPlayheadDrag: (event: ReactPointerEvent<HTMLElement>) => void;
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
  timelineBookmarks: SmartEditTrackStackBookmark[];
  timelineContextMenu?: SmartEditContextMenuState;
  timelineDropPreviewSecond?: number;
  timelineDurationSeconds: number;
  timelinePanelHeight: number;
  timelinePixelsPerSecond: number;
  timelineWidth: number;
  timelineZoom: number;
  trackBoxSelectDrag?: TrackBoxSelectDragState;
  trackBoxSelectTrackIdSet: Set<SmartEditTrackId>;
  trackClipDragPreview: Array<
    Pick<SmartEditTrackSegment, "durationSeconds" | "id" | "startSecond" | "trackId">
  >;
  trackClipMoveDrag?: TrackClipMoveDragState;
  trackClipTrimDrag?: TrackClipTrimDragState;
  trackClipTrimPreview: Array<
    Pick<SmartEditTrackSegment, "durationSeconds" | "id" | "startSecond" | "trackId">
  >;
  trackLabels: Record<SmartEditTrackId, string>;
  trackPresentationState: (track: SmartEditTrack) => SmartEditTrackPresentationState;
  trackSegments: SmartEditTrack[];
  trimTrackClipEdge: (
    segment: SmartEditTrackSegment,
    edge: "in" | "out",
    deltaSeconds: number,
  ) => void;
  updatePlayheadDrag: (event: ReactPointerEvent<HTMLElement>) => void;
  updateTimelineTrackState: (
    trackId: SmartEditTrackId,
    patch: SmartEditTimelineTrackPatch,
    label: string,
  ) => void;
  updateTrackBoxSelectDrag: (event: ReactPointerEvent<HTMLDivElement>) => void;
  updateTrackClipMoveDrag: (event: ReactPointerEvent<HTMLElement>) => void;
  updateTrackClipTrimDrag: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}

export const SmartEditTrackStack = ({
  addTimelineBookmarkAtPlayhead,
  boundedPlayheadSeconds,
  closeTimelineContextMenu,
  copy,
  copySelectedSegmentsToLocalClipboard,
  duplicateSelectedSegment,
  duplicateSelectedTimelineMaterials,
  finishPlayheadDrag,
  finishTrackBoxSelectDrag,
  finishTrackClipMoveDrag,
  finishTrackClipTrimDrag,
  handleTimelineAssetDragOver,
  handleTimelineAssetDrop,
  normalizedPreviewRange,
  openTimelineContextMenu,
  playheadDrag,
  removeNearestTimelineBookmark,
  removeSelectedSegment,
  removeSelectedTrackClip,
  rulerTicks,
  selectTimelineTrackMaterials,
  selectTrackClip,
  selectedSegment,
  selectedSegmentIdSet,
  selectedTrackClipId,
  selectedTrackClipIdSet,
  setPlayheadAndSeekPreview,
  setPlayheadDrag,
  setTimelineDropPreviewSecond,
  setTimelineZoom,
  setTrackBoxSelectDrag,
  setTrackClipMoveDrag,
  setTrackClipTrimDrag,
  setTrackScrollRef,
  splitAtPlayhead,
  startPlayheadDrag,
  startTrackBoxSelectDrag,
  startTrackClipMoveDrag,
  startTrackClipTrimDrag,
  suppressTimelineMoveClickRef,
  syncTrackStackScroll,
  timelineBookmarks,
  timelineContextMenu,
  timelineDropPreviewSecond,
  timelineDurationSeconds,
  timelinePanelHeight,
  timelinePixelsPerSecond,
  timelineWidth,
  timelineZoom,
  trackBoxSelectDrag,
  trackBoxSelectTrackIdSet,
  trackClipDragPreview,
  trackClipMoveDrag,
  trackClipTrimDrag,
  trackClipTrimPreview,
  trackLabels,
  trackPresentationState,
  trackSegments,
  trimTrackClipEdge,
  updatePlayheadDrag,
  updateTimelineTrackState,
  updateTrackBoxSelectDrag,
  updateTrackClipMoveDrag,
  updateTrackClipTrimDrag,
}: SmartEditTrackStackProps) => (
  <>
    {trackSegments.length > 0 ? (
      <div
        className={`smart-edit-track-stack ${
          timelineDropPreviewSecond !== undefined ? "is-drop-target" : ""
        }`.trim()}
        aria-label={copy.trackStack}
        style={{ minHeight: timelinePanelHeight }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setTimelineDropPreviewSecond(undefined);
          }
        }}
        onDragOver={handleTimelineAssetDragOver}
        onDrop={handleTimelineAssetDrop}
      >
        <SmartEditTrackStackHeader
          addTimelineBookmarkAtPlayhead={addTimelineBookmarkAtPlayhead}
          boundedPlayheadSeconds={boundedPlayheadSeconds}
          copy={copy}
          finishPlayheadDrag={finishPlayheadDrag}
          normalizedPreviewRange={normalizedPreviewRange}
          playheadDrag={playheadDrag}
          removeNearestTimelineBookmark={removeNearestTimelineBookmark}
          removeSelectedTrackClip={removeSelectedTrackClip}
          rulerTicks={rulerTicks}
          setPlayheadAndSeekPreview={setPlayheadAndSeekPreview}
          setPlayheadDrag={setPlayheadDrag}
          setTimelineZoom={setTimelineZoom}
          setTrackScrollRef={setTrackScrollRef}
          splitAtPlayhead={splitAtPlayhead}
          startPlayheadDrag={startPlayheadDrag}
          syncTrackStackScroll={syncTrackStackScroll}
          timelineBookmarks={timelineBookmarks}
          timelineDropPreviewSecond={timelineDropPreviewSecond}
          timelineDurationSeconds={timelineDurationSeconds}
          timelinePixelsPerSecond={timelinePixelsPerSecond}
          timelineWidth={timelineWidth}
          timelineZoom={timelineZoom}
          updatePlayheadDrag={updatePlayheadDrag}
        />
        {trackSegments.map((track, index) => {
          const presentationState = trackPresentationState(track);
          return (
            <SmartEditTrackRow
              boundedPlayheadSeconds={boundedPlayheadSeconds}
              copy={copy}
              finishTrackBoxSelectDrag={finishTrackBoxSelectDrag}
              finishTrackClipMoveDrag={finishTrackClipMoveDrag}
              finishTrackClipTrimDrag={finishTrackClipTrimDrag}
              index={index}
              key={track.id}
              normalizedPreviewRange={normalizedPreviewRange}
              openTimelineContextMenu={openTimelineContextMenu}
              selectableTrackMaterialCount={presentationState.selectableTrackMaterialCount}
              selectedSegment={selectedSegment}
              selectedSegmentIdSet={selectedSegmentIdSet}
              selectedTrackClipId={selectedTrackClipId}
              selectedTrackClipIdSet={selectedTrackClipIdSet}
              selectTimelineTrackMaterials={selectTimelineTrackMaterials}
              selectTrackClip={selectTrackClip}
              setTrackBoxSelectDrag={setTrackBoxSelectDrag}
              setTrackClipMoveDrag={setTrackClipMoveDrag}
              setTrackClipTrimDrag={setTrackClipTrimDrag}
              setTrackScrollRef={setTrackScrollRef}
              startTrackBoxSelectDrag={startTrackBoxSelectDrag}
              startTrackClipMoveDrag={startTrackClipMoveDrag}
              startTrackClipTrimDrag={startTrackClipTrimDrag}
              suppressTimelineMoveClickRef={suppressTimelineMoveClickRef}
              syncTrackStackScroll={syncTrackStackScroll}
              timelineDropPreviewSecond={timelineDropPreviewSecond}
              timelinePixelsPerSecond={timelinePixelsPerSecond}
              timelineWidth={timelineWidth}
              track={track}
              trackBoxSelectDrag={trackBoxSelectDrag}
              trackBoxSelectTrackIdSet={trackBoxSelectTrackIdSet}
              trackClipDragPreview={trackClipDragPreview}
              trackClipMoveDrag={trackClipMoveDrag}
              trackClipTrimDrag={trackClipTrimDrag}
              trackClipTrimPreview={trackClipTrimPreview}
              trackHidden={presentationState.hidden}
              trackLabels={trackLabels}
              trackLocked={presentationState.locked}
              trackMuted={presentationState.muted}
              trimTrackClipEdge={trimTrackClipEdge}
              updateTimelineTrackState={updateTimelineTrackState}
              updateTrackBoxSelectDrag={updateTrackBoxSelectDrag}
              updateTrackClipMoveDrag={updateTrackClipMoveDrag}
              updateTrackClipTrimDrag={updateTrackClipTrimDrag}
            />
          );
        })}
      </div>
    ) : null}

    {timelineContextMenu ? (
      <SmartEditTimelineContextMenu
        x={timelineContextMenu.x}
        y={timelineContextMenu.y}
        onAddBookmark={addTimelineBookmarkAtPlayhead}
        onClose={closeTimelineContextMenu}
        onCopy={copySelectedSegmentsToLocalClipboard}
        onDelete={() => {
          if (timelineContextMenu.clipId) {
            removeSelectedTrackClip();
          } else {
            removeSelectedSegment();
          }
        }}
        onDuplicate={() => {
          if (timelineContextMenu.clipId) {
            duplicateSelectedTimelineMaterials();
          } else {
            duplicateSelectedSegment();
          }
        }}
        onSplitAtPlayhead={splitAtPlayhead}
      />
    ) : null}
  </>
);
