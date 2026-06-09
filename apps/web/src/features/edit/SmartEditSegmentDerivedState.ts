import type { AssetMetadata, AssetSlice, SmartEditPlan, SmartEditSegment } from "@shopclip/shared";

import { sourceLabel } from "./SmartEditSegmentUtils";
import { TIMELINE_BASE_PX_PER_SECOND } from "./SmartEditTimelineMath";
import { timelineDurationForSegments } from "./SmartEditTimelineOperations";

export const sortSmartEditSegments = (
  segments: SmartEditSegment[] | undefined,
): SmartEditSegment[] => [...(segments ?? [])].sort((left, right) => left.order - right.order);

export const selectSmartEditSegment = (
  sortedSegments: SmartEditSegment[],
  selectedSegmentId: string | undefined,
): SmartEditSegment | undefined =>
  sortedSegments.find((segment) => segment.id === selectedSegmentId) ?? sortedSegments[0];

export const materializableSmartEditSegments = (
  sortedSegments: SmartEditSegment[],
): SmartEditSegment[] =>
  sortedSegments.filter(
    (segment) =>
      segment.enabled && Boolean(segment.source.sceneClipVideoOnlyUrl || segment.source.sceneClipUrl),
  );

export const selectedSmartEditSegmentIndex = (
  sortedSegments: SmartEditSegment[],
  selectedSegment: SmartEditSegment | undefined,
): number =>
  selectedSegment
    ? sortedSegments.findIndex((segment) => segment.id === selectedSegment.id) + 1
    : 0;

export const selectSmartEditSegmentsById = (
  sortedSegments: SmartEditSegment[],
  selectedSegmentIdSet: Set<string>,
): SmartEditSegment[] =>
  sortedSegments.filter((segment) => selectedSegmentIdSet.has(segment.id));

export const selectSmartEditSegmentIdsOrUndefined = (
  segments: Array<Pick<SmartEditSegment, "id">>,
): string[] | undefined => {
  const ids = segments.map((segment) => segment.id);
  return ids.length > 0 ? ids : undefined;
};

export const updateSelectedSmartEditSegments = (
  segments: SmartEditSegment[],
  selectedSegments: Array<Pick<SmartEditSegment, "id">>,
  update: (segment: SmartEditSegment) => SmartEditSegment,
): SmartEditSegment[] => {
  const selectedIds = selectSmartEditSegmentIdsOrUndefined(selectedSegments);
  if (!selectedIds) {
    return segments;
  }
  const selectedIdSet = new Set(selectedIds);
  return segments.map((segment) => (selectedIdSet.has(segment.id) ? update(segment) : segment));
};

export const selectSmartEditSegmentIdByOffset = ({
  offset,
  selectedSegment,
  sortedSegments,
}: {
  offset: number;
  selectedSegment: SmartEditSegment | undefined;
  sortedSegments: SmartEditSegment[];
}): string | undefined => {
  if (sortedSegments.length === 0) {
    return undefined;
  }
  const currentIndex = Math.max(
    0,
    sortedSegments.findIndex((segment) => segment.id === selectedSegment?.id),
  );
  const nextIndex = Math.max(0, Math.min(sortedSegments.length - 1, currentIndex + offset));
  return sortedSegments[nextIndex]?.id;
};

export const smartEditEnabledDurationSeconds = (
  sortedSegments: SmartEditSegment[],
): number =>
  sortedSegments
    .filter((segment) => segment.enabled)
    .reduce((total, segment) => total + segment.durationSeconds, 0);

export const smartEditTimelineDurationSeconds = (
  sortedSegments: SmartEditSegment[],
): number => Math.max(1, timelineDurationForSegments(sortedSegments));

export const buildSmartEditTimelineMetrics = ({
  playheadSeconds,
  sortedSegments,
  timelineZoom,
}: {
  playheadSeconds: number;
  sortedSegments: SmartEditSegment[];
  timelineZoom: number;
}): {
  boundedPlayheadSeconds: number;
  enabledDurationSeconds: number;
  timelineDurationSeconds: number;
  timelinePixelsPerSecond: number;
  timelineWidth: number;
} => {
  const enabledDurationSeconds = smartEditEnabledDurationSeconds(sortedSegments);
  const timelineDurationSeconds = smartEditTimelineDurationSeconds(sortedSegments);
  const timelinePixelsPerSecond = TIMELINE_BASE_PX_PER_SECOND * timelineZoom;

  return {
    boundedPlayheadSeconds: Math.min(playheadSeconds, timelineDurationSeconds),
    enabledDurationSeconds,
    timelineDurationSeconds,
    timelinePixelsPerSecond,
    timelineWidth: Math.max(720, timelineDurationSeconds * timelinePixelsPerSecond),
  };
};

export const smartEditSelectedSourceLabel = (
  selectedSegment: SmartEditSegment | undefined,
  assets: AssetMetadata[],
): string => (selectedSegment ? sourceLabel(selectedSegment, assets) : "-");

export const smartEditPreviewSegmentLabel = (
  selectedSegment: SmartEditSegment | undefined,
  assets: AssetMetadata[],
): string =>
  selectedSegment ? selectedSegment.subtitle || sourceLabel(selectedSegment, assets) : "-";

export const selectSmartEditAssetSlicesForSegment = (
  assetSlices: AssetSlice[],
  selectedSegment: SmartEditSegment | undefined,
): AssetSlice[] =>
  selectedSegment?.source.assetId
    ? assetSlices.filter((slice) => slice.assetId === selectedSegment.source.assetId)
    : [];

export const selectSmartEditSegmentIdsWithToken = (
  segments: SmartEditSegment[],
  sourceIds: string[],
  token: string,
): string[] =>
  segments
    .map((segment) => segment.id)
    .filter((id) => sourceIds.some((sourceId) => id.startsWith(`${sourceId}-${token}-`)));

export const sortSmartEditPlanSegments = (
  plan: SmartEditPlan | undefined,
): SmartEditSegment[] => sortSmartEditSegments(plan?.segments);
