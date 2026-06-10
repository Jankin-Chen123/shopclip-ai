import { describe, expect, it } from "vitest";

import {
  clampBackgroundTaskAnchorPosition,
  getBackgroundTaskPopoverStyle,
} from "./AppShell";

describe("background task floating placement", () => {
  const anchor = { height: 52, width: 174 };
  const viewport = { viewportHeight: 600, viewportWidth: 800 };

  it("clamps only the floating trigger to the viewport", () => {
    expect(
      clampBackgroundTaskAnchorPosition({
        anchor,
        position: { x: -120, y: -40 },
        viewport,
      }),
    ).toEqual({ x: 0, y: 0 });

    expect(
      clampBackgroundTaskAnchorPosition({
        anchor,
        position: { x: 760, y: 590 },
        viewport,
      }),
    ).toEqual({ x: 626, y: 548 });
  });

  it("keeps the popover visible when the trigger sits on the left edge", () => {
    expect(
      getBackgroundTaskPopoverStyle({
        anchor,
        position: { x: 0, y: 40 },
        viewport,
      }),
    ).toMatchObject({
      "--background-task-popover-left": "8px",
      "--background-task-popover-top": "60px",
      "--background-task-popover-width": "360px",
    });
  });

  it("shifts the popover left near the right edge and flips above near the bottom", () => {
    expect(
      getBackgroundTaskPopoverStyle({
        anchor,
        position: { x: 626, y: 548 },
        viewport,
      }),
    ).toMatchObject({
      "--background-task-popover-bottom": "60px",
      "--background-task-popover-left": "-194px",
      "--background-task-popover-top": "auto",
    });
  });
});
