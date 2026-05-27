import type { ProjectSnapshot } from "../../modules/projects/projectStore.js";
import type { AssetMetadata, ScriptGenerationRequest, ScriptResult } from "@shopclip/shared";

export interface ScriptProviderResult {
  fallback: {
    used: boolean;
    provider: string;
  };
  script: Omit<ScriptResult, "id" | "projectId">;
}

export interface ScriptGenerationContext {
  assets?: AssetMetadata[];
  request?: ScriptGenerationRequest;
}

const compactList = (values: Array<string | undefined>, fallback: string) => {
  const compacted = values.map((value) => value?.trim()).filter((value): value is string => Boolean(value));
  return compacted.length > 0 ? compacted.join(", ") : fallback;
};

export const rewriteFallbackScript = (
  project: ProjectSnapshot,
  context: ScriptGenerationContext = {},
): { fallback: { used: boolean; provider: string }; scriptText: string } => {
  const request = context.request;
  const draftScript = request?.draftScript?.trim();
  const materialNames = compactList(
    [
      ...(context.assets ?? []).map((asset) => asset.name),
      ...(request?.materials ?? []).map((material) => material.name),
    ].slice(0, 6),
    "prepared product materials",
  );
  const keywordLine = compactList(
    [...(request?.keywords ?? []), ...project.sellingPoints].slice(0, 8),
    "clear product benefit",
  );

  return {
    fallback: {
      used: true,
      provider: "mock-script-provider",
    },
    scriptText: [
      `Hook: Stop scrolling past ${project.productName}; show the buyer problem in the first second.`,
      `Body: ${draftScript || `Use ${materialNames} to demonstrate ${keywordLine}.`}`,
      `Proof: Highlight ${keywordLine} with close-up details from ${materialNames}.`,
      `CTA: Keep the final line direct for ${project.audience}: try ${project.productName} today.`,
    ].join("\n"),
  };
};

export const generateFallbackScript = (
  project: ProjectSnapshot,
  context: ScriptGenerationContext = {},
): ScriptProviderResult => {
  const primaryAsset = context.assets?.[0] ?? project.assets[0];
  const assetId = primaryAsset?.id;
  const draftScript = context.request?.draftScript?.trim();
  const keywordSummary = compactList(
    [...(context.request?.keywords ?? []), ...project.sellingPoints].slice(0, 4),
    project.sellingPoints[0] ?? "clear product benefit",
  );

  return {
    fallback: {
      used: true,
      provider: "mock-script-provider",
    },
    script: {
      hook: `Stop scrolling past ${project.productName}.`,
      narrative:
        draftScript ||
        `Show the buyer pain, demonstrate ${project.productName}, then close with a clear TikTok Shop export moment.`,
      constraints: [
        "Use deterministic fallback copy",
        "Keep the full storyboard within 15 seconds",
        "Do not call external AI providers without server configuration",
        `Reference prepared keywords: ${keywordSummary}`,
      ],
      scenes: [
        {
          id: "scene-draft-1",
          projectId: project.id,
          order: 1,
          durationSeconds: 3,
          subtitle: "Hook the problem",
          voiceover: `Still fighting with ${project.sellingPoints[0] ?? "slow product demos"}?`,
          visualPrompt: `Fast opening shot for ${project.productName} showing the buyer problem.`,
          assetId,
          status: "generated",
        },
        {
          id: "scene-draft-2",
          projectId: project.id,
          order: 2,
          durationSeconds: 4,
          subtitle: "Show the fix",
          voiceover: `${project.productName} makes it simple in one move.`,
          visualPrompt: `Close-up product demonstration using the uploaded product asset.`,
          assetId,
          status: "generated",
        },
        {
          id: "scene-draft-3",
          projectId: project.id,
          order: 3,
          durationSeconds: 4,
          subtitle: "Prove the benefit",
          voiceover: project.sellingPoints.slice(0, 2).join(". "),
          visualPrompt: `Before and after visual with clean creator desk styling.`,
          assetId,
          status: "generated",
        },
        {
          id: "scene-draft-4",
          projectId: project.id,
          order: 4,
          durationSeconds: 4,
          subtitle: "Export to TikTok Shop",
          voiceover: "Export a polished short video in seconds.",
          visualPrompt: `Final packshot and direct call to action for ${project.audience}.`,
          assetId,
          status: "generated",
        },
      ],
    },
  };
};
