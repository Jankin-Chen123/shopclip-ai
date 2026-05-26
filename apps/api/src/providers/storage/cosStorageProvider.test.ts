import { describe, expect, it } from "vitest";

import { CosStorageProvider } from "./cosStorageProvider.js";

describe("CosStorageProvider", () => {
  it("creates a signed read URL for private Tencent COS assets without exposing secrets", () => {
    const provider = new CosStorageProvider({
      COS_PROVIDER_MODE: "tencent",
      COS_BUCKET: "shopclip-assets-123456",
      COS_REGION: "ap-guangzhou",
      COS_SECRET_ID: "SECRET_ID",
      COS_SECRET_KEY: "SECRET_KEY",
    });

    const readUrl = provider.createReadUrl({
      objectKey: "library/raw/asset-1/source.png",
    });

    expect(readUrl.url).toContain(
      "https://shopclip-assets-123456.cos.ap-guangzhou.myqcloud.com/library/raw/asset-1/source.png",
    );
    expect(readUrl.url).toContain("q-sign-algorithm=sha1");
    expect(readUrl.url).toContain("q-ak=SECRET_ID");
    expect(readUrl.url).not.toContain("SECRET_KEY");
  });
});
