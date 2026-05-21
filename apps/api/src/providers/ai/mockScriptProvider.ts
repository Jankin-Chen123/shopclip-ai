import type { ProjectSnapshot } from "../../modules/projects/memoryStore.js";
import type { ScriptResult } from "@shopclip/shared";

export interface ScriptProviderResult {
  fallback: {
    used: boolean;
    provider: "mock-script-provider";
  };
  script: Omit<ScriptResult, "id" | "projectId">;
}

export const generateFallbackScript = (project: ProjectSnapshot): ScriptProviderResult => {
  const primaryAsset = project.assets[0];
  const assetId = primaryAsset?.id;

  return {
    fallback: {
      used: true,
      provider: "mock-script-provider",
    },
    script: {
      hook: `Stop scrolling past ${project.productName}.`,
      narrative: `Show the buyer pain, demonstrate ${project.productName}, then close with a clear TikTok Shop export moment.`,
      constraints: [
        "Use deterministic fallback copy",
        "Keep the full storyboard within 15 seconds",
        "Do not call external AI providers without server configuration",
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
