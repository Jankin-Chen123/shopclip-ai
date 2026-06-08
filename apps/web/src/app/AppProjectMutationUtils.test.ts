import { describe, expect, it } from "vitest";
import type {
  AssetMetadata,
  AssetProcessingEvent,
  AssetProcessingJob,
  AssetSlice,
  Project,
  RenderTask,
  ScriptResult,
  StoryboardScene,
  ViralTemplate,
} from "@shopclip/shared";

import type { ProjectSnapshot } from "../lib/api";
import {
  appendProjectScript,
  appendProjectAsset,
  appendProjectRenderTask,
  mergeImportedProjectAssets,
  markProjectRenderTaskExported,
  removeProjectAssets,
  replaceProjectScriptStoryboard,
  replaceProjectRenderTaskProgress,
  replaceProjectScenesAcrossScripts,
  replaceProjectPrepKeywords,
  replaceProcessedProjectAsset,
  upsertProjectRenderTask,
  upsertProjectAsset,
  upsertProjectViralTemplate,
} from "./AppProjectMutationUtils";

const asset = (id: string): AssetMetadata => ({ id }) as AssetMetadata;
const slice = (id: string, assetId: string): AssetSlice => ({ id, assetId }) as AssetSlice;
const processingEvent = (id: string, assetId: string): AssetProcessingEvent =>
  ({ id, assetId }) as AssetProcessingEvent;
const processingJob = (id: string, assetId: string): AssetProcessingJob =>
  ({ id, assetId }) as AssetProcessingJob;
const scene = (id: string, assetId?: string): StoryboardScene =>
  ({ id, assetId }) as StoryboardScene;
const script = (id: string, scenes: StoryboardScene[]): ScriptResult =>
  ({ id, scenes }) as ScriptResult;
const renderTask = (
  id: string,
  status: RenderTask["status"] = "running",
): RenderTask => ({ id, status }) as RenderTask;
const viralTemplate = (templateId: string, title: string): ViralTemplate =>
  ({ templateId, title }) as ViralTemplate;

describe("removeProjectAssets", () => {
  it("removes assets and slices while clearing scene asset references", () => {
    const project = {
      assets: [asset("asset-keep"), asset("asset-delete")],
      assetSlices: [slice("slice-keep", "asset-keep"), slice("slice-delete", "asset-delete")],
      scenes: [scene("scene-keep", "asset-keep"), scene("scene-delete", "asset-delete")],
      scripts: [
        {
          id: "script-1",
          scenes: [
            scene("script-scene-keep", "asset-keep"),
            scene("script-scene-delete", "asset-delete"),
          ],
        } as ScriptResult,
      ],
    } as ProjectSnapshot;

    const nextProject = removeProjectAssets(project, new Set(["asset-delete"]));

    expect(nextProject?.assets.map((candidate) => candidate.id)).toEqual(["asset-keep"]);
    expect(nextProject?.assetSlices.map((candidate) => candidate.id)).toEqual(["slice-keep"]);
    expect(nextProject?.scenes).toEqual([
      expect.objectContaining({ id: "scene-keep", assetId: "asset-keep" }),
      expect.objectContaining({ id: "scene-delete", assetId: undefined }),
    ]);
    expect(nextProject?.scripts[0]?.scenes).toEqual([
      expect.objectContaining({ id: "script-scene-keep", assetId: "asset-keep" }),
      expect.objectContaining({ id: "script-scene-delete", assetId: undefined }),
    ]);
  });

  it("preserves an undefined project", () => {
    expect(removeProjectAssets(undefined, new Set(["asset-delete"]))).toBeUndefined();
  });
});

describe("appendProjectScript", () => {
  it("appends a generated script, promotes its scenes, and marks the project ready", () => {
    const initialScript = script("script-existing", [scene("scene-existing")]);
    const nextScript = script("script-new", [scene("scene-new-a"), scene("scene-new-b")]);
    const project = {
      scenes: initialScript.scenes,
      scripts: [initialScript],
      status: "draft" as Project["status"],
    } as ProjectSnapshot;

    const nextProject = appendProjectScript(project, nextScript);

    expect(nextProject?.scenes.map((candidate) => candidate.id)).toEqual([
      "scene-new-a",
      "scene-new-b",
    ]);
    expect(nextProject?.scripts.map((candidate) => candidate.id)).toEqual([
      "script-existing",
      "script-new",
    ]);
    expect(nextProject?.status).toBe("ready");
  });

  it("preserves an undefined project", () => {
    expect(appendProjectScript(undefined, script("script-new", []))).toBeUndefined();
  });
});

describe("replaceProjectScriptStoryboard", () => {
  it("replaces an existing script storyboard and marks the project ready", () => {
    const existingScript = script("script-1", [scene("old-scene")]);
    const updatedScript = script("script-1", [scene("new-scene-a"), scene("new-scene-b")]);
    const untouchedScript = script("script-2", [scene("other-scene")]);
    const project = {
      scenes: existingScript.scenes,
      scripts: [existingScript, untouchedScript],
      status: "draft" as Project["status"],
    } as ProjectSnapshot;

    const nextProject = replaceProjectScriptStoryboard(project, updatedScript);

    expect(nextProject?.scenes.map((candidate) => candidate.id)).toEqual([
      "new-scene-a",
      "new-scene-b",
    ]);
    expect(nextProject?.scripts).toEqual([
      expect.objectContaining({ id: "script-1", scenes: updatedScript.scenes }),
      expect.objectContaining({ id: "script-2", scenes: untouchedScript.scenes }),
    ]);
    expect(nextProject?.status).toBe("ready");
  });

  it("preserves an undefined project", () => {
    expect(replaceProjectScriptStoryboard(undefined, script("script-new", []))).toBeUndefined();
  });
});

describe("replaceProjectScenesAcrossScripts", () => {
  it("replaces project scenes and syncs matching script scene versions", () => {
    const project = {
      scenes: [scene("scene-1"), scene("scene-2")],
      scripts: [
        script("script-1", [scene("scene-1"), scene("scene-3")]),
        script("script-2", [scene("scene-2")]),
      ],
    } as ProjectSnapshot;
    const updatedScenes = [
      { ...scene("scene-1"), subtitle: "Updated one" },
      { ...scene("scene-2"), subtitle: "Updated two" },
      { ...scene("scene-ignored"), subtitle: "Not in scripts" },
    ];

    const nextProject = replaceProjectScenesAcrossScripts(project, updatedScenes);

    expect(nextProject?.scenes).toEqual(updatedScenes);
    expect(nextProject?.scripts[0]?.scenes).toEqual([
      expect.objectContaining({ id: "scene-1", subtitle: "Updated one" }),
    ]);
    expect(nextProject?.scripts[1]?.scenes).toEqual([
      expect.objectContaining({ id: "scene-2", subtitle: "Updated two" }),
    ]);
  });

  it("preserves an undefined project", () => {
    expect(replaceProjectScenesAcrossScripts(undefined, [scene("scene-1")])).toBeUndefined();
  });
});

describe("project render task mutations", () => {
  it("appends a render task and marks the project rendering until completion", () => {
    const project = {
      renderTasks: [renderTask("render-existing", "completed")],
      status: "ready" as Project["status"],
    } as ProjectSnapshot;

    const nextProject = appendProjectRenderTask(project, renderTask("render-new", "running"));

    expect(nextProject?.renderTasks.map((candidate) => candidate.id)).toEqual([
      "render-existing",
      "render-new",
    ]);
    expect(nextProject?.status).toBe("rendering");
  });

  it("appends a completed render task and marks the project completed", () => {
    const project = {
      renderTasks: [],
      status: "rendering" as Project["status"],
    } as ProjectSnapshot;

    const nextProject = appendProjectRenderTask(project, renderTask("render-new", "completed"));

    expect(nextProject?.renderTasks.map((candidate) => candidate.id)).toEqual(["render-new"]);
    expect(nextProject?.status).toBe("completed");
  });

  it("upserts a render task by id and updates the project render status", () => {
    const project = {
      renderTasks: [renderTask("render-1", "running"), renderTask("render-2", "completed")],
      status: "rendering" as Project["status"],
    } as ProjectSnapshot;

    const nextProject = upsertProjectRenderTask(project, renderTask("render-1", "completed"));

    expect(nextProject?.renderTasks.map((candidate) => `${candidate.id}:${candidate.status}`)).toEqual([
      "render-2:completed",
      "render-1:completed",
    ]);
    expect(nextProject?.status).toBe("completed");
  });

  it("replaces polled render task progress while preserving project status until completion", () => {
    const project = {
      renderTasks: [renderTask("render-1", "running")],
      status: "ready" as Project["status"],
    } as ProjectSnapshot;

    const runningProject = replaceProjectRenderTaskProgress(
      project,
      renderTask("render-1", "running"),
    );
    const completedProject = replaceProjectRenderTaskProgress(
      project,
      renderTask("render-1", "completed"),
    );

    expect(runningProject?.renderTasks[0]?.status).toBe("running");
    expect(runningProject?.status).toBe("ready");
    expect(completedProject?.renderTasks[0]?.status).toBe("completed");
    expect(completedProject?.status).toBe("completed");
  });

  it("marks a render task exported and completes the project", () => {
    const project = {
      renderTasks: [renderTask("render-1", "completed"), renderTask("render-2", "running")],
      status: "rendering" as Project["status"],
    } as ProjectSnapshot;

    const nextProject = markProjectRenderTaskExported(project, {
      exportUrl: "https://example.com/export.mp4",
      renderTaskId: "render-1",
    });

    expect(nextProject?.renderTasks[0]).toEqual(
      expect.objectContaining({
        exportUrl: "https://example.com/export.mp4",
        previewUrl: "https://example.com/export.mp4",
      }),
    );
    expect(nextProject?.renderTasks[1]).toEqual(expect.objectContaining({ id: "render-2" }));
    expect(nextProject?.status).toBe("completed");
  });
});

describe("single project asset mutations", () => {
  it("appends an asset that belongs to the current project", () => {
    const project = {
      id: "project-1",
      assets: [asset("asset-1")],
    } as ProjectSnapshot;

    expect(
      appendProjectAsset(project, { ...asset("asset-2"), projectId: "project-1" }).assets.map(
        (candidate) => candidate.id,
      ),
    ).toEqual(["asset-1", "asset-2"]);
  });

  it("leaves the project unchanged when the appended asset belongs elsewhere", () => {
    const project = {
      id: "project-1",
      assets: [asset("asset-1")],
    } as ProjectSnapshot;

    expect(appendProjectAsset(project, { ...asset("asset-2"), projectId: "project-2" })).toBe(
      project,
    );
  });

  it("replaces an existing asset before appending the latest version", () => {
    const project = {
      id: "project-1",
      assets: [
        { ...asset("asset-1"), name: "Old" },
        { ...asset("asset-2"), name: "Keep" },
      ],
    } as ProjectSnapshot;

    expect(
      upsertProjectAsset(project, {
        ...asset("asset-1"),
        name: "New",
        projectId: "project-1",
      }).assets,
    ).toEqual([
      expect.objectContaining({ id: "asset-2", name: "Keep" }),
      expect.objectContaining({ id: "asset-1", name: "New" }),
    ]);
  });
});

describe("upsertProjectViralTemplate", () => {
  it("replaces an existing template by id before appending the latest version", () => {
    const project = {
      viralTemplates: [
        viralTemplate("template-1", "Old"),
        viralTemplate("template-2", "Keep"),
      ],
    } as ProjectSnapshot;

    const nextProject = upsertProjectViralTemplate(
      project,
      viralTemplate("template-1", "New"),
    );

    expect(nextProject?.viralTemplates).toEqual([
      expect.objectContaining({ templateId: "template-2", title: "Keep" }),
      expect.objectContaining({ templateId: "template-1", title: "New" }),
    ]);
  });

  it("appends a new template", () => {
    const project = {
      viralTemplates: [viralTemplate("template-1", "Existing")],
    } as ProjectSnapshot;

    const nextProject = upsertProjectViralTemplate(
      project,
      viralTemplate("template-2", "New"),
    );

    expect(nextProject?.viralTemplates.map((candidate) => candidate.templateId)).toEqual([
      "template-1",
      "template-2",
    ]);
  });

  it("preserves an undefined project", () => {
    expect(
      upsertProjectViralTemplate(undefined, viralTemplate("template-1", "New")),
    ).toBeUndefined();
  });
});

describe("replaceProjectPrepKeywords", () => {
  it("replaces prep keywords for the matching project", () => {
    const project = {
      id: "project-1",
      prepKeywords: ["old"],
    } as ProjectSnapshot;

    const nextProject = replaceProjectPrepKeywords(project, {
      id: "project-1",
      prepKeywords: ["new", "keywords"],
    });

    expect(nextProject?.prepKeywords).toEqual(["new", "keywords"]);
  });

  it("leaves the project unchanged when the updated project id does not match", () => {
    const project = {
      id: "project-1",
      prepKeywords: ["old"],
    } as ProjectSnapshot;

    expect(
      replaceProjectPrepKeywords(project, {
        id: "project-2",
        prepKeywords: ["new"],
      }),
    ).toBe(project);
  });

  it("preserves an undefined project", () => {
    expect(
      replaceProjectPrepKeywords(undefined, {
        id: "project-1",
        prepKeywords: ["new"],
      }),
    ).toBeUndefined();
  });
});

describe("mergeImportedProjectAssets", () => {
  it("adds imported project assets and replaces slices for imported asset ids", () => {
    const project = {
      id: "project-1",
      assets: [asset("asset-existing")],
      assetSlices: [
        slice("slice-old-existing", "asset-existing"),
        slice("slice-keep", "asset-keep"),
      ],
    } as ProjectSnapshot;

    const nextProject = mergeImportedProjectAssets({
      assets: [
        { ...asset("asset-existing"), projectId: "project-1" },
        { ...asset("asset-new"), projectId: "project-1" },
        { ...asset("asset-elsewhere"), projectId: "project-2" },
      ],
      assetSlices: [
        slice("slice-new-existing", "asset-existing"),
        slice("slice-new", "asset-new"),
        slice("slice-elsewhere", "asset-elsewhere"),
      ],
      project,
    });

    expect(nextProject?.assets.map((candidate) => candidate.id)).toEqual([
      "asset-existing",
      "asset-existing",
      "asset-new",
    ]);
    expect(nextProject?.assetSlices.map((candidate) => candidate.id)).toEqual([
      "slice-keep",
      "slice-new-existing",
      "slice-new",
    ]);
  });

  it("leaves the project unchanged when imported assets belong elsewhere", () => {
    const project = {
      id: "project-1",
      assets: [asset("asset-existing")],
      assetSlices: [slice("slice-existing", "asset-existing")],
    } as ProjectSnapshot;

    expect(
      mergeImportedProjectAssets({
        assets: [{ ...asset("asset-elsewhere"), projectId: "project-2" }],
        assetSlices: [slice("slice-elsewhere", "asset-elsewhere")],
        project,
      }),
    ).toBe(project);
  });
});

describe("replaceProcessedProjectAsset", () => {
  it("replaces the processed asset, refreshes its slices, and appends processing records", () => {
    const project = {
      id: "project-1",
      assets: [
        { ...asset("asset-1"), name: "Old" },
        { ...asset("asset-2"), name: "Keep" },
      ],
      assetSlices: [slice("slice-old", "asset-1"), slice("slice-keep", "asset-2")],
      assetProcessingEvents: [processingEvent("event-old", "asset-1")],
      assetProcessingJobs: [processingJob("job-old", "asset-1")],
    } as ProjectSnapshot;

    const nextProject = replaceProcessedProjectAsset(project, {
      asset: { ...asset("asset-1"), name: "Processed", projectId: "project-1" },
      events: [processingEvent("event-new", "asset-1")],
      job: processingJob("job-new", "asset-1"),
      slices: [slice("slice-new-a", "asset-1"), slice("slice-new-b", "asset-1")],
    });

    expect(nextProject?.assets).toEqual([
      expect.objectContaining({ id: "asset-1", name: "Processed" }),
      expect.objectContaining({ id: "asset-2", name: "Keep" }),
    ]);
    expect(nextProject?.assetSlices.map((candidate) => candidate.id)).toEqual([
      "slice-keep",
      "slice-new-a",
      "slice-new-b",
    ]);
    expect(nextProject?.assetProcessingEvents.map((candidate) => candidate.id)).toEqual([
      "event-old",
      "event-new",
    ]);
    expect(nextProject?.assetProcessingJobs.map((candidate) => candidate.id)).toEqual([
      "job-old",
      "job-new",
    ]);
  });

  it("leaves the project unchanged when the processed asset belongs elsewhere", () => {
    const project = {
      id: "project-1",
      assets: [asset("asset-1")],
      assetSlices: [slice("slice-old", "asset-1")],
      assetProcessingEvents: [],
      assetProcessingJobs: [],
    } as ProjectSnapshot;

    expect(
      replaceProcessedProjectAsset(project, {
        asset: { ...asset("asset-2"), projectId: "project-2" },
        events: [processingEvent("event-new", "asset-2")],
        job: processingJob("job-new", "asset-2"),
        slices: [slice("slice-new", "asset-2")],
      }),
    ).toBe(project);
  });
});
