import { describe, expect, it } from "vitest";
import type {
  ScriptResult,
  StoryboardScene,
} from "@shopclip/shared";

import type { ProjectSnapshot } from "../lib/api";
import {
  selectCurrentBackgroundTaskTarget,
  selectWorkspaceScenes,
} from "./AppWorkspaceDerivedState";

const sceneWithId = (id: string): StoryboardScene => ({ id }) as StoryboardScene;

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

describe("selectWorkspaceScenes", () => {
  it("uses the active script scenes before the project scenes", () => {
    const project = {
      scenes: [sceneWithId("project-scene")],
    } as ProjectSnapshot;
    const script = {
      scenes: [sceneWithId("script-scene")],
    } as ScriptResult;

    expect(selectWorkspaceScenes(script, project).map((scene) => scene.id)).toEqual([
      "script-scene",
    ]);
  });

  it("falls back to project scenes when there is no active script", () => {
    const project = {
      scenes: [sceneWithId("project-scene")],
    } as ProjectSnapshot;

    expect(selectWorkspaceScenes(undefined, project).map((scene) => scene.id)).toEqual([
      "project-scene",
    ]);
  });

  it("returns an empty scene list without script or project scenes", () => {
    expect(selectWorkspaceScenes(undefined, undefined)).toEqual([]);
  });
});
