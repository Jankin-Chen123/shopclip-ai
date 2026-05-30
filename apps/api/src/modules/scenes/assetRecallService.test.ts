import type { AssetMetadata, AssetSlice, StoryboardScene } from "@shopclip/shared";
import { describe, expect, it } from "vitest";

import type { ProjectSnapshot } from "../projects/projectStore.js";
import { recallAssetsForScene } from "./assetRecallService.js";

const baseAsset: AssetMetadata = {
  id: "asset-demo-video",
  projectId: "project-recall",
  type: "video",
  status: "ready",
  source: "merchant_upload",
  url: "https://cdn.example.test/demo.mp4",
  name: "Bottle demo video",
  mimeType: "video/mp4",
  tags: ["bottle", "demo"],
  createdAt: "2026-05-30T00:00:00.000Z",
  updatedAt: "2026-05-30T00:00:00.000Z",
};

const makeSlice = (
  id: string,
  role: "hook" | "demo" | "trust" | "cta",
  summary: string,
): AssetSlice => ({
  id,
  assetId: baseAsset.id,
  label: `${role} slice`,
  startSecond: role === "hook" ? 0 : 3,
  endSecond: role === "hook" ? 3 : 6,
  tags: ["bottle", role],
  searchText: `${summary} ${role} bottle`,
  embeddingText: `${summary} ${role} bottle`,
  metadata: {
    sliceId: id,
    assetId: baseAsset.id,
    startSecond: role === "hook" ? 0 : 3,
    endSecond: role === "hook" ? 3 : 6,
    summary,
    transcript: "",
    ocrText: "",
    shotType: "close_up",
    cameraMovement: "static",
    composition: "Product centered.",
    transition: "hard cut",
    mood: "clear",
    action: summary,
    keyElements: ["bottle"],
    productVisibility: "clear",
    visibleProductParts: ["body"],
    suitableSceneRoles: [role],
    qualitySignals: {
      productVisibility: "clear",
      usableForAd: true,
    },
    searchText: `${summary} ${role} bottle`,
    embeddingText: `${summary} ${role} bottle`,
    cosFrameObjectKeys: [`projects/project-recall/derived/${baseAsset.id}/frames/${id}.jpg`],
  },
});

const makeProject = (assetSlices: AssetSlice[]): ProjectSnapshot =>
  ({
    id: "project-recall",
    title: "Bottle launch",
    productName: "ClearSip Bottle",
    audience: "students",
    sellingPoints: ["leak proof"],
    tone: "confident",
    style: "fast demo",
    targetDurationSeconds: 15,
    prepKeywords: [],
    status: "ready",
    createdAt: "2026-05-30T00:00:00.000Z",
    updatedAt: "2026-05-30T00:00:00.000Z",
    assets: [baseAsset],
    assetSlices,
    assetProcessingEvents: [],
    assetProcessingJobs: [],
    referenceVideos: [],
    viralTemplates: [],
    scripts: [],
    scenes: [],
    renderTasks: [],
  }) satisfies ProjectSnapshot;

const makeScene = (scene: Partial<StoryboardScene>): StoryboardScene => ({
  id: "scene-hook",
  projectId: "project-recall",
  order: 1,
  durationSeconds: 3,
  subtitle: "开场第一秒抓住学生党注意力",
  voiceover: "学生党水杯别乱买",
  visualPrompt: "opening hook close-up reveal",
  assetRecallQuery: "identity hook opening reveal",
  status: "generated",
  ...scene,
});

describe("recallAssetsForScene", () => {
  it("uses the storyboard role inferred from scene text instead of always searching demo slices", () => {
    const project = makeProject([
      makeSlice("slice-demo", "demo", "Hand demonstrates the leak proof lid."),
      makeSlice("slice-hook", "hook", "Opening reveal with identity hook text."),
    ]);

    const candidates = recallAssetsForScene(project, makeScene({}));

    expect(candidates[0]?.slice?.id).toBe("slice-hook");
    expect(candidates[0]?.reasons).toContain("scene-role:hook");
    expect(candidates[0]?.reasons).toContain("slice-role:hook");
  });
});
