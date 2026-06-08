import type { SmartEditPlan, SmartEditSegment } from "@shopclip/shared";
import type {
  SmartEditTrack,
  SmartEditTrackSegment,
  TrackClipMoveDragState,
  TrackClipTrimDragState,
} from "./SmartEditTimelineOperations";
import type { SmartEditTimelineElement } from "./SmartEditTimelineTypes";
import { clampTimelineStart, snapTimelineSeconds } from "./SmartEditTimelineMath";
import type { SmartEditTrackId } from "./SmartEditTrackUtils";
import { buildSmartEditTimeline } from "./SmartEditSegmentOperations";
import { selectSmartEditTimelineElementIdsForTrack } from "./SmartEditTimelineElementOperations";
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

export const selectSmartEditTimelineElementIdsWithToken = (
  elements: SmartEditTimelineElement[] | undefined,
  sourceIds: string[],
  token: string,
): string[] =>
  elements
    ?.map((element) => element.id)
    .filter((id) => sourceIds.some((sourceId) => id.startsWith(`${sourceId}-${token}-`))) ?? [];

export const selectSmartEditTimelineElementIdsByExactToken = (
  elements: SmartEditTimelineElement[] | undefined,
  sourceIds: string[],
  token: string,
): string[] =>
  elements
    ?.map((element) => element.id)
    .filter((id) => sourceIds.some((sourceId) => id === `${sourceId}-${token}`)) ?? [];

export const selectExistingSmartEditTimelineElementIds = (
  elements: SmartEditTimelineElement[] | undefined,
  sourceIds: string[],
): string[] => {
  const elementIdSet = new Set(elements?.map((element) => element.id) ?? []);
  return sourceIds.filter((id) => elementIdSet.has(id));
};

export const selectSplitSmartEditTextElementIds = (
  elements: SmartEditTimelineElement[] | undefined,
  sourceId: string,
): string[] =>
  elements
    ?.filter((element) => element.id === sourceId || element.id.startsWith(`${sourceId}-line-`))
    .map((element) => element.id) ?? [];

export const findSelectedSmartEditTimelineElement = (
  plan: SmartEditPlan | undefined,
  selectedTrackClip: SmartEditTrackSegment | undefined,
): SmartEditTimelineElement | undefined =>
  plan?.timeline?.elements.find((element) => element.id === selectedTrackClip?.id);

export const smartEditTimelineTextLineCount = (
  element: SmartEditTimelineElement | undefined,
): number =>
  element?.kind === "text"
    ? (element.text ?? element.label)
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter(Boolean).length
    : 0;

export const linkedSmartEditTimelineElements = (
  plan: SmartEditPlan | undefined,
  selectedTimelineElement: SmartEditTimelineElement | undefined,
): SmartEditTimelineElement[] => {
  if (!plan?.timeline || !selectedTimelineElement?.linkedGroupId) {
    return [];
  }
  return plan.timeline.elements.filter(
    (element) => element.linkedGroupId === selectedTimelineElement.linkedGroupId,
  );
};

export const canRelinkSmartEditTimelineElement = (
  plan: SmartEditPlan | undefined,
  selectedTimelineElement: SmartEditTimelineElement | undefined,
): boolean => {
  if (
    !plan?.timeline ||
    !selectedTimelineElement ||
    selectedTimelineElement.linkedGroupId ||
    !selectedTimelineElement.sceneId ||
    (selectedTimelineElement.kind !== "video" && selectedTimelineElement.kind !== "audio")
  ) {
    return false;
  }
  return plan.timeline.elements.some(
    (element) =>
      element.id !== selectedTimelineElement.id &&
      !element.linkedGroupId &&
      element.sceneId === selectedTimelineElement.sceneId &&
      ((selectedTimelineElement.kind === "video" && element.kind === "audio") ||
        (selectedTimelineElement.kind === "audio" && element.kind === "video")),
  );
};

export const smartEditTimelineTrackIdForTrack = (trackId: SmartEditTrackId): string =>
  trackId === "sourceAudio"
    ? "audio-source"
    : trackId === "caption"
      ? "text-copy"
      : trackId === "video"
        ? "video-main"
        : trackId === "bgm"
          ? "bgm-bed"
          : "voiceover";

export const smartEditTimelineTrackForTrack = (
  plan: SmartEditPlan | undefined,
  trackId: SmartEditTrackId,
): NonNullable<SmartEditPlan["timeline"]>["tracks"][number] | undefined =>
  (plan?.timeline ?? (plan ? buildSmartEditTimeline(plan) : undefined))?.tracks.find(
    (track) => track.id === smartEditTimelineTrackIdForTrack(trackId),
  );

export const smartEditTrackPresentationState = ({
  plan,
  track,
}: {
  plan: SmartEditPlan | undefined;
  track: SmartEditTrack;
}) => {
  const timelineTrack = smartEditTimelineTrackForTrack(plan, track.id);
  return {
    hidden: timelineTrack?.hidden ?? track.segments.every((segment) => segment.hidden),
    locked: timelineTrack?.locked ?? false,
    muted: timelineTrack?.muted ?? track.segments.every((segment) => segment.muted),
    selectableTrackMaterialCount: plan
      ? selectSmartEditTimelineElementIdsForTrack(plan, track.id).length
      : 0,
  };
};

export const isSmartEditTimelineTrackLocked = (
  plan: SmartEditPlan | undefined,
  trackId: SmartEditTrackId,
): boolean => smartEditTimelineTrackForTrack(plan, trackId)?.locked ?? false;

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

  const selectedResizeIds =
    selectedTrackClipIds.length > 1 && selectedTrackClipIdSet.has(trackClipTrimDrag.trackClip.id)
      ? selectedTrackClipIds
      : [];
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
