import type { ProjectSnapshot } from "../../modules/projects/projectStore.js";
import type { MediaSettings, RenderTask, TraceEvent } from "@shopclip/shared";
import { synthesizeMockVoiceover } from "../tts/mockTtsProvider.js";

export interface RenderProviderResult {
  renderTask: Omit<RenderTask, "id" | "projectId" | "createdAt" | "updatedAt">;
  traceEvents: Array<Omit<TraceEvent, "id" | "renderTaskId" | "createdAt">>;
}

export interface RenderFallbackOptions {
  mediaSettings: MediaSettings;
  retryOfRenderTaskId?: string;
  retryOfTraceEventId?: string;
  simulateFailure?: boolean;
}

const mediaQuery = (settings: MediaSettings): string =>
  new URLSearchParams({
    voice: settings.ttsVoice,
    subtitles: settings.subtitlesEnabled ? settings.subtitleStyle : "off",
    bgm: settings.bgmTrack,
  }).toString();

export const renderFallbackPreview = (
  project: ProjectSnapshot,
  options: RenderFallbackOptions = {
    mediaSettings: {
      bgmTrack: "creator-pop",
      subtitleStyle: "clean-lower-third",
      subtitlesEnabled: true,
      ttsVoice: "clear-host",
    },
  },
): RenderProviderResult => {
  const ttsResult = synthesizeMockVoiceover(project, options.mediaSettings);
  const retryTrace = options.retryOfTraceEventId;
  const commonTrace: Array<Omit<TraceEvent, "id" | "renderTaskId" | "createdAt">> = [
    ...(options.retryOfRenderTaskId
      ? [
          {
            status: "retrying" as const,
            step: "render-retry-started",
            message: `Retrying failed render task ${options.retryOfRenderTaskId}.`,
            retryOfTraceEventId: retryTrace,
          },
        ]
      : []),
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
      step: "tts-synthesized",
      message: `Mock TTS generated with ${ttsResult.voice} at ${ttsResult.audioUrl}.`,
    },
    {
      status: "completed",
      step: "subtitle-overlay-prepared",
      message: options.mediaSettings.subtitlesEnabled
        ? `Subtitle overlay prepared with ${options.mediaSettings.subtitleStyle}.`
        : "Subtitle overlay disabled for this render.",
    },
    {
      status: "completed",
      step: "bgm-selected",
      message: `BGM track selected: ${options.mediaSettings.bgmTrack}.`,
    },
  ];

  if (options.simulateFailure) {
    return {
      renderTask: {
        status: "failed",
        progress: 72,
        errorMessage:
          "Simulated renderer failure after media layers were prepared. Retry is available.",
        mediaSettings: options.mediaSettings,
        retryOfRenderTaskId: options.retryOfRenderTaskId,
      },
      traceEvents: [
        ...commonTrace,
        {
          status: "failed",
          step: "preview-render-failed",
          message: "Simulated renderer failure occurred after media preparation.",
        },
      ],
    };
  }

  const query = mediaQuery(options.mediaSettings);

  return {
    renderTask: {
      status: "completed",
      progress: 100,
      previewUrl: `/demo-exports/${project.id}/preview.mp4?${query}`,
      exportUrl: `/demo-exports/${project.id}/export.mp4?${query}`,
      mediaSettings: options.mediaSettings,
      retryOfRenderTaskId: options.retryOfRenderTaskId,
    },
    traceEvents: [
      ...commonTrace,
      {
        status: "completed",
        step: "preview-created",
        message: "Deterministic preview URL assigned with selected media layers.",
      },
    ],
  };
};
