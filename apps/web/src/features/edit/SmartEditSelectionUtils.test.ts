import { describe, expect, it } from "vitest";

import {
  retainSmartEditSelectionIds,
  toggleSmartEditSelectionId,
} from "./SmartEditSelectionUtils";

describe("SmartEditSelectionUtils", () => {
  it("retains valid selected ids in their current selection order", () => {
    expect(
      retainSmartEditSelectionIds({
        fallbackId: "scene-1",
        selectedIds: ["scene-3", "missing", "scene-2"],
        validIds: ["scene-1", "scene-2", "scene-3"],
      }),
    ).toEqual(["scene-3", "scene-2"]);
  });

  it("falls back when no selected ids remain valid", () => {
    expect(
      retainSmartEditSelectionIds({
        fallbackId: "scene-1",
        selectedIds: ["missing"],
        validIds: ["scene-1", "scene-2"],
      }),
    ).toEqual(["scene-1"]);
  });

  it("toggles ids while preserving timeline order", () => {
    expect(
      toggleSmartEditSelectionId({
        currentIds: ["clip-3", "clip-1"],
        orderedIds: ["clip-1", "clip-2", "clip-3"],
        targetId: "clip-2",
      }),
    ).toEqual(["clip-1", "clip-2", "clip-3"]);
  });

  it("does not remove the last selected id when toggled", () => {
    expect(
      toggleSmartEditSelectionId({
        currentIds: ["clip-1"],
        orderedIds: ["clip-1", "clip-2"],
        targetId: "clip-1",
      }),
    ).toEqual(["clip-1"]);
  });
});
