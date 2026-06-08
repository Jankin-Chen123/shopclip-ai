import { describe, expect, it } from "vitest";
import type { SmartEditSegment } from "@shopclip/shared";

import type { SmartEditTimelineElement } from "./SmartEditTimelineTypes";
import {
  selectSmartEditMaterializationTargetSegmentIds,
  selectSmartEditMaterializedTimelineElementIds,
} from "./SmartEditMaterialization";

const segment = (id: string): SmartEditSegment => ({ id }) as SmartEditSegment;
const element = (id: string): SmartEditTimelineElement => ({ id }) as SmartEditTimelineElement;

describe("SmartEditMaterialization", () => {
  it("uses selected materializable segments when any selected segment can be materialized", () => {
    expect(
      selectSmartEditMaterializationTargetSegmentIds({
        materializableSegments: [segment("scene-1"), segment("scene-2"), segment("scene-3")],
        selectedSegmentIds: ["scene-2", "not-materializable"],
      }),
    ).toEqual(["scene-2"]);
  });

  it("falls back to all materializable segments when no selection can be materialized", () => {
    expect(
      selectSmartEditMaterializationTargetSegmentIds({
        materializableSegments: [segment("scene-1"), segment("scene-2")],
        selectedSegmentIds: ["not-materializable"],
      }),
    ).toEqual(["scene-1", "scene-2"]);
  });

  it("returns all materializable segments when nothing is selected", () => {
    expect(
      selectSmartEditMaterializationTargetSegmentIds({
        materializableSegments: [segment("scene-1"), segment("scene-2")],
        selectedSegmentIds: [],
      }),
    ).toEqual(["scene-1", "scene-2"]);
  });

  it("selects timeline element ids created with the materialization token", () => {
    expect(
      selectSmartEditMaterializedTimelineElementIds({
        elements: [
          element("source-video-token-1"),
          element("source-audio-token-1"),
          element("source-video-other-token"),
        ],
        token: "token-1",
      }),
    ).toEqual(["source-video-token-1", "source-audio-token-1"]);
  });

  it("returns no added timeline element ids when the timeline is absent", () => {
    expect(
      selectSmartEditMaterializedTimelineElementIds({
        elements: undefined,
        token: "token",
      }),
    ).toEqual([]);
  });
});
