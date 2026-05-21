import { z } from "zod";

const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxImageSizeBytes = 10 * 1024 * 1024;

export const CreateAssetRequestSchema = z
  .object({
    type: z.enum(["image"]),
    name: z.string().trim().min(1),
    mimeType: z.string().trim().min(1),
    sizeBytes: z.number().int().positive().max(maxImageSizeBytes),
    url: z.string().trim().min(1).optional(),
    tags: z.array(z.string().trim().min(1)).default([]),
  })
  .superRefine((asset, context) => {
    if (!allowedMimeTypes.has(asset.mimeType)) {
      context.addIssue({
        code: "custom",
        message: "Only jpeg, png, and webp image assets are supported in P0.",
        path: ["mimeType"],
      });
    }
  });

export type CreateAssetRequest = z.infer<typeof CreateAssetRequestSchema>;
