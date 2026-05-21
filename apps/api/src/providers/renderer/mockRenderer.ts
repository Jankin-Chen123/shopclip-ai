import type { ProjectSnapshot } from "../../modules/projects/memoryStore.js";
import type { RenderTask, TraceEvent } from "@shopclip/shared";

export interface RenderProviderResult {
  renderTask: Omit<RenderTask, "id" | "projectId" | "createdAt" | "updatedAt">;
  traceEvents: Array<Omit<TraceEvent, "id" | "renderTaskId" | "createdAt">>;
}

export const renderFallbackPreview = (project: ProjectSnapshot): RenderProviderResult => ({
  renderTask: {
    status: "completed",
    progress: 100,
    previewUrl: `/demo-exports/${project.id}/preview.mp4`,
    exportUrl: `/demo-exports/${project.id}/export.mp4`,
  },
  traceEvents: [
    {
      status: "queued",
      step: "render-queued",
      message: "Fallback render job queued.",
    },
    {
      status: "completed",
      step: "storyboard-validated",
      message: "Storyboard duration validated before rendering.",
    },
    {
      status: "completed",
      step: "preview-created",
      message: "Deterministic preview URL assigned.",
    },
  ],
});
