import type { AssetMetadata, EditingSuggestion, StoryboardScene } from "@shopclip/shared";

import type { ProjectSnapshot } from "../../modules/projects/projectStore.js";

export const regenerateSceneFallback = (
  project: ProjectSnapshot,
  scene: StoryboardScene,
): StoryboardScene => ({
  ...scene,
  subtitle: `重生成：${scene.subtitle.replace(/^重生成：/u, "").replace(/^Regenerated:\s*/i, "")}`,
  voiceover: `围绕${project.productName}优化：${scene.voiceover}`,
  visualPrompt: `${scene.visualPrompt} 使用更紧凑的产品聚焦镜头，并保持与前后分镜的连续性；产品外观必须与绑定素材一致。`,
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
      title: "压缩开头钩子",
      explanation: "更短的开头文案能让用户在第一秒看清痛点和产品利益点。",
      update: {
        subtitle: `${project.productName}：${project.sellingPoints[0] ?? "核心卖点"}`,
        voiceover: `${project.productName}一步解决这个使用痛点。`,
        status: "edited",
      },
    },
    {
      id: "product-focus-shot",
      title: "强化产品近景",
      explanation: "更近的产品镜头能把卖点和用户上传素材中的真实产品外观绑定起来。",
      update: {
        visualPrompt: linkedAsset
          ? `使用${linkedAsset.name}做产品近景镜头，清晰展示买家利益点；产品外观必须与绑定素材一致。`
          : `为${project.productName}生成产品近景镜头，清晰展示买家利益点；产品外观必须与绑定素材一致。`,
        assetId: linkedAsset?.id,
        status: "edited",
      },
    },
  ];
};
