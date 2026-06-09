import type { SmartEditPlan, TraceEvent } from "@shopclip/shared";

import { smartEditSegmentOutputsForResponse } from "../../providers/renderer/smartEditComposer.js";
import type { ProjectStore } from "./projectStore.js";
import {
  smartEditFailureMessage,
  smartEditSegmentClipsForPlan,
} from "./smartEditPlanUtils.js";
import type { SmartEditComposer } from "./smartEditJobService.js";

export type SmartEditTraceEvent = Omit<TraceEvent, "id" | "renderTaskId" | "createdAt">;

type SmartEditPlannerFallback = {
  provider: string;
  reason?: string;
  used: boolean;
};

export const updateSmartEditJobStarted = (
  store: ProjectStore,
  renderTaskId: string,
  traceEvent: SmartEditTraceEvent,
) =>
  store.updateRenderTask(
    renderTaskId,
    {
      progress: 12,
      status: "running",
    },
    [traceEvent],
  );

export const updateSmartEditJobFailed = (
  store: ProjectStore,
  renderTaskId: string,
  error: unknown,
  fallbackMessage: string,
  step: string,
) => {
  const message = smartEditFailureMessage(error, fallbackMessage);
  return store.updateRenderTask(
    renderTaskId,
    {
      errorMessage: message,
      progress: 100,
      status: "failed",
    },
    [
      {
        status: "failed",
        step,
        message,
      },
    ],
  );
};

export const updateSmartEditComposeStarted = (
  store: ProjectStore,
  renderTaskId: string,
  plan: SmartEditPlan,
  traceEvents: SmartEditTraceEvent[],
) =>
  store.updateRenderTask(
    renderTaskId,
    {
      progress: 42,
      providerTaskId: plan.id,
      sceneClips: smartEditSegmentClipsForPlan(plan),
      smartEditPlan: plan,
      status: "running",
    },
    traceEvents,
  );

export const updateSmartEditComposeCompleted = (
  store: ProjectStore,
  renderTaskId: string,
  plan: SmartEditPlan,
  exportResult: Awaited<ReturnType<SmartEditComposer>>,
  traceEvent: SmartEditTraceEvent,
) =>
  store.updateRenderTask(
    renderTaskId,
    {
      exportUrl: exportResult.publicUrl,
      previewUrl: exportResult.publicUrl,
      progress: 100,
      sceneClips: smartEditSegmentClipsForPlan(plan, exportResult.publicUrl),
      smartEditPlan: plan,
      smartEditSegmentOutputs: smartEditSegmentOutputsForResponse(exportResult.segmentOutputs),
      status: "completed",
    },
    [traceEvent],
  );

export const smartEditSceneMaterialsTrace = (appliedCount: number): SmartEditTraceEvent[] =>
  appliedCount > 0
    ? [
        {
          status: "completed",
          step: "smart-edit-scene-materials-applied",
          message: `Applied ${appliedCount} fresh scene video/audio/text material sources before ffmpeg composition.`,
        },
      ]
    : [];

export const smartEditPlanningTraceEvents = ({
  appliedMaterialsCount,
  fallback,
  reusedCurrentPlan,
}: {
  appliedMaterialsCount: number;
  fallback: SmartEditPlannerFallback;
  reusedCurrentPlan: boolean;
}): SmartEditTraceEvent[] => [
  {
    status: fallback.used ? "retrying" : "completed",
    step: reusedCurrentPlan
      ? "smart-edit-plan-current"
      : fallback.used
        ? "smart-edit-plan-fallback"
        : "smart-edit-plan-model",
    message: reusedCurrentPlan
      ? "Smart edit reused the current edited timeline plan for ffmpeg composition."
      : fallback.used
        ? `Smart edit used local planning fallback: ${fallback.reason ?? "unknown reason"}`
        : `Smart edit planned by ${fallback.provider}.`,
  },
  ...smartEditSceneMaterialsTrace(appliedMaterialsCount),
  {
    status: "running",
    step: "smart-edit-ffmpeg-compose-started",
    message: "Planning is ready. ffmpeg is composing clips, transitions, subtitles, voiceover, and BGM.",
  },
];

export const smartEditSegmentRefreshTraceEvents = ({
  appliedMaterialsCount,
  fallback,
}: {
  appliedMaterialsCount: number;
  fallback: SmartEditPlannerFallback;
}): SmartEditTraceEvent[] => [
  {
    status: fallback.used ? "retrying" : "completed",
    step: fallback.used ? "smart-edit-segment-plan-fallback" : "smart-edit-segment-plan-model",
    message: fallback.used
      ? `Segment refresh used local planning fallback: ${fallback.reason ?? "unknown reason"}`
      : `Segment refresh planned by ${fallback.provider}.`,
  },
  ...smartEditSceneMaterialsTrace(appliedMaterialsCount),
  {
    status: "running",
    step: "smart-edit-segment-refresh-compose-started",
    message: "Reusing unchanged segment outputs and recomposing the final video with ffmpeg.",
  },
];
