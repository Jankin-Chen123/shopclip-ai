import type {
  RenderTask,
  SmartEditPlan,
  SmartEditResult,
  StoryboardScene,
  TraceEvent,
} from "@shopclip/shared";

import {
  materializeSmartEditRenderedSegmentsToTimelineElements,
} from "../features/edit/SmartEditPanel";
import type { MediaSettings, RenderSnapshot } from "../lib/api";
import type { Language } from "./i18n";

export const isRenderTaskPollingActive = (
  renderTask: Pick<RenderTask, "status"> | undefined,
): boolean =>
  renderTask?.status === "queued" ||
  renderTask?.status === "running" ||
  renderTask?.status === "retrying";

export const markRenderTaskExported = (
  renderTask: RenderTask | undefined,
  exportUrl: string,
): RenderTask | undefined =>
  renderTask
    ? {
        ...renderTask,
        exportUrl,
        previewUrl: exportUrl,
      }
    : renderTask;

export const isSmartEditTask = (renderTask: Pick<RenderTask, "provider"> | undefined): boolean =>
  renderTask?.provider === "smart-edit-ffmpeg";

export const hasCompletedSceneClips = (renderTask: RenderTask | undefined): boolean =>
  renderTask?.status === "completed" &&
  renderTask.sceneClips?.some((clip) => clip.status === "completed" && Boolean(clip.videoUrl)) ===
    true;

export const needsSceneClipMaterialRefresh = (renderTask: RenderTask | undefined): boolean =>
  renderTask?.provider === "volcengine-seedance" &&
  hasCompletedSceneClips(renderTask) &&
  renderTask.sceneClips?.some(
    (clip) => clip.status === "completed" && Boolean(clip.videoUrl) && !clip.material,
  ) === true;

export const selectInvalidSeedanceSceneDuration = (
  scenes: StoryboardScene[],
): StoryboardScene | undefined =>
  scenes.find((scene) => scene.durationSeconds < 4 || scene.durationSeconds > 12);

const hasSceneClipAudioMaterial = (renderTask: RenderTask | undefined): boolean =>
  hasCompletedSceneClips(renderTask) &&
  renderTask?.sceneClips?.some((clip) => Boolean(clip.material?.audioUrl)) === true;

export const selectStudioBaseRenderTask = (renderTasks: RenderTask[]): RenderTask | undefined => {
  const sourceRenders = [...renderTasks]
    .reverse()
    .filter((candidate) => !isSmartEditTask(candidate) && hasCompletedSceneClips(candidate));

  return (
    sourceRenders.find(hasSceneClipAudioMaterial) ??
    sourceRenders.find(
      (candidate) =>
        candidate.videoSettings?.generateAudio === true &&
        candidate.sceneClips?.some(
          (clip) => clip.status === "completed" && Boolean(clip.videoUrl) && !clip.material,
        ) === true,
    ) ??
    sourceRenders[0] ??
    renderTasks.at(-1)
  );
};

export const selectLatestCompletedSmartEditTask = (
  renderTasks: RenderTask[],
): RenderTask | undefined =>
  [...renderTasks]
    .reverse()
    .find(
      (candidate) =>
        isSmartEditTask(candidate) &&
        candidate.status === "completed" &&
        Boolean(candidate.smartEditPlan) &&
        Boolean(candidate.exportUrl) &&
        Boolean(candidate.previewUrl),
    );

export const smartEditResultFromRenderSnapshot = (
  render: RenderSnapshot,
): SmartEditResult | undefined => {
  if (
    render.renderTask.status !== "completed" ||
    render.renderTask.provider !== "smart-edit-ffmpeg" ||
    !render.renderTask.smartEditPlan ||
    !render.renderTask.exportUrl ||
    !render.renderTask.previewUrl
  ) {
    return undefined;
  }

  return {
    exportUrl: render.renderTask.exportUrl,
    plan: render.renderTask.smartEditPlan,
    previewUrl: render.renderTask.previewUrl,
    renderTaskId: render.renderTask.id,
    segmentOutputs: render.renderTask.smartEditSegmentOutputs ?? [],
    traceEvents: render.traceEvents,
  };
};

export const createSmartEditResultFromCompletedSourceRender = ({
  language,
  mediaSettings,
  renderTask,
  scenes,
  targetLanguage,
  traceEvents,
}: {
  language: Language;
  mediaSettings: MediaSettings;
  renderTask: RenderTask;
  scenes: StoryboardScene[];
  targetLanguage?: string;
  traceEvents: TraceEvent[];
}): SmartEditResult | undefined => {
  if (renderTask.status !== "completed" || isSmartEditTask(renderTask)) {
    return undefined;
  }

  const readyClips = (renderTask.sceneClips ?? [])
    .filter((clip) => clip.status === "completed" && Boolean(clip.videoUrl))
    .sort((left, right) => left.order - right.order);
  if (readyClips.length === 0) {
    return undefined;
  }

  const sceneById = new Map(scenes.map((scene) => [scene.id, scene]));
  const segments = readyClips.map((clip) => {
    const scene = sceneById.get(clip.sceneId);
    const durationSeconds =
      scene?.durationSeconds ?? clip.material?.audioWaveform?.durationSeconds ?? 4;
    const subtitle = (clip.material?.text || clip.subtitle || scene?.subtitle || scene?.voiceover || "")
      .trim()
      .slice(0, 2000);
    const voiceover = (scene?.voiceover || clip.subtitle || subtitle).trim().slice(0, 2000);

    return {
      assetTags: [],
      captionHidden: false,
      captionStartOffsetSeconds: 0,
      durationSeconds,
      enabled: true,
      id: `source-render-${renderTask.id}-scene-${clip.sceneId}`,
      order: clip.order,
      playbackRate: 1,
      rationale:
        language === "zh"
          ? "娓叉煋瀹屾垚鍚庤嚜鍔ㄦ媶瑙ｄ负鍙壀杈戠殑瑙嗛銆侀煶棰戝拰瀛楀箷绱犳潗銆?"
          : "Automatically materialized after rendering for video, audio, and subtitle editing.",
      sceneId: clip.sceneId,
      source: {
        kind: "generated-scene-clip" as const,
        sceneClipAudioUrl: clip.material?.audioUrl,
        sceneClipAudioWaveform: clip.material?.audioWaveform,
        sceneClipUrl: clip.videoUrl!,
        sceneClipVideoOnlyUrl: clip.material?.videoOnlyUrl,
      },
      sourceAudioMuted: false,
      sourceAudioStartOffsetSeconds: 0,
      subtitle: subtitle || (language === "zh" ? `鍒嗛暅 ${clip.order}` : `Scene ${clip.order}`),
      timelineStartSecond: 0,
      transition: clip.order === 1 ? ("cut" as const) : ("fade" as const),
      voiceover: voiceover || subtitle || (language === "zh" ? `鍒嗛暅 ${clip.order}` : `Scene ${clip.order}`),
      voiceoverStartOffsetSeconds: 0,
    };
  });
  const targetDurationSeconds = Math.max(
    1,
    segments.reduce((sum, segment) => sum + segment.durationSeconds, 0),
  );
  const plan: SmartEditPlan = {
    audio: {
      bgmTrack: renderTask.mediaSettings?.bgmTrack ?? mediaSettings.bgmTrack,
      targetLanguage: targetLanguage?.trim() || (language === "zh" ? "zh-CN" : "en-US"),
      voice: renderTask.mediaSettings?.ttsVoice ?? mediaSettings.ttsVoice,
    },
    createdAt: new Date().toISOString(),
    id: `source-render-${renderTask.id}-auto-edit-plan`,
    projectId: renderTask.projectId,
    segments,
    strategy:
      language === "zh"
        ? "鑷姩鎶婂凡娓叉煋鍒嗛暅鎷嗚В涓哄壀杈戝尯绱犳潗銆?"
        : "Automatically seed the editor with materialized rendered scenes.",
    targetDurationSeconds,
  };
  const materializedPlan = materializeSmartEditRenderedSegmentsToTimelineElements(
    plan,
    segments.map((segment) => segment.id),
    renderTask.updatedAt.replace(/[^a-zA-Z0-9]/gu, ""),
  );
  const firstClipUrl = readyClips[0]?.videoUrl;
  const previewUrl = renderTask.previewUrl ?? renderTask.exportUrl ?? firstClipUrl;
  const exportUrl = renderTask.exportUrl ?? renderTask.previewUrl ?? firstClipUrl;
  if (!previewUrl || !exportUrl) {
    return undefined;
  }

  return {
    exportUrl,
    plan: materializedPlan,
    previewUrl,
    renderTaskId: renderTask.id,
    segmentOutputs: [],
    traceEvents,
  };
};
