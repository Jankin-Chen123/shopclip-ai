import type { AssetMetadata, EditingSuggestion, StoryboardScene } from "@shopclip/shared";

import type { ProjectSnapshot } from "../../modules/projects/memoryStore.js";

export const regenerateSceneFallback = (
  project: ProjectSnapshot,
  scene: StoryboardScene,
): StoryboardScene => ({
  ...scene,
  subtitle: `Regenerated: ${scene.subtitle.replace(/^Regenerated:\s*/i, "")}`,
  voiceover: `Updated for ${project.productName}: ${scene.voiceover}`,
  visualPrompt: `${scene.visualPrompt} Use a tighter product-focused shot and keep continuity with the surrounding storyboard.`,
  status: "generated",
});

export const generateEditingSuggestions = (
  project: ProjectSnapshot,
  scene: StoryboardScene,
  assets: AssetMetadata[],
): EditingSuggestion[] => {
  const linkedAsset = assets.find((asset) => asset.id === scene.assetId) ?? assets[0];

  return [
    {
      id: "tighten-hook",
      title: "Tighten the hook",
      explanation:
        "Shorter opening copy makes the first second easier to scan and keeps the product benefit visible.",
      update: {
        subtitle: `${project.productName}: ${project.sellingPoints[0] ?? "clear product benefit"}`,
        voiceover: `${project.productName} solves this in one quick move.`,
        status: "edited",
      },
    },
    {
      id: "product-focus-shot",
      title: "Use stronger product focus",
      explanation:
        "A closer product frame helps the scene connect the promise with the visible asset instead of staying abstract.",
      update: {
        visualPrompt: linkedAsset
          ? `Close product-focused shot using ${linkedAsset.name}; show the buyer benefit clearly.`
          : `Close product-focused shot for ${project.productName}; show the buyer benefit clearly.`,
        assetId: linkedAsset?.id,
        status: "edited",
      },
    },
  ];
};
