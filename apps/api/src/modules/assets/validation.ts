import { z } from "zod";

const allowedMimeTypesByType = {
  image: new Set(["image/jpeg", "image/png", "image/webp"]),
  video: new Set(["video/mp4", "video/webm", "video/quicktime"]),
  reference: new Set([
    "audio/mpeg",
    "audio/mp3",
    "audio/wav",
    "audio/x-wav",
    "text/plain",
    "text/markdown",
  ]),
} as const;
const maxImageSizeBytes = 10 * 1024 * 1024;
const maxVideoSizeBytes = 200 * 1024 * 1024;
const maxReferenceSizeBytes = 25 * 1024 * 1024;

const maxSizeByType = {
  image: maxImageSizeBytes,
  video: maxVideoSizeBytes,
  reference: maxReferenceSizeBytes,
} as const;

export const CreateAssetRequestSchema = z
  .object({
    type: z.enum(["image", "video", "reference"]),
    name: z.string().trim().min(1),
    mimeType: z.string().trim().min(1),
    sizeBytes: z.number().int().positive(),
    url: z.string().trim().min(1).optional(),
    tags: z.array(z.string().trim().min(1)).default([]),
  })
  .superRefine((asset, context) => {
    if (!allowedMimeTypesByType[asset.type].has(asset.mimeType)) {
      context.addIssue({
        code: "custom",
        message: "Asset MIME type is not supported for this asset type.",
        path: ["mimeType"],
      });
    }
    if (asset.sizeBytes > maxSizeByType[asset.type]) {
      context.addIssue({
        code: "custom",
        message: "Asset exceeds the supported metadata size limit.",
        path: ["sizeBytes"],
      });
    }
  });

export type CreateAssetRequest = z.infer<typeof CreateAssetRequestSchema>;
