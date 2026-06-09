import type {
  SmartEditTimelineToolbarState,
} from "./SmartEditTimelineToolbar";
import type {
  SmartEditCommandHistory,
  SmartEditTimelineEditMode,
  TimelinePreviewRangeState,
} from "./SmartEditTimelineOperations";

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
  normalizedPreviewRange?: { endSecond: number; startSecond: number };
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
