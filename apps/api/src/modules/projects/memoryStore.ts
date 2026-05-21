import { randomUUID } from "node:crypto";
import type {
  AssetMetadata,
  Project,
  ProjectBrief,
  RenderTask,
  ScriptResult,
  StoryboardScene,
  TraceEvent,
} from "@shopclip/shared";

export interface ProjectSnapshot extends Project {
  assets: AssetMetadata[];
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
    project.status = storedRenderTask.status === "completed" ? "completed" : "rendering";
    project.updatedAt = timestamp;
    this.traceEvents.set(storedRenderTask.id, storedTraceEvents);

    return {
      renderTask: storedRenderTask,
      traceEvents: storedTraceEvents,
    };
  }

  getRenderTask(
    renderTaskId: string,
  ): { renderTask: RenderTask; traceEvents: TraceEvent[] } | undefined {
    for (const project of this.projects.values()) {
      const renderTask = project.renderTasks.find((candidate) => candidate.id === renderTaskId);
      if (renderTask) {
        return {
          renderTask,
          traceEvents: this.traceEvents.get(renderTaskId) ?? [],
        };
      }
    }

    return undefined;
  }
}
