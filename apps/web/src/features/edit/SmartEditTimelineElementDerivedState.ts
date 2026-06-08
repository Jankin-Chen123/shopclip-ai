import type { SmartEditPlan } from "@shopclip/shared";
import type { SmartEditTrackSegment } from "./SmartEditTimelineOperations";
import type { SmartEditTimelineElement } from "./SmartEditTimelineTypes";

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
