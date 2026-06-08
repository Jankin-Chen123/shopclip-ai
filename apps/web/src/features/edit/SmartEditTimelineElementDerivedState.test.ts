import { describe, expect, it } from "vitest";

import type { SmartEditPlan } from "@shopclip/shared";
import type { SmartEditTimelineElement } from "./SmartEditTimelineTypes";
import {
  canRelinkSmartEditTimelineElement,
  linkedSmartEditTimelineElements,
  selectSmartEditTimelineElementIdsByExactToken,
  smartEditTimelineTextLineCount,
} from "./SmartEditTimelineElementDerivedState";

const timelineElement = (
  id: string,
  patch: Partial<SmartEditTimelineElement> = {},
): SmartEditTimelineElement =>
  ({
    durationSeconds: 1,
    id,
    kind: "text",
    startSecond: 0,
    text: id,
    trackId: "text-copy",
    ...patch,
  }) as SmartEditTimelineElement;

const planWithElements = (elements: SmartEditTimelineElement[]): SmartEditPlan =>
  ({
    id: "plan-1",
    scenes: [],
    segments: [],
    timeline: {
      elements,
      tracks: [],
    },
  }) as SmartEditPlan;

describe("SmartEditTimelineElementDerivedState", () => {
  it("selects generated element ids by exact source-token match", () => {
    expect(
      selectSmartEditTimelineElementIdsByExactToken(
        [
          timelineElement("caption-1-split-token"),
          timelineElement("caption-1-split-token-extra"),
          timelineElement("caption-2-split-token"),
        ],
        ["caption-2", "caption-1"],
        "split-token",
      ),
    ).toEqual(["caption-1-split-token", "caption-2-split-token"]);
  });

  it("counts non-empty text lines from timeline text elements", () => {
    expect(
      smartEditTimelineTextLineCount(
        timelineElement("caption-1", { text: " first line \n\n second line " }),
      ),
    ).toBe(2);

    expect(
      smartEditTimelineTextLineCount(
        timelineElement("video-1", { kind: "video", text: undefined }),
      ),
    ).toBe(0);
  });

  it("returns linked timeline elements and relink eligibility", () => {
    const selectedVideo = timelineElement("video-1", {
      kind: "video",
      linkedGroupId: "group-1",
      sceneId: "scene-1",
    });
    const linkedAudio = timelineElement("audio-1", {
      kind: "audio",
      linkedGroupId: "group-1",
      sceneId: "scene-1",
    });
    const unlinkedVideo = timelineElement("video-2", {
      kind: "video",
      sceneId: "scene-2",
    });
    const relinkableAudio = timelineElement("audio-2", {
      kind: "audio",
      sceneId: "scene-2",
    });

    expect(
      linkedSmartEditTimelineElements(planWithElements([selectedVideo, linkedAudio]), selectedVideo)
        .map((element) => element.id),
    ).toEqual(["video-1", "audio-1"]);

    expect(
      canRelinkSmartEditTimelineElement(
        planWithElements([unlinkedVideo, relinkableAudio]),
        unlinkedVideo,
      ),
    ).toBe(true);

    expect(
      canRelinkSmartEditTimelineElement(
        planWithElements([selectedVideo, linkedAudio]),
        selectedVideo,
      ),
    ).toBe(false);
  });
});
