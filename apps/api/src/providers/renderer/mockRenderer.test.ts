import { describe, expect, it } from "vitest";

import type { ProjectSnapshot } from "../../modules/projects/projectStore.js";
import { renderFallbackPreview } from "./mockRenderer.js";

const project: ProjectSnapshot = {
  id: "project-1",
  title: "Desk clip",
  productName: "GlowGrip Phone Stand",
  audience: "TikTok buyers",
  sellingPoints: ["folds flat"],
  tone: "confident",
  style: "fast desk demo",
  targetDurationSeconds: 12,
  prepKeywords: [],
  status: "ready",
  createdAt: "2026-05-28T00:00:00.000Z",
  updatedAt: "2026-05-28T00:00:00.000Z",
  assets: [],
  assetSlices: [],
  assetProcessingEvents: [],
  assetProcessingJobs: [],
  referenceVideos: [],
  viralTemplates: [],
  scripts: [],
  scenes: [],
  renderTasks: [],
};

describe("mock renderer provider", () => {
  it("keeps the selected script title on fallback render tasks", () => {
    const result = renderFallbackPreview(project, {
      displayName: "高转化水杯短视频脚本",
      mediaSettings: {
        ttsVoice: "clear-host",
        subtitleStyle: "clean-lower-third",
        subtitlesEnabled: true,
        bgmTrack: "creator-pop",
      },
    });

    expect(result.renderTask.displayName).toBe("高转化水杯短视频脚本");
  });
});
