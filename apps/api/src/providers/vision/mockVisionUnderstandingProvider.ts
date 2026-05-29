import type {
  AssetMetadata,
  AssetRole,
  SceneRole,
  StructuredAssetMetadata,
  StructuredSliceMetadata,
} from "@shopclip/shared";

import type { VisionUnderstandingProvider } from "./visionUnderstandingProvider.js";

const includesAny = (source: string, terms: string[]): boolean =>
  terms.some((term) => source.includes(term));

const roleForAsset = (asset: AssetMetadata): AssetRole => {
  const source = `${asset.name} ${asset.tags.join(" ")}`.toLowerCase();
  if (asset.type === "reference" || asset.source === "public_reference") {
    return "reference_video";
  }
  if (includesAny(source, ["package", "box", "unbox"])) {
    return "packaging";
  }
  if (includesAny(source, ["detail", "close", "macro"])) {
    return "detail_image";
  }
  if (includesAny(source, ["demo", "usage", "hand"])) {
    return "usage_demo";
  }
  return "hero_image";
};

const sourceDeclarationForAsset = (asset: AssetMetadata): string => {
  if (asset.source === "public_reference") {
    return "Public reference asset; use structured analysis only.";
  }
  if (asset.source === "generated") {
    return "Generated asset owned by this demo workspace.";
  }
  return "Merchant-uploaded asset for this product workspace.";
};

const searchTextForAsset = (asset: AssetMetadata): string =>
  [asset.name, asset.type, asset.source, asset.tags.join(" "), asset.embeddingText]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

export const createMockVisionUnderstandingProvider = (): VisionUnderstandingProvider => ({
  understandAsset: async ({ asset, audio, probe }) => {
    const role = roleForAsset(asset);
    const metadata: StructuredAssetMetadata = {
      assetId: asset.id,
      projectId: asset.projectId,
      type: asset.type,
      source: asset.source ?? "merchant_upload",
      sourceDeclaration: sourceDeclarationForAsset(asset),
      objectKey: asset.objectKey,
      thumbnailKey: asset.thumbnailKey,
      durationSeconds: asset.type === "video" ? probe.durationSeconds : undefined,
      width: probe.width,
      height: probe.height,
      format: probe.format,
      overallSummary: `${asset.name} structured as ${role.replaceAll("_", " ")} for ecommerce video creation.`,
      role,
      globalTags: [...new Set([...asset.tags, role, asset.type])],
      ocrText: asset.type === "image" ? asset.tags.slice(0, 3).join(" ") : "",
      asrSummary: audio.asrSummary,
      visualStyle: {
        colors: ["product-neutral"],
        materials: ["inferred-material"],
        lighting: "demo-safe bright lighting",
        background: "merchant or generated product scene",
        mood: includesAny(asset.name.toLowerCase(), ["summer", "fresh"]) ? "fresh" : "practical",
      },
      qualitySignals: {
        sharpness: 0.82,
        stability: asset.type === "video" ? 0.76 : 1,
        productVisibility: "clear",
        usableForAd: true,
      },
      complianceFlags: asset.source === "public_reference" ? ["reference_only_no_remix"] : [],
      searchText: searchTextForAsset(asset),
      embeddingText: asset.embeddingText ?? searchTextForAsset(asset),
      modelTrace: {
        provider: "mock-vision",
        model: "deterministic-structured-assets-v1",
        confidence: 0.82,
        fallbackUsed: true,
      },
    };
    return metadata;
  },
  understandSlice: async ({ asset, audio, endSecond, frameKeys, index, sliceId, startSecond }) => {
    const source = `${asset.name} ${asset.tags.join(" ")}`.toLowerCase();
    const suitableSceneRoles: SceneRole[] =
      index === 0 ? ["hook", "demo"] : index === 1 ? ["demo", "trust"] : ["cta", "trust"];
    const action = includesAny(source, ["demo", "close", "hand"])
      ? "product close-up demonstration"
      : "product visibility shot";
    const searchText = [
      asset.name,
      asset.tags.join(" "),
      action,
      suitableSceneRoles.join(" "),
      audio.transcript,
    ]
      .join(" ")
      .toLowerCase();

    const metadata: StructuredSliceMetadata = {
      sliceId,
      assetId: asset.id,
      startSecond,
      endSecond,
      thumbnailKey: frameKeys[0],
      frameKeys,
      summary: `${asset.name} slice ${index + 1}: ${action}.`,
      transcript: audio.transcript,
      ocrText: index === 0 ? asset.tags.slice(0, 2).join(" ") : "",
      shotType: includesAny(source, ["close", "detail"]) ? "close_up" : "medium",
      cameraMovement: index === 0 ? "handheld_push_in" : "static",
      composition: "Product remains central and readable for a short-form ad.",
      transition: index === 0 ? "opening_cut" : "hard_cut",
      mood: includesAny(source, ["fresh", "summer"]) ? "fresh" : "practical",
      action,
      keyElements: [...new Set(["product", ...asset.tags.slice(0, 4)])],
      productVisibility: "clear",
      visibleProductParts: ["main body", "logo area"],
      suitableSceneRoles,
      qualitySignals: {
        sharpness: 0.84,
        stability: asset.type === "video" ? 0.74 : 1,
        productVisibility: "clear",
        usableForAd: true,
      },
      searchText,
      embeddingText: searchText,
      cosFrameObjectKeys: frameKeys,
    };
    return metadata;
  },
});
