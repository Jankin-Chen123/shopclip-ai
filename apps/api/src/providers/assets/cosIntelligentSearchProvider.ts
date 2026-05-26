import { createHash, createHmac } from "node:crypto";
import type { AssetMetadata, AssetSearchResult, AssetSlice } from "@shopclip/shared";

export interface CosImageSearchMatch {
  objectKey?: string;
  score: number;
  uri: string;
}

export interface CosIntelligentSearchInput {
  limit?: number;
  matchThreshold?: number;
  query: string;
}

export interface CosIntelligentSearchProvider {
  search: (input: CosIntelligentSearchInput) => Promise<CosImageSearchMatch[]>;
}

type AnyRecord = Record<string, unknown>;
type Fetcher = (url: string | URL, init?: RequestInit) => Promise<Response>;

interface CosIntelligentSearchConfig {
  appId: string;
  datasetName: string;
  endpoint?: string;
  region: string;
  secretId: string;
  secretKey: string;
}

const hybridSearchPath = "/datasetquery/hybridsearch";
const defaultMatchThreshold = 60;
const defaultLimit = 24;

const isRecord = (value: unknown): value is AnyRecord =>
  typeof value === "object" && value !== null;

const getString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value : undefined;

const getNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};

const getRecordArray = (value: unknown): AnyRecord[] => {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }
  if (isRecord(value)) {
    const item = value.Item;
    if (Array.isArray(item)) {
      return item.filter(isRecord);
    }
    return [value];
  }
  return [];
};

const sha1 = (value: string): string => createHash("sha1").update(value).digest("hex");

const hmacSha1 = (key: string, value: string): string =>
  createHmac("sha1", key).update(value).digest("hex");

const normalizeHeaderValue = (value: string): string => encodeURIComponent(value.toLowerCase());

const nowSeconds = (): number => Math.floor(Date.now() / 1000);

const createAuthorization = ({
  config,
  host,
  method,
  path,
}: {
  config: Pick<CosIntelligentSearchConfig, "secretId" | "secretKey">;
  host: string;
  method: string;
  path: string;
}): string => {
  const start = nowSeconds();
  const end = start + 15 * 60;
  const keyTime = `${start};${end}`;
  const headerList = "content-type;host";
  const httpString = [
    method.toLowerCase(),
    path,
    "",
    `content-type=${normalizeHeaderValue("application/json")}&host=${host.toLowerCase()}`,
    "",
  ].join("\n");
  const stringToSign = ["sha1", keyTime, sha1(httpString), ""].join("\n");
  const signKey = hmacSha1(config.secretKey, keyTime);
  const signature = hmacSha1(signKey, stringToSign);

  return [
    "q-sign-algorithm=sha1",
    `q-ak=${encodeURIComponent(config.secretId)}`,
    `q-sign-time=${keyTime}`,
    `q-key-time=${keyTime}`,
    `q-header-list=${headerList}`,
    "q-url-param-list=",
    `q-signature=${signature}`,
  ].join("&");
};

const objectKeyFromUri = (uri: string): string | undefined => {
  if (uri.startsWith("cos://")) {
    const withoutScheme = uri.slice("cos://".length);
    const slashIndex = withoutScheme.indexOf("/");
    return slashIndex >= 0 ? decodeURIComponent(withoutScheme.slice(slashIndex + 1)) : undefined;
  }

  if (uri.startsWith("http://") || uri.startsWith("https://")) {
    try {
      const parsed = new URL(uri);
      return decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
    } catch {
      return undefined;
    }
  }

  return uri.startsWith("/") ? decodeURIComponent(uri.replace(/^\/+/, "")) : uri;
};

const collectImageRecords = (body: unknown): AnyRecord[] => {
  if (!isRecord(body)) {
    return [];
  }

  return [
    ...getRecordArray(body.ImageResult),
    ...getRecordArray(body.ImageResults),
    ...getRecordArray(body.Results),
    ...getRecordArray(body.Result),
  ];
};

export const normalizeCosHybridSearchResponse = (body: unknown): CosImageSearchMatch[] =>
  collectImageRecords(body)
    .map((record) => {
      const uri =
        getString(record.URI) ??
        getString(record.Uri) ??
        getString(record.Url) ??
        getString(record.URL) ??
        getString(record.ObjectKey) ??
        "";
      const score = getNumber(record.Score) ?? 0;
      return {
        uri,
        objectKey: objectKeyFromUri(uri),
        score,
      };
    })
    .filter((match) => match.uri && match.score > defaultMatchThreshold)
    .sort((left, right) => right.score - left.score);

const deriveAppIdFromBucket = (bucket?: string): string | undefined => {
  const match = bucket?.match(/-(\d+)$/);
  return match?.[1];
};

const configFromEnv = (env: NodeJS.ProcessEnv): CosIntelligentSearchConfig | undefined => {
  if (env.COS_INTELLIGENT_SEARCH_ENABLED === "false") {
    return undefined;
  }

  const appId = env.COS_APP_ID?.trim() || deriveAppIdFromBucket(env.COS_BUCKET?.trim());
  const datasetName =
    env.COS_INTELLIGENT_SEARCH_DATASET?.trim() || env.COS_DATASET_NAME?.trim();
  const region = env.COS_INTELLIGENT_SEARCH_REGION?.trim() || env.COS_REGION?.trim();
  const secretId = env.COS_SECRET_ID?.trim();
  const secretKey = env.COS_SECRET_KEY?.trim();

  if (!appId || !datasetName || !region || !secretId || !secretKey) {
    return undefined;
  }

  return {
    appId,
    datasetName,
    endpoint: env.COS_INTELLIGENT_SEARCH_ENDPOINT?.trim() || undefined,
    region,
    secretId,
    secretKey,
  };
};

export const createCosIntelligentSearchProvider = (
  env: NodeJS.ProcessEnv = process.env,
  fetcher: Fetcher = fetch,
): CosIntelligentSearchProvider | undefined => {
  const config = configFromEnv(env);
  if (!config) {
    return undefined;
  }

  const host = `${config.appId}.ci.${config.region}.myqcloud.com`;
  const endpoint = config.endpoint?.replace(/\/$/, "") ?? `https://${host}`;

  return {
    search: async ({ query, limit = defaultLimit, matchThreshold = defaultMatchThreshold }) => {
      const trimmedQuery = query.trim();
      if (!trimmedQuery) {
        return [];
      }

      const body = JSON.stringify({
        DatasetName: config.datasetName,
        Limit: limit,
        MatchThreshold: matchThreshold,
        Mode: "text",
        SearchText: trimmedQuery,
        Templates: "ImageSearch",
      });
      const response = await fetcher(`${endpoint}${hybridSearchPath}`, {
        method: "POST",
        headers: {
          accept: "application/json",
          authorization: createAuthorization({
            config,
            host,
            method: "POST",
            path: hybridSearchPath,
          }),
          "content-type": "application/json",
          host,
        },
        body,
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => "");
        const detail = errorBody.trim() ? `: ${errorBody.trim().slice(0, 500)}` : "";
        throw new Error(`COS intelligent search failed with HTTP ${response.status}${detail}`);
      }

      return normalizeCosHybridSearchResponse(await response.json()).filter(
        (match) => match.score > matchThreshold,
      );
    },
  };
};

export const searchCosIntelligentAssets = async (
  input: CosIntelligentSearchInput,
): Promise<CosImageSearchMatch[] | undefined> => createCosIntelligentSearchProvider()?.search(input);

const assetIdFromObjectKey = (objectKey?: string): string | undefined => {
  const rawSegment = objectKey?.match(/(?:^|\/)raw\/([^/]+)\//)?.[1];
  return rawSegment ? decodeURIComponent(rawSegment) : undefined;
};

const findMatchingAsset = (
  match: CosImageSearchMatch,
  assets: AssetMetadata[],
): AssetMetadata | undefined => {
  const objectKey = match.objectKey;
  const assetId = assetIdFromObjectKey(objectKey);

  return assets.find((asset) => {
    if (asset.objectKey && objectKey && asset.objectKey === objectKey) {
      return true;
    }
    return assetId ? asset.id === assetId : false;
  });
};

export const mapCosImageMatchesToAssetResults = (
  matches: CosImageSearchMatch[],
  library: { assets: AssetMetadata[]; assetSlices: AssetSlice[] },
): AssetSearchResult[] => {
  const seenAssetIds = new Set<string>();
  const results: AssetSearchResult[] = [];

  for (const match of matches.filter((candidate) => candidate.score > defaultMatchThreshold)) {
    const asset = findMatchingAsset(match, library.assets);
    if (!asset || seenAssetIds.has(asset.id)) {
      continue;
    }

    seenAssetIds.add(asset.id);
    results.push({
      asset,
      slices: library.assetSlices.filter((slice) => slice.assetId === asset.id),
      score: match.score,
      reasons: [
        "cos-intelligent-search",
        `cos-score:${match.score}`,
        `cos-uri:${match.uri}`,
      ],
    });
  }

  return results.sort((left, right) => right.score - left.score);
};
