import type { RenderRequest, SceneRenderClip } from "@shopclip/shared";

import { createQueuedRenderWithConfiguredVideoProvider } from "../../providers/renderer/seedanceRenderer.js";
import type { ProjectStore } from "./projectStore.js";
import { isLocalRenderExportUrl } from "./projectAssetUtils.js";

export type RenderExportPublisherFn = (
  projectId: string,
  clips: SceneRenderClip[],
) => Promise<string | undefined>;

export const isSeedanceSceneDurationError = (error: unknown): error is Error =>
  error instanceof Error && error.message.includes("outside the configured Seedance range");

export type RetryRenderTaskResult =
  | { kind: "created"; render: NonNullable<Awaited<ReturnType<ProjectStore["addRenderTask"]>>> }
  | { kind: "not-found" }
  | { kind: "not-retryable" }
  | { kind: "project-not-found" }
  | { kind: "invalid-scene-duration"; message: string };

export const retryFailedRenderTask = async ({
  renderTaskId,
  requestData,
  store,
}: {
  renderTaskId: string;
  requestData: RenderRequest;
  store: ProjectStore;
}): Promise<RetryRenderTaskResult> => {
  const previousRender = await store.getRenderTask(renderTaskId);
  if (!previousRender) {
    return { kind: "not-found" };
  }

  if (previousRender.renderTask.status !== "failed") {
    return { kind: "not-retryable" };
  }

  const failedTrace = [...previousRender.traceEvents]
    .reverse()
    .find((event) => event.status === "failed");
  const latestProject = await store.getProject(previousRender.project.id);
  if (!latestProject) {
    return { kind: "project-not-found" };
  }

  let renderResult: ReturnType<typeof createQueuedRenderWithConfiguredVideoProvider>;
  try {
    renderResult = createQueuedRenderWithConfiguredVideoProvider(latestProject, {
      ...requestData,
      retryOfRenderTaskId: previousRender.renderTask.id,
      retryOfTraceEventId: failedTrace?.id,
    });
  } catch (error) {
    if (isSeedanceSceneDurationError(error)) {
      return { kind: "invalid-scene-duration", message: error.message };
    }
    throw error;
  }

  const storedRender = await store.addRenderTask(
    latestProject.id,
    renderResult.renderTask,
    renderResult.traceEvents,
  );
  if (!storedRender) {
    return { kind: "project-not-found" };
  }

  return { kind: "created", render: storedRender };
};

export type ProjectExportResult =
  | {
      kind: "ready";
      body: {
        projectId: string;
        exportUrl: string;
        downloadUrl: string;
        contentType: "video/mp4";
        fallback: {
          used: boolean;
          provider: string;
        };
      };
    }
  | { kind: "project-not-found" }
  | { kind: "not-ready" }
  | { kind: "compose-failed"; message: string };

export const resolveProjectExport = async ({
  projectId,
  publishRenderExport,
  store,
}: {
  projectId: string;
  publishRenderExport: RenderExportPublisherFn;
  store: ProjectStore;
}): Promise<ProjectExportResult> => {
  const project = await store.getProject(projectId);
  if (!project) {
    return { kind: "project-not-found" };
  }

  const completedRender = [...project.renderTasks]
    .reverse()
    .find((renderTask) => renderTask.status === "completed");
  let exportUrl = completedRender?.exportUrl;

  if (
    completedRender &&
    (!exportUrl || isLocalRenderExportUrl(exportUrl)) &&
    completedRender.sceneClips &&
    completedRender.sceneClips.length > 0
  ) {
    try {
      exportUrl = await publishRenderExport(project.id, completedRender.sceneClips);
      if (exportUrl) {
        await store.updateRenderTask(completedRender.id, { exportUrl }, [
          {
            status: "completed",
            step: "render-export-published",
            message: "Seedance scene clips composed and published as a final export video.",
          },
        ]);
      }
    } catch (error) {
      return {
        kind: "compose-failed",
        message: error instanceof Error ? error.message : "Final video composition failed.",
      };
    }
  }

  if (!exportUrl) {
    return { kind: "not-ready" };
  }

  return {
    kind: "ready",
    body: {
      projectId: project.id,
      exportUrl,
      downloadUrl: exportUrl,
      contentType: "video/mp4",
      fallback: {
        used: completedRender?.provider === "mock-renderer",
        provider: completedRender?.provider ?? "unknown",
      },
    },
  };
};
