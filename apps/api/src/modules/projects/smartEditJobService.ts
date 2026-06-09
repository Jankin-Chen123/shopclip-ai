import { randomUUID } from "node:crypto";
import type { SmartEditPlan, StoryboardScene } from "@shopclip/shared";
import type {
  SmartEditRequestSchema,
  SmartEditSegmentRefreshRequestSchema,
} from "@shopclip/shared";

import type { createSmartEditPlan } from "../../providers/ai/smartEditPlannerProvider.js";
import type {
  composeSmartEditToStorage,
} from "../../providers/renderer/smartEditComposer.js";
import type { StorageProvider } from "../../providers/storage/storageProvider.js";
import type { ProjectSnapshot, ProjectStore } from "./projectStore.js";
import {
  applyLatestSceneMaterialsToSmartEditPlan,
  buildSmartEditRefreshPlan,
  withSmartEditTimeline,
} from "./smartEditPlanUtils.js";
import {
  smartEditPlanningTraceEvents,
  smartEditSegmentRefreshTraceEvents,
  updateSmartEditComposeCompleted,
  updateSmartEditComposeStarted,
  updateSmartEditJobFailed,
  updateSmartEditJobStarted,
} from "./smartEditJobTaskUpdates.js";

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
  await updateSmartEditJobStarted(store, renderTaskId, {
    status: "running",
    step: "smart-edit-plan-started",
    message: "Smart edit job started. Calling the configured general model for timeline planning.",
  });

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
      await updateSmartEditJobFailed(
        store,
        renderTaskId,
        error,
        "Smart edit planning failed.",
        "smart-edit-plan-failed",
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
  await updateSmartEditComposeStarted(
    store,
    renderTaskId,
    plannerResult.plan,
    smartEditPlanningTraceEvents({
      appliedMaterialsCount: materializedPlan.appliedCount,
      fallback: plannerResult.fallback,
      reusedCurrentPlan: Boolean(requestData.currentPlan),
    }),
  );

  let exportResult: Awaited<ReturnType<SmartEditComposer>>;
  try {
    exportResult = await smartEditComposer(project.id, plannerResult.plan, project.assets, {
      storageProvider,
      subtitlesEnabled: requestData.mediaSettings.subtitlesEnabled,
      videoSettings: requestData.videoSettings,
    });
  } catch (error) {
    await updateSmartEditJobFailed(
      store,
      renderTaskId,
      error,
      "Smart edit ffmpeg composition failed.",
      "smart-edit-ffmpeg-compose-failed",
    );
    return;
  }

  await updateSmartEditComposeCompleted(store, renderTaskId, plannerResult.plan, exportResult, {
    status: "completed",
    step: "smart-edit-ffmpeg-compose",
    message: "Smart edit video composed with ffmpeg and uploaded to storage.",
  });
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
  await updateSmartEditJobStarted(store, renderTaskId, {
    status: "running",
    step: "smart-edit-segment-plan-started",
    message: "Refreshing the selected segment with the configured general model.",
  });

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
    await updateSmartEditJobFailed(
      store,
      renderTaskId,
      error,
      "Smart edit segment planning failed.",
      "smart-edit-segment-plan-failed",
    );
    return;
  }

  const refreshedSegment = plannerResult.plan.segments[0];
  if (!refreshedSegment) {
    await updateSmartEditJobFailed(
      store,
      renderTaskId,
      new Error("Smart edit segment planning returned no segment."),
      "Smart edit segment planning returned no segment.",
      "smart-edit-segment-plan-empty",
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
    await updateSmartEditJobFailed(
      store,
      renderTaskId,
      error,
      "Reusable segment outputs are required.",
      "smart-edit-segment-outputs-missing",
    );
    return;
  }
  const materializedRefreshPlan = applyLatestSceneMaterialsToSmartEditPlan(
    refreshPlan,
    project.renderTasks,
  );
  refreshPlan = withSmartEditTimeline(materializedRefreshPlan.plan);
  await updateSmartEditComposeStarted(
    store,
    renderTaskId,
    refreshPlan,
    smartEditSegmentRefreshTraceEvents({
      appliedMaterialsCount: materializedRefreshPlan.appliedCount,
      fallback: plannerResult.fallback,
    }),
  );

  let exportResult: Awaited<ReturnType<SmartEditComposer>>;
  try {
    exportResult = await smartEditComposer(project.id, refreshPlan, project.assets, {
      storageProvider,
      subtitlesEnabled: requestData.mediaSettings.subtitlesEnabled,
      videoSettings: requestData.videoSettings,
    });
  } catch (error) {
    await updateSmartEditJobFailed(
      store,
      renderTaskId,
      error,
      "Smart edit segment refresh ffmpeg composition failed.",
      "smart-edit-segment-refresh-compose-failed",
    );
    return;
  }

  await updateSmartEditComposeCompleted(store, renderTaskId, refreshPlan, exportResult, {
    status: "completed",
    step: "smart-edit-segment-refresh-compose",
    message:
      "Selected segment was refreshed; unchanged segments reused uploaded segment outputs before final ffmpeg composition.",
  });
};
