import type { AssetUploadIntent } from "@shopclip/shared";

import type { CreateAssetUploadIntentRequest } from "../../modules/assets/validation.js";

export interface StorageUploadIntentInput {
  projectId?: string;
  assetId: string;
  asset: CreateAssetUploadIntentRequest;
}

export interface StorageUploadObjectInput {
  body: Buffer;
  contentType: string;
  objectKey: string;
}

export interface StorageUploadObjectResult {
  objectKey: string;
  provider: AssetUploadIntent["provider"];
  publicUrl: string;
}

export interface StorageReadUrlInput {
  objectKey: string;
}

export interface StorageReadUrlResult {
  expiresAt?: string;
  url: string;
}

export interface StorageDeleteObjectInput {
  objectKey: string;
}

export interface StorageProvider {
  createUploadIntent(input: StorageUploadIntentInput): AssetUploadIntent;
  createReadUrl(input: StorageReadUrlInput): StorageReadUrlResult;
  deleteObject(input: StorageDeleteObjectInput): Promise<void>;
  uploadObject(input: StorageUploadObjectInput): Promise<StorageUploadObjectResult>;
}

const extensionFromName = (name: string): string => {
  const match = name.match(/\.([a-z0-9]{1,12})$/i);
  return match?.[1] ? `.${match[1].toLowerCase()}` : "";
};

export const createAssetObjectKey = ({
  assetId,
  name,
  projectId,
}: {
  assetId: string;
  name: string;
  projectId?: string;
}): string =>
  projectId
    ? `projects/${projectId}/raw/${assetId}/source${extensionFromName(name)}`
    : `library/raw/${assetId}/source${extensionFromName(name)}`;
