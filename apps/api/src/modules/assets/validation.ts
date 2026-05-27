import { z } from "zod";

const allowedMimeTypesByType = {
  image: new Set(["image/jpeg", "image/png", "image/webp"]),
  video: new Set(["video/mp4", "video/webm", "video/quicktime"]),
  reference: new Set([
    "audio/mpeg",
    "audio/mp3",
    "audio/wav",
    "audio/x-wav",
    "application/msword",
    "application/pdf",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
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
    source: z
      .enum(["merchant_upload", "external_provider", "generated", "public_reference"])
      .optional(),
    storageProvider: z.enum(["local", "mock-cos", "tencent-cos"]).optional(),
    objectKey: z.string().trim().min(1).optional(),
    thumbnailKey: z.string().trim().min(1).optional(),
    embeddingText: z.string().trim().min(1).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
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

export const CreateAssetUploadIntentRequestSchema = CreateAssetRequestSchema.extend({
  checksum: z.string().trim().min(1).optional(),
});

export type CreateAssetUploadIntentRequest = z.infer<
  typeof CreateAssetUploadIntentRequestSchema
>;

export const ConfirmAssetUploadRequestSchema = z
  .object({
    checksum: z.string().trim().min(1).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    objectKey: z.string().trim().min(1).optional(),
  })
  .default({});

export type ConfirmAssetUploadRequest = z.infer<typeof ConfirmAssetUploadRequestSchema>;

export const DeleteAssetsRequestSchema = z.object({
  assetIds: z.array(z.string().trim().min(1)).min(1),
});

export type DeleteAssetsRequest = z.infer<typeof DeleteAssetsRequestSchema>;
