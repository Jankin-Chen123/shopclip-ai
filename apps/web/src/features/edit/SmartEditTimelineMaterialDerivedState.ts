import type { SmartEditSegment } from "@shopclip/shared";
import type { SmartEditTrackSegment } from "./SmartEditTimelineOperations";
import { snapTimelineSeconds } from "./SmartEditTimelineMath";
import type { SmartEditTrackId } from "./SmartEditTrackUtils";

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
