import type {
  AssetMetadata,
  ScriptGenerationRequest,
  ScriptResult,
  StoryboardScene,
} from "@shopclip/shared";

import { generateInspiration } from "../../providers/ai/arkInspirationProvider.js";
import type { VideoFrameExtractor } from "../../providers/media/videoFrameExtractor.js";
import type { ProjectSnapshot } from "./projectStore.js";
import {
  getAppearanceAnchorLines,
  resolveSceneBoundAsset,
  resolveStoryboardReferenceImageUrls,
} from "./referenceAssetUtils.js";
import {
  canUseStoryboardFallbackImage,
  createStoryboardFallbackImageUrl,
} from "./storyboardFallback.js";

const shouldForceMockProviders = (): boolean => process.env.SHOPCLIP_FORCE_MOCK_PROVIDERS === "1";

export const buildStoryboardImagePrompt = (
  project: ProjectSnapshot,
  scene: StoryboardScene,
  request: ScriptGenerationRequest | undefined,
  assets: AssetMetadata[],
  referenceImageUrls: string[],
): string => {
  const boundAsset = resolveSceneBoundAsset(scene, assets);
  const materialNames = [
    ...(boundAsset ? [boundAsset.name] : []),
    ...assets.filter((asset) => asset.id !== boundAsset?.id).map((asset) => asset.name),
    ...(request?.materials ?? []).map((material) => material.name),
  ].slice(0, 8);
  const appearanceAnchorLines = getAppearanceAnchorLines(boundAsset);

  return [
    "你正在为电商短视频生成 9:16 竖版分镜图。",
    "",
    "【全局硬性规则】",
    "- 必须使用中文理解以下内容。",
    "- 画面中的产品必须严格匹配绑定素材和参考图，不得重新设计产品。",
    "- 不得改变产品颜色、形状、材质、Logo、包装、结构、配件和可见文字。",
    "- 如果素材信息不足，只能弱化背景或镜头动作，不能虚构产品外观。",
    "",
    "【视频脚本上下文】",
    `产品名称：${project.productName}`,
    `目标人群：${project.audience}`,
    `核心卖点：${project.sellingPoints.join("、")}`,
    `视频语气：${project.tone}`,
    `视频风格：${project.style}`,
    `关键词：${request?.keywords.join("、") || "无"}`,
    "",
    "【本镜头信息】",
    `镜头序号：${scene.order}`,
    `镜头文案：${scene.subtitle}`,
    `时长：${scene.durationSeconds} 秒`,
    `画面描述：${scene.visualPrompt}`,
    "",
    "【绑定素材】",
    `素材 ID：${boundAsset?.id ?? "未绑定"}`,
    `素材名称：${boundAsset?.name ?? "未绑定"}`,
    `素材类型：${boundAsset?.type ?? "未知"}`,
    `参考图数量：${referenceImageUrls.length}`,
    `已准备素材：${materialNames.join("、") || "无"}`,
    `产品外观锚点：${appearanceAnchorLines.join("；")}`,
    "",
    "【禁止改变】",
    "- 禁止更换产品颜色、形状、品牌、Logo、包装、材质、屏幕内容、结构和配件数量。",
    "- 禁止添加参考图中不存在的品牌元素。",
    "- 禁止生成海报大字、乱码或不可读文字。",
    "",
    "【生成要求】",
    "生成一张 9:16 电商短视频分镜图。画面主体是绑定素材中的同一款产品。构图、背景、光线、人物手部或使用场景可以服务本镜头目标，但产品外观必须与绑定素材一致。",
  ].join("\n");
};

export const generateStoryboardSceneImageUrl = async (
  project: ProjectSnapshot,
  scene: StoryboardScene,
  request: ScriptGenerationRequest | undefined,
  assets: AssetMetadata[],
  videoFrameExtractor: VideoFrameExtractor,
): Promise<string> => {
  let referenceImageUrls: string[] = [];
  let prompt = "";
  try {
    if (shouldForceMockProviders()) {
      return createStoryboardFallbackImageUrl(project, scene);
    }
    referenceImageUrls = await resolveStoryboardReferenceImageUrls(
      scene,
      assets,
      videoFrameExtractor,
    );
    prompt = buildStoryboardImagePrompt(project, scene, request, assets, referenceImageUrls);
    const generated = await generateInspiration({
      assetType: "image",
      prompt,
      apiConfig: request?.apiConfig,
      options: {
        image: {
          aspectRatio: "9:16",
          count: 1,
          quality: "standard",
          referenceImages: referenceImageUrls,
        },
      },
    });
    const material = generated.materials.find(
      (candidate) => candidate.status === "ready" && candidate.url,
    );
    if (material?.url) {
      return material.url;
    }
    const fallbackReason = generated.fallback.reason ?? "";
    const shouldRetryWithoutReferences =
      referenceImageUrls.length > 0 &&
      !fallbackReason.includes("AI_PROVIDER_MODE is mock") &&
      !fallbackReason.includes("environment variables are incomplete") &&
      !fallbackReason.includes("User API settings are incomplete");
    if (shouldRetryWithoutReferences) {
      console.warn(
        "[storyboard] image generation with reference images did not return a URL; retrying text-only generation.",
        {
          fallback: generated.fallback,
          referenceImageCount: referenceImageUrls.length,
          sceneId: scene.id,
        },
      );
      const retried = await generateInspiration({
        assetType: "image",
        prompt,
        apiConfig: request?.apiConfig,
        options: {
          image: {
            aspectRatio: "9:16",
            count: 1,
            quality: "standard",
          },
        },
      });
      const retriedMaterial = retried.materials.find(
        (candidate) => candidate.status === "ready" && candidate.url,
      );
      if (retriedMaterial?.url) {
        return retriedMaterial.url;
      }
    }
  } catch (error) {
    if (referenceImageUrls.length > 0 && !canUseStoryboardFallbackImage()) {
      const retried = await generateInspiration({
        assetType: "image",
        prompt,
        apiConfig: request?.apiConfig,
        options: {
          image: {
            aspectRatio: "9:16",
            count: 1,
            quality: "standard",
          },
        },
      });
      const retriedMaterial = retried.materials.find(
        (candidate) => candidate.status === "ready" && candidate.url,
      );
      if (retriedMaterial?.url) {
        return retriedMaterial.url;
      }
    }
    if (canUseStoryboardFallbackImage()) {
      console.warn("[storyboard] image generation failed; using deterministic fallback.", error);
      return createStoryboardFallbackImageUrl(project, scene);
    }
    throw error;
  }

  if (canUseStoryboardFallbackImage()) {
    return createStoryboardFallbackImageUrl(project, scene);
  }
  throw new Error(
    "Real storyboard image generation did not return a usable image URL. Set AI_PROVIDER_MODE=mock only for demo fixtures.",
  );
};

export const renderStoryboardSceneImages = async (
  project: ProjectSnapshot,
  script: Omit<ScriptResult, "id" | "projectId">,
  request: ScriptGenerationRequest | undefined,
  assets: AssetMetadata[],
  videoFrameExtractor: VideoFrameExtractor,
): Promise<Omit<ScriptResult, "id" | "projectId">> => ({
  ...script,
  scenes: await Promise.all(
    script.scenes.map(async (scene) => ({
      ...scene,
      imageUrl: await generateStoryboardSceneImageUrl(
        project,
        scene,
        request,
        assets,
        videoFrameExtractor,
      ),
    })),
  ),
});
