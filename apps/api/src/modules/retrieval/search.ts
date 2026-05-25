import type { AssetMetadata, AssetSearchResult, AssetSlice } from "@shopclip/shared";

import type { ProjectSnapshot } from "../projects/projectStore.js";

export interface AssetSearchInput {
  query: string;
  tags: string[];
}

const conceptGroups = [
  ["desk", "table", "tabletop", "workspace", "creator", "creator-workspace"],
  ["hands", "free", "hands-free", "stable", "steady", "stability", "stand", "benefit"],
  ["packshot", "hero", "product", "product-focus", "closeup", "white"],
  ["unboxing", "shipping", "packaging", "box", "delivery"],
  ["demo", "usage", "lifestyle", "ugc"],
];

const normalize = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const tokenize = (value: string): string[] =>
  normalize(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);

const tokenSetForAsset = (asset: AssetMetadata, slices: AssetSlice[]): Set<string> =>
  new Set([
    ...tokenize(asset.name),
    ...asset.tags.flatMap(tokenize),
    ...slices.flatMap((slice) => [slice.label, ...slice.tags].flatMap(tokenize)),
  ]);

const isConceptMatch = (queryToken: string, assetToken: string): boolean =>
  conceptGroups.some((group) => group.includes(queryToken) && group.includes(assetToken));

const addReason = (reasons: string[], reason: string) => {
  if (!reasons.includes(reason)) {
    reasons.push(reason);
  }
};

export const searchAssets = (
  project: ProjectSnapshot,
  input: AssetSearchInput,
): AssetSearchResult[] => {
  const queryTokens = tokenize(input.query);
  const requestedTags = input.tags.flatMap(tokenize);

  return project.assets
    .map((asset) => {
      const slices = project.assetSlices.filter((slice) => slice.assetId === asset.id);
      const assetTokens = tokenSetForAsset(asset, slices);
      const reasons: string[] = [];
      let score = 0;

      for (const token of queryTokens) {
        if (assetTokens.has(token)) {
          score += 8;
          addReason(reasons, `keyword:${token}`);
          continue;
        }

        if ([...assetTokens].some((assetToken) => isConceptMatch(token, assetToken))) {
          score += 4;
          addReason(reasons, `vector-like:${token}`);
        }
      }

      for (const tag of requestedTags) {
        if (assetTokens.has(tag)) {
          score += 12;
          addReason(reasons, `tag:${tag}`);
        } else if ([...assetTokens].some((assetToken) => isConceptMatch(tag, assetToken))) {
          score += 5;
          addReason(reasons, `vector-like-tag:${tag}`);
        }
      }

      return {
        asset,
        slices,
        score,
        reasons: reasons.length > 0 ? reasons : ["library-order"],
      };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.asset.createdAt?.localeCompare(right.asset.createdAt ?? "") ||
        0,
    );
};
