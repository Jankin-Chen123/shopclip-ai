import { describe, expect, it } from "vitest";

import { selectCurrentBackgroundTaskTarget } from "./AppWorkspaceDerivedState";

describe("selectCurrentBackgroundTaskTarget", () => {
  it("keeps the project detail tab only for project page tasks", () => {
    expect(
      selectCurrentBackgroundTaskTarget({
        flow: "script",
        isProjectStudioMode: false,
        page: "project",
        projectDetailTab: "timeline",
        section: "create",
      }),
    ).toEqual({
      flow: undefined,
      isProjectStudioMode: false,
      page: "project",
      projectDetailTab: "timeline",
      section: "create",
    });
  });

  it("drops the project detail tab outside the project page", () => {
    expect(
      selectCurrentBackgroundTaskTarget({
        flow: "render",
        isProjectStudioMode: false,
        page: "studio",
        projectDetailTab: "timeline",
        section: "create",
      }),
    ).toEqual({
      flow: undefined,
      isProjectStudioMode: false,
      page: "studio",
      projectDetailTab: undefined,
      section: "create",
    });
  });

  it("keeps the studio flow only while project studio mode is active", () => {
    expect(
      selectCurrentBackgroundTaskTarget({
        flow: "storyboard",
        isProjectStudioMode: true,
        page: "studio",
        projectDetailTab: "overview",
        section: "create",
      }),
    ).toEqual({
      flow: "storyboard",
      isProjectStudioMode: true,
      page: "studio",
      projectDetailTab: undefined,
      section: "create",
    });
  });
});
