import type {
  SmartEditTimelineToolbarState,
} from "./SmartEditTimelineToolbar";
import type {
  SmartEditCommandHistory,
  SmartEditTimelineEditMode,
  TimelinePreviewRangeState,
} from "./SmartEditTimelineOperations";
import { formatTimelineTime } from "./SmartEditTimelineMath";

type NormalizedPreviewRange = { endSecond: number; startSecond: number };

export const selectSmartEditPreviewRangeLabel = (
  normalizedPreviewRange: NormalizedPreviewRange | undefined,
  fallbackLabel: string,
): string =>
  normalizedPreviewRange
    ? `${formatTimelineTime(normalizedPreviewRange.startSecond)}-${formatTimelineTime(normalizedPreviewRange.endSecond)}`
    : fallbackLabel;

export const buildSmartEditTimelineToolbarState = ({
  boundedPlayheadSeconds,
  commandHistory,
  commandHistoryLabel,
  materializableSegmentCount,
  normalizedPreviewRange,
  planExists,
  previewRange,
  previewRangeLabel,
  previewRangeLoopEnabled,
  selectedEditableMaterialCount,
  smartEditClipboardExists,
  timelineDurationSeconds,
  timelineEditMode,
}: {
  boundedPlayheadSeconds: number;
  commandHistory: SmartEditCommandHistory;
  commandHistoryLabel: (label: string) => string;
  materializableSegmentCount: number;
  normalizedPreviewRange?: NormalizedPreviewRange;
  planExists: boolean;
  previewRange: TimelinePreviewRangeState;
  previewRangeLabel: string;
  previewRangeLoopEnabled: boolean;
  selectedEditableMaterialCount: number;
  smartEditClipboardExists: boolean;
  timelineDurationSeconds: number;
  timelineEditMode: SmartEditTimelineEditMode;
}): SmartEditTimelineToolbarState => ({
  boundedPlayheadSeconds,
  commandHistory,
  commandHistoryLabel,
  hasMaterializableSegments: materializableSegmentCount > 0,
  hasPlan: planExists,
  hasSelectedEditableMaterials: selectedEditableMaterialCount > 0,
  hasSmartEditClipboard: smartEditClipboardExists,
  normalizedPreviewRange,
  previewRange,
  previewRangeLabel,
  previewRangeLoopEnabled,
  timelineDurationSeconds,
  timelineEditMode,
});
