import type { RenderTask, ScriptResult, StoryboardScene } from "@shopclip/shared";

import type { ProjectSnapshot } from "../lib/api";

export const replaceProjectRenderTask = (
  project: ProjectSnapshot | undefined,
  renderTask: RenderTask,
): ProjectSnapshot | undefined =>
  project
    ? {
        ...project,
        renderTasks: project.renderTasks.map((task) =>
          task.id === renderTask.id ? renderTask : task,
        ),
      }
    : project;

export const removeProjectRenderTask = (
  project: ProjectSnapshot | undefined,
  renderTaskId: string,
): ProjectSnapshot | undefined =>
  project
    ? {
        ...project,
        renderTasks: project.renderTasks.filter((task) => task.id !== renderTaskId),
      }
    : project;

export const replaceProjectScript = (
  project: ProjectSnapshot | undefined,
  script: ScriptResult,
): ProjectSnapshot | undefined =>
  project
    ? {
        ...project,
        scripts: project.scripts.map((candidate) =>
          candidate.id === script.id ? script : candidate,
        ),
      }
    : project;

export const removeProjectScript = (
  project: ProjectSnapshot | undefined,
  scriptId: string,
): ProjectSnapshot | undefined =>
  project
    ? {
        ...project,
        scripts: project.scripts.filter((candidate) => candidate.id !== scriptId),
      }
    : project;

export const replaceProjectScenes = (
  project: ProjectSnapshot | undefined,
  scenes: StoryboardScene[],
): ProjectSnapshot | undefined =>
  project
    ? {
        ...project,
        scenes,
      }
    : project;

export const replaceProjectScene = (
  project: ProjectSnapshot | undefined,
  scene: StoryboardScene,
): ProjectSnapshot | undefined =>
  project
    ? {
        ...project,
        scenes: project.scenes.map((candidate) => (candidate.id === scene.id ? scene : candidate)),
        scripts: project.scripts.map((script) => ({
          ...script,
          scenes: script.scenes.map((candidate) =>
            candidate.id === scene.id ? scene : candidate,
          ),
        })),
      }
    : project;
