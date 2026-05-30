import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReferenceDownloadProvider } from "./referenceDownloadProvider.js";

const defaultMaxBytes = 50 * 1024 * 1024;
const defaultDownloadDir = () => join(process.env.TEMP ?? process.env.TMP ?? ".", "shopclip-reference-downloads");
const defaultUserAgent =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

const maxDownloadBytes = (): number => {
  const configured = Number(process.env.REFERENCE_DOWNLOAD_MAX_BYTES);
  return Number.isFinite(configured) && configured > 0 ? configured : defaultMaxBytes;
};

const fileNameFromReference = (title: string, sourceUrl: string, mimeType: string): string => {
  const extension = mimeType.includes("webm") ? "webm" : mimeType.includes("quicktime") ? "mov" : "mp4";
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) ||
    new URL(sourceUrl).hostname.replace(/[^a-z0-9]+/gi, "-") ||
    "public-reference-video";
  return `${slug}.${extension}`;
};

export const createHttpReferenceDownloadProvider = (): ReferenceDownloadProvider => ({
  downloadReference: async ({ reference }) => {
    const response = await fetch(reference.sourceUrl, {
      headers: {
        referer: process.env.REFERENCE_DOWNLOAD_REFERER?.trim() || "https://www.douyin.com/",
        "user-agent": process.env.REFERENCE_DOWNLOAD_USER_AGENT?.trim() || defaultUserAgent,
      },
    });
    if (!response.ok) {
      throw new Error(`Reference download failed with HTTP ${response.status}.`);
    }

    const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim() || "video/mp4";
    if (!mimeType.startsWith("video/")) {
      throw new Error(`Reference download expected a video response, got ${mimeType}.`);
    }

    const body = Buffer.from(await response.arrayBuffer());
    if (body.length > maxDownloadBytes()) {
      throw new Error(`Reference video exceeds ${maxDownloadBytes()} bytes.`);
    }
    const outputDir = process.env.REFERENCE_DOWNLOAD_DIR?.trim() || defaultDownloadDir();
    await mkdir(outputDir, { recursive: true });
    const hash = createHash("sha1").update(reference.sourceUrl).digest("hex").slice(0, 12);
    const name = fileNameFromReference(reference.title, reference.sourceUrl, mimeType);
    const localFilePath = join(outputDir, `${hash}-${name}`);
    await writeFile(localFilePath, body);

    return {
      body,
      durationSeconds: 12,
      localFilePath,
      mimeType,
      name,
      publicAnalysisUrl: reference.sourceUrl,
      sizeBytes: body.length,
      sourceUrl: reference.sourceUrl,
    };
  },
});
