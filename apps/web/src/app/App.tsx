import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, Film, FileText, ListVideo, Scissors } from "lucide-react";
import type {
  AssetMetadata,
  AssetSlice,
  DashboardResponse,
  ProjectBrief,
  ReferenceVideo,
  RenderTask,
  ScriptGenerationRequest,
  ScriptResult,
  StoryboardScene,
  TraceEvent,
  ViralTemplate,
  SmartEditPlan,
  SmartEditResult,
} from "@shopclip/shared";

import {
  AppShell,
  type CreationPageId,
  type WorkspaceSectionId,
  type WorkspacePageId,
} from "../components/layout/AppShell";
import { Button } from "../components/ui/Button";
import {
  assetMatchesCategory,
  externalAssetMatchesCategory,
  getAssetDraftDefaults,
  type AssetCategory,
} from "../features/assets/AssetCategoryTabs";
import { AssetPrepPanel, type AssetPrepSnapshot } from "../features/assets/AssetPrepPanel";
import { AssetsPanel, hasSearchableStockProviderCredential } from "../features/assets/AssetsPanel";
import { DashboardPanel } from "../features/dashboard/DashboardPanel";
import { SmartEditPanel } from "../features/edit/SmartEditPanel";
import { RenderPanel, defaultVideoSettings } from "../features/render/RenderPanel";
import { ReferenceLibraryPanel } from "../features/references/ReferenceLibraryPanel";
import {
  ProjectModal,
  ProjectWorkspace,
  ScriptDetail,
  type ProjectDetailTab,
} from "../features/projects/ProjectWorkspace";
import {
  createDefaultStockProviderConfigs,
  createDefaultApiConfig,
  sanitizeApiConfig,
  sanitizeStockProviderConfigs,
  SettingsPanel,
} from "../features/settings/SettingsPanel";
import { ScriptPanel } from "../features/script/ScriptPanel";
import { StudioWorkspace } from "../features/studio/StudioWorkspace";
import { copy, isLanguage, type Language } from "./i18n";
import {
  addAsset,
  addReferenceToScriptLibrary,
  applySceneSuggestion,
  analyzeReferenceVideo,
  createReferenceTemplate,
  createProject,
  createAssetUploadIntent,
  deleteAssets as deleteAssetsRequest,
  deleteRenderTask as deleteRenderTaskRequest,
  deleteReferenceVideo,
  deleteScene,
  deleteScript as deleteScriptRequest,
  extractTemplateFromScriptAssets,
  exportProject,
  generateScript,
  generateScriptStoryboard,
  importExternalAsset,
  loadDashboard,
  listReferenceTemplates,
  listReferenceVideos,
  listProjects,
  loadSceneSuggestions,
  loadProject,
  loadProjectAssets,
  loadRenderTask,
  processAssetStructure,
  recallSceneAssets,
  regenerateScene,
  reorderScenes,
  retryRenderTask,
  rewriteScript,
  saveScript,
  refreshSmartEditSegment,
  searchAssets,
  searchExternalStockAssets,
  startSmartEdit,
  startRender,
  updateProjectPrep,
  updateProjectBrief,
  updateRenderTaskDisplayName,
  updateScene,
  updateScriptDisplayName,
  uploadAssetFileToStorage,
  type AssetRecallCandidate,
  type AssetLibraryCategory,
  type AssetSearchResult,
  type CreateAssetInput,
  type EditingSuggestion,
  type ExportResult,
  type ExternalAssetResult,
  type ExternalAssetSearchResponse,
  type MediaSettings,
  type ProjectSummary,
  type ProjectSnapshot,
  type RenderSnapshot,
  type StockProviderConfig,
  type UserApiConfig,
  type VideoGenerationSettings,
} from "../lib/api";

const defaultBrief: ProjectBrief = {
  title: "Desk launch clip",
  productName: "GlowGrip Phone Stand",
  audience: "TikTok Shop buyers",
  sellingPoints: ["folds flat", "keeps product shots stable"],
  tone: "confident",
  style: "fast desk demo",
  targetDurationSeconds: 15,
};

const createProjectMockDashboard = (project: ProjectSnapshot): DashboardResponse => {
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

const defaultAssetSizeBytes = 220_000;

const createDefaultAsset = (language: Language): CreateAssetInput => ({
  ...getAssetDraftDefaults("image", language),
  sizeBytes: defaultAssetSizeBytes,
});

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

export const createScriptGenerationRequestPayload = (
  assetPrepSnapshot: Pick<AssetPrepSnapshot, "assetIds" | "keywords" | "materials">,
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

export const createAssetInputFromFile = (file: File, language: Language): CreateAssetInput => {
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
  const defaults = getAssetDraftDefaults(inferredCategory, language);
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

const shouldAutoProcessImportedAsset = (asset: AssetMetadata): boolean =>
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

const mergeTemplates = (...groups: ViralTemplate[][]): ViralTemplate[] => {
  const templatesById = new Map<string, ViralTemplate>();
  groups.flat().forEach((template) => templatesById.set(template.templateId, template));
  return [...templatesById.values()];
};

interface ImportAndStructureFilesInput {
  createAssetUploadIntentFn?: typeof createAssetUploadIntent;
  files: File[];
  language: Language;
  processAssetStructureFn?: typeof processAssetStructure;
  projectId?: string;
  uploadAssetFileToStorageFn?: typeof uploadAssetFileToStorage;
}

export const importAndStructureFiles = async ({
  createAssetUploadIntentFn = createAssetUploadIntent,
  files,
  language,
  processAssetStructureFn = processAssetStructure,
  projectId,
  uploadAssetFileToStorageFn = uploadAssetFileToStorage,
}: ImportAndStructureFilesInput): Promise<{
  assets: AssetMetadata[];
  assetSlices: AssetSlice[];
}> => {
  const importedAssets: AssetMetadata[] = [];
  const assetSlices: AssetSlice[] = [];

  for (const file of files) {
    const uploadIntent = await createAssetUploadIntentFn(
      projectId,
      createAssetInputFromFile(file, language),
    );
    const uploaded = await uploadAssetFileToStorageFn(uploadIntent.asset.id, file);
    let importedAsset = uploaded.asset;

    if (shouldAutoProcessImportedAsset(importedAsset)) {
      const processed = await processAssetStructureFn(importedAsset.id);
      importedAsset = processed.asset;
      assetSlices.push(...processed.slices);
    }

    importedAssets.push(importedAsset);
  }

  return { assets: importedAssets, assetSlices };
};

export const hasUsableStockProviderCredential = hasSearchableStockProviderCredential;

const defaultMediaSettings: MediaSettings = {
  bgmTrack: "creator-pop",
  subtitleStyle: "clean-lower-third",
  subtitlesEnabled: true,
  ttsVoice: "clear-host",
};

const creationPageIds: CreationPageId[] = [
  "project",
  "create",
  "studio",
  "delivery",
  "edit",
  "dashboard",
];

const isCreationPage = (page: WorkspacePageId): page is CreationPageId =>
  creationPageIds.includes(page as CreationPageId);

type BusyState =
  | "idle"
  | "project"
  | "asset"
  | "search"
  | "script"
  | "scene"
  | "render"
  | "smart-edit"
  | "export"
  | "dashboard"
  | "reference";

type ScriptProductionMode = NonNullable<ScriptGenerationRequest["productionMode"]>;
type ProjectStudioFlow = "script" | "storyboard" | "render" | "edit";

const getStoredLanguage = (): Language => {
  if (typeof window === "undefined") {
    return "en";
  }
  const storedLanguage = window.localStorage.getItem("shopclip-language");
  return isLanguage(storedLanguage) ? storedLanguage : "en";
};

const getStoredApiConfig = (): UserApiConfig => {
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

const getStoredStockProviderConfigs = (): StockProviderConfig[] => {
  if (typeof window === "undefined") {
    return createDefaultStockProviderConfigs();
  }

  try {
    const storedConfig = window.localStorage.getItem("shopclip-stock-provider-config");
    if (!storedConfig) {
      return createDefaultStockProviderConfigs();
    }
    return sanitizeStockProviderConfigs(JSON.parse(storedConfig) as StockProviderConfig[]);
  } catch {
    return createDefaultStockProviderConfigs();
  }
};

const pageFromHash = (): WorkspacePageId => {
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

export const getCreationUsableAssets = (
  projectId: string | undefined,
  assets: AssetMetadata[],
): AssetMetadata[] => {
  const assetsById = new Map<string, AssetMetadata>();
  assets.forEach((asset) => {
    if (asset.projectId && asset.projectId !== projectId) {
      return;
    }
    assetsById.set(asset.id, asset);
  });
  return [...assetsById.values()];
};

const getReferenceIdFromScriptAsset = (asset: AssetMetadata): string | undefined => {
  if (!asset.metadata || typeof asset.metadata !== "object" || !("referenceId" in asset.metadata)) {
    return undefined;
  }
  return typeof asset.metadata.referenceId === "string" ? asset.metadata.referenceId : undefined;
};

export const getReferenceScriptAssets = (assets: AssetMetadata[]): AssetMetadata[] => {
  const assetsById = new Map<string, AssetMetadata>();
  assets.forEach((asset) => {
    const kind =
      asset.metadata && typeof asset.metadata === "object" && "kind" in asset.metadata
        ? asset.metadata.kind
        : undefined;
    if (
      kind === "reference_script_asset" &&
      asset.status === "ready" &&
      getReferenceIdFromScriptAsset(asset)
    ) {
      assetsById.set(asset.id, asset);
    }
  });
  return [...assetsById.values()];
};

export const isRenderTaskPollingActive = (
  renderTask: Pick<RenderTask, "status"> | undefined,
): boolean =>
  renderTask?.status === "queued" ||
  renderTask?.status === "running" ||
  renderTask?.status === "retrying";

const isSmartEditTask = (renderTask: Pick<RenderTask, "provider"> | undefined): boolean =>
  renderTask?.provider === "smart-edit-ffmpeg";

const smartEditResultFromRenderSnapshot = (
  render: RenderSnapshot,
): SmartEditResult | undefined => {
  if (
    render.renderTask.status !== "completed" ||
    render.renderTask.provider !== "smart-edit-ffmpeg" ||
    !render.renderTask.smartEditPlan ||
    !render.renderTask.exportUrl ||
    !render.renderTask.previewUrl
  ) {
    return undefined;
  }

  return {
    exportUrl: render.renderTask.exportUrl,
    plan: render.renderTask.smartEditPlan,
    previewUrl: render.renderTask.previewUrl,
    renderTaskId: render.renderTask.id,
    segmentOutputs: render.renderTask.smartEditSegmentOutputs ?? [],
    traceEvents: render.traceEvents,
  };
};

type PreparedAssetBucketId = "hero" | "scene" | "demo" | "brand";

export const getPreparedAssetsByBucket = (
  assets: AssetMetadata[],
): Record<string, AssetMetadata[]> => {
  const preparedAssetsByBucket: Record<PreparedAssetBucketId, AssetMetadata[]> = {
    hero: [],
    scene: [],
    demo: [],
    brand: [],
  };

  assets.forEach((asset) => {
    if (asset.type === "image" || asset.mimeType?.startsWith("image/")) {
      const bucketId = preparedAssetsByBucket.hero.length === 0 ? "hero" : "scene";
      preparedAssetsByBucket[bucketId].push(asset);
      return;
    }

    if (asset.type === "video" || asset.mimeType?.startsWith("video/")) {
      preparedAssetsByBucket.demo.push(asset);
      return;
    }

    preparedAssetsByBucket.brand.push(asset);
  });

  return Object.fromEntries(
    Object.entries(preparedAssetsByBucket).filter(([, bucketAssets]) => bucketAssets.length > 0),
  );
};

export const createAssetPrepSnapshotFromProjectAssets = (
  assets: AssetMetadata[],
  keywords: string[] = [],
): AssetPrepSnapshot => {
  const preparedAssetsByBucket = getPreparedAssetsByBucket(assets);
  const materials = Object.entries(preparedAssetsByBucket).flatMap(([bucketId, bucketAssets]) =>
    bucketAssets.map((asset) => ({
      assetId: asset.id,
      bucketId,
      mimeType: asset.mimeType,
      name: asset.name,
      sizeBytes: asset.sizeBytes,
      source: "library" as const,
      tags: asset.tags,
      type: asset.type,
    })),
  );

  return {
    assetIds: materials.map((material) => material.assetId),
    keywords,
    materials,
  };
};

export const pruneAssetPrepSnapshotDeletedAssets = (
  snapshot: AssetPrepSnapshot,
  deletedAssetIds: Set<string>,
): AssetPrepSnapshot => ({
  ...snapshot,
  assetIds: snapshot.assetIds.filter((assetId) => !deletedAssetIds.has(assetId)),
  materials: snapshot.materials.filter(
    (material) => !material.assetId || !deletedAssetIds.has(material.assetId),
  ),
});

interface AppProps {
  initialLanguage?: Language;
  initialPage?: WorkspacePageId;
  initialProject?: ProjectSnapshot;
  initialProjectDetailTab?: ProjectDetailTab;
  initialProjectHistory?: ProjectSummary[];
}

export const App = ({
  initialLanguage,
  initialPage,
  initialProject,
  initialProjectDetailTab,
  initialProjectHistory,
}: AppProps) => {
  const [language, setLanguage] = useState<Language>(() => initialLanguage ?? getStoredLanguage());
  const [activePage, setActivePage] = useState<WorkspacePageId>(
    () => initialPage ?? pageFromHash(),
  );
  const [activeAssetCategory, setActiveAssetCategory] = useState<AssetCategory>("image");
  const [apiConfig, setApiConfig] = useState<UserApiConfig>(() => getStoredApiConfig());
  const [stockProviderConfigs, setStockProviderConfigs] = useState<StockProviderConfig[]>(() =>
    getStoredStockProviderConfigs(),
  );
  const [assetDraft, setAssetDraft] = useState<CreateAssetInput>(() =>
    createDefaultAsset(language),
  );
  const [assetSearchQuery, setAssetSearchQuery] = useState("");
  const [hasAssetSearchRun, setHasAssetSearchRun] = useState(false);
  const [assetSearchResults, setAssetSearchResults] = useState<AssetSearchResult[]>([]);
  const [externalAssetSearchResults, setExternalAssetSearchResults] = useState<
    ExternalAssetResult[]
  >([]);
  const [brief, setBrief] = useState<ProjectBrief>(defaultBrief);
  const [busyState, setBusyState] = useState<BusyState>("idle");
  const [dashboard, setDashboard] = useState<DashboardResponse>();
  const [dirtySceneIds, setDirtySceneIds] = useState<Set<string>>(() => new Set());
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [exportResult, setExportResult] = useState<ExportResult>();
  const [fallbackProvider, setFallbackProvider] = useState<string>();
  const [forceRenderFailure, setForceRenderFailure] = useState(false);
  const [editingSuggestions, setEditingSuggestions] = useState<EditingSuggestion[]>([]);
  const [assetRecallCandidates, setAssetRecallCandidates] = useState<AssetRecallCandidate[]>([]);
  const [assetPrepSnapshot, setAssetPrepSnapshot] = useState<AssetPrepSnapshot>({
    assetIds: [],
    keywords: [],
    materials: [],
  });
  const [assetLibrary, setAssetLibrary] = useState<{
    assets: AssetMetadata[];
    assetSlices: AssetSlice[];
  }>({ assets: [], assetSlices: [] });
  const [mediaSettings, setMediaSettings] = useState<MediaSettings>(defaultMediaSettings);
  const [videoSettings, setVideoSettings] = useState<VideoGenerationSettings>(defaultVideoSettings);
  const [project, setProject] = useState<ProjectSnapshot | undefined>(() => initialProject);
  const [projectHistory, setProjectHistory] = useState<ProjectSummary[]>(
    () => initialProjectHistory ?? [],
  );
  const [projectDetailTab, setProjectDetailTab] = useState<ProjectDetailTab>(
    () => initialProjectDetailTab ?? "overview",
  );
  const [isProjectScriptComposerOpen, setIsProjectScriptComposerOpen] = useState(false);
  const [isProjectStudioMode, setIsProjectStudioMode] = useState(false);
  const [projectStudioFlow, setProjectStudioFlow] = useState<ProjectStudioFlow>("script");
  const [projectStudioPreviewScriptId, setProjectStudioPreviewScriptId] = useState<
    string | undefined
  >();
  const [isProjectHistoryLoading, setIsProjectHistoryLoading] = useState(false);
  const [referenceLibrary, setReferenceLibrary] = useState<ReferenceVideo[]>([]);
  const [renderTask, setRenderTask] = useState<RenderTask>();
  const [script, setScript] = useState<ScriptResult>();
  const [scriptDraft, setScriptDraft] = useState("");
  const [scriptProductionMode, setScriptProductionMode] =
    useState<ScriptProductionMode>("automatic");
  const [selectedReferenceIdForScript, setSelectedReferenceIdForScript] = useState<string>();
  const [selectedTemplateIdForScript, setSelectedTemplateIdForScript] = useState<string>();
  const [selectedSceneId, setSelectedSceneId] = useState<string>();
  const [selectedSmartEditSegmentId, setSelectedSmartEditSegmentId] = useState<string>();
  const [smartEditInstructions, setSmartEditInstructions] = useState("");
  const [smartEditResult, setSmartEditResult] = useState<SmartEditResult>();
  const [smartEditTargetLanguage, setSmartEditTargetLanguage] = useState("zh-CN");
  const [traceEvents, setTraceEvents] = useState<TraceEvent[]>([]);
  const [viralTemplateLibrary, setViralTemplateLibrary] = useState<ViralTemplate[]>([]);
  const isReferencePollInFlight = useRef(false);
  const isRenderPollInFlight = useRef(false);
  const text = copy[language];

  const scenes = useMemo(() => script?.scenes ?? project?.scenes ?? [], [project?.scenes, script]);
  const activeAssets = useMemo(
    () => assetLibrary.assets.filter((asset) => assetMatchesCategory(asset, activeAssetCategory)),
    [activeAssetCategory, assetLibrary.assets],
  );
  const creationUsableAssets = useMemo(
    () =>
      getCreationUsableAssets(project?.id, [...(project?.assets ?? []), ...assetLibrary.assets]),
    [assetLibrary.assets, project?.assets, project?.id],
  );
  const studioAssets = useMemo(() => {
    const assetsById = new Map<string, AssetMetadata>();
    [...(project?.assets ?? []), ...assetLibrary.assets].forEach((asset) => {
      assetsById.set(asset.id, asset);
    });
    return [...assetsById.values()];
  }, [assetLibrary.assets, project?.assets]);
  const smartEditAssetSlices = useMemo(
    () => [...(project?.assetSlices ?? []), ...assetLibrary.assetSlices],
    [assetLibrary.assetSlices, project?.assetSlices],
  );
  const isSmartEditTaskRunning = isSmartEditTask(renderTask) && isRenderTaskPollingActive(renderTask);
  const preparedProjectAssetsByBucket = useMemo(
    () => getPreparedAssetsByBucket(project?.assets ?? []),
    [project?.assets],
  );
  const scriptReferenceLibrary = useMemo(
    () => mergeReferences(project?.referenceVideos ?? [], referenceLibrary),
    [project?.referenceVideos, referenceLibrary],
  );
  const scriptReferenceAssets = useMemo(
    () => getReferenceScriptAssets([...(project?.assets ?? []), ...assetLibrary.assets]),
    [assetLibrary.assets, project?.assets],
  );
  const hasPendingReferences = useMemo(
    () => hasActivePendingReferenceAnalysis(scriptReferenceLibrary),
    [scriptReferenceLibrary],
  );
  const scriptTemplateLibrary = useMemo(
    () => mergeTemplates(viralTemplateLibrary, project?.viralTemplates ?? []),
    [project?.viralTemplates, viralTemplateLibrary],
  );
  const activeAssetSearchResults = useMemo(
    () =>
      assetSearchResults.filter((result) =>
        assetMatchesCategory(result.asset, activeAssetCategory),
      ),
    [activeAssetCategory, assetSearchResults],
  );
  const activeExternalAssetSearchResults = useMemo(
    () =>
      externalAssetSearchResults.filter((result) =>
        externalAssetMatchesCategory(result, activeAssetCategory),
      ),
    [activeAssetCategory, externalAssetSearchResults],
  );
  const activeSection: WorkspaceSectionId =
    activePage === "assets"
      ? "assets"
      : activePage === "inspiration"
        ? "inspiration"
        : activePage === "settings"
          ? "settings"
          : "create";
  useEffect(() => {
    const handleHashChange = () => setActivePage(pageFromHash());
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    }
  }, [language]);

  const handlePageChange = (page: WorkspacePageId) => {
    if (page !== "studio" && page !== "delivery" && page !== "edit") {
      setIsProjectStudioMode(false);
    }
    setActivePage(page);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${page}`);
    }
  };

  const handleSectionChange = (section: WorkspaceSectionId) => {
    if (section === "create") {
      setProject(undefined);
      setProjectDetailTab("overview");
    }
    handlePageChange(
      section === "assets"
        ? "assets"
        : section === "inspiration"
          ? "inspiration"
          : section === "settings"
            ? "settings"
            : "project",
    );
  };

  const handleLanguageChange = (nextLanguage: Language) => {
    const previousLanguage = language;
    setLanguage(nextLanguage);
    setAssetDraft((current) => {
      const previousDefaults = getAssetDraftDefaults(activeAssetCategory, previousLanguage);
      const nextDefaults = getAssetDraftDefaults(activeAssetCategory, nextLanguage);
      const isLocalizedDefault =
        current.type === previousDefaults.type &&
        current.mimeType === previousDefaults.mimeType &&
        current.name === previousDefaults.name &&
        current.tags.join("\u0000") === previousDefaults.tags.join("\u0000");

      return isLocalizedDefault ? { ...nextDefaults, sizeBytes: current.sizeBytes } : current;
    });
    if (typeof window !== "undefined") {
      window.localStorage.setItem("shopclip-language", nextLanguage);
    }
  };

  const handleApiConfigChange = (nextApiConfig: UserApiConfig) => {
    const normalizedConfig = sanitizeApiConfig(nextApiConfig);
    setApiConfig(normalizedConfig);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("shopclip-api-config", JSON.stringify(normalizedConfig));
    }
  };

  const handleStockProviderConfigsChange = (nextConfigs: StockProviderConfig[]) => {
    const normalizedConfigs = sanitizeStockProviderConfigs(nextConfigs);
    setStockProviderConfigs(normalizedConfigs);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        "shopclip-stock-provider-config",
        JSON.stringify(normalizedConfigs),
      );
    }
  };

  const handleAssetPrepChange = useCallback((snapshot: AssetPrepSnapshot) => {
    setAssetPrepSnapshot(snapshot);
  }, []);

  useEffect(() => {
    if (!project) {
      return;
    }

    const currentKeywords = project.prepKeywords.join("\u001f");
    const nextKeywords = assetPrepSnapshot.keywords.join("\u001f");
    if (currentKeywords === nextKeywords) {
      return;
    }

    const projectId = project.id;
    const keywords = [...assetPrepSnapshot.keywords];
    const timeoutId = window.setTimeout(() => {
      void updateProjectPrep(projectId, { keywords })
        .then((updatedProject) => {
          setProject((current) =>
            current?.id === updatedProject.id
              ? { ...current, prepKeywords: updatedProject.prepKeywords }
              : current,
          );
        })
        .catch(() => undefined);
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [assetPrepSnapshot.keywords, project]);

  const handleContinueToScript = () => {
    if (typeof document !== "undefined") {
      document.getElementById("script")?.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  };

  const handleAssetCategoryChange = (category: AssetCategory) => {
    setActiveAssetCategory(category);
    setAssetDraft((current) => ({
      ...getAssetDraftDefaults(category, language),
      sizeBytes: current.sizeBytes > 0 ? current.sizeBytes : defaultAssetSizeBytes,
    }));
  };

  const runAction = async (key: string, busy: BusyState, action: () => Promise<void>) => {
    setBusyState(busy);
    setErrors((current) => ({ ...current, [key]: undefined }));
    try {
      await action();
    } catch (error) {
      setErrors((current) => ({
        ...current,
        [key]: error instanceof Error ? error.message : "Action failed.",
      }));
    } finally {
      setBusyState("idle");
    }
  };

  const replaceAssetCategoryInLibrary = (
    currentLibrary: { assets: AssetMetadata[]; assetSlices: AssetSlice[] },
    category: AssetLibraryCategory,
    assets: AssetMetadata[],
    assetSlices: AssetSlice[],
  ): { assets: AssetMetadata[]; assetSlices: AssetSlice[] } => {
    if (category === "all") {
      return { assets, assetSlices };
    }

    const replacedAssetIds = new Set(
      currentLibrary.assets
        .filter((asset) => assetMatchesCategory(asset, category))
        .map((asset) => asset.id),
    );
    const nextAssetIds = new Set(assets.map((asset) => asset.id));

    return {
      assets: [
        ...currentLibrary.assets.filter((asset) => !replacedAssetIds.has(asset.id)),
        ...assets,
      ],
      assetSlices: [
        ...currentLibrary.assetSlices.filter(
          (slice) => !replacedAssetIds.has(slice.assetId) && !nextAssetIds.has(slice.assetId),
        ),
        ...assetSlices,
      ],
    };
  };

  const refreshAssetLibrary = (category: AssetLibraryCategory) => {
    void runAction("asset", "asset", async () => {
      const response = await loadProjectAssets(undefined, category);
      setAssetLibrary((current) =>
        replaceAssetCategoryInLibrary(current, category, response.assets, response.assetSlices),
      );
      setHasAssetSearchRun(false);
      setAssetSearchResults([]);
      setExternalAssetSearchResults([]);
    });
  };

  const refreshProjectHistory = () => {
    setIsProjectHistoryLoading(true);
    void listProjects()
      .then((projects) => {
        setProjectHistory(projects);
      })
      .catch((error) => {
        setErrors((current) => ({
          ...current,
          project: error instanceof Error ? error.message : "Project history failed to load.",
        }));
      })
      .finally(() => {
        setIsProjectHistoryLoading(false);
      });
  };

  const refreshReferenceLibrary = (options: { includeTemplates?: boolean } = {}) => {
    if (isReferencePollInFlight.current) {
      return;
    }
    const includeTemplates = options.includeTemplates ?? true;
    isReferencePollInFlight.current = true;
    const templatesRequest = includeTemplates
      ? listReferenceTemplates()
      : Promise.resolve<ViralTemplate[]>([]);
    void Promise.all([listReferenceVideos(), templatesRequest])
      .then(([references, templates]) => {
        setReferenceLibrary(references);
        if (includeTemplates) {
          setViralTemplateLibrary(templates);
        }
      })
      .catch((error) => {
        setErrors((current) => ({
          ...current,
          script: error instanceof Error ? error.message : "Reference library failed to load.",
        }));
      })
      .finally(() => {
        isReferencePollInFlight.current = false;
      });
  };

  useEffect(() => {
    if (activePage === "assets") {
      if (activeAssetCategory === "template") {
        refreshReferenceLibrary({ includeTemplates: true });
        return;
      }
      refreshAssetLibrary(activeAssetCategory);
      return;
    }

    const creationAssetLibraryRefreshCategory =
      activePage === "inspiration" ? "all" : getCreationAssetLibraryRefreshCategory(activePage);
    if (creationAssetLibraryRefreshCategory) {
      refreshAssetLibrary(creationAssetLibraryRefreshCategory);
    }
  }, [activePage, activeAssetCategory]);

  useEffect(() => {
    if (activePage === "project") {
      refreshProjectHistory();
    }
  }, [activePage]);

  useEffect(() => {
    if (activePage === "inspiration" || activePage === "create") {
      refreshReferenceLibrary({ includeTemplates: true });
    }
  }, [activePage]);

  useEffect(() => {
    if (!hasPendingReferences || (activePage !== "inspiration" && activePage !== "create")) {
      return;
    }

    const intervalId = window.setInterval(
      () => refreshReferenceLibrary({ includeTemplates: false }),
      5000,
    );
    refreshReferenceLibrary({ includeTemplates: false });
    return () => window.clearInterval(intervalId);
  }, [activePage, hasPendingReferences]);

  useEffect(() => {
    if (!renderTask || !isRenderTaskPollingActive(renderTask)) {
      return;
    }

    let cancelled = false;
    const syncRenderTask = async () => {
      if (isRenderPollInFlight.current) {
        return;
      }
      isRenderPollInFlight.current = true;
      try {
        const render = await loadRenderTask(renderTask.id);
        if (cancelled) {
          return;
        }
        setRenderTask(render.renderTask);
        setTraceEvents(render.traceEvents);
        const smartEdit = smartEditResultFromRenderSnapshot(render);
        if (smartEdit) {
          setSmartEditResult(smartEdit);
          setSelectedSmartEditSegmentId(smartEdit.plan.segments[0]?.id);
          setExportResult(undefined);
        }
        if (
          render.renderTask.status === "failed" &&
          render.renderTask.provider === "smart-edit-ffmpeg"
        ) {
          setErrors((current) => ({
            ...current,
            smartEdit: render.renderTask.errorMessage ?? "Smart edit failed.",
          }));
        }
        setProject((current) =>
          current
            ? {
                ...current,
                renderTasks: current.renderTasks.map((task) =>
                  task.id === render.renderTask.id ? render.renderTask : task,
                ),
                status: render.renderTask.status === "completed" ? "completed" : current.status,
              }
            : current,
        );
      } catch (error) {
        if (!cancelled) {
          setErrors((current) => ({
            ...current,
            render: error instanceof Error ? error.message : "Render progress sync failed.",
          }));
        }
      } finally {
        isRenderPollInFlight.current = false;
      }
    };

    const firstSync = window.setTimeout(() => {
      void syncRenderTask();
    }, 1200);
    const interval = window.setInterval(() => {
      void syncRenderTask();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearTimeout(firstSync);
      window.clearInterval(interval);
    };
  }, [renderTask?.id, renderTask?.status]);

  useEffect(() => {
    setProjectStudioPreviewScriptId(undefined);
  }, [project?.id]);

  const handleCreateProject = () =>
    runAction("project", "project", async () => {
      const createdProject = await createProject(brief);
      setProject(createdProject);
      setProjectDetailTab("overview");
      setIsProjectScriptComposerOpen(false);
      setIsProjectStudioMode(false);
      setProjectStudioFlow("script");
      setScript(undefined);
      setScriptDraft("");
      setScriptProductionMode("automatic");
      setSelectedReferenceIdForScript(undefined);
      setSelectedTemplateIdForScript(undefined);
      setRenderTask(undefined);
      setSmartEditResult(undefined);
      setSelectedSmartEditSegmentId(undefined);
      setTraceEvents([]);
      setDashboard(undefined);
      setExportResult(undefined);
      setHasAssetSearchRun(false);
      setAssetSearchResults([]);
      setExternalAssetSearchResults([]);
      setEditingSuggestions([]);
      setAssetRecallCandidates([]);
      setAssetPrepSnapshot({ assetIds: [], keywords: [], materials: [] });
      setSelectedSceneId(undefined);
      setDirtySceneIds(new Set());
      refreshProjectHistory();
    });

  const applyLoadedProject = (loadedProject: ProjectSnapshot) => {
    const latestScript = loadedProject.scripts.at(-1);
    const latestRender = loadedProject.renderTasks.at(-1);
    setProject(loadedProject);
    setProjectDetailTab("overview");
    setIsProjectScriptComposerOpen(false);
    setIsProjectStudioMode(false);
    setProjectStudioFlow("script");
    setBrief({
      title: loadedProject.title,
      productName: loadedProject.productName,
      audience: loadedProject.audience,
      sellingPoints: loadedProject.sellingPoints,
      tone: loadedProject.tone,
      style: loadedProject.style,
      targetDurationSeconds: loadedProject.targetDurationSeconds,
    });
    setScript(latestScript);
    setScriptDraft(latestScript?.narrative ?? "");
    setScriptProductionMode("automatic");
    setSelectedReferenceIdForScript(undefined);
    setSelectedTemplateIdForScript(undefined);
    setRenderTask(latestRender);
    setTraceEvents([]);
    if (
      latestRender?.provider === "smart-edit-ffmpeg" &&
      latestRender.status === "completed" &&
      latestRender.smartEditPlan &&
      latestRender.exportUrl &&
      latestRender.previewUrl
    ) {
      setSmartEditResult({
        exportUrl: latestRender.exportUrl,
        plan: latestRender.smartEditPlan,
        previewUrl: latestRender.previewUrl,
        renderTaskId: latestRender.id,
        segmentOutputs: latestRender.smartEditSegmentOutputs ?? [],
        traceEvents: [],
      });
      setSelectedSmartEditSegmentId(latestRender.smartEditPlan.segments[0]?.id);
    } else {
      setSmartEditResult(undefined);
      setSelectedSmartEditSegmentId(undefined);
    }
    setDashboard(undefined);
    setExportResult(undefined);
    setHasAssetSearchRun(false);
    setAssetSearchResults([]);
    setExternalAssetSearchResults([]);
    setEditingSuggestions([]);
    setAssetRecallCandidates([]);
    setAssetPrepSnapshot(
      createAssetPrepSnapshotFromProjectAssets(loadedProject.assets, loadedProject.prepKeywords),
    );
    setSelectedSceneId(latestScript?.scenes[0]?.id ?? loadedProject.scenes[0]?.id);
    setDirtySceneIds(new Set());
  };

  const handleLoadProjectFromHistory = (projectId: string) =>
    runAction("project", "project", async () => {
      const loadedProject = await loadProject(projectId);
      applyLoadedProject(loadedProject);
    });

  const handleBackToProjectList = () => {
    setProject(undefined);
    setProjectDetailTab("overview");
    setIsProjectScriptComposerOpen(false);
    setIsProjectStudioMode(false);
    setProjectStudioFlow("script");
    refreshProjectHistory();
  };

  const handleAddProjectScript = () => {
    setProjectDetailTab("scripts");
    setIsProjectScriptComposerOpen(true);
  };

  const handleUpdateProjectBrief = (nextBrief: ProjectBrief) => {
    if (!project) {
      return;
    }

    void runAction("project", "project", async () => {
      const updatedProject = await updateProjectBrief(project.id, nextBrief);
      setProject(updatedProject);
      setBrief({
        title: updatedProject.title,
        productName: updatedProject.productName,
        audience: updatedProject.audience,
        sellingPoints: updatedProject.sellingPoints,
        tone: updatedProject.tone,
        style: updatedProject.style,
        targetDurationSeconds: updatedProject.targetDurationSeconds,
      });
      refreshProjectHistory();
    });
  };

  const handleGenerateProjectVideo = () => {
    setProjectDetailTab("videos");
    setIsProjectStudioMode(true);
    setProjectStudioFlow("script");
    handlePageChange("studio");
  };

  const handleSaveVideoAndReturn = () => {
    setIsProjectStudioMode(false);
    setProjectDetailTab("videos");
    handlePageChange("project");
    refreshProjectHistory();
  };

  const handleProjectStudioFlowChange = (flow: ProjectStudioFlow) => {
    setIsProjectStudioMode(true);
    setProjectStudioFlow(flow);
    handlePageChange(flow === "render" ? "delivery" : flow === "edit" ? "edit" : "studio");
  };

  const loadProjectScriptIntoStudio = (selectedScript: ScriptResult) => {
    setScript(selectedScript);
    setScriptDraft(selectedScript.narrative);
    setSelectedSceneId(selectedScript.scenes[0]?.id);
    setDirtySceneIds(new Set());
    setEditingSuggestions([]);
    setAssetRecallCandidates([]);
    setProject((current) =>
      current
        ? {
            ...current,
            scenes: selectedScript.scenes,
          }
        : current,
    );
    handleProjectStudioFlowChange("storyboard");
  };

  const handleSelectProjectScriptForStudio = (selectedScript: ScriptResult) => {
    if (!project) {
      return;
    }

    void runAction("script", "script", async () => {
      const generated = await generateScriptStoryboard(project.id, selectedScript.id);
      setProject((current) =>
        current
          ? {
              ...current,
              scenes: generated.script.scenes,
              scripts: current.scripts.map((candidate) =>
                candidate.id === generated.script.id ? generated.script : candidate,
              ),
              status: "ready",
            }
          : current,
      );
      loadProjectScriptIntoStudio(generated.script);
      refreshProjectHistory();
    });
  };

  const replaceSceneInState = (updatedScene: StoryboardScene) => {
    setScript((current) =>
      current
        ? {
            ...current,
            scenes: current.scenes.map((scene) =>
              scene.id === updatedScene.id ? updatedScene : scene,
            ),
          }
        : current,
    );
    setProject((current) =>
      current
        ? {
            ...current,
            scenes: current.scenes.map((scene) =>
              scene.id === updatedScene.id ? updatedScene : scene,
            ),
            scripts: current.scripts.map((currentScript) => ({
              ...currentScript,
              scenes: currentScript.scenes.map((scene) =>
                scene.id === updatedScene.id ? updatedScene : scene,
              ),
            })),
          }
        : current,
    );
  };

  const replaceScenesInState = (updatedScenes: StoryboardScene[]) => {
    setScript((current) =>
      current
        ? {
            ...current,
            scenes: updatedScenes,
          }
        : current,
    );
    setProject((current) =>
      current
        ? {
            ...current,
            scenes: updatedScenes,
            scripts: current.scripts.map((currentScript) => ({
              ...currentScript,
              scenes: updatedScenes.filter((scene) =>
                currentScript.scenes.some((scriptScene) => scriptScene.id === scene.id),
              ),
            })),
          }
        : current,
    );
  };

  const persistDirtyScenesForRender = async () => {
    const dirtyScenes = scenes.filter((scene) => dirtySceneIds.has(scene.id));
    if (dirtyScenes.length === 0) {
      return scenes;
    }

    const savedScenes = await Promise.all(
      dirtyScenes.map((scene) =>
        updateScene(scene.id, {
          durationSeconds: scene.durationSeconds,
          subtitle: scene.subtitle,
          voiceover: scene.voiceover,
          visualPrompt: scene.visualPrompt,
          assetId: scene.assetId ?? null,
          status: "edited",
        }),
      ),
    );
    const savedById = new Map(savedScenes.map((scene) => [scene.id, scene]));
    const nextScenes = scenes.map((scene) => savedById.get(scene.id) ?? scene);
    replaceScenesInState(nextScenes);
    setDirtySceneIds(new Set());
    return nextScenes;
  };

  const validateSeedanceSceneDurations = () => {
    const invalidScene = scenes.find(
      (scene) => scene.durationSeconds < 4 || scene.durationSeconds > 12,
    );
    if (!invalidScene) {
      return true;
    }
    setErrors((current) => ({
      ...current,
      render: `分镜 ${invalidScene.order} 的时长为 ${invalidScene.durationSeconds}s。doubao-seedance-1.5-pro 仅支持单分镜 4-12s，请先在步骤三调整分镜时长。`,
    }));
    handlePageChange("studio");
    setSelectedSceneId(invalidScene.id);
    return false;
  };

  const handleUploadAsset = () => {
    void runAction("asset", "asset", async () => {
      const asset = await addAsset(project?.id, assetDraft);
      setAssetLibrary((current) => ({
        ...current,
        assets: [...current.assets, asset],
      }));
      setProject((current) =>
        current && asset.projectId === current.id
          ? {
              ...current,
              assets: [...current.assets, asset],
            }
          : current,
      );
    });
  };

  const handleImportFiles = (files: File[]) => {
    if (files.length === 0) {
      return;
    }

    void runAction("asset", "asset", async () => {
      const imported = await importAndStructureFiles({
        files,
        language,
        projectId: project?.id,
      });
      const importedAssets = imported.assets;

      setAssetLibrary((current) => ({
        ...current,
        assets: [...current.assets, ...importedAssets],
        assetSlices: [
          ...current.assetSlices.filter(
            (slice) =>
              !imported.assetSlices.some((candidate) => candidate.assetId === slice.assetId),
          ),
          ...imported.assetSlices,
        ],
      }));
      setProject((current) =>
        current && importedAssets.some((asset) => asset.projectId === current.id)
          ? {
              ...current,
              assets: [
                ...current.assets,
                ...importedAssets.filter((asset) => asset.projectId === current.id),
              ],
              assetSlices: [
                ...current.assetSlices.filter(
                  (slice) =>
                    !imported.assetSlices.some((candidate) => candidate.assetId === slice.assetId),
                ),
                ...imported.assetSlices.filter((slice) =>
                  importedAssets.some(
                    (asset) => asset.projectId === current.id && asset.id === slice.assetId,
                  ),
                ),
              ],
            }
          : current,
      );
      setHasAssetSearchRun(false);
      setAssetSearchResults([]);
      setExternalAssetSearchResults([]);
    });
  };

  const handleSearchAssets = () => {
    if (activeAssetCategory === "template") {
      return;
    }
    void runAction("asset", "search", async () => {
      const response = await searchAssets(project?.id, assetSearchQuery, [], {
        level: activeAssetCategory === "video" ? "slice" : undefined,
        sceneRole: activeAssetCategory === "video" ? "demo" : undefined,
      });
      setHasAssetSearchRun(true);
      setAssetSearchResults(response.results);
      setExternalAssetSearchResults(response.externalResults);
    });
  };

  const handleProcessAsset = (assetId: string) => {
    void runAction("asset", "asset", async () => {
      const processed = await processAssetStructure(assetId);
      setAssetLibrary((current) => ({
        assets: current.assets.map((asset) =>
          asset.id === processed.asset.id ? processed.asset : asset,
        ),
        assetSlices: [
          ...current.assetSlices.filter((slice) => slice.assetId !== processed.asset.id),
          ...processed.slices,
        ],
      }));
      setProject((current) =>
        current && processed.asset.projectId === current.id
          ? {
              ...current,
              assets: current.assets.map((asset) =>
                asset.id === processed.asset.id ? processed.asset : asset,
              ),
              assetSlices: [
                ...current.assetSlices.filter((slice) => slice.assetId !== processed.asset.id),
                ...processed.slices,
              ],
              assetProcessingEvents: [...current.assetProcessingEvents, ...processed.events],
              assetProcessingJobs: [...current.assetProcessingJobs, processed.job],
            }
          : current,
      );
      setAssetSearchResults([]);
      setHasAssetSearchRun(false);
    });
  };

  const handleSearchExternalAssets = async (
    query: string,
    type?: AssetCategory,
    page = 1,
    perPage = 12,
  ): Promise<ExternalAssetSearchResponse> => {
    const enabledProviders = stockProviderConfigs.filter(hasUsableStockProviderCredential);
    if (enabledProviders.length === 0) {
      return { query, page, perPage, hasMore: false, externalResults: [] };
    }

    setBusyState("search");
    setErrors((current) => ({ ...current, asset: undefined }));
    try {
      const response = await searchExternalStockAssets({
        query,
        page,
        perPage,
        type: type === "template" ? undefined : type,
        providers: enabledProviders,
      });
      return response;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Action failed.";
      setErrors((current) => ({ ...current, asset: message }));
      throw error;
    } finally {
      setBusyState("idle");
    }
  };

  const handleImportExternalAsset = async (externalAsset: ExternalAssetResult) => {
    setErrors((current) => ({ ...current, asset: undefined }));
    try {
      const { asset } = await importExternalAsset(project?.id, externalAsset);
      setAssetLibrary((current) => ({
        ...current,
        assets: [...current.assets, asset],
      }));
      setProject((current) =>
        current && asset.projectId === current.id
          ? {
              ...current,
              assets: [...current.assets, asset],
            }
          : current,
      );
      setAssetSearchResults([]);
      setExternalAssetSearchResults((current) =>
        current.filter((candidate) => candidate.id !== externalAsset.id),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Action failed.";
      setErrors((current) => ({
        ...current,
        asset: message,
      }));
      throw error;
    }
  };

  const handleDeleteAssets = (assetIds: string[]) => {
    if (assetIds.length === 0) {
      return;
    }

    void runAction("asset", "asset", async () => {
      const response = await deleteAssetsRequest(assetIds);
      const deletedAssetIds = new Set(response.deletedAssets.map((asset) => asset.id));

      setAssetLibrary((current) => ({
        assets: current.assets.filter((asset) => !deletedAssetIds.has(asset.id)),
        assetSlices: current.assetSlices.filter((slice) => !deletedAssetIds.has(slice.assetId)),
      }));
      setProject((current) =>
        current
          ? {
              ...current,
              assets: current.assets.filter((asset) => !deletedAssetIds.has(asset.id)),
              assetSlices: current.assetSlices.filter(
                (slice) => !deletedAssetIds.has(slice.assetId),
              ),
              scenes: current.scenes.map((scene) =>
                scene.assetId && deletedAssetIds.has(scene.assetId)
                  ? { ...scene, assetId: undefined }
                  : scene,
              ),
              scripts: current.scripts.map((currentScript) => ({
                ...currentScript,
                scenes: currentScript.scenes.map((scene) =>
                  scene.assetId && deletedAssetIds.has(scene.assetId)
                    ? { ...scene, assetId: undefined }
                    : scene,
                ),
              })),
            }
          : current,
      );
      setScript((current) =>
        current
          ? {
              ...current,
              scenes: current.scenes.map((scene) =>
                scene.assetId && deletedAssetIds.has(scene.assetId)
                  ? { ...scene, assetId: undefined }
                  : scene,
              ),
            }
          : current,
      );
      setAssetPrepSnapshot((current) =>
        pruneAssetPrepSnapshotDeletedAssets(current, deletedAssetIds),
      );
      setAssetSearchResults((current) =>
        current.filter((result) => !deletedAssetIds.has(result.asset.id)),
      );
    });
  };

  const handleRemoveProjectMaterial = (asset: AssetMetadata) => {
    if (!project || asset.projectId !== project.id) {
      return;
    }
    handleDeleteAssets([asset.id]);
  };

  const handleDeleteProjectScript = (scriptId: string) => {
    const shouldDelete =
      typeof window === "undefined" ||
      window.confirm(language === "zh" ? "确认删除这个剧本？" : "Delete this script?");
    if (!shouldDelete) {
      return;
    }

    void runAction("script", "script", async () => {
      const { deletedScript } = await deleteScriptRequest(scriptId);
      setProject((current) =>
        current
          ? {
              ...current,
              scripts: current.scripts.filter((candidate) => candidate.id !== deletedScript.id),
            }
          : current,
      );
      setScript((current) => (current?.id === deletedScript.id ? undefined : current));
      setScriptDraft((current) => (script?.id === deletedScript.id ? "" : current));
    });
  };

  const handleDeleteProjectRenderTask = (renderTaskId: string) => {
    const shouldDelete =
      typeof window === "undefined" ||
      window.confirm(language === "zh" ? "确认删除这个视频？" : "Delete this video?");
    if (!shouldDelete) {
      return;
    }

    void runAction("render", "render", async () => {
      const { deletedRenderTask } = await deleteRenderTaskRequest(renderTaskId);
      setProject((current) =>
        current
          ? {
              ...current,
              renderTasks: current.renderTasks.filter(
                (candidate) => candidate.id !== deletedRenderTask.id,
              ),
            }
          : current,
      );
      setRenderTask((current) => (current?.id === deletedRenderTask.id ? undefined : current));
      setTraceEvents((current) => (renderTask?.id === deletedRenderTask.id ? [] : current));
    });
  };

  const handleRenameProjectScript = (scriptId: string, displayName: string) => {
    const nextDisplayName = displayName.trim() || undefined;
    void runAction("script", "script", async () => {
      const { script: updatedScript } = await updateScriptDisplayName(scriptId, nextDisplayName);
      setProject((current) =>
        current
          ? {
              ...current,
              scripts: current.scripts.map((candidate) =>
                candidate.id === updatedScript.id ? updatedScript : candidate,
              ),
            }
          : current,
      );
      setScript((current) => (current?.id === updatedScript.id ? updatedScript : current));
      refreshProjectHistory();
    });
  };

  const handleRenameProjectRenderTask = (renderTaskId: string, displayName: string) => {
    const nextDisplayName = displayName.trim() || undefined;
    void runAction("render", "render", async () => {
      const { renderTask: updatedRenderTask } = await updateRenderTaskDisplayName(
        renderTaskId,
        nextDisplayName,
      );
      setProject((current) =>
        current
          ? {
              ...current,
              renderTasks: current.renderTasks.map((candidate) =>
                candidate.id === updatedRenderTask.id ? updatedRenderTask : candidate,
              ),
            }
          : current,
      );
      setRenderTask((current) =>
        current?.id === updatedRenderTask.id ? updatedRenderTask : current,
      );
      refreshProjectHistory();
    });
  };

  const createScriptGenerationRequest = () =>
    ({
      ...createScriptGenerationRequestPayload(assetPrepSnapshot, scriptDraft, apiConfig),
      productionMode: scriptProductionMode,
      referenceId: selectedReferenceIdForScript,
      templateId: selectedTemplateIdForScript,
    }) satisfies ScriptGenerationRequest;

  const handleScriptProductionModeChange = (mode: ScriptProductionMode) => {
    setScriptProductionMode(mode);
    if (mode === "automatic") {
      setSelectedReferenceIdForScript(undefined);
      setSelectedTemplateIdForScript(undefined);
      return;
    }
    if (mode === "viral-remix") {
      setSelectedTemplateIdForScript(undefined);
      return;
    }
    if (mode === "template") {
      setSelectedReferenceIdForScript(undefined);
    }
  };

  const handleAnalyzeReference = (draft: {
    category: string;
    sourceDeclaration: string;
    sourceAssetId?: string;
    sourcePlatform: string;
    sourceUrl?: string;
    title: string;
  }) => {
    void runAction("script", "reference", async () => {
      const reference = await analyzeReferenceVideo({
        ...draft,
        sourceAssetId: draft.sourceAssetId?.trim() || undefined,
        sourceUrl: draft.sourceUrl?.trim() || undefined,
      });
      setReferenceLibrary((current) => mergeReferences([reference], current));
      if (reference.status === "ready") {
        setSelectedReferenceIdForScript(reference.id);
        setSelectedTemplateIdForScript(undefined);
        setScriptProductionMode("viral-remix");
      }
    });
  };

  const handleCreateReferenceTemplate = () => {
    if (scriptReferenceLibrary.length === 0) {
      return;
    }

    const readyReferences = scriptReferenceLibrary.filter(
      (reference) => reference.status === "ready",
    );
    if (readyReferences.length === 0) {
      return;
    }

    void runAction("script", "reference", async () => {
      const template = await createReferenceTemplate({
        category: readyReferences[0]?.category ?? project?.productName ?? brief.productName,
        referenceIds: readyReferences.map((reference) => reference.id),
        templateName: `${project?.productName ?? brief.productName} viral template`,
      });
      setViralTemplateLibrary((current) => mergeTemplates([template], current));
      setProject((current) =>
        current
          ? {
              ...current,
              viralTemplates: [
                ...current.viralTemplates.filter(
                  (candidate) => candidate.templateId !== template.templateId,
                ),
                template,
              ],
            }
          : current,
      );
      setSelectedTemplateIdForScript(template.templateId);
      setScriptProductionMode("template");
    });
  };

  const handleExtractTemplateFromScripts = (assetIds: string[]) => {
    if (assetIds.length === 0) {
      return;
    }

    void runAction("script", "script", async () => {
      const template = await extractTemplateFromScriptAssets({
        assetIds,
        category: project?.productName || brief.productName || undefined,
        templateName: `${project?.productName || brief.productName || "Script"} reusable template`,
        apiConfig,
      });
      setViralTemplateLibrary((current) => mergeTemplates([template], current));
      setActiveAssetCategory("template");
      setAssetSearchQuery("");
      setHasAssetSearchRun(false);
      setAssetSearchResults([]);
      setExternalAssetSearchResults([]);
    });
  };

  const handleUseReferenceForScript = (referenceId: string) => {
    void runAction("script", "asset", async () => {
      const asset = await addReferenceToScriptLibrary(referenceId, project?.id);
      setAssetLibrary((current) => ({
        ...current,
        assets: [...current.assets.filter((candidate) => candidate.id !== asset.id), asset],
      }));
      setProject((current) =>
        current && asset.projectId === current.id
          ? {
              ...current,
              assets: [...current.assets.filter((candidate) => candidate.id !== asset.id), asset],
            }
          : current,
      );
      setSelectedReferenceIdForScript(referenceId);
      setSelectedTemplateIdForScript(undefined);
      setScriptProductionMode("viral-remix");
      setActiveAssetCategory("script");
      handlePageChange("assets");
    });
  };

  const handleDeleteReferences = (referenceIds: string[]) => {
    const uniqueReferenceIds = Array.from(new Set(referenceIds)).filter(Boolean);
    if (uniqueReferenceIds.length === 0) {
      return;
    }
    const shouldDelete =
      typeof window === "undefined" ||
      window.confirm(
        language === "zh"
          ? uniqueReferenceIds.length === 1
            ? "确认删除这条拆解任务？相关的脚本素材和公开视频分析素材也会一并删除。"
            : `确认删除选中的 ${uniqueReferenceIds.length} 条拆解任务？相关的脚本素材和公开视频分析素材也会一并删除。`
          : uniqueReferenceIds.length === 1
            ? "Delete this breakdown? Related script material and public reference analysis assets will also be removed."
            : `Delete ${uniqueReferenceIds.length} selected breakdowns? Related script material and public reference analysis assets will also be removed.`,
      );
    if (!shouldDelete) {
      return;
    }

    void runAction("script", "reference", async () => {
      const deletedResults = [];
      for (const referenceId of uniqueReferenceIds) {
        deletedResults.push(await deleteReferenceVideo(referenceId));
      }
      const deletedAssetIds = new Set(
        deletedResults.flatMap((deleted) => deleted.deletedAssets.map((asset) => asset.id)),
      );
      const deletedReferenceIds = new Set(
        deletedResults.map((deleted) => deleted.deletedReference.id),
      );
      const deletedTemplateIds = new Set(
        deletedResults.flatMap((deleted) => deleted.deletedTemplateIds),
      );

      setReferenceLibrary((current) =>
        current.filter((reference) => !deletedReferenceIds.has(reference.id)),
      );
      setAssetLibrary((current) => ({
        assets: current.assets.filter((asset) => !deletedAssetIds.has(asset.id)),
        assetSlices: current.assetSlices.filter((slice) => !deletedAssetIds.has(slice.assetId)),
      }));
      setProject((current) =>
        current
          ? {
              ...current,
              assets: current.assets.filter((asset) => !deletedAssetIds.has(asset.id)),
              assetSlices: current.assetSlices.filter(
                (slice) => !deletedAssetIds.has(slice.assetId),
              ),
              assetProcessingEvents: current.assetProcessingEvents.filter(
                (event) => !deletedAssetIds.has(event.assetId),
              ),
              assetProcessingJobs: current.assetProcessingJobs.filter(
                (job) => !deletedAssetIds.has(job.assetId),
              ),
              referenceVideos: current.referenceVideos.filter(
                (reference) => !deletedReferenceIds.has(reference.id),
              ),
              viralTemplates: current.viralTemplates.filter(
                (template) => !deletedTemplateIds.has(template.templateId),
              ),
              scenes: current.scenes.map((scene) =>
                scene.assetId && deletedAssetIds.has(scene.assetId)
                  ? { ...scene, assetId: undefined }
                  : scene,
              ),
              scripts: current.scripts.map((currentScript) => ({
                ...currentScript,
                scenes: currentScript.scenes.map((scene) =>
                  scene.assetId && deletedAssetIds.has(scene.assetId)
                    ? { ...scene, assetId: undefined }
                    : scene,
                ),
              })),
            }
          : current,
      );
      setScript((current) =>
        current
          ? {
              ...current,
              scenes: current.scenes.map((scene) =>
                scene.assetId && deletedAssetIds.has(scene.assetId)
                  ? { ...scene, assetId: undefined }
                  : scene,
              ),
            }
          : current,
      );
      setAssetPrepSnapshot((current) =>
        pruneAssetPrepSnapshotDeletedAssets(current, deletedAssetIds),
      );
      setAssetSearchResults((current) =>
        current.filter((result) => !deletedAssetIds.has(result.asset.id)),
      );
      setViralTemplateLibrary((current) =>
        current.filter((template) => !deletedTemplateIds.has(template.templateId)),
      );
      setSelectedReferenceIdForScript((current) =>
        current && deletedReferenceIds.has(current) ? undefined : current,
      );
      setSelectedTemplateIdForScript((current) =>
        current && deletedTemplateIds.has(current) ? undefined : current,
      );
      if (
        (selectedReferenceIdForScript && deletedReferenceIds.has(selectedReferenceIdForScript)) ||
        (selectedTemplateIdForScript && deletedTemplateIds.has(selectedTemplateIdForScript))
      ) {
        setScriptProductionMode("automatic");
      }
    });
  };

  const handleDeleteReference = (referenceId: string) => {
    handleDeleteReferences([referenceId]);
  };

  const handleRewriteScript = () => {
    if (!project) {
      setErrors((current) => ({ ...current, script: "Create or load a project first." }));
      return;
    }

    void runAction("script", "script", async () => {
      const rewritten = await rewriteScript(project.id, createScriptGenerationRequest());
      setFallbackProvider(rewritten.fallback.used ? rewritten.fallback.provider : undefined);
      setScriptDraft(rewritten.scriptText);
    });
  };

  const handleSaveProjectScript = () => {
    if (!project) {
      setErrors((current) => ({ ...current, script: "Create or load a project first." }));
      return;
    }
    if (!scriptDraft.trim()) {
      setErrors((current) => ({
        ...current,
        script:
          language === "zh"
            ? "\u8bf7\u5148\u8f93\u5165\u6216\u751f\u6210\u811a\u672c\u5185\u5bb9\u3002"
            : "Enter or generate script content first.",
      }));
      return;
    }

    void runAction("script", "script", async () => {
      const saved = await saveScript(project.id, createScriptGenerationRequest());
      setFallbackProvider(undefined);
      setDashboard(undefined);
      setScript(saved.script);
      setScriptDraft(saved.script.narrative);
      setSelectedSceneId(saved.script.scenes[0]?.id);
      setDirtySceneIds(new Set());
      setAssetRecallCandidates([]);
      setProject((current) =>
        current
          ? {
              ...current,
              scenes: saved.script.scenes,
              scripts: [...current.scripts, saved.script],
              status: "ready",
            }
          : current,
      );
      setIsProjectScriptComposerOpen(false);
      setProjectDetailTab("scripts");
      refreshProjectHistory();
    });
  };

  const handleGenerateScript = (nextPage?: WorkspacePageId) => {
    if (!project) {
      setErrors((current) => ({ ...current, script: "Create or load a project first." }));
      return;
    }

    void runAction("script", "script", async () => {
      const generated = await generateScript(project.id, createScriptGenerationRequest());
      setFallbackProvider(generated.fallback.used ? generated.fallback.provider : undefined);
      setDashboard(undefined);
      setScript(generated.script);
      setScriptDraft(generated.script.narrative);
      setSelectedSceneId(generated.script.scenes[0]?.id);
      setDirtySceneIds(new Set());
      setAssetRecallCandidates([]);
      setProject((current) =>
        current
          ? {
              ...current,
              scenes: generated.script.scenes,
              scripts: [...current.scripts, generated.script],
              status: "ready",
            }
          : current,
      );
      setIsProjectScriptComposerOpen(false);
      setProjectDetailTab((current) => (current === "scripts" ? "scripts" : current));
      if (nextPage) {
        handlePageChange(nextPage);
      }
    });
  };

  const handleSceneChange = (updatedScene: StoryboardScene) => {
    replaceSceneInState(updatedScene);
    setDirtySceneIds((current) => new Set(current).add(updatedScene.id));
  };

  const handleSelectedSceneChange = (sceneId: string) => {
    setSelectedSceneId(sceneId);
    setEditingSuggestions([]);
    setAssetRecallCandidates([]);
  };

  const handleSceneSave = (sceneId: string) => {
    const scene = scenes.find((candidate) => candidate.id === sceneId);
    if (!scene) {
      return;
    }

    void runAction("studio", "scene", async () => {
      const savedScene = await updateScene(sceneId, {
        durationSeconds: scene.durationSeconds,
        subtitle: scene.subtitle,
        voiceover: scene.voiceover,
        visualPrompt: scene.visualPrompt,
        assetId: scene.assetId ?? null,
        status: "edited",
      });
      replaceSceneInState(savedScene);
      setDirtySceneIds((current) => {
        const next = new Set(current);
        next.delete(sceneId);
        return next;
      });
    });
  };

  const handleRecallAsset = (assetId: string) => {
    const scene = scenes.find((candidate) => candidate.id === selectedSceneId);
    if (!scene) {
      return;
    }

    handleSceneChange({
      ...scene,
      assetId,
      status: "edited",
    });
    handlePageChange("studio");
  };

  const handleSceneMove = (sceneId: string, direction: "earlier" | "later") => {
    if (!project) {
      return;
    }

    const currentIndex = scenes.findIndex((scene) => scene.id === sceneId);
    const targetIndex = direction === "earlier" ? currentIndex - 1 : currentIndex + 1;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= scenes.length) {
      return;
    }

    const sceneIds = scenes.map((scene) => scene.id);
    const currentSceneId = sceneIds[currentIndex];
    const targetSceneId = sceneIds[targetIndex];
    if (!currentSceneId || !targetSceneId) {
      return;
    }
    sceneIds[currentIndex] = targetSceneId;
    sceneIds[targetIndex] = currentSceneId;

    void runAction("studio", "scene", async () => {
      const reordered = await reorderScenes(project.id, sceneIds);
      replaceScenesInState(reordered);
      setDirtySceneIds(new Set());
    });
  };

  const handleDeleteScene = (sceneId: string) => {
    void runAction("studio", "scene", async () => {
      const updatedScenes = await deleteScene(sceneId);
      replaceScenesInState(updatedScenes);
      setSelectedSceneId(updatedScenes[0]?.id);
      setDirtySceneIds(new Set());
      setEditingSuggestions([]);
      setAssetRecallCandidates([]);
    });
  };

  const handleRegenerateScene = (scene: StoryboardScene) => {
    void runAction("studio", "scene", async () => {
      const regenerated = await regenerateScene(scene.id, {
        scene: {
          durationSeconds: scene.durationSeconds,
          subtitle: scene.subtitle,
          voiceover: scene.voiceover,
          visualPrompt: scene.visualPrompt,
          assetId: scene.assetId ?? null,
        },
        apiConfig,
      });
      replaceSceneInState(regenerated.scene);
      setTraceEvents((current) => [...current, regenerated.traceEvent]);
      setDirtySceneIds((current) => {
        const next = new Set(current);
        next.delete(scene.id);
        return next;
      });
      setEditingSuggestions([]);
      setAssetRecallCandidates([]);
    });
  };

  const handleLoadAssetCandidates = (sceneId: string) => {
    void runAction("studio", "scene", async () => {
      const recall = await recallSceneAssets(sceneId);
      setAssetRecallCandidates(recall.candidates);
    });
  };

  const handleApplyAssetCandidate = (assetId: string) => {
    handleRecallAsset(assetId);
  };

  const handleLoadSuggestions = (sceneId: string) => {
    void runAction("studio", "scene", async () => {
      setEditingSuggestions(await loadSceneSuggestions(sceneId));
    });
  };

  const handleApplySuggestion = (suggestionId: string) => {
    if (!selectedSceneId) {
      return;
    }

    void runAction("studio", "scene", async () => {
      const applied = await applySceneSuggestion(selectedSceneId, suggestionId);
      replaceSceneInState(applied.scene);
      setTraceEvents((current) => [...current, applied.traceEvent]);
      setEditingSuggestions((current) =>
        current.filter((suggestion) => suggestion.id !== suggestionId),
      );
    });
  };

  const handleDismissSuggestion = (suggestionId: string) => {
    setEditingSuggestions((current) =>
      current.filter((suggestion) => suggestion.id !== suggestionId),
    );
  };

  const handleStartRender = () => {
    if (!project) {
      setErrors((current) => ({ ...current, render: "Create or load a project first." }));
      return;
    }
    if (!validateSeedanceSceneDurations()) {
      return;
    }

    void runAction("render", "render", async () => {
      await persistDirtyScenesForRender();
      const render = await startRender(project.id, {
        mediaSettings,
        videoSettings,
        simulateFailure: forceRenderFailure,
      });
      setDashboard(undefined);
      setExportResult(undefined);
      setRenderTask(render.renderTask);
      setTraceEvents(render.traceEvents);
      setProject((current) =>
        current
          ? {
              ...current,
              renderTasks: [...current.renderTasks, render.renderTask],
              status: render.renderTask.status === "completed" ? "completed" : "rendering",
            }
          : current,
      );
    });
  };

  const handleRetryRender = () => {
    if (!renderTask) {
      return;
    }
    if (!validateSeedanceSceneDurations()) {
      return;
    }

    void runAction("render", "render", async () => {
      await persistDirtyScenesForRender();
      const render = await retryRenderTask(renderTask.id, {
        mediaSettings,
        videoSettings,
        simulateFailure: false,
      });
      setDashboard(undefined);
      setExportResult(undefined);
      setForceRenderFailure(false);
      setRenderTask(render.renderTask);
      setTraceEvents(render.traceEvents);
      setProject((current) =>
        current
          ? {
              ...current,
              renderTasks: [...current.renderTasks, render.renderTask],
              status: render.renderTask.status === "completed" ? "completed" : "rendering",
            }
          : current,
      );
    });
  };

  const handleRefreshRender = () => {
    if (!renderTask) {
      return;
    }
    void runAction("render", "render", async () => {
      const render = await loadRenderTask(renderTask.id);
      setRenderTask(render.renderTask);
      setTraceEvents(render.traceEvents);
    });
  };

  const createSmartEditRequest = () => {
    const renderedSceneSegments =
      !smartEditResult && renderTask?.status === "completed" && renderTask.sceneClips
        ? renderTask.sceneClips
            .filter((clip) => clip.videoUrl)
            .map((clip) => {
              const scene = scenes.find((candidate) => candidate.id === clip.sceneId);
              return {
                sceneId: clip.sceneId,
                durationSeconds: scene?.durationSeconds ?? 4,
                enabled: true,
                playbackRate: 1,
                source: {
                  kind: "generated-scene-clip" as const,
                  sceneClipAudioUrl: clip.material?.audioUrl,
                  sceneClipUrl: clip.videoUrl,
                  sceneClipVideoOnlyUrl: clip.material?.videoOnlyUrl,
                },
                subtitle: clip.material?.text || clip.subtitle,
                transition: clip.order === 1 ? ("cut" as const) : ("fade" as const),
                voiceover: scene?.voiceover || clip.subtitle,
              };
            })
        : [];
    return {
      apiConfig,
      instructions: smartEditInstructions || undefined,
      locale: language === "zh" ? "zh-CN" : "en-US",
      mediaSettings,
      segments:
        smartEditResult?.plan.segments.map((segment) => ({
        sceneId: segment.sceneId,
        durationSeconds: segment.durationSeconds,
        enabled: segment.enabled,
        playbackRate: segment.playbackRate,
        source: segment.source,
        subtitle: segment.subtitle,
        transition: segment.transition,
        voiceover: segment.voiceover,
        })) ?? renderedSceneSegments,
      targetLanguage: smartEditTargetLanguage.trim() || undefined,
      videoSettings,
    };
  };

  const applySmartEditRenderSnapshot = (render: RenderSnapshot) => {
    setExportResult(undefined);
    setRenderTask(render.renderTask);
    setTraceEvents(render.traceEvents);
    const completedSmartEdit = smartEditResultFromRenderSnapshot(render);
    if (completedSmartEdit) {
      setSmartEditResult(completedSmartEdit);
      setSelectedSmartEditSegmentId(completedSmartEdit.plan.segments[0]?.id);
    }
    setProject((current) =>
      current
        ? {
            ...current,
            renderTasks: [
              ...current.renderTasks.filter((task) => task.id !== render.renderTask.id),
              render.renderTask,
            ],
            status: render.renderTask.status === "completed" ? "completed" : "rendering",
          }
        : current,
    );
  };

  const handleSmartEditPlanChange = (plan: SmartEditPlan) => {
    setSmartEditResult((current) =>
      current
        ? {
            ...current,
            plan,
          }
        : current,
    );
  };

  const handleStartSmartEdit = () => {
    if (!project) {
      setErrors((current) => ({ ...current, smartEdit: "Create or load a project first." }));
      return;
    }
    if (scenes.length === 0) {
      setErrors((current) => ({ ...current, smartEdit: "Generate a storyboard first." }));
      return;
    }

    void runAction("smartEdit", "smart-edit", async () => {
      await persistDirtyScenesForRender();
      setSmartEditResult(undefined);
      setSelectedSmartEditSegmentId(undefined);
      const render = await startSmartEdit(project.id, createSmartEditRequest());
      applySmartEditRenderSnapshot(render);
    });
  };

  const handleRefreshSmartEditSegment = () => {
    if (!project || !smartEditResult) {
      setErrors((current) => ({ ...current, smartEdit: "Run smart edit before refreshing a segment." }));
      return;
    }
    const selectedSegment =
      smartEditResult.plan.segments.find((segment) => segment.id === selectedSmartEditSegmentId) ??
      smartEditResult.plan.segments[0];
    if (!selectedSegment) {
      return;
    }

    void runAction("smartEdit", "smart-edit", async () => {
      const render = await refreshSmartEditSegment(project.id, selectedSegment.sceneId, {
        apiConfig,
        currentPlan: smartEditResult.plan,
        instructions: smartEditInstructions || undefined,
        locale: language === "zh" ? "zh-CN" : "en-US",
        mediaSettings,
        segment: {
          sceneId: selectedSegment.sceneId,
          durationSeconds: selectedSegment.durationSeconds,
          enabled: selectedSegment.enabled,
          playbackRate: selectedSegment.playbackRate,
          source: selectedSegment.source,
          subtitle: selectedSegment.subtitle,
          transition: selectedSegment.transition,
          voiceover: selectedSegment.voiceover,
        },
        segmentOutputs: smartEditResult.segmentOutputs,
        targetLanguage: smartEditTargetLanguage.trim() || undefined,
        videoSettings,
      });
      applySmartEditRenderSnapshot(render);
    });
  };

  const handleExport = () => {
    if (!project) {
      return;
    }
    void runAction("export", "export", async () => {
      const exported = await exportProject(project.id);
      setExportResult(exported);
      setRenderTask((current) =>
        current
          ? {
              ...current,
              exportUrl: exported.exportUrl,
              previewUrl: exported.exportUrl,
            }
          : current,
      );
      setProject((current) =>
        current
          ? {
              ...current,
              renderTasks: current.renderTasks.map((task) =>
                task.id === renderTask?.id
                  ? {
                      ...task,
                      exportUrl: exported.exportUrl,
                      previewUrl: exported.exportUrl,
                    }
                  : task,
              ),
              status: "completed",
            }
          : current,
      );
    });
  };

  const handleLoadDashboard = () => {
    if (!project) {
      setErrors((current) => ({ ...current, dashboard: "Create or load a project first." }));
      return;
    }

    void runAction("dashboard", "dashboard", async () => {
      setDashboard(await loadDashboard(project.id));
    });
  };

  const projectStudioFlowItems: Array<{
    id: ProjectStudioFlow;
    label: string;
    description: string;
    icon: typeof FileText;
  }> = [
    {
      id: "script",
      label: language === "zh" ? "\u9009\u62e9\u5267\u672c\u751f\u6210\u5206\u955c" : "Select script for storyboard",
      description:
        language === "zh"
          ? "\u4ece\u672c\u9879\u76ee\u5267\u672c\u5e93\u9009\u62e9\u4e00\u4e2a\u5267\u672c\uff0c\u8f7d\u5165\u5bf9\u5e94\u5206\u955c\u3002"
          : "Choose a project script and load its storyboard scenes.",
      icon: FileText,
    },
    {
      id: "storyboard",
      label: language === "zh" ? "\u5206\u955c\u91cd\u7f16\u8f91" : "Storyboard re-editing",
      description:
        language === "zh"
          ? "\u8c03\u6574\u753b\u9762\u3001\u955c\u5934\u3001\u7d20\u6750\u5339\u914d\u548c\u5206\u955c\u987a\u5e8f\u3002"
          : "Refine shots, asset matches, and scene order.",
      icon: ListVideo,
    },
    {
      id: "render",
      label: language === "zh" ? "\u89c6\u9891\u751f\u6210\u9884\u89c8\u4e0e\u4e0b\u8f7d" : "Video preview and download",
      description:
        language === "zh"
          ? "\u751f\u6210\u89c6\u9891\u9884\u89c8\uff0c\u68c0\u67e5\u7ed3\u679c\u540e\u5bfc\u51fa\u4e0b\u8f7d\u3002"
          : "Render a preview, inspect the result, and export it.",
      icon: Film,
    },
    {
      id: "edit",
      label: language === "zh" ? "\u667a\u80fd\u526a\u8f91" : "Smart edit",
      description:
        language === "zh"
          ? "\u57fa\u4e8e\u5206\u955c\u548c\u7d20\u6750\u8fdb\u884c\u667a\u80fd\u526a\u8f91\u4f18\u5316\u3002"
          : "Use storyboard and assets for smart editing.",
      icon: Scissors,
    },
  ];
  const projectScriptStudioFlow = projectStudioFlowItems[0]!;
  const projectStudioPreviewScript = project?.scripts.find(
    (candidate) => candidate.id === projectStudioPreviewScriptId,
  );

  return (
    <AppShell
      activePage={activePage}
      activeSection={activeSection}
      copy={text}
      language={language}
      onPageChange={handlePageChange}
      onSectionChange={handleSectionChange}
      projectStudioMode={isProjectStudioMode}
    >
      <div className={`workspace-grid workspace-page page-${activePage}`}>
        {activePage === "assets" ? (
          <section className="asset-workspace" aria-label={text.assets.title}>
            <AssetsPanel
              activeCategory={activeAssetCategory}
              assetDraft={assetDraft}
              assets={activeAssets}
              copy={text.assets}
              disabled={busyState !== "idle"}
              error={errors.asset}
              hasProject={Boolean(project)}
              hasSearched={hasAssetSearchRun}
              isLoading={busyState === "asset"}
              isSearching={busyState === "search"}
              language={language}
              onAssetDraftChange={setAssetDraft}
              onCategoryChange={handleAssetCategoryChange}
              onImportExternalAsset={handleImportExternalAsset}
              onImportFiles={handleImportFiles}
              onDeleteAssets={handleDeleteAssets}
              onExtractTemplateFromScripts={handleExtractTemplateFromScripts}
              onProcessAsset={handleProcessAsset}
              onRecallAsset={selectedSceneId ? handleRecallAsset : undefined}
              onSearchExternalAssets={handleSearchExternalAssets}
              onSearchAssets={handleSearchAssets}
              onSearchQueryChange={setAssetSearchQuery}
              onUploadAsset={handleUploadAsset}
              searchQuery={assetSearchQuery}
              stockProviderConfigs={stockProviderConfigs}
              externalSearchResults={activeExternalAssetSearchResults}
              searchResults={activeAssetSearchResults}
              templates={scriptTemplateLibrary}
            />
          </section>
        ) : null}

        {activePage === "inspiration" ? (
          <section className="inspiration-reference-workspace" aria-label="Inspiration workspace">
            <ReferenceLibraryPanel
              disabled={busyState !== "idle"}
              error={errors.script}
              isLoading={busyState === "reference"}
              language={language}
              onAnalyzeReference={handleAnalyzeReference}
              onCreateTemplate={handleCreateReferenceTemplate}
              onDeleteReference={handleDeleteReference}
              onDeleteReferences={handleDeleteReferences}
              onUseReference={handleUseReferenceForScript}
              references={scriptReferenceLibrary}
              selectedReferenceId={selectedReferenceIdForScript}
              sourceAssets={studioAssets.filter(
                (asset) =>
                  (asset.type === "video" || asset.mimeType?.startsWith("video/")) &&
                  asset.source !== "public_reference",
              )}
              templates={scriptTemplateLibrary}
            />
          </section>
        ) : null}

        {activePage === "settings" ? (
          <SettingsPanel
            apiConfig={apiConfig}
            language={language}
            onApiConfigChange={handleApiConfigChange}
            onLanguageChange={handleLanguageChange}
            onStockProviderConfigsChange={handleStockProviderConfigsChange}
            stockProviderConfigs={stockProviderConfigs}
          />
        ) : null}

        {isCreationPage(activePage) ? (
          <section className={`creation-shell creation-shell-${activePage}`}>
            <div className="creation-main">
              {activePage === "project" ? (
                <ProjectWorkspace
                  activeTab={projectDetailTab}
                  dashboardPanel={
                    <DashboardPanel
                      copy={text.dashboard}
                      dashboard={dashboard ?? (project ? createProjectMockDashboard(project) : undefined)}
                      disabled={!project || busyState !== "idle"}
                      error={errors.dashboard}
                      isLoading={busyState === "dashboard"}
                      onLoadDashboard={handleLoadDashboard}
                      showLoadButton={false}
                    />
                  }
                  disabled={busyState !== "idle"}
                  error={errors.project}
                  isHistoryLoading={isProjectHistoryLoading}
                  language={language}
                  materialsPanel={
                    <AssetPrepPanel
                      disabled={busyState !== "idle"}
                      embedded
                      error={errors.asset}
                      isGenerating={busyState === "script"}
                      isImporting={busyState === "asset"}
                      initialSnapshot={assetPrepSnapshot}
                      key={`${project?.id ?? "projectless"}-detail-asset-prep`}
                      language={language}
                      libraryAssets={creationUsableAssets}
                      onBack={() => setProjectDetailTab("overview")}
                      onGenerateStoryboard={handleContinueToScript}
                      onImportFiles={handleImportFiles}
                      onPreparationChange={handleAssetPrepChange}
                      onRemovePreparedAsset={handleRemoveProjectMaterial}
                      preparedLibraryAssetsByBucket={preparedProjectAssetsByBucket}
                    />
                  }
                  onAddScript={handleAddProjectScript}
                  onBackToProjects={handleBackToProjectList}
                  onCloseScriptComposer={() => setIsProjectScriptComposerOpen(false)}
                  onCreateProject={handleCreateProject}
                  onDeleteRenderTask={handleDeleteProjectRenderTask}
                  onDeleteScript={handleDeleteProjectScript}
                  onGenerateVideo={handleGenerateProjectVideo}
                  onLoadProject={handleLoadProjectFromHistory}
                  onRenameRenderTask={handleRenameProjectRenderTask}
                  onRenameScript={handleRenameProjectScript}
                  onTabChange={setProjectDetailTab}
                  onUpdateProjectBrief={handleUpdateProjectBrief}
                  project={project}
                  projectHistory={projectHistory}
                  showScriptComposer={isProjectScriptComposerOpen}
                  scriptPanel={
                    <ScriptPanel
                      copy={text.script}
                      disabled={busyState !== "idle"}
                      error={errors.script}
                      fallbackProvider={fallbackProvider}
                      confirmActionLabel={language === "zh" ? "\u786e\u8ba4\u6dfb\u52a0" : "Confirm add"}
                      isLoading={busyState === "script"}
                      isStoryboardGenerating={busyState === "script"}
                      onConfirmScript={handleSaveProjectScript}
                      onGenerateScript={handleRewriteScript}
                      onGenerateStoryboard={() => handleGenerateScript("studio")}
                      onProductionModeChange={handleScriptProductionModeChange}
                      onReferenceChange={setSelectedReferenceIdForScript}
                      onScriptDraftChange={setScriptDraft}
                      onTemplateChange={setSelectedTemplateIdForScript}
                      productionMode={scriptProductionMode}
                      referenceScriptAssets={scriptReferenceAssets}
                      script={script}
                      scriptDraft={scriptDraft}
                      selectedReferenceId={selectedReferenceIdForScript}
                      selectedTemplateId={selectedTemplateIdForScript}
                      showStoryboardAction={false}
                      templates={scriptTemplateLibrary}
                    />
                  }
                />
              ) : null}

              {(activePage === "studio" || activePage === "delivery" || activePage === "edit") &&
              project ? (
                <div className={`studio-return-bar ${isProjectStudioMode ? "is-project-studio" : ""}`}>
                  <div className="studio-return-copy">
                    <strong>{language === "zh" ? "\u5de5\u4f5c\u5ba4" : "Studio"}</strong>
                    <span>
                      {language === "zh"
                        ? "\u6309\u9879\u76ee\u77ed\u89c6\u9891\u6d41\u7a0b\u5b8c\u6210\u5206\u955c\u3001\u9884\u89c8\u751f\u6210\u548c\u667a\u80fd\u526a\u8f91\uff0c\u4fdd\u5b58\u540e\u8fd4\u56de\u89c6\u9891\u5e93\u3002"
                        : "Move through the project video flow, then save back to the video library."}
                    </span>
                  </div>
                  {isProjectStudioMode ? (
                    <nav
                      className="project-studio-flow"
                      aria-label={language === "zh" ? "\u9879\u76ee\u89c6\u9891\u6d41\u7a0b" : "Project video flow"}
                    >
                      {projectStudioFlowItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = projectStudioFlow === item.id;
                        return (
                          <button
                            className={`project-studio-flow-item ${isActive ? "active" : ""}`}
                            key={item.id}
                            onClick={() => handleProjectStudioFlowChange(item.id)}
                            type="button"
                          >
                            <span className="project-studio-flow-icon">
                              <Icon size={18} aria-hidden="true" />
                            </span>
                            <span>
                              <strong>{item.label}</strong>
                              <small>{item.description}</small>
                            </span>
                          </button>
                        );
                      })}
                    </nav>
                  ) : null}
                  <Button
                    disabled={busyState !== "idle" || isSmartEditTaskRunning}
                    icon={<Download size={18} />}
                    onClick={handleSaveVideoAndReturn}
                    variant="primary"
                  >
                    {language === "zh" ? "\u4fdd\u5b58\u89c6\u9891\u5e76\u8fd4\u56de" : "Save video and return"}
                  </Button>
                </div>
              ) : null}

              {activePage === "create" ? (
                <>
                  <AssetPrepPanel
                    disabled={busyState !== "idle"}
                    error={errors.asset}
                    isGenerating={busyState === "script"}
                    isImporting={busyState === "asset"}
                    initialSnapshot={assetPrepSnapshot}
                    key={project?.id ?? "projectless-asset-prep"}
                    language={language}
                    libraryAssets={creationUsableAssets}
                    onBack={() => handlePageChange("project")}
                    onGenerateStoryboard={handleContinueToScript}
                    onImportFiles={handleImportFiles}
                    onPreparationChange={handleAssetPrepChange}
                    preparedLibraryAssetsByBucket={preparedProjectAssetsByBucket}
                  />
                  <ScriptPanel
                    copy={text.script}
                    disabled={busyState !== "idle"}
                    error={errors.script}
                    fallbackProvider={fallbackProvider}
                    isLoading={busyState === "script"}
                    isStoryboardGenerating={busyState === "script"}
                    onGenerateScript={handleRewriteScript}
                    onGenerateStoryboard={() => handleGenerateScript("studio")}
                    onProductionModeChange={handleScriptProductionModeChange}
                    onReferenceChange={setSelectedReferenceIdForScript}
                    onScriptDraftChange={setScriptDraft}
                    onTemplateChange={setSelectedTemplateIdForScript}
                    productionMode={scriptProductionMode}
                    referenceScriptAssets={scriptReferenceAssets}
                    script={script}
                    scriptDraft={scriptDraft}
                    selectedReferenceId={selectedReferenceIdForScript}
                    selectedTemplateId={selectedTemplateIdForScript}
                    templates={scriptTemplateLibrary}
                  />
                </>
              ) : null}

              {activePage === "studio" ? (
                isProjectStudioMode && projectStudioFlow === "script" && project ? (
                  <section className="project-script-selector-panel" aria-label={projectScriptStudioFlow.label}>
                    <div className="project-script-selector-heading">
                      <div>
                        <span>{language === "zh" ? "\u7b2c\u4e00\u6b65" : "Step 1"}</span>
                        <h3>{projectScriptStudioFlow.label}</h3>
                        <p>
                          {language === "zh"
                            ? "\u70b9\u51fb\u5267\u672c\u5361\u7247\u53ef\u9884\u89c8\u8be6\u60c5\uff0c\u70b9\u51fb\u751f\u6210\u5206\u955c\u540e\u4f1a\u8c03\u7528\u56fe\u7247\u751f\u6210\u6a21\u578b\u91cd\u65b0\u751f\u6210\u5206\u955c\u5e76\u8fdb\u5165\u91cd\u7f16\u8f91\u6d41\u7a0b\u3002"
                            : "Click a script card to preview it, or generate a fresh AI storyboard before continuing to storyboard editing."}
                        </p>
                      </div>
                      <Button
                        onClick={() => {
                          setProjectDetailTab("scripts");
                          handlePageChange("project");
                        }}
                        variant="secondary"
                      >
                        {language === "zh" ? "\u8fd4\u56de\u5267\u672c\u5e93" : "Back to script library"}
                      </Button>
                    </div>
                    {project.scripts.length > 0 ? (
                      <div className="project-studio-script-grid">
                        {project.scripts.map((projectScript, index) => (
                          <article
                            aria-label={
                              language === "zh"
                                ? `\u9884\u89c8\u5267\u672c ${index + 1}: ${projectScript.hook}`
                                : `Preview script ${index + 1}: ${projectScript.hook}`
                            }
                            className={`project-studio-script-card ${
                              projectStudioPreviewScriptId === projectScript.id ? "active" : ""
                            }`.trim()}
                            key={projectScript.id}
                            onClick={() => setProjectStudioPreviewScriptId(projectScript.id)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                setProjectStudioPreviewScriptId(projectScript.id);
                              }
                            }}
                            role="button"
                            tabIndex={0}
                          >
                            <div>
                              <span>
                                {language === "zh"
                                  ? `\u5267\u672c ${index + 1}`
                                  : `Script ${index + 1}`}
                              </span>
                              <h4>{projectScript.hook}</h4>
                              <p>{projectScript.scenes.length} {language === "zh" ? "\u4e2a\u5206\u955c" : "scenes"}</p>
                            </div>
                            <Button
                              disabled={busyState !== "idle"}
                              icon={<ListVideo size={18} />}
                              onClick={(event) => {
                                event.stopPropagation();
                                handleSelectProjectScriptForStudio(projectScript);
                              }}
                              variant="primary"
                            >
                              {language === "zh" ? "\u751f\u6210\u5206\u955c" : "Generate storyboard"}
                            </Button>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <div className="project-studio-empty">
                        <strong>{language === "zh" ? "\u6682\u65e0\u53ef\u7528\u5267\u672c" : "No scripts yet"}</strong>
                        <p>
                          {language === "zh"
                            ? "\u8bf7\u5148\u56de\u5230\u9879\u76ee\u5267\u672c\u5e93\u6dfb\u52a0\u5267\u672c\uff0c\u518d\u8fdb\u5165\u5de5\u4f5c\u5ba4\u751f\u6210\u89c6\u9891\u3002"
                            : "Add a script in the project script library before generating a video."}
                        </p>
                      </div>
                    )}
                  </section>
                ) : (
                  <section className="script-storyboard-workspace">
                    <StudioWorkspace
                      assetCandidates={assetRecallCandidates}
                      assets={studioAssets}
                      copy={text.studio}
                      dirtySceneIds={dirtySceneIds}
                      isBusy={busyState === "scene"}
                      onApplyAssetCandidate={handleApplyAssetCandidate}
                      onApplySuggestion={handleApplySuggestion}
                      onDeleteScene={handleDeleteScene}
                      onDismissSuggestion={handleDismissSuggestion}
                      onLoadAssetCandidates={handleLoadAssetCandidates}
                      onLoadSuggestions={handleLoadSuggestions}
                      onRegenerateScene={handleRegenerateScene}
                      onSceneChange={handleSceneChange}
                      onSceneMove={handleSceneMove}
                      onSceneSave={handleSceneSave}
                      onSelectedSceneChange={handleSelectedSceneChange}
                      scenes={scenes}
                      selectedSceneId={selectedSceneId}
                      suggestions={editingSuggestions}
                    />
                  </section>
                )
              ) : null}

              {activePage === "delivery" ? (
                <RenderPanel
                  copy={text.render}
                  disabled={
                    !project || scenes.length === 0 || busyState !== "idle" || isSmartEditTaskRunning
                  }
                  error={errors.render ?? errors.export}
                  exportResult={exportResult}
                  forceRenderFailure={forceRenderFailure}
                  isExporting={busyState === "export"}
                  isRendering={busyState === "render"}
                  mediaSettings={mediaSettings}
                  videoSettings={videoSettings}
                  onForceFailureChange={setForceRenderFailure}
                  onExport={handleExport}
                  onMediaSettingsChange={setMediaSettings}
                  onVideoSettingsChange={setVideoSettings}
                  onRefreshRender={handleRefreshRender}
                  onRetryRender={handleRetryRender}
                  onStartRender={handleStartRender}
                  renderTask={renderTask}
                  traceEvents={traceEvents}
                />
              ) : null}

              {activePage === "edit" ? (
                <SmartEditPanel
                  assets={studioAssets}
                  assetSlices={smartEditAssetSlices}
                  copy={text.smartEdit}
                  disabled={!project || scenes.length === 0 || busyState !== "idle"}
                  error={errors.smartEdit}
                  instructions={smartEditInstructions}
                  isEditing={(busyState === "smart-edit" || isSmartEditTaskRunning) && !smartEditResult}
                  isRefreshing={
                    (busyState === "smart-edit" || isSmartEditTaskRunning) && Boolean(smartEditResult)
                  }
                  mediaSettings={mediaSettings}
                  renderTask={renderTask}
                  result={smartEditResult}
                  selectedSegmentId={selectedSmartEditSegmentId}
                  targetLanguage={smartEditTargetLanguage}
                  traceEvents={traceEvents}
                  onInstructionsChange={setSmartEditInstructions}
                  onMediaSettingsChange={setMediaSettings}
                  onPlanChange={handleSmartEditPlanChange}
                  onRefreshSegment={handleRefreshSmartEditSegment}
                  onSelectedSegmentChange={setSelectedSmartEditSegmentId}
                  onStartSmartEdit={handleStartSmartEdit}
                  onTargetLanguageChange={setSmartEditTargetLanguage}
                />
              ) : null}

              {activePage === "dashboard" ? (
                <DashboardPanel
                  copy={text.dashboard}
                  dashboard={dashboard}
                  disabled={!project || busyState !== "idle"}
                  error={errors.dashboard}
                  isLoading={busyState === "dashboard"}
                  onLoadDashboard={handleLoadDashboard}
                />
              ) : null}
            </div>
          </section>
        ) : null}
      </div>
      {projectStudioPreviewScript ? (
        <ProjectModal
          title={language === "zh" ? "\u5267\u672c\u9884\u89c8" : "Script preview"}
          onClose={() => setProjectStudioPreviewScriptId(undefined)}
        >
          <ScriptDetail script={projectStudioPreviewScript} />
        </ProjectModal>
      ) : null}
    </AppShell>
  );
};
