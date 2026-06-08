import { randomUUID } from "node:crypto";
import type { SmartEditPlan, StoryboardScene, TraceEvent } from "@shopclip/shared";
import type {
  SmartEditRequestSchema,
  SmartEditSegmentRefreshRequestSchema,
} from "@shopclip/shared";

import type { createSmartEditPlan } from "../../providers/ai/smartEditPlannerProvider.js";
import type {
  composeSmartEditToStorage,
} from "../../providers/renderer/smartEditComposer.js";
import { smartEditSegmentOutputsForResponse } from "../../providers/renderer/smartEditComposer.js";
import type { StorageProvider } from "../../providers/storage/storageProvider.js";
import type { ProjectSnapshot, ProjectStore } from "./projectStore.js";
import {
  applyLatestSceneMaterialsToSmartEditPlan,
  buildSmartEditRefreshPlan,
  smartEditFailureMessage,
  smartEditSegmentClipsForPlan,
  withSmartEditTimeline,
} from "./smartEditPlanUtils.js";

export type SmartEditPlanner = typeof createSmartEditPlan;
export type SmartEditComposer = typeof composeSmartEditToStorage;

export const runSmartEditJob = async ({
  project,
  renderTaskId,
  requestData,
  smartEditComposer,
  smartEditPlanner,
  storageProvider,
  store,
}: {
  project: ProjectSnapshot;
  renderTaskId: string;
  requestData: ReturnType<typeof SmartEditRequestSchema.parse>;
  smartEditComposer: SmartEditComposer;
  smartEditPlanner: SmartEditPlanner;
  storageProvider: StorageProvider;
  store: ProjectStore;
}) => {
  await store.updateRenderTask(
    renderTaskId,
    {
      progress: 12,
      status: "running",
    },
    [
      {
        status: "running",
        step: "smart-edit-plan-started",
        message: "Smart edit job started. Calling the configured general model for timeline planning.",
      },
    ],
  );

  let plannerResult: Awaited<ReturnType<SmartEditPlanner>>;
  if (requestData.currentPlan) {
    plannerResult = {
      fallback: {
        provider: "current-plan",
        used: false,
      },
      plan: requestData.currentPlan,
    };
  } else {
    try {
      plannerResult = await smartEditPlanner({
        apiConfig: requestData.apiConfig,
        assets: project.assets,
        assetSlices: project.assetSlices,
        project,
        request: requestData,
        scenes: project.scenes,
      });
    } catch (error) {
      await store.updateRenderTask(
        renderTaskId,
        {
          errorMessage: smartEditFailureMessage(error, "Smart edit planning failed."),
          progress: 100,
          status: "failed",
        },
        [
          {
            status: "failed",
            step: "smart-edit-plan-failed",
            message: smartEditFailureMessage(error, "Smart edit planning failed."),
          },
        ],
      );
      return;
    }
  }
  const materializedPlan = applyLatestSceneMaterialsToSmartEditPlan(
    plannerResult.plan,
    project.renderTasks,
  );
  plannerResult = {
    ...plannerResult,
    plan: requestData.currentPlan?.timeline
      ? materializedPlan.plan
      : withSmartEditTimeline(materializedPlan.plan),
  };
  const planningTraceEvents: Array<Omit<TraceEvent, "id" | "renderTaskId" | "createdAt">> = [
    {
      status: plannerResult.fallback.used ? "retrying" : "completed",
      step: requestData.currentPlan
        ? "smart-edit-plan-current"
        : plannerResult.fallback.used
          ? "smart-edit-plan-fallback"
          : "smart-edit-plan-model",
      message: requestData.currentPlan
        ? "Smart edit reused the current edited timeline plan for ffmpeg composition."
        : plannerResult.fallback.used
          ? `Smart edit used local planning fallback: ${plannerResult.fallback.reason ?? "unknown reason"}`
          : `Smart edit planned by ${plannerResult.fallback.provider}.`,
    },
    ...(materializedPlan.appliedCount > 0
      ? [
          {
            status: "completed" as const,
            step: "smart-edit-scene-materials-applied",
            message: `Applied ${materializedPlan.appliedCount} fresh scene video/audio/text material sources before ffmpeg composition.`,
          },
        ]
      : []),
    {
      status: "running",
      step: "smart-edit-ffmpeg-compose-started",
      message: "Planning is ready. ffmpeg is composing clips, transitions, subtitles, voiceover, and BGM.",
    },
  ];

  await store.updateRenderTask(
    renderTaskId,
    {
      progress: 42,
      providerTaskId: plannerResult.plan.id,
      sceneClips: smartEditSegmentClipsForPlan(plannerResult.plan),
      smartEditPlan: plannerResult.plan,
      status: "running",
    },
    planningTraceEvents,
  );

  let exportResult: Awaited<ReturnType<SmartEditComposer>>;
  try {
    exportResult = await smartEditComposer(project.id, plannerResult.plan, project.assets, {
      storageProvider,
      subtitlesEnabled: requestData.mediaSettings.subtitlesEnabled,
      videoSettings: requestData.videoSettings,
    });
  } catch (error) {
    await store.updateRenderTask(
      renderTaskId,
      {
        errorMessage: smartEditFailureMessage(error, "Smart edit ffmpeg composition failed."),
        progress: 100,
        status: "failed",
      },
      [
        {
          status: "failed",
          step: "smart-edit-ffmpeg-compose-failed",
          message: smartEditFailureMessage(error, "Smart edit ffmpeg composition failed."),
        },
      ],
    );
    return;
  }

  await store.updateRenderTask(
    renderTaskId,
    {
      exportUrl: exportResult.publicUrl,
      previewUrl: exportResult.publicUrl,
      progress: 100,
      sceneClips: smartEditSegmentClipsForPlan(plannerResult.plan, exportResult.publicUrl),
      smartEditPlan: plannerResult.plan,
      smartEditSegmentOutputs: smartEditSegmentOutputsForResponse(exportResult.segmentOutputs),
      status: "completed",
    },
    [
      {
        status: "completed",
        step: "smart-edit-ffmpeg-compose",
        message: "Smart edit video composed with ffmpeg and uploaded to storage.",
      },
    ],
  );
};

export const runSmartEditSegmentRefreshJob = async ({
  project,
  renderTaskId,
  requestData,
  smartEditComposer,
  smartEditPlanner,
  storageProvider,
  store,
  targetScene,
}: {
  project: ProjectSnapshot;
  renderTaskId: string;
  requestData: ReturnType<typeof SmartEditSegmentRefreshRequestSchema.parse>;
  smartEditComposer: SmartEditComposer;
  smartEditPlanner: SmartEditPlanner;
  storageProvider: StorageProvider;
  store: ProjectStore;
  targetScene: StoryboardScene;
}) => {
  await store.updateRenderTask(
    renderTaskId,
    {
      progress: 12,
      status: "running",
    },
    [
      {
        status: "running",
        step: "smart-edit-segment-plan-started",
        message: "Refreshing the selected segment with the configured general model.",
      },
    ],
  );

  let plannerResult: Awaited<ReturnType<SmartEditPlanner>>;
  try {
    plannerResult = await smartEditPlanner({
      apiConfig: requestData.apiConfig,
      assets: project.assets,
      assetSlices: project.assetSlices,
      project,
      request: {
        apiConfig: requestData.apiConfig,
        instructions: requestData.instructions,
        locale: requestData.locale,
        mediaSettings: requestData.mediaSettings,
        segments: requestData.segment ? [requestData.segment] : [],
        targetLanguage: requestData.targetLanguage,
        videoSettings: requestData.videoSettings,
      },
      scenes: [targetScene],
    });
  } catch (error) {
    await store.updateRenderTask(
      renderTaskId,
      {
        errorMessage: smartEditFailureMessage(error, "Smart edit segment planning failed."),
        progress: 100,
        status: "failed",
      },
      [
        {
          status: "failed",
          step: "smart-edit-segment-plan-failed",
          message: smartEditFailureMessage(error, "Smart edit segment planning failed."),
        },
      ],
    );
    return;
  }

  const refreshedSegment = plannerResult.plan.segments[0];
  if (!refreshedSegment) {
    await store.updateRenderTask(
      renderTaskId,
      {
        errorMessage: "Smart edit segment planning returned no segment.",
        progress: 100,
        status: "failed",
      },
      [
        {
          status: "failed",
          step: "smart-edit-segment-plan-empty",
          message: "Smart edit segment planning returned no segment.",
        },
      ],
    );
    return;
  }

  let refreshPlan: SmartEditPlan;
  try {
    refreshPlan = buildSmartEditRefreshPlan({
      createId: randomUUID,
      currentPlan: requestData.currentPlan,
      nowIso: new Date().toISOString(),
      projectId: project.id,
      refreshedSegment,
      segmentOutputs: requestData.segmentOutputs,
      scenes: project.scenes,
      targetSceneId: targetScene.id,
    });
  } catch (error) {
    await store.updateRenderTask(
      renderTaskId,
      {
        errorMessage: smartEditFailureMessage(error, "Reusable segment outputs are required."),
        progress: 100,
        status: "failed",
      },
      [
        {
          status: "failed",
          step: "smart-edit-segment-outputs-missing",
          message: smartEditFailureMessage(error, "Reusable segment outputs are required."),
        },
      ],
    );
    return;
  }
  const materializedRefreshPlan = applyLatestSceneMaterialsToSmartEditPlan(
    refreshPlan,
    project.renderTasks,
  );
  refreshPlan = withSmartEditTimeline(materializedRefreshPlan.plan);
  const refreshTraceEvents: Array<Omit<TraceEvent, "id" | "renderTaskId" | "createdAt">> = [
    {
      status: plannerResult.fallback.used ? "retrying" : "completed",
      step: plannerResult.fallback.used
        ? "smart-edit-segment-plan-fallback"
        : "smart-edit-segment-plan-model",
      message: plannerResult.fallback.used
        ? `Segment refresh used local planning fallback: ${plannerResult.fallback.reason ?? "unknown reason"}`
        : `Segment refresh planned by ${plannerResult.fallback.provider}.`,
    },
    ...(materializedRefreshPlan.appliedCount > 0
      ? [
          {
            status: "completed" as const,
            step: "smart-edit-scene-materials-applied",
            message: `Applied ${materializedRefreshPlan.appliedCount} fresh scene video/audio/text material sources before ffmpeg composition.`,
          },
        ]
      : []),
    {
      status: "running",
      step: "smart-edit-segment-refresh-compose-started",
      message: "Reusing unchanged segment outputs and recomposing the final video with ffmpeg.",
    },
  ];

  await store.updateRenderTask(
    renderTaskId,
    {
      progress: 42,
      providerTaskId: refreshPlan.id,
      sceneClips: smartEditSegmentClipsForPlan(refreshPlan),
      smartEditPlan: refreshPlan,
      status: "running",
    },
    refreshTraceEvents,
  );

  let exportResult: Awaited<ReturnType<SmartEditComposer>>;
  try {
    exportResult = await smartEditComposer(project.id, refreshPlan, project.assets, {
      storageProvider,
      subtitlesEnabled: requestData.mediaSettings.subtitlesEnabled,
      videoSettings: requestData.videoSettings,
    });
  } catch (error) {
    await store.updateRenderTask(
      renderTaskId,
      {
        errorMessage: smartEditFailureMessage(
          error,
          "Smart edit segment refresh ffmpeg composition failed.",
        ),
        progress: 100,
        status: "failed",
      },
      [
        {
          status: "failed",
          step: "smart-edit-segment-refresh-compose-failed",
          message: smartEditFailureMessage(
            error,
            "Smart edit segment refresh ffmpeg composition failed.",
          ),
        },
      ],
    );
    return;
  }

  await store.updateRenderTask(
    renderTaskId,
    {
      exportUrl: exportResult.publicUrl,
      previewUrl: exportResult.publicUrl,
      progress: 100,
      sceneClips: smartEditSegmentClipsForPlan(refreshPlan, exportResult.publicUrl),
      smartEditPlan: refreshPlan,
      smartEditSegmentOutputs: smartEditSegmentOutputsForResponse(exportResult.segmentOutputs),
      status: "completed",
    },
    [
      {
        status: "completed",
        step: "smart-edit-segment-refresh-compose",
        message:
          "Selected segment was refreshed; unchanged segments reused uploaded segment outputs before final ffmpeg composition.",
      },
    ],
  );
};
