import type {
  SmartEditTrack,
  SmartEditTrackSegment,
  TrackClipMoveDragState,
  TrackClipTrimDragState,
} from "./SmartEditTimelineOperations";
import { clampTimelineStart, snapTimelineSeconds } from "./SmartEditTimelineMath";
import type { SmartEditTrackId } from "./SmartEditTrackUtils";
import { canResizeSelectedSmartEditTimelineMaterials } from "./SmartEditTimelineMaterialDerivedState";
import {
  previewSmartEditTrackClipDrag,
  resizeSmartEditTrackClipPreview,
  snapSmartEditTrackClipTrimDelta,
} from "./SmartEditTrackClipOperations";

type SmartEditTrackClipPreview = Pick<
  SmartEditTrackSegment,
  "durationSeconds" | "id" | "startSecond" | "trackId"
>;

export const allSmartEditTrackClips = (
  trackSegments: SmartEditTrack[],
): SmartEditTrackSegment[] => trackSegments.flatMap((track) => track.segments);

export const buildSmartEditTrackEditPoints = (
  timelineDurationSeconds: number,
  trackSegments: SmartEditTrack[],
): number[] =>
  [
    0,
    timelineDurationSeconds,
    ...allSmartEditTrackClips(trackSegments).flatMap((segment) => [
      segment.startSecond,
      snapTimelineSeconds(segment.startSecond + segment.durationSeconds),
    ]),
  ]
    .map((point) => Math.min(timelineDurationSeconds, Math.max(0, snapTimelineSeconds(point))))
    .filter((point, index, points) => points.indexOf(point) === index)
    .sort((left, right) => left - right);

export const selectSmartEditTrackClipSnapPoints = ({
  excludedClipIds,
  referenceSecond,
  trackSegments,
}: {
  excludedClipIds: Set<string>;
  referenceSecond: number;
  trackSegments: SmartEditTrack[];
}): number[] => [
  referenceSecond,
  ...allSmartEditTrackClips(trackSegments)
    .filter((segment) => !excludedClipIds.has(segment.id))
    .flatMap((segment) => [
      segment.startSecond,
      snapTimelineSeconds(segment.startSecond + segment.durationSeconds),
    ]),
];

export const selectSelectedSmartEditTrackClipBatchIds = ({
  selectedTrackClipIds,
  selectedTrackClipIdSet,
  targetTrackClipId,
}: {
  selectedTrackClipIds: string[];
  selectedTrackClipIdSet: Set<string>;
  targetTrackClipId: string;
}): string[] =>
  selectedTrackClipIds.length > 1 && selectedTrackClipIdSet.has(targetTrackClipId)
    ? selectedTrackClipIds
    : [];

export const findSmartEditTrackClip = (
  trackSegments: SmartEditTrack[],
  selectedTrackClipId: string | undefined,
): SmartEditTrackSegment | undefined =>
  allSmartEditTrackClips(trackSegments).find((trackClip) => trackClip.id === selectedTrackClipId);

export const selectSmartEditTrackClipsById = (
  trackSegments: SmartEditTrack[],
  selectedTrackClipIdSet: Set<string>,
): SmartEditTrackSegment[] =>
  allSmartEditTrackClips(trackSegments).filter((trackClip) =>
    selectedTrackClipIdSet.has(trackClip.id),
  );

export const selectSmartEditTrackClipIdsAtSecond = ({
  isTrackLocked,
  playheadSecond,
  trackSegments,
}: {
  isTrackLocked: (trackId: SmartEditTrackId) => boolean;
  playheadSecond: number;
  trackSegments: SmartEditTrack[];
}): string[] =>
  allSmartEditTrackClips(trackSegments)
    .filter((trackClip) => !isTrackLocked(trackClip.trackId))
    .filter((trackClip) => {
      const startSecond = clampTimelineStart(trackClip.startSecond);
      const endSecond = snapTimelineSeconds(startSecond + trackClip.durationSeconds);
      return playheadSecond >= startSecond - 0.001 && playheadSecond <= endSecond + 0.001;
    })
    .map((trackClip) => trackClip.id);

export const buildSmartEditTrackClipDragPreview = ({
  boundedPlayheadSeconds,
  selectedTrackClipIdSet,
  selectedTrackClipIds,
  timelinePixelsPerSecond,
  trackClipMoveDrag,
  trackSegments,
}: {
  boundedPlayheadSeconds: number;
  selectedTrackClipIdSet: Set<string>;
  selectedTrackClipIds: string[];
  timelinePixelsPerSecond: number;
  trackClipMoveDrag?: TrackClipMoveDragState;
  trackSegments: SmartEditTrack[];
}): SmartEditTrackClipPreview[] =>
  trackClipMoveDrag
    ? previewSmartEditTrackClipDrag({
        currentClientX: trackClipMoveDrag.currentClientX,
        pixelsPerSecond: timelinePixelsPerSecond,
        selectedIds: selectedTrackClipIds,
        snapPoints: selectSmartEditTrackClipSnapPoints({
          excludedClipIds: selectedTrackClipIdSet,
          referenceSecond: boundedPlayheadSeconds,
          trackSegments,
        }),
        startClientX: trackClipMoveDrag.startClientX,
        trackClip: trackClipMoveDrag.trackClip,
        trackClips: allSmartEditTrackClips(trackSegments),
      })
    : [];

export const buildSmartEditTrackClipTrimPreview = ({
  boundedPlayheadSeconds,
  isTrackLocked,
  selectedBatchTrackClips,
  selectedTrackClipIdSet,
  selectedTrackClipIds,
  timelinePixelsPerSecond,
  trackClipTrimDrag,
  trackSegments,
}: {
  boundedPlayheadSeconds: number;
  isTrackLocked: (trackId: SmartEditTrackId) => boolean;
  selectedBatchTrackClips: SmartEditTrackSegment[];
  selectedTrackClipIdSet: Set<string>;
  selectedTrackClipIds: string[];
  timelinePixelsPerSecond: number;
  trackClipTrimDrag?: TrackClipTrimDragState;
  trackSegments: SmartEditTrack[];
}): SmartEditTrackClipPreview[] => {
  if (!trackClipTrimDrag || timelinePixelsPerSecond <= 0) {
    return [];
  }

  const selectedResizeIds = selectSelectedSmartEditTrackClipBatchIds({
    selectedTrackClipIds,
    selectedTrackClipIdSet,
    targetTrackClipId: trackClipTrimDrag.trackClip.id,
  });
  const sourceClips =
    selectedResizeIds.length > 1 &&
    canResizeSelectedSmartEditTimelineMaterials(selectedBatchTrackClips, isTrackLocked)
      ? selectedBatchTrackClips
      : [trackClipTrimDrag.trackClip];
  const snapPoints = selectSmartEditTrackClipSnapPoints({
    excludedClipIds: new Set(sourceClips.map((sourceClip) => sourceClip.id)),
    referenceSecond: boundedPlayheadSeconds,
    trackSegments,
  });
  const rawDeltaSeconds = snapTimelineSeconds(
    (trackClipTrimDrag.currentClientX - trackClipTrimDrag.startClientX) /
      timelinePixelsPerSecond,
  );
  const snappedDeltaSeconds = snapSmartEditTrackClipTrimDelta({
    deltaSeconds: rawDeltaSeconds,
    edge: trackClipTrimDrag.edge,
    snapPoints,
    trackClips: sourceClips,
  });
  return sourceClips.map((sourceClip) =>
    resizeSmartEditTrackClipPreview(sourceClip, trackClipTrimDrag.edge, snappedDeltaSeconds),
  );
};
