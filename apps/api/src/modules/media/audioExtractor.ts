import type { AssetMetadata } from "@shopclip/shared";

export interface ExtractedAudioSummary {
  asrSummary: string;
  transcript: string;
}

export const extractAssetAudioSummary = (asset: AssetMetadata): ExtractedAudioSummary => {
  if (asset.type !== "video") {
    return {
      asrSummary: "",
      transcript: "",
    };
  }

  const tagText = asset.tags.join(", ");
  return {
    asrSummary: `Mock ASR summary for ${asset.name}${tagText ? ` covering ${tagText}` : ""}.`,
    transcript: "Show the product, prove the benefit, and close with a clear call to action.",
  };
};
