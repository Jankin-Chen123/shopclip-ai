import { createHttpReferenceDownloadProvider } from "./httpReferenceDownloadProvider.js";
import { createMockReferenceDownloadProvider } from "./mockReferenceDownloadProvider.js";
import type { ReferenceDownloadProvider } from "./referenceDownloadProvider.js";

export const createReferenceDownloadProviderFromEnv = (): ReferenceDownloadProvider => {
  const mode = (process.env.REFERENCE_DOWNLOAD_PROVIDER_MODE ?? "http").trim().toLowerCase();
  if (["http", "direct", "real"].includes(mode)) {
    return createHttpReferenceDownloadProvider();
  }
  if (mode === "mock") {
    return createMockReferenceDownloadProvider();
  }

  throw new Error(
    `Unsupported REFERENCE_DOWNLOAD_PROVIDER_MODE=${mode}. Use http/real for business runs, or explicitly set mock for tests/demo fixtures.`,
  );
};
