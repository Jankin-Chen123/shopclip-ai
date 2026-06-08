import type { SmartEditSegment } from "@shopclip/shared";

import type { SmartEditTimelineElement } from "./SmartEditTimelineTypes";

export const selectSmartEditMaterializationTargetSegmentIds = ({
  materializableSegments,
  selectedSegmentIds,
}: {
  materializableSegments: Pick<SmartEditSegment, "id">[];
  selectedSegmentIds: string[];
}): string[] => {
  const selectedMaterializableIds = materializableSegments
    .filter((segment) => selectedSegmentIds.includes(segment.id))
    .map((segment) => segment.id);

  return selectedMaterializableIds.length > 0
    ? selectedMaterializableIds
    : materializableSegments.map((segment) => segment.id);
};

export const selectSmartEditMaterializedTimelineElementIds = ({
  elements,
  token,
}: {
  elements: SmartEditTimelineElement[] | undefined;
  token: string;
}): string[] => elements?.map((element) => element.id).filter((id) => id.endsWith(`-${token}`)) ?? [];
