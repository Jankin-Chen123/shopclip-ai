import type {
  AssetMetadata,
  ProjectSummary,
  ReferenceVideo,
  ScriptResult,
  StoryboardScene,
} from "@shopclip/shared";

import type { ProjectSnapshot } from "./projectStore.js";

const isImageAsset = (asset: AssetMetadata): boolean =>
  asset.type === "image" || Boolean(asset.mimeType?.startsWith("image/"));

export const toMemoryProjectSummary = (project: ProjectSnapshot): ProjectSummary => {
  const coverAsset = project.assets.find(isImageAsset);
  return {
    id: project.id,
    title: project.title,
    productName: project.productName,
    status: project.status,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    assetCount: project.assets.length,
    coverAssetId: coverAsset?.id,
    coverAssetUrl: coverAsset?.url,
    sceneCount: project.scenes.length,
  };
};

export const clearAssetReferences = (
  project: Pick<ProjectSnapshot, "scenes" | "scripts">,
  assetIds: ReadonlySet<string>,
): {
  changed: boolean;
  scenes: StoryboardScene[];
  scripts: ScriptResult[];
} => {
  const scenes = project.scenes.map((scene) =>
    scene.assetId && assetIds.has(scene.assetId) ? { ...scene, assetId: undefined } : scene,
  );
  const scripts = project.scripts.map((script) => ({
    ...script,
    scenes: script.scenes.map((scene) =>
      scene.assetId && assetIds.has(scene.assetId) ? { ...scene, assetId: undefined } : scene,
    ),
  }));
  const changed =
    scenes.some((scene, index) => scene.assetId !== project.scenes[index]?.assetId) ||
    scripts.some((script, scriptIndex) =>
      script.scenes.some(
        (scene, sceneIndex) =>
          scene.assetId !== project.scripts[scriptIndex]?.scenes[sceneIndex]?.assetId,
      ),
    );

  return { changed, scenes, scripts };
};

export const isReferenceOwnedAsset = (
  asset: AssetMetadata,
  reference: ReferenceVideo,
): boolean => {
  const metadata = asset.metadata && typeof asset.metadata === "object" ? asset.metadata : {};
  return (
    (metadata.kind === "reference_script_asset" && metadata.referenceId === reference.id) ||
    (asset.id === reference.sourceAssetId && asset.source === "public_reference")
  );
};
