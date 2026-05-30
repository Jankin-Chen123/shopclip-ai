import type { ReferenceDownloadProvider } from "./referenceDownloadProvider.js";

const slugFromText = (value: string): string =>
  value
    .toLowerCase()
    .replace(/https?:\/\//g, "")
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "public-reference-video";

export const createMockReferenceDownloadProvider = (): ReferenceDownloadProvider => ({
  downloadReference: async ({ reference }) => {
    const slug = slugFromText(reference.title || reference.sourceUrl);
    const sourceUrl = reference.sourceUrl;
    return {
      durationSeconds: 12,
      height: 1920,
      mimeType: "video/mp4",
      name: `${slug}.mp4`,
      localFilePath: undefined,
      publicAnalysisUrl: `/reference-ingest/${slug}.mp4`,
      sizeBytes: 4_800_000,
      sourceUrl,
      width: 1080,
    };
  },
});
