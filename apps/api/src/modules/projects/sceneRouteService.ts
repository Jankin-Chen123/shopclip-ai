import type {
  AssetMetadata,
  SceneRegenerationRequest,
  SceneUpdate,
  ScriptGenerationRequest,
  StoryboardScene,
  TraceEvent,
} from "@shopclip/shared";

import { canUseAssetInProject } from "./projectAssetUtils.js";
import type { ProjectSnapshot, ProjectStore } from "./projectStore.js";

export type SceneImageGenerator = (
  project: ProjectSnapshot,
  scene: StoryboardScene,
  request: ScriptGenerationRequest | undefined,
  assets: AssetMetadata[],
) => Promise<string>;

export type SceneUpdateResult =
  | { kind: "updated"; scene: StoryboardScene }
  | { kind: "scene-not-found" }
  | { kind: "invalid-asset" };

export const updateSceneWithAssetValidation = async ({
  sceneId,
  store,
  update,
}: {
  sceneId: string;
  store: ProjectStore;
  update: SceneUpdate;
}): Promise<SceneUpdateResult> => {
  if (typeof update.assetId === "string") {
    const context = await store.getSceneContext(sceneId);
    if (!context) {
      return { kind: "scene-not-found" };
    }

    const asset = await store.getAsset(update.assetId);
    if (!asset || !canUseAssetInProject(asset, context.project.id)) {
      return { kind: "invalid-asset" };
    }
  }

  const updatedScene = await store.updateScene(sceneId, update);
  if (!updatedScene) {
    return { kind: "scene-not-found" };
  }

  return { kind: "updated", scene: updatedScene };
};

export type SceneRegenerationResult =
  | { kind: "regenerated"; scene: StoryboardScene; traceEvent: TraceEvent }
  | { kind: "scene-not-found" }
  | { kind: "invalid-asset" };

export const regenerateSceneWithImage = async ({
  generateImageUrl,
  regeneration,
  sceneId,
  store,
}: {
  generateImageUrl: SceneImageGenerator;
  regeneration: SceneRegenerationRequest;
  sceneId: string;
  store: ProjectStore;
}): Promise<SceneRegenerationResult> => {
  const context = await store.getSceneContext(sceneId);
  if (!context) {
    return { kind: "scene-not-found" };
  }

  const sceneUpdate = regeneration.scene;
  if (typeof sceneUpdate?.assetId === "string") {
    const asset = await store.getAsset(sceneUpdate.assetId);
    if (!asset || !canUseAssetInProject(asset, context.project.id)) {
      return { kind: "invalid-asset" };
    }
  }

  const nextAssetId =
    sceneUpdate?.assetId === null ? undefined : (sceneUpdate?.assetId ?? context.scene.assetId);
  const sceneForImage: StoryboardScene = {
    ...context.scene,
    durationSeconds: sceneUpdate?.durationSeconds ?? context.scene.durationSeconds,
    subtitle: sceneUpdate?.subtitle ?? context.scene.subtitle,
    voiceover: sceneUpdate?.voiceover ?? context.scene.voiceover,
    visualPrompt: sceneUpdate?.visualPrompt ?? context.scene.visualPrompt,
    assetId: nextAssetId,
    status: "generated",
  };
  const linkedAsset = sceneForImage.assetId ? await store.getAsset(sceneForImage.assetId) : undefined;
  const imageUrl = await generateImageUrl(
    context.project,
    sceneForImage,
    {
      assetIds: sceneForImage.assetId ? [sceneForImage.assetId] : [],
      keywords: [],
      materials: [],
      productionMode: "automatic",
      apiConfig: regeneration.apiConfig,
    },
    linkedAsset ? [linkedAsset] : context.project.assets,
  );
  const storedScene = await store.updateScene(context.scene.id, {
    durationSeconds: sceneForImage.durationSeconds,
    subtitle: sceneForImage.subtitle,
    voiceover: sceneForImage.voiceover,
    visualPrompt: sceneForImage.visualPrompt,
    assetId: sceneUpdate?.assetId === null ? null : sceneForImage.assetId,
    status: "generated",
    imageUrl,
  });
  if (!storedScene) {
    return { kind: "scene-not-found" };
  }

  const traceEvent = await store.appendTraceEvent(`scene:${context.scene.id}`, {
    status: "completed",
    step: "scene-regenerated",
    message: `已根据当前分镜字段重生成第 ${context.scene.order} 个镜头图片。`,
  });

  return {
    kind: "regenerated",
    scene: storedScene,
    traceEvent,
  };
};
