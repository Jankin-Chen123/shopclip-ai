import { useEffect, useMemo, useState } from "react";
import type {
  AssetMetadata,
  AssetSlice,
  DashboardResponse,
  ProjectBrief,
  RenderTask,
  ScriptResult,
  StoryboardScene,
  TraceEvent,
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
import { AssetPrepPanel } from "../features/assets/AssetPrepPanel";
import { AssetsPanel, hasSearchableStockProviderCredential } from "../features/assets/AssetsPanel";
import { DashboardPanel } from "../features/dashboard/DashboardPanel";
import { InspirationPanel } from "../features/inspiration/InspirationPanel";
import { RenderPanel } from "../features/render/RenderPanel";
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
  applySceneSuggestion,
  createProject,
  createAssetUploadIntent,
  deleteAssets as deleteAssetsRequest,
  deleteScene,
  exportProject,
  generateScript,
  importExternalAsset,
  loadDashboard,
  loadSceneSuggestions,
  loadProject,
  loadProjectAssets,
  loadRenderTask,
  regenerateScene,
  reorderScenes,
  retryRenderTask,
  searchAssets,
  searchExternalStockAssets,
  startRender,
  updateScene,
  uploadAssetFileToStorage,
  type AssetSearchResult,
  type CreateAssetInput,
  type EditingSuggestion,
  type ExportResult,
  type ExternalAssetResult,
  type ExternalAssetSearchResponse,
  type MediaSettings,
  type ProjectSnapshot,
  type StockProviderConfig,
  type UserApiConfig,
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

export const createAssetInputFromFile = (file: File, language: Language): CreateAssetInput => {
  const lowerName = file.name.toLowerCase();
  const inferredCategory: AssetCategory = file.type.startsWith("image/")
    ? "image"
    : file.type.startsWith("video/")
      ? "video"
      : file.type.startsWith("audio/")
        ? "audio"
        : file.type.startsWith("text/") || lowerName.endsWith(".txt") || lowerName.endsWith(".md")
          ? "script"
          : "script";
  const defaults = getAssetDraftDefaults(inferredCategory, language);
  const inferredMimeType =
    file.type ||
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
  | "dashboard";

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
  const [assetLibrary, setAssetLibrary] = useState<{
    assets: AssetMetadata[];
    assetSlices: AssetSlice[];
  }>({ assets: [], assetSlices: [] });
  const [mediaSettings, setMediaSettings] = useState<MediaSettings>(defaultMediaSettings);
  const [project, setProject] = useState<ProjectSnapshot>();
  const [projectIdToLoad, setProjectIdToLoad] = useState("");
  const [renderTask, setRenderTask] = useState<RenderTask>();
  const [script, setScript] = useState<ScriptResult>();
  const [selectedSceneId, setSelectedSceneId] = useState<string>();
  const [traceEvents, setTraceEvents] = useState<TraceEvent[]>([]);
  const text = copy[language];

  const scenes = useMemo(() => script?.scenes ?? project?.scenes ?? [], [project?.scenes, script]);
  const activeAssets = useMemo(
    () => assetLibrary.assets.filter((asset) => assetMatchesCategory(asset, activeAssetCategory)),
    [activeAssetCategory, assetLibrary.assets],
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
  const prepAssets = useMemo(() => {
    const seenAssetIds = new Set<string>();
    return [...(project?.assets ?? []), ...assetLibrary.assets].filter((asset) => {
      if (seenAssetIds.has(asset.id)) {
        return false;
      }
      seenAssetIds.add(asset.id);
      return true;
    });
  }, [assetLibrary.assets, project?.assets]);
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
    category: AssetCategory,
    assets: AssetMetadata[],
    assetSlices: AssetSlice[],
  ): { assets: AssetMetadata[]; assetSlices: AssetSlice[] } => {
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

  const refreshAssetLibrary = (category: AssetCategory) => {
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

  useEffect(() => {
    if (activePage === "assets") {
      refreshAssetLibrary(activeAssetCategory);
    }
  }, [activePage, activeAssetCategory]);

  const handleCreateProject = () =>
    runAction("project", "project", async () => {
      const createdProject = await createProject(brief);
      setProject(createdProject);
      setScript(undefined);
      setRenderTask(undefined);
      setTraceEvents([]);
      setDashboard(undefined);
      setExportResult(undefined);
      setHasAssetSearchRun(false);
      setAssetSearchResults([]);
      setExternalAssetSearchResults([]);
      setEditingSuggestions([]);
      setSelectedSceneId(undefined);
      setDirtySceneIds(new Set());
    });

  const handleLoadProject = () =>
    runAction("project", "project", async () => {
      const loadedProject = await loadProject(projectIdToLoad.trim());
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
      setRenderTask(latestRender);
      setTraceEvents([]);
      setDashboard(undefined);
      setExportResult(undefined);
      setHasAssetSearchRun(false);
      setAssetSearchResults([]);
      setExternalAssetSearchResults([]);
      setEditingSuggestions([]);
      setSelectedSceneId(latestScript?.scenes[0]?.id ?? loadedProject.scenes[0]?.id);
      setDirtySceneIds(new Set());
    });

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
      const asset = await addAsset(undefined, assetDraft);
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
      const importedAssets = await Promise.all(
        files.map(async (file) => {
          const uploadIntent = await createAssetUploadIntent(
            undefined,
            createAssetInputFromFile(file, language),
          );
          const uploaded = await uploadAssetFileToStorage(uploadIntent.asset.id, file);
          return uploaded.asset;
        }),
      );

      setAssetLibrary((current) => ({
        ...current,
        assets: [...current.assets, ...importedAssets],
      }));
      setProject((current) =>
        current && importedAssets.some((asset) => asset.projectId === current.id)
          ? {
              ...current,
              assets: [
                ...current.assets,
                ...importedAssets.filter((asset) => asset.projectId === current.id),
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
    void runAction("asset", "search", async () => {
      const response = await searchAssets(undefined, assetSearchQuery);
      setHasAssetSearchRun(true);
      setAssetSearchResults(response.results);
      setExternalAssetSearchResults(response.externalResults);
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
        type,
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

  const handleImportExternalAsset = (externalAsset: ExternalAssetResult) => {
    void runAction("asset", "asset", async () => {
      const asset = await importExternalAsset(undefined, externalAsset);
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
    });
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
      setAssetSearchResults((current) =>
        current.filter((result) => !deletedAssetIds.has(result.asset.id)),
      );
    });
  };

  const handleGenerateScript = (nextPage?: WorkspacePageId) => {
    if (!project) {
      setErrors((current) => ({ ...current, script: "Create or load a project first." }));
      return;
    }

    void runAction("script", "script", async () => {
      const generated = await generateScript(project.id);
      setFallbackProvider(generated.fallback.provider);
      setDashboard(undefined);
      setScript(generated.script);
      setSelectedSceneId(generated.script.scenes[0]?.id);
      setDirtySceneIds(new Set());
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
    });
  };

  const handleRegenerateScene = (sceneId: string) => {
    void runAction("studio", "scene", async () => {
      const regenerated = await regenerateScene(sceneId);
      replaceSceneInState(regenerated.scene);
      setTraceEvents((current) => [...current, regenerated.traceEvent]);
      setDirtySceneIds((current) => {
        const next = new Set(current);
        next.delete(sceneId);
        return next;
      });
      setEditingSuggestions([]);
    });
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
        simulateFailure: forceRenderFailure,
      });
      setDashboard(undefined);
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
        simulateFailure: false,
      });
      setDashboard(undefined);
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
              onRecallAsset={selectedSceneId ? handleRecallAsset : undefined}
              onSearchExternalAssets={handleSearchExternalAssets}
              onSearchAssets={handleSearchAssets}
              onSearchQueryChange={setAssetSearchQuery}
              onUploadAsset={handleUploadAsset}
              searchQuery={assetSearchQuery}
              stockProviderConfigs={stockProviderConfigs}
              externalSearchResults={activeExternalAssetSearchResults}
              searchResults={activeAssetSearchResults}
            />
          </section>
        ) : null}

        {activePage === "inspiration" ? (
          <InspirationPanel apiConfig={apiConfig} language={language} />
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
                  isLoading={busyState === "project"}
                  onBriefChange={setBrief}
                  onCreateProject={handleCreateProject}
                  onLoadProject={handleLoadProject}
                  onProjectIdToLoadChange={setProjectIdToLoad}
                  project={project}
                  projectIdToLoad={projectIdToLoad}
                />
              ) : null}

              {activePage === "create" ? (
                <AssetPrepPanel
                  assets={prepAssets}
                  disabled={busyState !== "idle"}
                  error={errors.asset ?? errors.script}
                  isGenerating={busyState === "script"}
                  isImporting={busyState === "asset"}
                  language={language}
                  onBack={() => handlePageChange("project")}
                  onGenerateStoryboard={() => handleGenerateScript("studio")}
                  onImportFiles={handleImportFiles}
                />
              ) : null}

              {activePage === "studio" ? (
                <section className="script-storyboard-workspace">
                  <ScriptPanel
                    copy={text.script}
                    disabled={busyState !== "idle"}
                    error={errors.script}
                    fallbackProvider={fallbackProvider}
                    isLoading={busyState === "script"}
                    onGenerateScript={() => handleGenerateScript()}
                    script={script}
                  />
                  <StudioWorkspace
                    assets={project?.assets ?? assetLibrary.assets}
                    copy={text.studio}
                    dirtySceneIds={dirtySceneIds}
                    isBusy={busyState === "scene"}
                    onApplySuggestion={handleApplySuggestion}
                    onDeleteScene={handleDeleteScene}
                    onDismissSuggestion={handleDismissSuggestion}
                    onLoadSuggestions={handleLoadSuggestions}
                    onRegenerateScene={handleRegenerateScene}
                    onSceneChange={handleSceneChange}
                    onSceneMove={handleSceneMove}
                    onSceneSave={handleSceneSave}
                    onSelectedSceneChange={setSelectedSceneId}
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
                  onForceFailureChange={setForceRenderFailure}
                  onExport={handleExport}
                  onMediaSettingsChange={setMediaSettings}
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
