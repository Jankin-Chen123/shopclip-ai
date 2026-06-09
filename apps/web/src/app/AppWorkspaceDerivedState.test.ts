import { describe, expect, it } from "vitest";
import type {
  RenderTask,
  SmartEditPlan,
  ScriptResult,
  StoryboardScene,
} from "@shopclip/shared";

import type { ProjectSnapshot } from "../lib/api";
import {
  selectAssetPrepKeywordsChanged,
  selectCurrentBackgroundTaskTarget,
  selectLoadedProjectWorkspaceState,
  selectReferenceSourceAssets,
  selectSectionPage,
  selectWorkspaceAssetRefreshAction,
  selectWorkspaceScenes,
} from "./AppWorkspaceDerivedState";

const sceneWithId = (id: string): StoryboardScene => ({ id }) as StoryboardScene;

const scriptWithScenes = (id: string, scenes: StoryboardScene[]): ScriptResult =>
  ({
    id,
    narrative: `${id} narrative`,
    scenes,
  }) as ScriptResult;

const smartEditPlan = (segmentId: string): SmartEditPlan =>
  ({
    id: `plan-${segmentId}`,
    segments: [{ id: segmentId }],
  }) as SmartEditPlan;

const renderTask = (patch: Partial<RenderTask>): RenderTask =>
  ({
    id: "render-1",
    provider: "ffmpeg",
    status: "completed",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...patch,
  }) as RenderTask;

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

describe("selectWorkspaceAssetRefreshAction", () => {
  it("refreshes references and templates for the template asset library", () => {
    expect(
      selectWorkspaceAssetRefreshAction({
        activeAssetCategory: "template",
        activePage: "assets",
      }),
    ).toEqual({ type: "reference", includeTemplates: true });
  });

  it("refreshes the selected category on non-template asset library pages", () => {
    expect(
      selectWorkspaceAssetRefreshAction({
        activeAssetCategory: "image",
        activePage: "assets",
      }),
    ).toEqual({ type: "asset", category: "image" });
  });

  it("refreshes all reusable assets for inspiration", () => {
    expect(
      selectWorkspaceAssetRefreshAction({
        activeAssetCategory: "video",
        activePage: "inspiration",
      }),
    ).toEqual({ type: "asset", category: "all" });
  });

  it("uses the creation-page asset refresh category for create pages", () => {
    expect(
      selectWorkspaceAssetRefreshAction({
        activeAssetCategory: "audio",
        activePage: "create",
      }),
    ).toEqual({ type: "asset", category: "all" });
  });

  it("does not refresh an asset library for project pages", () => {
    expect(
      selectWorkspaceAssetRefreshAction({
        activeAssetCategory: "image",
        activePage: "project",
      }),
    ).toEqual({ type: "none" });
  });
});

describe("selectSectionPage", () => {
  it("routes top-level workspace sections to their pages", () => {
    expect(selectSectionPage("assets")).toBe("assets");
    expect(selectSectionPage("inspiration")).toBe("inspiration");
    expect(selectSectionPage("settings")).toBe("settings");
  });

  it("routes creation and project sections back to the project page", () => {
    expect(selectSectionPage("create")).toBe("project");
  });
});

describe("selectAssetPrepKeywordsChanged", () => {
  it("detects when the asset prep keyword snapshot differs from the project", () => {
    expect(selectAssetPrepKeywordsChanged(["hero", "demo"], ["hero", "ugc"])).toBe(true);
  });

  it("keeps order-sensitive keyword snapshots unchanged", () => {
    expect(selectAssetPrepKeywordsChanged(["hero", "demo"], ["hero", "demo"])).toBe(false);
    expect(selectAssetPrepKeywordsChanged(["hero", "demo"], ["demo", "hero"])).toBe(true);
  });
});

describe("selectReferenceSourceAssets", () => {
  it("keeps local video assets and excludes public reference videos", () => {
    const assets = [
      { id: "image", type: "image", mimeType: "image/png", source: "upload" },
      { id: "video-by-type", type: "video", mimeType: "application/octet-stream", source: "upload" },
      { id: "video-by-mime", type: "image", mimeType: "video/mp4", source: "generated" },
      { id: "public-reference", type: "video", mimeType: "video/mp4", source: "public_reference" },
    ];

    expect(selectReferenceSourceAssets(assets as never).map((asset) => asset.id)).toEqual([
      "video-by-type",
      "video-by-mime",
    ]);
  });
});

describe("selectLoadedProjectWorkspaceState", () => {
  it("uses the latest script for the initial script draft and selected scene", () => {
    const firstScript = scriptWithScenes("script-1", [sceneWithId("scene-from-first-script")]);
    const latestScript = scriptWithScenes("script-2", [sceneWithId("scene-from-latest-script")]);

    const state = selectLoadedProjectWorkspaceState({
      language: "en",
      mediaSettings: {
        aspectRatio: "9:16",
        bgmTrack: "uplifting",
        targetDurationSeconds: 30,
        ttsVoice: "alloy",
      },
      project: {
        scenes: [sceneWithId("project-scene")],
        scripts: [firstScript, latestScript],
        renderTasks: [],
      } as ProjectSnapshot,
      smartEditTargetLanguage: "en-US",
    });

    expect(state.latestScript).toBe(latestScript);
    expect(state.scriptDraft).toBe("script-2 narrative");
    expect(state.selectedSceneId).toBe("scene-from-latest-script");
  });

  it("prefers the latest completed smart edit render over a source render seed", () => {
    const olderSmartEdit = renderTask({
      id: "smart-edit-1",
      exportUrl: "https://example.test/old.mp4",
      previewUrl: "https://example.test/old-preview.mp4",
      provider: "smart-edit-ffmpeg",
      smartEditPlan: smartEditPlan("old-segment"),
    });
    const latestSmartEdit = renderTask({
      id: "smart-edit-2",
      exportUrl: "https://example.test/new.mp4",
      previewUrl: "https://example.test/new-preview.mp4",
      provider: "smart-edit-ffmpeg",
      smartEditPlan: smartEditPlan("new-segment"),
      smartEditSegmentOutputs: [{ segmentId: "new-segment", videoUrl: "https://example.test/new.mp4" }],
    });

    const state = selectLoadedProjectWorkspaceState({
      language: "en",
      mediaSettings: {
        aspectRatio: "9:16",
        bgmTrack: "uplifting",
        targetDurationSeconds: 30,
        ttsVoice: "alloy",
      },
      project: {
        scenes: [sceneWithId("project-scene")],
        scripts: [],
        renderTasks: [olderSmartEdit, latestSmartEdit],
      } as ProjectSnapshot,
      smartEditTargetLanguage: "en-US",
    });

    expect(state.smartEditResult?.renderTaskId).toBe("smart-edit-2");
    expect(state.smartEditResult?.segmentOutputs).toEqual([
      { segmentId: "new-segment", videoUrl: "https://example.test/new.mp4" },
    ]);
    expect(state.selectedSmartEditSegmentId).toBe("new-segment");
  });
});
