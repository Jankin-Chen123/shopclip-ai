import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AssetMetadata, ExternalAssetResult } from "@shopclip/shared";

import { inferAssetTags } from "../assets/tagging.js";
import { mediaOutputDir } from "../media/mediaPaths.js";

export const normalizeTag = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

export const assetTypeForExternalAsset = (
  type: ExternalAssetResult["type"],
): AssetMetadata["type"] => (type === "audio" || type === "text" ? "reference" : type);

export const mimeTypeForExternalAsset = (type: ExternalAssetResult["type"]) =>
  type === "video"
    ? "video/mp4"
    : type === "audio"
      ? "audio/mpeg"
      : type === "text"
        ? "text/plain"
        : "image/jpeg";

export const externalAssetTypeTag = (type: ExternalAssetResult["type"]): string =>
  type === "text" ? "script" : type;

export const buildExternalImportTags = (
  externalAsset: ExternalAssetResult,
  contentType: string,
  storageProviderName?: AssetMetadata["storageProvider"],
): string[] =>
  inferAssetTags({
    name: externalAsset.title,
    mimeType: contentType,
    source: "external_provider",
    storageProvider: storageProviderName,
    tags: [
      ...externalAsset.tags,
      externalAssetTypeTag(externalAsset.type),
      "external",
      `source-${externalAsset.source}`,
      `external-id-${externalAsset.externalId}`,
      `license-${normalizeTag(externalAsset.licenseLabel)}`,
    ],
  });

export const buildExternalImportMetadata = (
  externalAsset: ExternalAssetResult,
  extras: Record<string, unknown> = {},
): Record<string, unknown> => ({
  externalAssetImport: true,
  externalAssetType: externalAsset.type,
  externalId: externalAsset.externalId,
  externalSource: externalAsset.source,
  externalUrl: externalAsset.externalUrl,
  originalDownloadUrl: externalAsset.downloadUrl,
  originalPreviewUrl: externalAsset.previewUrl,
  licenseLabel: externalAsset.licenseLabel,
  licenseUrl: externalAsset.licenseUrl,
  requiresAttribution: externalAsset.requiresAttribution,
  canUseCommercially: externalAsset.canUseCommercially,
  structuredAssetVersion: "asset-multigranularity-v1",
  ...extras,
});

export const contentTypeMatchesExternalType = (
  type: ExternalAssetResult["type"],
  contentType: string | undefined,
): boolean => {
  const normalizedContentType = contentType?.split(";")[0]?.trim().toLowerCase();
  if (!normalizedContentType) {
    return false;
  }

  if (type === "image") {
    return normalizedContentType.startsWith("image/");
  }
  if (type === "video") {
    return normalizedContentType.startsWith("video/");
  }
  if (type === "audio") {
    return normalizedContentType.startsWith("audio/");
  }

  return normalizedContentType.startsWith("text/") || normalizedContentType === "application/json";
};

export const contentTypeForExternalAsset = (
  type: ExternalAssetResult["type"],
  downloadedContentType: string | undefined,
): string => {
  const normalizedContentType = downloadedContentType?.split(";")[0]?.trim().toLowerCase();
  if (normalizedContentType && contentTypeMatchesExternalType(type, normalizedContentType)) {
    return normalizedContentType;
  }

  return mimeTypeForExternalAsset(type);
};

export const extensionForContentType = (contentType: string): string => {
  if (contentType.includes("png")) {
    return ".png";
  }
  if (contentType.includes("webp")) {
    return ".webp";
  }
  if (contentType.includes("jpeg") || contentType.includes("jpg")) {
    return ".jpg";
  }
  if (contentType.includes("webm")) {
    return ".webm";
  }
  if (contentType.includes("quicktime")) {
    return ".mov";
  }
  if (contentType.includes("mp4")) {
    return ".mp4";
  }
  if (contentType.includes("wav")) {
    return ".wav";
  }
  if (contentType.includes("mpeg") || contentType.includes("mp3")) {
    return ".mp3";
  }
  if (contentType.includes("markdown")) {
    return ".md";
  }

  return ".txt";
};

export const fileNameForExternalImport = (title: string, contentType: string): string => {
  const extension = extensionForContentType(contentType);
  return title.toLowerCase().endsWith(extension) ? title : `${title}${extension}`;
};

export const safeLocalFileName = (value: string): string =>
  // eslint-disable-next-line no-control-regex
  value.replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "-").replace(/^\.+$/, "asset") || "asset";

export const writeDownloadedAssetCache = async ({
  assetId,
  body,
  name,
}: {
  assetId: string;
  body: Buffer;
  name: string;
}): Promise<string> => {
  const directory = join(mediaOutputDir(), "downloaded-assets", assetId);
  await mkdir(directory, { recursive: true });
  const localFilePath = join(directory, safeLocalFileName(name));
  await writeFile(localFilePath, body);
  return localFilePath;
};

const allowedDownloadHostsBySource: Record<ExternalAssetResult["source"], string[]> = {
  freesound: ["freesound.org", "cdn.freesound.org"],
  pexels: ["pexels.com", "images.pexels.com", "videos.pexels.com"],
  pixabay: ["pixabay.com", "cdn.pixabay.com"],
};

export const assertAllowedExternalDownloadUrl = (
  asset: ExternalAssetResult,
  sourceUrl: string,
): void => {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(sourceUrl);
  } catch {
    throw new Error("External asset download URL is invalid.");
  }

  if (parsedUrl.protocol !== "https:") {
    throw new Error("External asset downloads must use HTTPS URLs.");
  }

  const hostname = parsedUrl.hostname.toLowerCase();
  const allowedHosts = allowedDownloadHostsBySource[asset.source];
  const allowed = allowedHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`));
  if (!allowed) {
    throw new Error(`External asset download host is not allowed for ${asset.source}.`);
  }
};

export interface ExternalAssetDownloadResult {
  body: Buffer;
  contentType?: string;
  sourceUrl: string;
}

export type ExternalAssetDownloader = (
  asset: ExternalAssetResult,
) => Promise<ExternalAssetDownloadResult>;

export const downloadExternalAsset: ExternalAssetDownloader = async (asset) => {
  const sourceUrl = asset.downloadUrl ?? asset.previewUrl;
  assertAllowedExternalDownloadUrl(asset, sourceUrl);

  const downloadResponse = await fetch(sourceUrl);
  if (!downloadResponse.ok) {
    throw new Error(`External asset download failed with status ${downloadResponse.status}.`);
  }

  return {
    body: Buffer.from(await downloadResponse.arrayBuffer()),
    contentType: downloadResponse.headers.get("content-type") ?? undefined,
    sourceUrl,
  };
};
