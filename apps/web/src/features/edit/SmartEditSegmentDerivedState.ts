import type { AssetMetadata, SmartEditPlan, SmartEditSegment } from "@shopclip/shared";

import { sourceLabel } from "./SmartEditSegmentUtils";
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

export const smartEditSelectedSourceLabel = (
  selectedSegment: SmartEditSegment | undefined,
  assets: AssetMetadata[],
): string => (selectedSegment ? sourceLabel(selectedSegment, assets) : "-");

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
