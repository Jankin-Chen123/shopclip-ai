import type { Router } from "express";
import type {
  AssetMetadata,
  SceneRegenerationRequest,
  SceneUpdate,
  ScriptGenerationRequest,
  StoryboardScene,
  TraceEvent,
} from "@shopclip/shared";
import {
  SceneRegenerationRequestSchema,
  SceneUpdateSchema,
} from "@shopclip/shared";

import { generateEditingSuggestions } from "../../providers/ai/editingAgentProvider.js";
import { recallAssetsForScene } from "../scenes/assetRecallService.js";
import { sendInvalidRequest, sendNotFound } from "./httpResponseUtils.js";
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

type RegisterSceneRoutesOptions = {
  generateImageUrl: SceneImageGenerator;
  router: Router;
  store: ProjectStore;
};

export const registerSceneRoutes = ({
  generateImageUrl,
  router,
  store,
}: RegisterSceneRoutesOptions): void => {
  router.patch("/scenes/:sceneId", async (request, response) => {
    const parsedUpdate = SceneUpdateSchema.safeParse(request.body);
    if (!parsedUpdate.success) {
      sendInvalidRequest(response, "INVALID_SCENE_UPDATE", "Scene update fields are invalid.");
      return;
    }

    const updatedScene = await updateSceneWithAssetValidation({
      sceneId: request.params.sceneId,
      store,
      update: parsedUpdate.data,
    });
    if (updatedScene.kind === "scene-not-found") {
      sendNotFound(response, "SCENE_NOT_FOUND", "Scene was not found.");
      return;
    }
    if (updatedScene.kind === "invalid-asset") {
      sendInvalidRequest(
        response,
        "INVALID_SCENE_ASSET",
        "Scene asset does not exist or cannot be used in this project.",
      );
      return;
    }

    response.json({ scene: updatedScene.scene });
  });

  router.post("/projects/:projectId/scenes/reorder", async (request, response) => {
    const sceneIds = Array.isArray(request.body?.sceneIds)
      ? request.body.sceneIds.filter(
          (sceneId: unknown): sceneId is string => typeof sceneId === "string",
        )
      : [];
    if (sceneIds.length === 0) {
      sendInvalidRequest(response, "INVALID_SCENE_ORDER", "sceneIds are required.");
      return;
    }

    const scenes = await store.reorderScenes(request.params.projectId, sceneIds);
    if (!scenes) {
      sendInvalidRequest(
        response,
        "INVALID_SCENE_ORDER",
        "Scene order does not match project scenes.",
      );
      return;
    }

    response.json({ scenes });
  });

  router.delete("/scenes/:sceneId", async (request, response) => {
    const scenes = await store.deleteScene(request.params.sceneId);
    if (!scenes) {
      sendNotFound(response, "SCENE_NOT_FOUND", "Scene was not found.");
      return;
    }

    response.json({ scenes });
  });

  router.post("/scenes/:sceneId/regenerate", async (request, response) => {
    const parsedRegeneration = SceneRegenerationRequestSchema.safeParse(request.body ?? {});
    if (!parsedRegeneration.success) {
      sendInvalidRequest(
        response,
        "INVALID_SCENE_REGENERATION_REQUEST",
        "Scene regeneration request is invalid.",
      );
      return;
    }

    const regeneratedScene = await regenerateSceneWithImage({
      generateImageUrl,
      regeneration: parsedRegeneration.data,
      sceneId: request.params.sceneId,
      store,
    });
    if (regeneratedScene.kind === "scene-not-found") {
      sendNotFound(response, "SCENE_NOT_FOUND", "Scene was not found.");
      return;
    }
    if (regeneratedScene.kind === "invalid-asset") {
      sendInvalidRequest(
        response,
        "INVALID_SCENE_ASSET",
        "Scene asset does not exist or cannot be used in this project.",
      );
      return;
    }

    response.json({
      scene: regeneratedScene.scene,
      traceEvent: regeneratedScene.traceEvent,
    });
  });

  router.get("/scenes/:sceneId/suggestions", async (request, response) => {
    const context = await store.getSceneContext(request.params.sceneId);
    if (!context) {
      sendNotFound(response, "SCENE_NOT_FOUND", "Scene was not found.");
      return;
    }

    response.json({
      suggestions: generateEditingSuggestions(
        context.project,
        context.scene,
        context.project.assets,
      ),
    });
  });

  router.post("/scenes/:sceneId/asset-recall", async (request, response) => {
    const context = await store.getSceneContext(request.params.sceneId);
    if (!context) {
      sendNotFound(response, "SCENE_NOT_FOUND", "Scene was not found.");
      return;
    }

    response.json({
      scene: context.scene,
      candidates: recallAssetsForScene(context.project, context.scene),
    });
  });

  router.post("/scenes/:sceneId/suggestions/:suggestionId/apply", async (request, response) => {
    const context = await store.getSceneContext(request.params.sceneId);
    if (!context) {
      sendNotFound(response, "SCENE_NOT_FOUND", "Scene was not found.");
      return;
    }

    const suggestion = generateEditingSuggestions(
      context.project,
      context.scene,
      context.project.assets,
    ).find((candidate) => candidate.id === request.params.suggestionId);
    if (!suggestion) {
      sendNotFound(response, "SUGGESTION_NOT_FOUND", "Suggestion was not found.");
      return;
    }

    const storedScene = await store.updateScene(context.scene.id, suggestion.update);
    if (!storedScene) {
      sendNotFound(response, "SCENE_NOT_FOUND", "Scene was not found.");
      return;
    }

    const traceEvent = await store.appendTraceEvent(`scene:${context.scene.id}`, {
      status: "completed",
      step: "agent-suggestion-applied",
      message: `Applied editing suggestion ${suggestion.id}: ${suggestion.title}.`,
    });

    response.json({
      scene: storedScene,
      traceEvent,
    });
  });
};
