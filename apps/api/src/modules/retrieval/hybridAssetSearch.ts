import type { AssetSearchResult } from "@shopclip/shared";

const mergeReasons = (left: string[], right: string[]): string[] => [...new Set([...left, ...right])];

export const mergeAssetSearchResults = (
  textResults: AssetSearchResult[],
  cosResults: AssetSearchResult[] = [],
): AssetSearchResult[] => {
  const byAssetId = new Map<string, AssetSearchResult>();

  for (const result of [...textResults, ...cosResults]) {
    const existing = byAssetId.get(result.asset.id);
    if (!existing) {
      byAssetId.set(result.asset.id, result);
      continue;
    }

    byAssetId.set(result.asset.id, {
      asset: existing.asset,
      slices: existing.slices.length >= result.slices.length ? existing.slices : result.slices,
      score: existing.score + result.score,
      reasons: mergeReasons(existing.reasons, result.reasons),
    });
  }

  return [...byAssetId.values()].sort((left, right) => right.score - left.score);
};
