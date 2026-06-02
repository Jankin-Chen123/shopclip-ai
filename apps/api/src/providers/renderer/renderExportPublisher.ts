import { readFile } from "node:fs/promises";

import type { SceneRenderClip } from "@shopclip/shared";

import type { StorageProvider } from "../storage/storageProvider.js";
import { composeSceneClipsToLocalFile } from "./ffmpegComposer.js";
import type { LocalSceneClipExport } from "./ffmpegComposer.js";

export type SceneClipLocalComposer = (
  projectId: string,
  clips: SceneRenderClip[],
) => Promise<LocalSceneClipExport | undefined>;

export type RenderExportPublisher = (
  projectId: string,
  clips: SceneRenderClip[],
) => Promise<string | undefined>;

interface RenderExportPublisherOptions {
  env?: Partial<Pick<NodeJS.ProcessEnv, "COS_EXPORT_READ_MODE">>;
  localComposer?: SceneClipLocalComposer;
  storageProvider: StorageProvider;
}

export const createRenderExportObjectKey = (projectId: string, exportId: string): string =>
  `projects/${projectId}/exports/${exportId}/export.mp4`;

const shouldUseSignedReadUrl = (env: RenderExportPublisherOptions["env"]): boolean =>
  env?.COS_EXPORT_READ_MODE?.trim().toLowerCase() === "signed";

export const publishRenderExportToStorage = async (
  projectId: string,
  clips: SceneRenderClip[],
  {
    env = process.env,
    localComposer = composeSceneClipsToLocalFile,
    storageProvider,
  }: RenderExportPublisherOptions,
): Promise<string | undefined> => {
  const videoUrls = [...clips]
    .sort((left, right) => left.order - right.order)
    .map((clip) => clip.videoUrl)
    .filter((url): url is string => Boolean(url));

  if (videoUrls.length === 0) {
    return undefined;
  }

  const localExport = await localComposer(projectId, clips);
  if (!localExport) {
    return undefined;
  }

  const objectKey = createRenderExportObjectKey(projectId, localExport.exportId);
  const uploaded = await storageProvider.uploadObject({
    body: await readFile(localExport.outputPath),
    contentType: "video/mp4",
    objectKey,
  });

  if (shouldUseSignedReadUrl(env)) {
    return storageProvider.createReadUrl({ objectKey: uploaded.objectKey }).url;
  }

  return uploaded.publicUrl;
};

export const createCosRenderExportPublisher =
  ({
    env = process.env,
    localComposer = composeSceneClipsToLocalFile,
    storageProvider,
  }: RenderExportPublisherOptions): RenderExportPublisher =>
  async (projectId, clips) =>
    publishRenderExportToStorage(projectId, clips, {
      env,
      localComposer,
      storageProvider,
    });
