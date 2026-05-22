import { randomUUID } from "node:crypto";
import type {
  AssetMetadata,
  AssetSlice,
  EditingSuggestion,
  Project,
  ProjectBrief,
  RenderTask,
  SceneUpdate,
  ScriptResult,
  StoryboardScene,
  TraceEvent,
} from "@shopclip/shared";

export interface ProjectSnapshot extends Project {
  assets: AssetMetadata[];
  assetSlices: AssetSlice[];
  scripts: ScriptResult[];
  scenes: StoryboardScene[];
  renderTasks: RenderTask[];
}

const now = (): string => new Date().toISOString();

export class MemoryProjectStore {
  private readonly projects = new Map<string, ProjectSnapshot>();
  private readonly traceEvents = new Map<string, TraceEvent[]>();

  createProject(brief: ProjectBrief): ProjectSnapshot {
    const timestamp = now();
    const project: ProjectSnapshot = {
      ...brief,
      id: randomUUID(),
      status: "draft",
      createdAt: timestamp,
      updatedAt: timestamp,
      assets: [],
      assetSlices: [],
      scripts: [],
      scenes: [],
      renderTasks: [],
    };

    this.projects.set(project.id, project);
    return project;
  }

  getProject(id: string): ProjectSnapshot | undefined {
    return this.projects.get(id);
  }

  addAsset(
    projectId: string,
    asset: Omit<AssetMetadata, "id" | "projectId" | "createdAt" | "updatedAt">,
    createSlices: (asset: AssetMetadata) => Array<Omit<AssetSlice, "id" | "assetId">> = () => [],
  ): AssetMetadata | undefined {
    const project = this.projects.get(projectId);
    if (!project) {
      return undefined;
    }

    const timestamp = now();
    const storedAsset: AssetMetadata = {
      ...asset,
      id: randomUUID(),
      projectId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };

    project.assets.push(storedAsset);
    project.assetSlices.push(
      ...createSlices(storedAsset).map((slice) => ({
        ...slice,
        id: randomUUID(),
        assetId: storedAsset.id,
      })),
    );
    project.updatedAt = timestamp;
    return storedAsset;
  }

  addScript(
    projectId: string,
    script: Omit<ScriptResult, "id" | "projectId">,
  ): ScriptResult | undefined {
    const project = this.projects.get(projectId);
    if (!project) {
      return undefined;
    }

    const storedScript: ScriptResult = {
      ...script,
      id: randomUUID(),
      projectId,
      scenes: script.scenes.map((scene) => ({
        ...scene,
        id: randomUUID(),
        projectId,
      })),
    };

    project.scripts.push(storedScript);
    project.scenes.push(...storedScript.scenes);
    project.status = "ready";
    project.updatedAt = now();
    return storedScript;
  }

  addRenderTask(
    projectId: string,
    renderTask: Omit<RenderTask, "id" | "projectId" | "createdAt" | "updatedAt">,
    traceEvents: Array<Omit<TraceEvent, "id" | "renderTaskId" | "createdAt">>,
  ): { renderTask: RenderTask; traceEvents: TraceEvent[] } | undefined {
    const project = this.projects.get(projectId);
    if (!project) {
      return undefined;
    }

    const timestamp = now();
    const storedRenderTask: RenderTask = {
      ...renderTask,
      id: randomUUID(),
      projectId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const storedTraceEvents: TraceEvent[] = traceEvents.map((event) => ({
      ...event,
      id: randomUUID(),
      renderTaskId: storedRenderTask.id,
      createdAt: now(),
    }));

    project.renderTasks.push(storedRenderTask);
    project.status =
      storedRenderTask.status === "completed"
        ? "completed"
        : storedRenderTask.status === "failed"
          ? "failed"
          : "rendering";
    project.updatedAt = timestamp;
    this.traceEvents.set(storedRenderTask.id, storedTraceEvents);

    return {
      renderTask: storedRenderTask,
      traceEvents: storedTraceEvents,
    };
  }

  updateScene(sceneId: string, update: SceneUpdate): StoryboardScene | undefined {
    const match = this.findSceneProject(sceneId);
    if (!match) {
      return undefined;
    }

    const updatedScene: StoryboardScene = {
      ...match.scene,
      ...update,
      assetId: update.assetId === null ? undefined : (update.assetId ?? match.scene.assetId),
      status: update.status ?? "edited",
    };

    this.replaceScene(match.project, updatedScene);
    match.project.updatedAt = now();
    return updatedScene;
  }

  reorderScenes(projectId: string, sceneIds: string[]): StoryboardScene[] | undefined {
    const project = this.projects.get(projectId);
    if (!project) {
      return undefined;
    }

    if (
      sceneIds.length !== project.scenes.length ||
      sceneIds.some((sceneId) => !project.scenes.some((scene) => scene.id === sceneId))
    ) {
      return undefined;
    }

    const reordered = sceneIds.map((sceneId, index) => ({
      ...project.scenes.find((scene) => scene.id === sceneId)!,
      order: index + 1,
    }));

    project.scenes = reordered;
    project.scripts = project.scripts.map((script) => ({
      ...script,
      scenes: reordered.filter((scene) =>
        script.scenes.some((scriptScene) => scriptScene.id === scene.id),
      ),
    }));
    project.updatedAt = now();
    return reordered;
  }

  deleteScene(sceneId: string): StoryboardScene[] | undefined {
    const match = this.findSceneProject(sceneId);
    if (!match) {
      return undefined;
    }

    const remainingScenes = match.project.scenes
      .filter((scene) => scene.id !== sceneId)
      .map((scene, index) => ({ ...scene, order: index + 1 }));

    match.project.scenes = remainingScenes;
    match.project.scripts = match.project.scripts.map((script) => ({
      ...script,
      scenes: script.scenes
        .filter((scene) => scene.id !== sceneId)
        .map((scene) => remainingScenes.find((remaining) => remaining.id === scene.id))
        .filter((scene): scene is StoryboardScene => Boolean(scene)),
    }));
    match.project.updatedAt = now();
    return remainingScenes;
  }

  getSceneContext(
    sceneId: string,
  ): { project: ProjectSnapshot; scene: StoryboardScene } | undefined {
    return this.findSceneProject(sceneId);
  }

  appendTraceEvent(
    traceKey: string,
    event: Omit<TraceEvent, "id" | "renderTaskId" | "createdAt">,
  ): TraceEvent {
    const storedTraceEvent: TraceEvent = {
      ...event,
      id: randomUUID(),
      renderTaskId: traceKey,
      createdAt: now(),
    };

    this.traceEvents.set(traceKey, [...(this.traceEvents.get(traceKey) ?? []), storedTraceEvent]);
    return storedTraceEvent;
  }

  getStoredSuggestion(
    sceneId: string,
    suggestionId: string,
    createSuggestions: () => EditingSuggestion[],
  ): EditingSuggestion | undefined {
    return createSuggestions().find((suggestion) => suggestion.id === suggestionId);
  }

  getRenderTask(
    renderTaskId: string,
  ): { project: ProjectSnapshot; renderTask: RenderTask; traceEvents: TraceEvent[] } | undefined {
    for (const project of this.projects.values()) {
      const renderTask = project.renderTasks.find((candidate) => candidate.id === renderTaskId);
      if (renderTask) {
        return {
          project,
          renderTask,
          traceEvents: this.traceEvents.get(renderTaskId) ?? [],
        };
      }
    }

    return undefined;
  }

  private findSceneProject(
    sceneId: string,
  ): { project: ProjectSnapshot; scene: StoryboardScene } | undefined {
    for (const project of this.projects.values()) {
      const scene = project.scenes.find((candidate) => candidate.id === sceneId);
      if (scene) {
        return { project, scene };
      }
    }

    return undefined;
  }

  private replaceScene(project: ProjectSnapshot, updatedScene: StoryboardScene): void {
    project.scenes = project.scenes.map((scene) =>
      scene.id === updatedScene.id ? updatedScene : scene,
    );
    project.scripts = project.scripts.map((script) => ({
      ...script,
      scenes: script.scenes.map((scene) => (scene.id === updatedScene.id ? updatedScene : scene)),
    }));
  }
}
