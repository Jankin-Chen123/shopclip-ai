import { describe, expect, it } from "vitest";
import type { AssetMetadata, AssetSlice } from "@shopclip/shared";

import {
  createCosIntelligentSearchProvider,
  mapCosImageMatchesToAssetResults,
  normalizeCosHybridSearchResponse,
} from "./cosIntelligentSearchProvider";

const makeAsset = (overrides: Partial<AssetMetadata>): AssetMetadata => ({
  id: "asset-1",
  type: "image",
  status: "ready",
  url: "/asset-1.png",
  name: "Asset 1",
  mimeType: "image/png",
  tags: [],
  createdAt: "2026-05-26T00:00:00.000Z",
  updatedAt: "2026-05-26T00:00:00.000Z",
  ...overrides,
});

describe("COS intelligent search provider", () => {
  it("normalizes image results and keeps only matches scoring above 60", () => {
    const matches = normalizeCosHybridSearchResponse({
      ImageResult: [
        { URI: "cos://shopclip-1250000000/projects/demo/raw/asset-1/source.png", Score: 61 },
        { URI: "cos://shopclip-1250000000/projects/demo/raw/asset-2/source.png", Score: 60 },
        { URI: "cos://shopclip-1250000000/projects/demo/raw/asset-3/source.png", Score: 0 },
      ],
      RequestId: "request-1",
    });

    expect(matches).toEqual([
      {
        uri: "cos://shopclip-1250000000/projects/demo/raw/asset-1/source.png",
        objectKey: "projects/demo/raw/asset-1/source.png",
        score: 61,
      },
    ]);
  });

  it("maps COS URIs back to local asset metadata and slices", () => {
    const assets = [
      makeAsset({
        id: "asset-object-key",
        name: "Matched by object key",
        objectKey: "projects/demo/raw/asset-object-key/source.png",
      }),
      makeAsset({
        id: "asset-path-id",
        name: "Matched by path id",
        objectKey: "legacy/path/source.png",
      }),
      makeAsset({
        id: "asset-low-score",
        name: "Low score",
        objectKey: "projects/demo/raw/asset-low-score/source.png",
      }),
    ];
    const slices: AssetSlice[] = [
      {
        id: "slice-1",
        assetId: "asset-object-key",
        label: "Hero",
        tags: ["hero"],
      },
    ];

    const results = mapCosImageMatchesToAssetResults(
      [
        {
          uri: "cos://shopclip-1250000000/projects/demo/raw/asset-object-key/source.png",
          objectKey: "projects/demo/raw/asset-object-key/source.png",
          score: 99,
        },
        {
          uri: "cos://shopclip-1250000000/projects/demo/raw/asset-path-id/source.png",
          objectKey: "projects/demo/raw/asset-path-id/source.png",
          score: 88,
        },
        {
          uri: "cos://shopclip-1250000000/projects/demo/raw/asset-low-score/source.png",
          objectKey: "projects/demo/raw/asset-low-score/source.png",
          score: 60,
        },
      ],
      { assets, assetSlices: slices },
    );

    expect(results.map((result) => result.asset.name)).toEqual([
      "Matched by object key",
      "Matched by path id",
    ]);
    expect(results[0]).toMatchObject({
      score: 99,
      reasons: [
        "cos-intelligent-search",
        "cos-score:99",
        "cos-uri:cos://shopclip-1250000000/projects/demo/raw/asset-object-key/source.png",
      ],
      slices,
    });
  });

  it("posts a text-to-image hybrid search request to the configured Tencent CI endpoint", async () => {
    const requests: Array<{ body: unknown; headers: Record<string, string>; url: string }> = [];
    const provider = createCosIntelligentSearchProvider(
      {
        COS_APP_ID: "1250000000",
        COS_INTELLIGENT_SEARCH_DATASET: "shopclip-multidata",
        COS_REGION: "ap-beijing",
        COS_SECRET_ID: "secret-id",
        COS_SECRET_KEY: "secret-key",
      },
      async (url, init) => {
        requests.push({
          body: JSON.parse(String(init?.body)),
          headers: init?.headers as Record<string, string>,
          url: String(url),
        });
        return new Response(
          JSON.stringify({
            ImageResult: [
              {
                URI: "cos://shopclip-1250000000/projects/demo/raw/asset-1/source.png",
                Score: 91,
              },
            ],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      },
    );

    const matches = await provider.search({
      query: "golden retriever product photo",
      limit: 12,
      matchThreshold: 60,
    });

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      url: "https://1250000000.ci.ap-beijing.myqcloud.com/datasetquery/hybridsearch",
      body: {
        DatasetName: "shopclip-multidata",
        Mode: "text",
        Templates: "ImageSearch",
        SearchText: "golden retriever product photo",
        Limit: 12,
        MatchThreshold: 60,
      },
    });
    expect(requests[0]?.headers.authorization).toContain("q-sign-algorithm=sha1");
    expect(matches).toHaveLength(1);
    expect(matches[0]?.score).toBe(91);
  });

  it("includes the COS response body when a hybrid search request fails", async () => {
    const provider = createCosIntelligentSearchProvider(
      {
        COS_APP_ID: "1250000000",
        COS_INTELLIGENT_SEARCH_DATASET: "shopclip-multidata",
        COS_REGION: "ap-beijing",
        COS_SECRET_ID: "secret-id",
        COS_SECRET_KEY: "secret-key",
      },
      async () =>
        new Response("<Error><Code>AccessDenied</Code></Error>", {
          status: 403,
          headers: { "content-type": "application/xml" },
        }),
    );

    await expect(provider.search({ query: "dog" })).rejects.toThrow(
      "COS intelligent search failed with HTTP 403: <Error><Code>AccessDenied</Code></Error>",
    );
  });
});
