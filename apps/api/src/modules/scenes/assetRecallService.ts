import type { AssetMetadata, AssetSlice, StoryboardScene } from "@shopclip/shared";

import type { ProjectSnapshot } from "../projects/projectStore.js";
import { searchAssets } from "../retrieval/search.js";

export interface SceneAssetRecallCandidate {
  asset: AssetMetadata;
  reasons: string[];
  score: number;
  slice?: AssetSlice;
}

const sourcePreference = {
  merchant_upload: 20,
  generated: 12,
  external_provider: 8,
  public_reference: -100,
} as const;

const queryForScene = (scene: StoryboardScene): string =>
  [scene.assetRecallQuery, scene.visualPrompt, scene.subtitle, scene.voiceover]
    .filter(Boolean)
    .join(" ");

export const recallAssetsForScene = (
  project: ProjectSnapshot,
  scene: StoryboardScene,
): SceneAssetRecallCandidate[] => {
  const searchResults = searchAssets(project, {
    query: queryForScene(scene),
    tags: [],
    level: "slice",
    sceneRole: "demo",
  });

  return searchResults
    .flatMap((result) => {
      const bestSlice = result.slices.find((slice) => slice.metadata) ?? result.slices[0];
      const sourceScore = sourcePreference[result.asset.source ?? "merchant_upload"] ?? 0;
      const productVisibilityScore = bestSlice?.metadata?.productVisibility === "clear" ? 18 : 0;
      const qualityScore = bestSlice?.metadata?.qualitySignals.usableForAd ? 10 : 0;
      const durationFitScore =
        bestSlice?.startSecond !== undefined && bestSlice.endSecond !== undefined
          ? Math.max(0, 10 - Math.abs(scene.durationSeconds - (bestSlice.endSecond - bestSlice.startSecond)))
          : 0;
      const reasons = [
        ...result.reasons,
        `source:${result.asset.source ?? "merchant_upload"}`,
        bestSlice?.metadata?.productVisibility
          ? `product-visibility:${bestSlice.metadata.productVisibility}`
          : undefined,
        bestSlice?.metadata?.qualitySignals.usableForAd ? "quality:ad-usable" : undefined,
        durationFitScore > 0 ? "duration-fit" : undefined,
      ].filter((reason): reason is string => Boolean(reason));

      return [
        {
          asset: result.asset,
          slice: bestSlice,
          score: result.score + sourceScore + productVisibilityScore + qualityScore + durationFitScore,
          reasons,
        },
      ];
    })
    .filter((candidate) => candidate.asset.source !== "public_reference")
    .sort((left, right) => right.score - left.score);
};
