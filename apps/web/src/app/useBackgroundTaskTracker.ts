import { useEffect, useMemo, useRef, useState } from "react";

import type { RenderTask } from "@shopclip/shared";

import type {
  BackgroundTaskItem,
  WorkspacePageId,
  WorkspaceSectionId,
} from "../components/layout/AppShell";
import type { ProjectDetailTab } from "../features/projects/ProjectWorkspace";
import type { ProjectStudioFlow } from "./useProjectStudioState";

export type BackgroundTaskKind =
  | "asset-analysis"
  | "asset-recall"
  | "inspiration"
  | "reference-analysis"
  | "scene-regeneration"
  | "script"
  | "smart-edit"
  | "storyboard"
  | "suggestions"
  | "template"
  | "video";

export interface BackgroundTaskTarget {
  flow?: ProjectStudioFlow;
  isProjectStudioMode?: boolean;
  page: WorkspacePageId;
  projectDetailTab?: ProjectDetailTab;
  section: WorkspaceSectionId;
}

export interface TrackedBackgroundTask extends BackgroundTaskItem {
  createdAt: number;
  kind: BackgroundTaskKind;
  target: BackgroundTaskTarget;
}

const isPollingRenderTask = (renderTask: Pick<RenderTask, "status"> | undefined): boolean =>
  renderTask?.status === "queued" ||
  renderTask?.status === "running" ||
  renderTask?.status === "retrying";

const isSmartEditRenderTask = (renderTask: Pick<RenderTask, "provider"> | undefined): boolean =>
  renderTask?.provider === "smart-edit-ffmpeg";

interface BackgroundTaskTrackerInput {
  currentTarget: BackgroundTaskTarget;
  getTaskText: (
    kind: BackgroundTaskKind,
  ) => Pick<BackgroundTaskItem, "description" | "title">;
  renderTask?: RenderTask;
}

export interface BackgroundTaskTracker {
  backgroundTasks: TrackedBackgroundTask[];
  startBackgroundTask: (
    kind: BackgroundTaskKind,
    target: BackgroundTaskTarget,
    options?: { id?: string; progress?: number },
  ) => string;
  startEstimatedBackgroundTaskProgress: (taskId: string) => void;
  stopEstimatedBackgroundTaskProgress: (taskId: string) => void;
  updateBackgroundTask: (
    taskId: string,
    updates: Partial<Pick<TrackedBackgroundTask, "progress" | "status">>,
  ) => void;
}

export const useBackgroundTaskTracker = ({
  currentTarget,
  getTaskText,
  renderTask,
}: BackgroundTaskTrackerInput): BackgroundTaskTracker => {
  const [trackedBackgroundTasks, setTrackedBackgroundTasks] = useState<TrackedBackgroundTask[]>([]);
  const backgroundTaskProgressTimers = useRef<Record<string, ReturnType<typeof window.setInterval>>>(
    {},
  );

  useEffect(
    () => () => {
      Object.values(backgroundTaskProgressTimers.current).forEach((timerId) => {
        window.clearInterval(timerId);
      });
      backgroundTaskProgressTimers.current = {};
    },
    [],
  );

  const startBackgroundTask: BackgroundTaskTracker["startBackgroundTask"] = (
    kind,
    target,
    options = {},
  ) => {
    const taskId =
      options.id ?? `${kind}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const taskText = getTaskText(kind);
    setTrackedBackgroundTasks((current) => [
      {
        ...taskText,
        createdAt: Date.now(),
        id: taskId,
        kind,
        progress: options.progress ?? 12,
        status: "running",
        target,
      },
      ...current.filter((task) => task.id !== taskId),
    ]);
    return taskId;
  };

  const updateBackgroundTask: BackgroundTaskTracker["updateBackgroundTask"] = (
    taskId,
    updates,
  ) => {
    setTrackedBackgroundTasks((current) =>
      current.map((task) =>
        task.id === taskId
          ? {
              ...task,
              ...updates,
            }
          : task,
      ),
    );
  };

  const stopEstimatedBackgroundTaskProgress = (taskId: string) => {
    const timerId = backgroundTaskProgressTimers.current[taskId];
    if (!timerId) {
      return;
    }
    window.clearInterval(timerId);
    delete backgroundTaskProgressTimers.current[taskId];
  };

  const startEstimatedBackgroundTaskProgress = (taskId: string) => {
    stopEstimatedBackgroundTaskProgress(taskId);
    backgroundTaskProgressTimers.current[taskId] = window.setInterval(() => {
      setTrackedBackgroundTasks((current) =>
        current.map((task) => {
          if (task.id !== taskId || task.status !== "running") {
            return task;
          }
          const nextProgress =
            task.progress < 35
              ? task.progress + 6
              : task.progress < 70
                ? task.progress + 3
                : task.progress < 90
                  ? task.progress + 1.4
                  : task.progress + 0.5;
          return {
            ...task,
            progress: Math.min(96, nextProgress),
          };
        }),
      );
    }, 900);
  };

  const hasVideoTaskHistory = trackedBackgroundTasks.some((task) => task.kind === "video");
  const hasSmartEditTaskHistory = trackedBackgroundTasks.some((task) => task.kind === "smart-edit");
  const renderBackgroundTask = useMemo<TrackedBackgroundTask | undefined>(() => {
    const renderTaskKind = isSmartEditRenderTask(renderTask) ? "smart-edit" : "video";
    const hasMatchingTaskHistory =
      renderTaskKind === "smart-edit" ? hasSmartEditTaskHistory : hasVideoTaskHistory;
    if (!renderTask || (!isPollingRenderTask(renderTask) && !hasMatchingTaskHistory)) {
      return undefined;
    }
    const taskText = getTaskText(renderTaskKind);
    const trackedRenderTask = trackedBackgroundTasks.find((task) => task.kind === renderTaskKind);
    const taskStatus =
      renderTask.status === "failed"
        ? "failed"
        : isPollingRenderTask(renderTask)
          ? "running"
          : "completed";

    return {
      ...taskText,
      createdAt: Date.parse(renderTask.updatedAt ?? renderTask.createdAt ?? "") || Date.now(),
      id: `render-task-${renderTask.id}`,
      kind: renderTaskKind,
      progress: taskStatus === "completed" ? 100 : renderTask.progress ?? 0,
      status: taskStatus,
      target: trackedRenderTask?.target ?? currentTarget,
    };
  }, [
    currentTarget,
    getTaskText,
    hasSmartEditTaskHistory,
    hasVideoTaskHistory,
    renderTask,
    trackedBackgroundTasks,
  ]);

  const backgroundTasks = useMemo<TrackedBackgroundTask[]>(() => {
    const trackedTasks = renderBackgroundTask
      ? trackedBackgroundTasks.filter((task) => task.kind !== renderBackgroundTask.kind)
      : trackedBackgroundTasks;
    return [renderBackgroundTask, ...trackedTasks]
      .filter((task): task is TrackedBackgroundTask => Boolean(task))
      .sort((left, right) => {
        if (left.status === "running" && right.status !== "running") {
          return -1;
        }
        if (left.status !== "running" && right.status === "running") {
          return 1;
        }
        return right.createdAt - left.createdAt;
      })
      .slice(0, 8);
  }, [renderBackgroundTask, trackedBackgroundTasks]);

  return {
    backgroundTasks,
    startBackgroundTask,
    startEstimatedBackgroundTaskProgress,
    stopEstimatedBackgroundTaskProgress,
    updateBackgroundTask,
  };
};
