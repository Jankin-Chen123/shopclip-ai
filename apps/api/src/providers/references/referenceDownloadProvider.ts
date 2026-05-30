import type { ReferenceVideo } from "@shopclip/shared";

export interface ReferenceDownloadInput {
  reference: Omit<ReferenceVideo, "analysis" | "createdAt" | "id" | "projectId" | "updatedAt">;
}

export interface DownloadedReferenceVideo {
  body?: Buffer;
  durationSeconds: number;
  height?: number;
  localFilePath?: string;
  mimeType: string;
  name: string;
  publicAnalysisUrl: string;
  sizeBytes: number;
  sourceUrl: string;
  width?: number;
}

export interface ReferenceDownloadProvider {
  downloadReference: (input: ReferenceDownloadInput) => Promise<DownloadedReferenceVideo>;
}
