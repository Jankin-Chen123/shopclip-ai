import type { AssetMetadata, AssetSlice, SceneRole, StoryboardScene } from "@shopclip/shared";

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

const sceneText = (scene: StoryboardScene): string => queryForScene(scene).toLowerCase();

const rolePatterns: Array<[SceneRole, RegExp]> = [
  ["cta", /(buy|order|shop|cart|tap|link|purchase|购买|下单|入手|点击|链接|橱窗|加购)/i],
  ["price", /(\$|¥|￥|\bprice\b|discount|deal|sale|元|价格|到手|折扣|优惠|限时)/i],
  ["trust", /(proof|review|material|quality|clean|leak.?proof|trust|材质|质量|防漏|清洗|实测|测评|证明|口碑)/i],
  ["pain", /(pain|problem|annoying|worry|困扰|痛点|麻烦|担心|不好用|不方便)/i],
  ["fear", /(fear|risk|avoid|别买错|踩雷|后悔|风险|担心)/i],
  ["solution", /(solve|solution|fix|解决|改善|一招|轻松|方案)/i],
  ["hook", /(hook|opening|open|intro|reveal|identity|first|开场|第一秒|第一眼|身份|学生党|宝妈|上班族|露出)/i],
  ["closure", /(packshot|final|ending|brand|showcase|收尾|结尾|定格|品牌|展示)/i],
  ["transition", /(transition|cutaway|转场|过渡)/i],
  ["demo", /(demo|use|usage|show|hand|演示|使用|上手|展示|操作)/i],
];

export const inferSceneRoleForRecall = (scene: StoryboardScene): SceneRole => {
  const text = sceneText(scene);
  for (const [role, pattern] of rolePatterns) {
    if (pattern.test(text)) {
      return role;
    }
  }

  if (scene.order === 1) {
    return "hook";
  }
  if (scene.order >= 4 || scene.durationSeconds <= 2) {
    return "cta";
  }
  return "demo";
};

export const recallAssetsForScene = (
  project: ProjectSnapshot,
  scene: StoryboardScene,
): SceneAssetRecallCandidate[] => {
  const sceneRole = inferSceneRoleForRecall(scene);
  const searchResults = searchAssets(project, {
    query: queryForScene(scene),
    tags: [],
    level: "slice",
    sceneRole,
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
        `scene-role:${sceneRole}`,
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
