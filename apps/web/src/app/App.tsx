import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
} from "@shopclip/shared";

import {
  AppShell,
  type CreationPageId,
  type WorkspaceSectionId,
  type WorkspacePageId,
} from "../components/layout/AppShell";
import {
  assetMatchesCategory,
  externalAssetMatchesCategory,
  getAssetDraftDefaults,
  type AssetCategory,
} from "../features/assets/AssetCategoryTabs";
import { AssetPrepPanel, type AssetPrepSnapshot } from "../features/assets/AssetPrepPanel";
import { AssetsPanel, hasSearchableStockProviderCredential } from "../features/assets/AssetsPanel";
import { DashboardPanel } from "../features/dashboard/DashboardPanel";
import { RenderPanel, defaultVideoSettings } from "../features/render/RenderPanel";
import { ReferenceLibraryPanel } from "../features/references/ReferenceLibraryPanel";
import { ProjectSetup } from "../features/projects/ProjectSetup";
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
  deleteProject as deleteProjectRequest,
  deleteReferenceVideo,
  deleteScene,
  extractTemplateFromScriptAssets,
  exportProject,
  generateScript,
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
  searchAssets,
  searchExternalStockAssets,
  startRender,
  updateProjectPrep,
  updateScene,
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

const creationPageIds: CreationPageId[] = ["project", "create", "studio", "delivery", "dashboard"];

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
  | "export"
  | "dashboard"
  | "reference";

type ScriptProductionMode = NonNullable<ScriptGenerationRequest["productionMode"]>;

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
}

export const App = ({ initialLanguage, initialPage }: AppProps) => {
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
  const [project, setProject] = useState<ProjectSnapshot>();
  const [projectHistory, setProjectHistory] = useState<ProjectSummary[]>([]);
  const [isProjectHistoryLoading, setIsProjectHistoryLoading] = useState(false);
  const [projectIdToLoad, setProjectIdToLoad] = useState("");
  const [referenceLibrary, setReferenceLibrary] = useState<ReferenceVideo[]>([]);
  const [renderTask, setRenderTask] = useState<RenderTask>();
  const [script, setScript] = useState<ScriptResult>();
  const [scriptDraft, setScriptDraft] = useState("");
  const [scriptProductionMode, setScriptProductionMode] =
    useState<ScriptProductionMode>("automatic");
  const [selectedReferenceIdForScript, setSelectedReferenceIdForScript] = useState<string>();
  const [selectedTemplateIdForScript, setSelectedTemplateIdForScript] = useState<string>();
  const [selectedSceneId, setSelectedSceneId] = useState<string>();
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
    setActivePage(page);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${page}`);
    }
  };

  const handleSectionChange = (section: WorkspaceSectionId) => {
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

  const handleCreateProject = () =>
    runAction("project", "project", async () => {
      const createdProject = await createProject(brief);
      setProject(createdProject);
      setScript(undefined);
      setScriptDraft("");
      setScriptProductionMode("automatic");
      setSelectedReferenceIdForScript(undefined);
      setSelectedTemplateIdForScript(undefined);
      setRenderTask(undefined);
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

  const clearCurrentWorkspace = () => {
    setProject(undefined);
    setBrief(defaultBrief);
    setScript(undefined);
    setScriptDraft("");
    setScriptProductionMode("automatic");
    setSelectedReferenceIdForScript(undefined);
    setSelectedTemplateIdForScript(undefined);
    setRenderTask(undefined);
    setTraceEvents([]);
    setDashboard(undefined);
    setExportResult(undefined);
    setFallbackProvider(undefined);
    setHasAssetSearchRun(false);
    setAssetSearchResults([]);
    setExternalAssetSearchResults([]);
    setEditingSuggestions([]);
    setAssetRecallCandidates([]);
    setAssetPrepSnapshot({ assetIds: [], keywords: [], materials: [] });
    setSelectedSceneId(undefined);
    setDirtySceneIds(new Set());
  };

  const applyLoadedProject = (loadedProject: ProjectSnapshot) => {
    const latestScript = loadedProject.scripts.at(-1);
    const latestRender = loadedProject.renderTasks.at(-1);
    setProject(loadedProject);
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

  const handleLoadProject = () =>
    runAction("project", "project", async () => {
      const loadedProject = await loadProject(projectIdToLoad.trim());
      applyLoadedProject(loadedProject);
    });

  const handleLoadProjectFromHistory = (projectId: string) =>
    runAction("project", "project", async () => {
      const loadedProject = await loadProject(projectId);
      setProjectIdToLoad(projectId);
      applyLoadedProject(loadedProject);
    });

  const handleDeleteProjectFromHistory = (projectId: string) => {
    const historyProject = projectHistory.find((candidate) => candidate.id === projectId);
    const projectTitle = historyProject?.title ?? projectId;
    if (
      typeof window !== "undefined" &&
      !window.confirm(text.project.deleteHistoryProjectConfirm(projectTitle))
    ) {
      return;
    }

    void runAction("project", "project", async () => {
      const response = await deleteProjectRequest(projectId);
      const deletedAssetIds = new Set(response.deletedAssets.map((asset) => asset.id));

      setProjectHistory((current) => current.filter((candidate) => candidate.id !== projectId));
      setAssetLibrary((current) => ({
        assets: current.assets.filter(
          (asset) => asset.projectId !== projectId && !deletedAssetIds.has(asset.id),
        ),
        assetSlices: current.assetSlices.filter((slice) => !deletedAssetIds.has(slice.assetId)),
      }));
      setAssetSearchResults((current) =>
        current.filter((result) => !deletedAssetIds.has(result.asset.id)),
      );
      setProjectIdToLoad((current) => (current === projectId ? "" : current));

      if (project?.id === projectId) {
        clearCurrentWorkspace();
      }

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
      setFallbackProvider(rewritten.fallback.provider);
      setScriptDraft(rewritten.scriptText);
    });
  };

  const handleGenerateScript = (nextPage?: WorkspacePageId) => {
    if (!project) {
      setErrors((current) => ({ ...current, script: "Create or load a project first." }));
      return;
    }

    void runAction("script", "script", async () => {
      const generated = await generateScript(project.id, createScriptGenerationRequest());
      setFallbackProvider(generated.fallback.provider);
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

    void runAction("render", "render", async () => {
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

    void runAction("render", "render", async () => {
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

  const handleExport = () => {
    if (!project) {
      return;
    }
    void runAction("export", "export", async () => {
      setExportResult(await exportProject(project.id));
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

  return (
    <AppShell
      activePage={activePage}
      activeSection={activeSection}
      copy={text}
      language={language}
      onPageChange={handlePageChange}
      onSectionChange={handleSectionChange}
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
                <ProjectSetup
                  brief={brief}
                  copy={text.project}
                  disabled={busyState !== "idle"}
                  error={errors.project}
                  isHistoryLoading={isProjectHistoryLoading}
                  isLoading={busyState === "project"}
                  onBriefChange={setBrief}
                  onCreateProject={handleCreateProject}
                  onDeleteProjectFromHistory={handleDeleteProjectFromHistory}
                  onLoadProject={handleLoadProject}
                  onLoadProjectFromHistory={handleLoadProjectFromHistory}
                  onProjectIdToLoadChange={setProjectIdToLoad}
                  project={project}
                  projectHistory={projectHistory}
                  projectIdToLoad={projectIdToLoad}
                />
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
              ) : null}

              {activePage === "delivery" ? (
                <RenderPanel
                  copy={text.render}
                  disabled={!project || scenes.length === 0 || busyState !== "idle"}
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
    </AppShell>
  );
};
