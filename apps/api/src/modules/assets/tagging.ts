import type { AssetMetadata, AssetSlice } from "@shopclip/shared";

const uniq = (values: string[]): string[] => [...new Set(values.map(normalizeTag).filter(Boolean))];

const normalizeTag = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const derivedTagRules: Array<{ match: RegExp; tags: string[] }> = [
  { match: /packshot|hero|white|close/, tags: ["hero", "packshot", "product-focus"] },
  { match: /desk|table|workspace/, tags: ["desk", "creator-workspace", "tabletop"] },
  { match: /hand|hands|free|stable|steady|stand/, tags: ["hands-free", "stability", "benefit"] },
  { match: /lifestyle|demo|ugc/, tags: ["lifestyle", "demo", "usage"] },
  { match: /unbox|shipping|box|package/, tags: ["packaging", "unboxing", "delivery"] },
  { match: /phone|grip|stand/, tags: ["phone-accessory", "stand"] },
];

export const inferAssetTags = (asset: {
  name: string;
  mimeType?: string;
  tags?: string[];
}): string[] => {
  const source = `${asset.name} ${asset.mimeType ?? ""}`.toLowerCase();
  const nameTokens = source
    .split(/[^a-z0-9]+/)
    .map(normalizeTag)
    .filter((token) => token.length > 2);
  const derivedTags = derivedTagRules.flatMap((rule) => (rule.match.test(source) ? rule.tags : []));

  return uniq([...(asset.tags ?? []), ...nameTokens, ...derivedTags, "ready", "demo-safe"]);
};

export const createAssetSlices = (
  asset: AssetMetadata,
): Array<Omit<AssetSlice, "id" | "assetId">> => [
  {
    label: `${asset.name} primary frame`,
    tags: uniq([...asset.tags, "primary-frame", "scene-recall"]),
  },
];
