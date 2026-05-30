import { loadLocalEnvFile } from "../env.js";
import { analyzeReferenceVideo } from "../modules/references/referenceAnalysisService.js";
import { MemoryProjectStore } from "../modules/projects/memoryStore.js";

loadLocalEnvFile(undefined, { override: false });

const required = (key: string): string => {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(`${key} is required.`);
  }
  return value;
};

const videoUrl = required("SMOKE_REFERENCE_URL");
const category = process.env.SMOKE_REFERENCE_CATEGORY?.trim() || "电商参考视频";
const title = process.env.SMOKE_REFERENCE_TITLE?.trim() || "真实公开视频拆解 smoke test";
const platform = process.env.SMOKE_REFERENCE_PLATFORM?.trim() || "douyin";

const store = new MemoryProjectStore();
const project = store.createProject({
  title: "Real reference smoke test",
  productName: process.env.SMOKE_PRODUCT_NAME?.trim() || "Reference product",
  audience: process.env.SMOKE_AUDIENCE?.trim() || "电商商家",
  sellingPoints: ["公开视频拆解", "多颗粒度结构化"],
  tone: "professional",
  style: "reference analysis",
  targetDurationSeconds: 15,
});

const reference = await analyzeReferenceVideo({
  projectId: project.id,
  store,
  reference: {
    category,
    publicStats: {
      comments: 0,
      likes: 0,
      shares: 0,
      views: 0,
    },
    sourceDeclaration: "Public reference URL; save structured analysis only. Do not remix or clip original video.",
    sourcePlatform: platform,
    sourceUrl: videoUrl,
    status: "analyzing",
    title,
  },
});

if (!reference?.analysis) {
  throw new Error("Reference analysis did not produce a structured result.");
}

const snapshot = store.getProject(project.id);
const sourceAsset = reference.sourceAssetId
  ? snapshot?.assets.find((asset) => asset.id === reference.sourceAssetId)
  : undefined;
const slices = reference.sourceAssetId
  ? snapshot?.assetSlices.filter((slice) => slice.assetId === reference.sourceAssetId) ?? []
  : [];
const structuredAsset =
  typeof sourceAsset?.metadata?.structuredAsset === "object" &&
  sourceAsset.metadata.structuredAsset !== null
    ? (sourceAsset.metadata.structuredAsset as { overallSummary?: unknown; role?: unknown })
    : undefined;
const structuredAssetRole =
  typeof structuredAsset?.role === "string" ? structuredAsset.role : undefined;
const structuredAssetSummary =
  typeof structuredAsset?.overallSummary === "string"
    ? structuredAsset.overallSummary
    : undefined;

console.log(
  JSON.stringify(
    {
      analysis: {
        contentFormula: reference.analysis.contentFormula,
        hookScore: reference.analysis.hookScore,
        keyViralFactors: reference.analysis.keyViralFactors,
        segmentCount: reference.analysis.commerceNarrativeSegments.length,
        title: reference.analysis.title,
      },
      reference: {
        id: reference.id,
        sourceAssetId: reference.sourceAssetId,
        status: reference.status,
      },
      sourceAsset: sourceAsset
        ? {
            id: sourceAsset.id,
            role: structuredAssetRole,
            source: sourceAsset.source,
            structured: Boolean(sourceAsset.metadata?.structuredAsset),
            summary: structuredAssetSummary,
            tags: sourceAsset.tags.slice(0, 8),
          }
        : undefined,
      slices: slices.slice(0, 5).map((slice) => ({
        endSecond: slice.endSecond,
        id: slice.id,
        roles: slice.metadata?.suitableSceneRoles,
        startSecond: slice.startSecond,
        summary: slice.metadata?.summary,
      })),
      sliceCount: slices.length,
    },
    null,
    2,
  ),
);
