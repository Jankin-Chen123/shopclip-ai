import { createHmac, createHash } from "node:crypto";
import type { AssetUploadIntent, AssetStorageProvider } from "@shopclip/shared";

import { createAssetObjectKey } from "./storageProvider.js";
import type { StorageProvider, StorageUploadIntentInput } from "./storageProvider.js";

interface CosConfig {
  bucket: string;
  publicBaseUrl?: string;
  region: string;
  secretId?: string;
  secretKey?: string;
  uploadPrefix: string;
}

const defaultMockBucket = "shopclip-demo";
const defaultMockRegion = "ap-guangzhou";
const uploadUrlTtlSeconds = 15 * 60;

const nowSeconds = (): number => Math.floor(Date.now() / 1000);

const encodePath = (path: string): string =>
  path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

const sha1 = (value: string): string => createHash("sha1").update(value).digest("hex");

const hmacSha1 = (key: string, value: string): string =>
  createHmac("sha1", key).update(value).digest("hex");

const publicBaseUrlFor = (config: Pick<CosConfig, "bucket" | "publicBaseUrl" | "region">): string =>
  config.publicBaseUrl?.replace(/\/$/, "") ??
  `https://${config.bucket}.cos.${config.region}.myqcloud.com`;

const createTencentCosPresignedPutUrl = ({
  config,
  contentType,
  objectKey,
}: {
  config: Required<Pick<CosConfig, "bucket" | "region" | "secretId" | "secretKey">> &
    Pick<CosConfig, "publicBaseUrl">;
  contentType: string;
  objectKey: string;
}): { expiresAt: string; headers: Record<string, string>; uploadUrl: string } => {
  const start = nowSeconds();
  const end = start + uploadUrlTtlSeconds;
  const keyTime = `${start};${end}`;
  const headers = {
    "content-type": contentType,
    host: `${config.bucket}.cos.${config.region}.myqcloud.com`,
  };
  const headerList = "content-type;host";
  const httpString = [
    "put",
    `/${encodePath(objectKey)}`,
    "",
    `content-type=${encodeURIComponent(headers["content-type"].toLowerCase())}&host=${headers.host.toLowerCase()}`,
    "",
  ].join("\n");
  const stringToSign = ["sha1", keyTime, sha1(httpString), ""].join("\n");
  const signKey = hmacSha1(config.secretKey, keyTime);
  const signature = hmacSha1(signKey, stringToSign);
  const authorization = [
    "q-sign-algorithm=sha1",
    `q-ak=${encodeURIComponent(config.secretId)}`,
    `q-sign-time=${keyTime}`,
    `q-key-time=${keyTime}`,
    `q-header-list=${headerList}`,
    "q-url-param-list=",
    `q-signature=${signature}`,
  ].join("&");
  const uploadUrl = `${publicBaseUrlFor(config)}/${encodePath(objectKey)}?${authorization}`;

  return {
    expiresAt: new Date(end * 1000).toISOString(),
    headers: {
      "content-type": contentType,
    },
    uploadUrl,
  };
};

export class CosStorageProvider implements StorageProvider {
  private readonly config: CosConfig;
  private readonly provider: AssetStorageProvider;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    const mode = env.COS_PROVIDER_MODE === "tencent" ? "tencent" : "mock";
    this.provider = mode === "tencent" ? "tencent-cos" : "mock-cos";
    this.config = {
      bucket: env.COS_BUCKET?.trim() || defaultMockBucket,
      publicBaseUrl: env.COS_PUBLIC_BASE_URL?.trim() || undefined,
      region: env.COS_REGION?.trim() || defaultMockRegion,
      secretId: env.COS_SECRET_ID?.trim() || undefined,
      secretKey: env.COS_SECRET_KEY?.trim() || undefined,
      uploadPrefix: env.COS_UPLOAD_PREFIX?.trim() || "projects",
    };
  }

  createUploadIntent(input: StorageUploadIntentInput): AssetUploadIntent {
    const objectKey = this.withUploadPrefix(
      createAssetObjectKey({
        assetId: input.assetId,
        name: input.asset.name,
        projectId: input.projectId,
      }),
    );
    const publicUrl = `${publicBaseUrlFor(this.config)}/${encodePath(objectKey)}`;

    if (this.provider === "tencent-cos") {
      if (!this.config.secretId || !this.config.secretKey) {
        throw new Error("COS_SECRET_ID and COS_SECRET_KEY are required for tencent COS mode.");
      }

      const intent = createTencentCosPresignedPutUrl({
        config: {
          bucket: this.config.bucket,
          publicBaseUrl: this.config.publicBaseUrl,
          region: this.config.region,
          secretId: this.config.secretId,
          secretKey: this.config.secretKey,
        },
        contentType: input.asset.mimeType,
        objectKey,
      });

      return {
        provider: this.provider,
        bucket: this.config.bucket,
        region: this.config.region,
        objectKey,
        uploadUrl: intent.uploadUrl,
        publicUrl,
        method: "PUT",
        headers: intent.headers,
        expiresAt: intent.expiresAt,
      };
    }

    return {
      provider: this.provider,
      bucket: this.config.bucket,
      region: this.config.region,
      objectKey,
      uploadUrl: publicUrl,
      publicUrl,
      method: "PUT",
      headers: {
        "content-type": input.asset.mimeType,
      },
      expiresAt: new Date((nowSeconds() + uploadUrlTtlSeconds) * 1000).toISOString(),
    };
  }

  private withUploadPrefix(objectKey: string): string {
    if (this.config.uploadPrefix === "projects") {
      return objectKey;
    }

    return `${this.config.uploadPrefix.replace(/^\/|\/$/g, "")}/${objectKey}`;
  }
}
