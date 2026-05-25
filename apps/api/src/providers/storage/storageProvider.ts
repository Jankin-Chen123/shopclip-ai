import type { AssetUploadIntent } from "@shopclip/shared";

import type { CreateAssetUploadIntentRequest } from "../../modules/assets/validation.js";

export interface StorageUploadIntentInput {
  projectId: string;
  assetId: string;
  asset: CreateAssetUploadIntentRequest;
}

export interface StorageProvider {
  createUploadIntent(input: StorageUploadIntentInput): AssetUploadIntent;
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
  projectId: string;
}): string => `projects/${projectId}/raw/${assetId}/source${extensionFromName(name)}`;
