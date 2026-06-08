import { describe, expect, it } from "vitest";

import { formatSmartEditCommandHistoryLabel } from "./SmartEditCommandHistory";

describe("SmartEditCommandHistory", () => {
  it("formats known command labels with localized history actions", () => {
    expect(
      formatSmartEditCommandHistoryLabel("Add text clip", {
        "Add text clip": "text clip",
      }),
    ).toBe("text clip");
  });

  it("falls back to the original command label when no mapping exists", () => {
    expect(formatSmartEditCommandHistoryLabel("Custom action", {})).toBe("Custom action");
  });
});
