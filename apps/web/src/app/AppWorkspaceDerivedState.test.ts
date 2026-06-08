import { describe, expect, it } from "vitest";
import type { RenderTask, ScriptResult, SmartEditResult, StoryboardScene } from "@shopclip/shared";

import type { ProjectSnapshot } from "../lib/api";
import {
  selectCurrentBackgroundTaskTarget,
  selectRenderedSmartEditSceneSegments,
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

describe("selectRenderedSmartEditSceneSegments", () => {
  it("maps completed rendered scene clips into Smart Edit segment overrides", () => {
    const renderTask = {
      status: "completed",
      sceneClips: [
        {
          sceneId: "scene-1",
          order: 1,
          subtitle: "Clip subtitle",
          videoUrl: "https://cdn.example.test/scene-1.mp4",
          material: {
            audioUrl: "https://cdn.example.test/scene-1.wav",
            materializedAt: "2026-06-08T00:00:00.000Z",
            status: "ready",
            text: "Material subtitle",
            videoOnlyUrl: "https://cdn.example.test/scene-1-video.mp4",
          },
        },
        {
          sceneId: "scene-2",
          order: 2,
          subtitle: "No video clip",
        },
      ],
    } as RenderTask;
    const scenes = [
      {
        ...sceneWithId("scene-1"),
        durationSeconds: 7,
        voiceover: "Scene voiceover",
      },
    ];

    expect(selectRenderedSmartEditSceneSegments(renderTask, scenes, undefined)).toEqual([
      {
        sceneId: "scene-1",
        durationSeconds: 7,
        enabled: true,
        timelineStartSecond: 0,
        playbackRate: 1,
        sourceAudioMuted: false,
        sourceAudioStartOffsetSeconds: 0,
        captionHidden: false,
        captionStartOffsetSeconds: 0,
        voiceoverStartOffsetSeconds: 0,
        source: {
          kind: "generated-scene-clip",
          sceneClipAudioUrl: "https://cdn.example.test/scene-1.wav",
          sceneClipAudioWaveform: undefined,
          sceneClipUrl: "https://cdn.example.test/scene-1.mp4",
          sceneClipVideoOnlyUrl: "https://cdn.example.test/scene-1-video.mp4",
        },
        subtitle: "Material subtitle",
        transition: "cut",
        voiceover: "Scene voiceover",
      },
    ]);
  });

  it("falls back to clip subtitle and default duration when scene metadata is absent", () => {
    const renderTask = {
      status: "completed",
      sceneClips: [
        {
          sceneId: "scene-2",
          order: 2,
          subtitle: "Clip subtitle",
          videoUrl: "https://cdn.example.test/scene-2.mp4",
        },
      ],
    } as RenderTask;

    expect(selectRenderedSmartEditSceneSegments(renderTask, [], undefined)).toEqual([
      {
        sceneId: "scene-2",
        durationSeconds: 4,
        enabled: true,
        timelineStartSecond: 0,
        playbackRate: 1,
        sourceAudioMuted: false,
        sourceAudioStartOffsetSeconds: 0,
        captionHidden: false,
        captionStartOffsetSeconds: 0,
        voiceoverStartOffsetSeconds: 0,
        source: {
          kind: "generated-scene-clip",
          sceneClipAudioUrl: undefined,
          sceneClipAudioWaveform: undefined,
          sceneClipUrl: "https://cdn.example.test/scene-2.mp4",
          sceneClipVideoOnlyUrl: undefined,
        },
        subtitle: "Clip subtitle",
        transition: "fade",
        voiceover: "Clip subtitle",
      },
    ]);
  });

  it("does not seed rendered segments while an existing Smart Edit result is active", () => {
    expect(
      selectRenderedSmartEditSceneSegments(
        {
          status: "completed",
          sceneClips: [
            {
              sceneId: "scene-1",
              order: 1,
              subtitle: "Clip subtitle",
              videoUrl: "https://cdn.example.test/scene-1.mp4",
            },
          ],
        } as RenderTask,
        [sceneWithId("scene-1")],
        {} as SmartEditResult,
      ),
    ).toEqual([]);
  });

  it("returns no rendered segments before render completion", () => {
    expect(
      selectRenderedSmartEditSceneSegments(
        {
          status: "running",
          sceneClips: [
            {
              sceneId: "scene-1",
              order: 1,
              subtitle: "Clip subtitle",
              videoUrl: "https://cdn.example.test/scene-1.mp4",
            },
          ],
        } as RenderTask,
        [sceneWithId("scene-1")],
        undefined,
      ),
    ).toEqual([]);
  });
});
