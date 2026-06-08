import type { AssetMetadata, AssetSlice } from "@shopclip/shared";

import {
  createAssetUploadIntent,
  processAssetStructure,
  uploadAssetFileToStorage,
} from "../lib/api";
import type { Language } from "./i18n";
import {
  createAssetInputFromFile,
  shouldAutoProcessImportedAsset,
} from "./AppSetupUtils";

interface ImportAndStructureFilesInput {
  createAssetUploadIntentFn?: typeof createAssetUploadIntent;
  files: File[];
  language: Language;
  processAssetStructureFn?: typeof processAssetStructure;
  projectId?: string;
  uploadAssetFileToStorageFn?: typeof uploadAssetFileToStorage;
}

export const importAndStructureFiles = async ({
  createAssetUploadIntentFn = createAssetUploadIntent,
  files,
  language,
  processAssetStructureFn = processAssetStructure,
  projectId,
  uploadAssetFileToStorageFn = uploadAssetFileToStorage,
}: ImportAndStructureFilesInput): Promise<{
  assets: AssetMetadata[];
  assetSlices: AssetSlice[];
}> => {
  const importedAssets: AssetMetadata[] = [];
  const assetSlices: AssetSlice[] = [];

  for (const file of files) {
    const uploadIntent = await createAssetUploadIntentFn(
      projectId,
      createAssetInputFromFile(file, language),
    );
    const uploaded = await uploadAssetFileToStorageFn(uploadIntent.asset.id, file);
    let importedAsset = uploaded.asset;

    if (shouldAutoProcessImportedAsset(importedAsset)) {
      const processed = await processAssetStructureFn(importedAsset.id);
      importedAsset = processed.asset;
      assetSlices.push(...processed.slices);
    }

    importedAssets.push(importedAsset);
  }

  return { assets: importedAssets, assetSlices };
};
