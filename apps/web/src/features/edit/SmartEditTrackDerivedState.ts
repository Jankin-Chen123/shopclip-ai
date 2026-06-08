import type { SmartEditSegment } from "@shopclip/shared";
import type {
  SmartEditTrack,
  SmartEditTrackSegment,
  TrackClipMoveDragState,
  TrackClipTrimDragState,
} from "./SmartEditTimelineOperations";
import { clampTimelineStart, snapTimelineSeconds } from "./SmartEditTimelineMath";
import type { SmartEditTrackId } from "./SmartEditTrackUtils";
import {
  previewSmartEditTrackClipDrag,
  resizeSmartEditTrackClipPreview,
  snapSmartEditTrackClipTrimDelta,
} from "./SmartEditTrackClipOperations";

export {
  canRelinkSmartEditTimelineElement,
  findSelectedSmartEditTimelineElement,
  linkedSmartEditTimelineElements,
  selectExistingSmartEditTimelineElementIds,
  selectSmartEditTimelineElementIdsByExactToken,
  selectSmartEditTimelineElementIdsWithToken,
  selectSplitSmartEditTextElementIds,
  smartEditTimelineTextLineCount,
} from "./SmartEditTimelineElementDerivedState";
export {
  isSmartEditTimelineTrackLocked,
  smartEditTimelineTrackForTrack,
  smartEditTimelineTrackIdForTrack,
  smartEditTrackPresentationState,
} from "./SmartEditTrackPresentationState";

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

export const isSmartEditTextTimelineMaterial = (trackClip: SmartEditTrackSegment): boolean =>
  !trackClip.segmentId && trackClip.trackId === "caption";

export const selectEditableSmartEditTimelineMaterials = (
  trackClips: SmartEditTrackSegment[],
  isTrackLocked: (trackId: SmartEditTrackId) => boolean,
): SmartEditTrackSegment[] =>
  trackClips.filter((trackClip) => !trackClip.segmentId && !isTrackLocked(trackClip.trackId));

export const selectEditableSmartEditTimelineMaterialIds = (
  trackClips: SmartEditTrackSegment[],
  isTrackLocked: (trackId: SmartEditTrackId) => boolean,
): string[] => selectEditableSmartEditTimelineMaterials(trackClips, isTrackLocked).map(
  (trackClip) => trackClip.id,
);

export const selectEditableSmartEditTimelineMaterialIdsOrUndefined = (
  trackClips: SmartEditTrackSegment[],
  isTrackLocked: (trackId: SmartEditTrackId) => boolean,
): string[] | undefined => {
  const selectedTimelineMaterialIds = selectEditableSmartEditTimelineMaterialIds(
    trackClips,
    isTrackLocked,
  );
  return selectedTimelineMaterialIds.length > 0 ? selectedTimelineMaterialIds : undefined;
};

export const selectMovableSmartEditTimelineMaterialIdsOrUndefined = (
  trackClips: SmartEditTrackSegment[],
  isTrackLocked: (trackId: SmartEditTrackId) => boolean,
): string[] | undefined =>
  selectEditableSmartEditTimelineMaterialIdsOrUndefined(trackClips, isTrackLocked);

export const canMoveSelectedSmartEditTimelineMaterials = (
  trackClips: SmartEditTrackSegment[],
  isTrackLocked: (trackId: SmartEditTrackId) => boolean,
): boolean =>
  trackClips.every((trackClip) => !trackClip.segmentId && !isTrackLocked(trackClip.trackId));

export const canResizeSelectedSmartEditTimelineMaterials = (
  trackClips: SmartEditTrackSegment[],
  isTrackLocked: (trackId: SmartEditTrackId) => boolean,
): boolean =>
  trackClips.every(
    (trackClip) =>
      !trackClip.segmentId && trackClip.trackId !== "bgm" && !isTrackLocked(trackClip.trackId),
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

export const selectSmartEditTimelineTextMaterialIds = (
  trackClips: SmartEditTrackSegment[],
): string[] =>
  trackClips
    .filter((trackClip) => isSmartEditTextTimelineMaterial(trackClip))
    .map((trackClip) => trackClip.id);

export const selectMergeableSmartEditTimelineTextMaterialIdsOrUndefined = (
  trackClips: SmartEditTrackSegment[],
): string[] | undefined => {
  const textMaterialIds = selectSmartEditTimelineTextMaterialIds(trackClips);
  return textMaterialIds.length >= 2 ? textMaterialIds : undefined;
};

export type SmartEditClipboardCopySelection =
  | {
      ids: string[];
      kind: "timeline-elements";
    }
  | {
      ids: string[];
      kind: "segments";
    };

export const selectSmartEditClipboardCopySelection = ({
  isTrackLocked,
  selectedSegments,
  selectedTrackClips,
}: {
  isTrackLocked: (trackId: SmartEditTrackId) => boolean;
  selectedSegments: Array<Pick<SmartEditSegment, "id">>;
  selectedTrackClips: SmartEditTrackSegment[];
}): SmartEditClipboardCopySelection | undefined => {
  const selectedTimelineMaterialIds = selectEditableSmartEditTimelineMaterialIdsOrUndefined(
    selectedTrackClips,
    isTrackLocked,
  );
  if (selectedTimelineMaterialIds) {
    return {
      ids: selectedTimelineMaterialIds,
      kind: "timeline-elements",
    };
  }

  if (selectedSegments.length > 0) {
    return {
      ids: selectedSegments.map((segment) => segment.id),
      kind: "segments",
    };
  }

  return undefined;
};

export const selectRemovableSmartEditTimelineMaterialIds = ({
  isTrackLocked,
  selectedTrackClips,
}: {
  isTrackLocked: (trackId: SmartEditTrackId) => boolean;
  selectedTrackClips: SmartEditTrackSegment[];
}): string[] =>
  selectedTrackClips.length > 1 &&
  canMoveSelectedSmartEditTimelineMaterials(selectedTrackClips, isTrackLocked)
    ? selectedTrackClips.map((trackClip) => trackClip.id)
    : [];

export const selectResizableSmartEditTimelineMaterialIdsOrUndefined = (
  trackClips: SmartEditTrackSegment[],
  isTrackLocked: (trackId: SmartEditTrackId) => boolean,
): string[] | undefined =>
  trackClips.length > 1 && canResizeSelectedSmartEditTimelineMaterials(trackClips, isTrackLocked)
    ? trackClips.map((trackClip) => trackClip.id)
    : undefined;

export const selectSmartEditTimelineMaterialAlignAnchorSecond = (
  trackClips: Pick<SmartEditTrackSegment, "durationSeconds" | "startSecond">[],
  edge: "start" | "end",
): number | undefined => {
  if (trackClips.length === 0) {
    return undefined;
  }

  return edge === "start"
    ? Math.min(...trackClips.map((trackClip) => trackClip.startSecond))
    : Math.max(
        ...trackClips.map((trackClip) =>
          snapTimelineSeconds(trackClip.startSecond + trackClip.durationSeconds),
        ),
      );
};

export const smartEditTimelineTextMaterialCount = (
  trackClips: SmartEditTrackSegment[],
): number => selectSmartEditTimelineTextMaterialIds(trackClips).length;

export const hasSmartEditTimelineTextMaterials = (
  trackClips: SmartEditTrackSegment[],
): boolean => smartEditTimelineTextMaterialCount(trackClips) > 0;

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
