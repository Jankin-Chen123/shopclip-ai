import { tmpdir } from "node:os";
import { join } from "node:path";

export const mediaOutputDir = (): string =>
  process.env.MEDIA_OUTPUT_DIR?.trim() || join(tmpdir(), "shopclip-ai-media");

export const mediaOutputPublicBase = (): string =>
  process.env.MEDIA_OUTPUT_PUBLIC_BASE_URL?.trim()?.replace(/\/$/, "") || "/api/media-outputs";
