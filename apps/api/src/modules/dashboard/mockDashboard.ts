import type { DashboardResponse } from "@shopclip/shared";

import type { ProjectSnapshot } from "../projects/memoryStore.js";

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

export const buildMockDashboard = (project: ProjectSnapshot): DashboardResponse => {
  const sceneCount = Math.max(project.scenes.length, 1);
  const assetCount = Math.max(project.assets.length, 1);
  const subtitleLength = project.scenes.reduce((sum, scene) => sum + scene.subtitle.length, 0);
  const productKeyword =
    project.productName.toLowerCase().split(" ")[0] ?? project.productName.toLowerCase();
  const productMentions = project.scenes.filter((scene) =>
    `${scene.subtitle} ${scene.voiceover} ${scene.visualPrompt}`
      .toLowerCase()
      .includes(productKeyword),
  ).length;

  const hookStrength = clamp01(0.62 + Math.min(project.sellingPoints.length, 3) * 0.07);
  const subtitleClarity = clamp01(0.84 - Math.max(0, subtitleLength / sceneCount - 34) * 0.006);
  const productFocus = clamp01(0.58 + productMentions * 0.08 + assetCount * 0.04);
  const predictedCompletionRate = clamp01(
    0.46 + hookStrength * 0.14 + subtitleClarity * 0.12 + productFocus * 0.1,
  );

  const impressions = 12_000;
  const watch3s = Math.round(impressions * predictedCompletionRate);
  const clicks = Math.round(watch3s * (0.16 + productFocus * 0.08));
  const carts = Math.round(clicks * 0.42);
  const purchases = Math.round(carts * 0.38);

  const firstScene = project.scenes[0];
  const secondScene = project.scenes[1] ?? firstScene;
  const finalScene = project.scenes.at(-1) ?? firstScene;

  return {
    projectId: project.id,
    summary: {
      predictedCompletionRate,
      hookStrength,
      subtitleClarity,
      productFocus,
    },
    funnel: [
      { stage: "Impression", value: impressions },
      { stage: "Watch 3s", value: watch3s },
      { stage: "Click", value: clicks },
      { stage: "Add to cart", value: carts },
      { stage: "Purchase", value: purchases },
    ],
    factors: [
      {
        id: "factor-hook-clarity",
        sceneId: firstScene?.id,
        factor: "Hook clarity",
        expectedImpact: "high",
        evidence: firstScene
          ? `Scene ${firstScene.order} opens with "${firstScene.subtitle}", which anchors the viewer in a concrete problem.`
          : "No storyboard scene exists yet, so the dashboard uses a conservative hook estimate.",
        recommendation: "Keep the first subtitle short and tied to one buyer pain point.",
      },
      {
        id: "factor-subtitle-readability",
        sceneId: secondScene?.id,
        factor: "Subtitle readability",
        expectedImpact: subtitleClarity > 0.75 ? "medium" : "high",
        evidence: `Average subtitle length is ${Math.round(subtitleLength / sceneCount)} characters across ${sceneCount} scenes.`,
        recommendation: "Prefer short captions that can be read in under two seconds.",
      },
      {
        id: "factor-product-focus",
        sceneId: finalScene?.id,
        factor: "Product focus",
        expectedImpact: "high",
        evidence: `${assetCount} asset record(s) and ${productMentions} product mention(s) support product recall.`,
        recommendation: "Use product close-ups in the proof and closing scenes.",
      },
    ],
  };
};
