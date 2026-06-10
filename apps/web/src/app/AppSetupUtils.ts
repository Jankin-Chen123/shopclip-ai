import type {
  AssetMetadata,
  DashboardResponse,
  ProjectBrief,
  ReferenceVideo,
  ScriptGenerationRequest,
  ViralTemplate,
} from "@shopclip/shared";

import type {
  CreationPageId,
  WorkspacePageId,
} from "../components/layout/AppShell";
import {
  getAssetDraftDefaults,
  type AssetCategory,
} from "../features/assets/AssetCategoryTabs";
import {
  createDefaultApiConfig,
  sanitizeApiConfig,
} from "../features/settings/SettingsPanel";
import {
  type AssetLibraryCategory,
  type CreateAssetInput,
  type MediaSettings,
  type ProjectSnapshot,
  type UserApiConfig,
} from "../lib/api";

export const defaultBrief: ProjectBrief = {
  title: "Desk launch clip",
  productName: "GlowGrip Phone Stand",
  audience: "TikTok Shop buyers",
  sellingPoints: ["folds flat", "keeps product shots stable"],
  tone: "confident",
  style: "fast desk demo",
  targetDurationSeconds: 15,
};

export const createNewProjectBrief = (
  _previousBrief?: ProjectBrief,
  language: string = "en",
): ProjectBrief => ({
  title: language === "zh" ? "未命名项目" : "Untitled project",
  productName: language === "zh" ? "未命名产品" : "Untitled product",
  audience: language === "zh" ? "待填写目标人群" : "Audience to fill in",
  sellingPoints: [language === "zh" ? "填写卖点" : "Fill in selling points"],
  tone: language === "zh" ? "待填写语气" : "Tone to fill in",
  style: "fast desk demo",
  targetDurationSeconds: 15,
});

export const createProjectMockDashboard = (project: ProjectSnapshot): DashboardResponse => {
  const assetBoost = Math.min(project.assets.length, 6) * 0.025;
  const scriptBoost = Math.min(project.scripts.length, 4) * 0.035;
  const focusScore = Math.min(0.92, 0.64 + assetBoost + scriptBoost);
  const hookScore = Math.min(0.94, 0.68 + project.sellingPoints.length * 0.04);
  const clarityScore = Math.min(0.9, 0.72 + project.scenes.length * 0.018);
  const completionRate = Math.min(0.88, 0.46 + hookScore * 0.14 + focusScore * 0.16);
  const impressions = 12000;
  const watch3s = Math.round(impressions * completionRate);
  const clicks = Math.round(watch3s * (0.18 + focusScore * 0.08));
  const carts = Math.round(clicks * 0.38);
  const purchases = Math.round(carts * 0.34);

  return {
    projectId: project.id,
    summary: {
      hookStrength: hookScore,
      predictedCompletionRate: completionRate,
      productFocus: focusScore,
      subtitleClarity: clarityScore,
    },
    funnel: [
      { stage: "Impression", value: impressions },
      { stage: "Watch 3s", value: watch3s },
      { stage: "Click", value: clicks },
      { stage: "Add to cart", value: carts },
      { stage: "Purchase", value: purchases },
    ],
    factors: [
      {
        id: "mock-factor-hook",
        factor: "Hook clarity",
        expectedImpact: "high",
        evidence: `${project.sellingPoints.length} selling point(s) are available for hook testing.`,
        recommendation: "Keep the first three seconds focused on the strongest visible product proof.",
      },
      {
        id: "mock-factor-assets",
        factor: "Product visibility",
        expectedImpact: project.assets.length > 0 ? "high" : "medium",
        evidence: `${project.assets.length} imported asset(s) can support product close-ups.`,
        recommendation: "Use the hero image and one usage scene before the CTA.",
      },
    ],
  };
};

export const defaultAssetSizeBytes = 220_000;

export const createDefaultAsset = (language: string): CreateAssetInput => ({
  ...getAssetDraftDefaults("image", language === "zh" ? "zh" : "en"),
  sizeBytes: defaultAssetSizeBytes,
});

export const createAssetDraftForCategory = (
  category: AssetCategory,
  language: string,
  currentSizeBytes: number,
): CreateAssetInput => ({
  ...getAssetDraftDefaults(category, language === "zh" ? "zh" : "en"),
  sizeBytes: currentSizeBytes > 0 ? currentSizeBytes : defaultAssetSizeBytes,
});

export const localizeDefaultAssetDraft = ({
  category,
  currentDraft,
  nextLanguage,
  previousLanguage,
}: {
  category: AssetCategory;
  currentDraft: CreateAssetInput;
  nextLanguage: string;
  previousLanguage: string;
}): CreateAssetInput => {
  const previousDefaults = getAssetDraftDefaults(
    category,
    previousLanguage === "zh" ? "zh" : "en",
  );
  const nextDefaults = getAssetDraftDefaults(category, nextLanguage === "zh" ? "zh" : "en");
  const isLocalizedDefault =
    currentDraft.type === previousDefaults.type &&
    currentDraft.mimeType === previousDefaults.mimeType &&
    currentDraft.name === previousDefaults.name &&
    currentDraft.tags.join("\u0000") === previousDefaults.tags.join("\u0000");

  return isLocalizedDefault ? { ...nextDefaults, sizeBytes: currentDraft.sizeBytes } : currentDraft;
};

const documentMimeTypesByExtension: Record<string, string> = {
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pdf": "application/pdf",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

const createScriptGenerationApiConfig = (apiConfig: UserApiConfig): UserApiConfig => {
  const useOfficialWhenMissingKey = (roleConfig: UserApiConfig["general"]) =>
    roleConfig?.credentialSource === "official" || roleConfig?.apiKey?.trim()
      ? roleConfig
      : {
          ...roleConfig,
          credentialSource: "official" as const,
          apiKey: undefined,
        };

  return {
    ...apiConfig,
    general: useOfficialWhenMissingKey(apiConfig.general),
    image: useOfficialWhenMissingKey(apiConfig.image),
  };
};

type ScriptAssetPrepSnapshot = {
  assetIds: string[];
  keywords: string[];
  materials: ScriptGenerationRequest["materials"];
};

export const createScriptGenerationRequestPayload = (
  assetPrepSnapshot: ScriptAssetPrepSnapshot,
  scriptDraft: string,
  apiConfig: UserApiConfig,
): ScriptGenerationRequest => ({
  assetIds: assetPrepSnapshot.assetIds,
  draftScript: scriptDraft.trim() || undefined,
  keywords: assetPrepSnapshot.keywords,
  materials: assetPrepSnapshot.materials,
  productionMode: "automatic",
  apiConfig: createScriptGenerationApiConfig(apiConfig),
});

export const createAssetInputFromFile = (file: File, language: string): CreateAssetInput => {
  const lowerName = file.name.toLowerCase();
  const documentMimeType = Object.entries(documentMimeTypesByExtension).find(([extension]) =>
    lowerName.endsWith(extension),
  )?.[1];
  const inferredCategory: AssetCategory = file.type.startsWith("image/")
    ? "image"
    : file.type.startsWith("video/")
      ? "video"
      : file.type.startsWith("audio/")
        ? "audio"
        : file.type.startsWith("text/") ||
            lowerName.endsWith(".txt") ||
            lowerName.endsWith(".md") ||
            Boolean(documentMimeType)
          ? "script"
          : "script";
  const defaults = getAssetDraftDefaults(inferredCategory, language === "zh" ? "zh" : "en");
  const inferredMimeType =
    file.type ||
    documentMimeType ||
    (lowerName.endsWith(".md")
      ? "text/markdown"
      : lowerName.endsWith(".txt")
        ? "text/plain"
        : defaults.mimeType);

  return {
    ...defaults,
    name: file.name || defaults.name,
    mimeType: inferredMimeType,
    sizeBytes: file.size > 0 ? file.size : defaultAssetSizeBytes,
  };
};

export const shouldAutoProcessImportedAsset = (asset: AssetMetadata): boolean =>
  asset.type === "image" ||
  asset.type === "video" ||
  Boolean(asset.mimeType?.startsWith("image/") || asset.mimeType?.startsWith("video/"));

export const mergeReferences = (...groups: ReferenceVideo[][]): ReferenceVideo[] => {
  const referencesById = new Map<string, ReferenceVideo>();
  groups.flat().forEach((reference) => referencesById.set(reference.id, reference));
  return [...referencesById.values()];
};

const activeReferencePollingWindowMs = 10 * 60 * 1000;

export const hasActivePendingReferenceAnalysis = (
  references: ReferenceVideo[],
  nowMs = Date.now(),
): boolean =>
  references.some((reference) => {
    if (reference.status !== "registered" && reference.status !== "analyzing") {
      return false;
    }
    const updatedAtMs = Date.parse(reference.updatedAt);
    if (Number.isNaN(updatedAtMs)) {
      return true;
    }
    return nowMs - updatedAtMs <= activeReferencePollingWindowMs;
  });

export const mergeTemplates = (...groups: ViralTemplate[][]): ViralTemplate[] => {
  const templatesById = new Map<string, ViralTemplate>();
  groups.flat().forEach((template) => templatesById.set(template.templateId, template));
  return [...templatesById.values()];
};

export const defaultMediaSettings: MediaSettings = {
  bgmTrack: "creator-pop",
  subtitleStyle: "clean-lower-third",
  subtitlesEnabled: true,
  ttsVoice: "clear-host",
};

export const creationPageIds: CreationPageId[] = [
  "project",
  "create",
  "studio",
  "delivery",
  "dashboard",
];

export const isCreationPage = (page: WorkspacePageId): page is CreationPageId =>
  creationPageIds.includes(page as CreationPageId);

const workspacePageOrder: WorkspacePageId[] = [
  "assets",
  "inspiration",
  "project",
  "create",
  "studio",
  "delivery",
  "dashboard",
  "edit",
  "settings",
];

export type PageTransitionDirection = "forward" | "backward" | "neutral";

export const getPageTransitionDirection = (
  previousPage: WorkspacePageId,
  nextPage: WorkspacePageId,
): PageTransitionDirection => {
  const previousIndex = workspacePageOrder.indexOf(previousPage);
  const nextIndex = workspacePageOrder.indexOf(nextPage);

  if (previousIndex === -1 || nextIndex === -1 || previousIndex === nextIndex) {
    return "neutral";
  }

  return nextIndex > previousIndex ? "forward" : "backward";
};

export const pageFromHash = (): WorkspacePageId => {
  if (typeof window === "undefined") {
    return "project";
  }

  const hash = window.location.hash.replace("#", "");
  if (hash === "assets") {
    return "assets";
  }
  if (hash === "inspiration") {
    return "inspiration";
  }
  if (hash === "settings") {
    return "settings";
  }
  if (hash === "script" || hash === "create") {
    return "create";
  }
  if (hash === "studio") {
    return "studio";
  }
  if (hash === "trace" || hash === "export" || hash === "delivery") {
    return "delivery";
  }
  if (hash === "dashboard") {
    return "dashboard";
  }
  return "project";
};

export const getCreationAssetLibraryRefreshCategory = (
  page: WorkspacePageId,
): AssetLibraryCategory | undefined => (page === "create" ? "all" : undefined);

export const getStoredApiConfig = (): UserApiConfig => {
  if (typeof window === "undefined") {
    return createDefaultApiConfig();
  }

  try {
    const storedConfig = window.localStorage.getItem("shopclip-api-config");
    if (!storedConfig) {
      return createDefaultApiConfig();
    }
    return sanitizeApiConfig(JSON.parse(storedConfig) as UserApiConfig);
  } catch {
    return createDefaultApiConfig();
  }
};
