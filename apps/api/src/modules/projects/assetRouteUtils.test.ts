import { describe, expect, it } from "vitest";
import type { AssetMetadata, AssetSlice } from "@shopclip/shared";

import {
  createGlobalAssetLibraryProject,
  mergeLocalAndCosAssetSearch,
  parseAssetSearchQuery,
  toStoredAssetInput,
} from "./assetRouteUtils.js";

const asset = (
  id: string,
  tags: string[] = [],
  overrides: Partial<AssetMetadata> = {},
): AssetMetadata =>
  ({
    id,
    type: "image",
    status: "ready",
    url: `/assets/${id}.png`,
    name: `${id}.png`,
    mimeType: "image/png",
    sizeBytes: 100,
    tags,
    createdAt: "2026-06-09T00:00:00.000Z",
    updatedAt: "2026-06-09T00:00:00.000Z",
    ...overrides,
  }) as AssetMetadata;

describe("asset route utils", () => {
  it("materializes stored asset input with fallback URL and inferred tags", () => {
    expect(
      toStoredAssetInput(
        {
          type: "image",
          name: "hero.png",
          mimeType: "image/png",
          sizeBytes: 100,
          tags: ["hero"],
        },
        "/fallback/hero.png",
      ),
    ).toEqual(
      expect.objectContaining({
        name: "hero.png",
        source: "merchant_upload",
        status: "ready",
        tags: expect.arrayContaining(["hero"]),
        url: "/fallback/hero.png",
      }),
    );
  });

  it("parses asset search query options", () => {
    expect(
      parseAssetSearchQuery({
        level: "slice",
        projectId: " project-1 ",
        q: "demo",
        sceneRole: "hook",
        tags: " hero, demo ,, ",
      }),
    ).toEqual({
      level: "slice",
      projectId: "project-1",
      query: "demo",
      sceneRole: "hook",
      tags: ["hero", "demo"],
    });
  });

  it("creates a searchable project-shaped global asset library", () => {
    const library = createGlobalAssetLibraryProject({
      assets: [asset("asset-1")],
      assetSlices: [{ id: "slice-1", assetId: "asset-1", tags: [] } as AssetSlice],
    });

    expect(library).toEqual(
      expect.objectContaining({
        id: "global-asset-library",
        status: "ready",
      }),
    );
    expect(library.assets).toHaveLength(1);
    expect(library.assetSlices).toHaveLength(1);
  });

  it("uses COS-only results for asset-level text search when COS has matches", () => {
    const library = createGlobalAssetLibraryProject({
      assets: [asset("asset-1", ["hero"], { objectKey: "cos/asset-1.png" })],
      assetSlices: [],
    });

    const results = mergeLocalAndCosAssetSearch(library, {
      cosMatches: [
        {
          objectKey: "cos/asset-1.png",
          score: 88,
          uri: "cos://bucket/cos/asset-1.png",
        },
      ],
      level: undefined,
      query: "hero",
      sceneRole: undefined,
      tags: [],
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.reasons).toContain("cos-intelligent-search");
  });

  it("merges text and COS results for slice-level searches", () => {
    const library = createGlobalAssetLibraryProject({
      assets: [asset("asset-1", ["hero"])],
      assetSlices: [
        {
          id: "slice-1",
          assetId: "asset-1",
          label: "Hero",
          tags: ["hero"],
          searchText: "hero close-up",
        } as AssetSlice,
      ],
    });

    const results = mergeLocalAndCosAssetSearch(library, {
      cosMatches: [],
      level: "slice",
      query: "hero",
      sceneRole: undefined,
      tags: ["hero"],
    });

    expect(results.some((result) => result.slices.some((slice) => slice.id === "slice-1"))).toBe(
      true,
    );
  });
});
