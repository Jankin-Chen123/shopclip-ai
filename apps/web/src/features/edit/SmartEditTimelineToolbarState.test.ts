import { describe, expect, it } from "vitest";

import { createSmartEditCommandHistory } from "./SmartEditCommandHistory";
import { buildSmartEditTimelineToolbarState } from "./SmartEditTimelineToolbarState";

describe("buildSmartEditTimelineToolbarState", () => {
  it("maps timeline toolbar values and derives boolean flags", () => {
    const commandHistory = createSmartEditCommandHistory();
    const commandHistoryLabel = (label: string) => `Label: ${label}`;
    const previewRange = { inSecond: 1, outSecond: 5 };
    const normalizedPreviewRange = { startSecond: 1, endSecond: 5 };

    const state = buildSmartEditTimelineToolbarState({
      boundedPlayheadSeconds: 2,
      commandHistory,
      commandHistoryLabel,
      materializableSegmentCount: 3,
      normalizedPreviewRange,
      planExists: true,
      previewRange,
      previewRangeLabel: "1.0s - 5.0s",
      previewRangeLoopEnabled: true,
      selectedEditableMaterialCount: 2,
      smartEditClipboardExists: true,
      timelineDurationSeconds: 12,
      timelineEditMode: "ripple",
    });

    expect(state).toEqual({
      boundedPlayheadSeconds: 2,
      commandHistory,
      commandHistoryLabel,
      hasMaterializableSegments: true,
      hasPlan: true,
      hasSelectedEditableMaterials: true,
      hasSmartEditClipboard: true,
      normalizedPreviewRange,
      previewRange,
      previewRangeLabel: "1.0s - 5.0s",
      previewRangeLoopEnabled: true,
      timelineDurationSeconds: 12,
      timelineEditMode: "ripple",
    });
  });

  it("derives disabled-state flags from empty counts and missing references", () => {
    const state = buildSmartEditTimelineToolbarState({
      boundedPlayheadSeconds: 0,
      commandHistory: createSmartEditCommandHistory(),
      commandHistoryLabel: (label) => label,
      materializableSegmentCount: 0,
      planExists: false,
      previewRange: {},
      previewRangeLabel: "None",
      previewRangeLoopEnabled: false,
      selectedEditableMaterialCount: 0,
      smartEditClipboardExists: false,
      timelineDurationSeconds: 1,
      timelineEditMode: "magnetic",
    });

    expect(state.hasMaterializableSegments).toBe(false);
    expect(state.hasPlan).toBe(false);
    expect(state.hasSelectedEditableMaterials).toBe(false);
    expect(state.hasSmartEditClipboard).toBe(false);
    expect(state.normalizedPreviewRange).toBeUndefined();
  });
});
