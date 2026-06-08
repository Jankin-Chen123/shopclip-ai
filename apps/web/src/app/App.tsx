import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Download, Film, FileText, ListVideo } from "lucide-react";
import type {
  AssetMetadata,
  AssetSlice,
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
  DashboardResponse,
} from "@shopclip/shared";

import {
  AppShell,
  type BackgroundTaskItem,
  type WorkspaceSectionId,
  type WorkspacePageId,
} from "../components/layout/AppShell";
import { Button } from "../components/ui/Button";
import type { AssetCategory } from "../features/assets/AssetCategoryTabs";
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
  SettingsPanel,
} from "../features/settings/SettingsPanel";
import { ScriptPanel } from "../features/script/ScriptPanel";
import { StudioWorkspace } from "../features/studio/StudioWorkspace";
import { copy, type Language } from "./i18n";
import {
  addAsset,
  addReferenceToScriptLibrary,
  applySceneSuggestion,
  analyzeReferenceVideo,
  createReferenceTemplate,
  createProject,
  deleteAssets as deleteAssetsRequest,
  deleteProject as deleteProjectRequest,
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
  type AssetRecallCandidate,
  type AssetLibraryCategory,
  type CreateAssetInput,
  type EditingSuggestion,
  type ExportResult,
  type ExternalAssetResult,
  type ExternalAssetSearchResponse,
  type MediaSettings,
  type ProjectSummary,
  type ProjectSnapshot,
  type RenderSnapshot,
  type VideoGenerationSettings,
} from "../lib/api";
import {
  createDefaultAsset,
  createAssetDraftForCategory,
  createProjectMockDashboard,
  createScriptGenerationRequestPayload,
  defaultBrief,
  defaultMediaSettings,
  isCreationPage,
  localizeDefaultAssetDraft,
  mergeReferences,
  mergeTemplates,
} from "./AppSetupUtils";
import { importAndStructureFiles } from "./AppAssetImportUtils";
import { getGenerationTaskText } from "./AppBackgroundTaskText";
import {
  createAssetPrepSnapshotFromProjectAssets,
  pruneAssetPrepSnapshotDeletedAssets,
} from "./AppProjectAssetUtils";
import {
  createBriefFromProject,
  replaceAssetCategoryInLibrary,
} from "./AppProjectLifecycleUtils";
import {
  appendProjectScript,
  appendProjectAsset,
  appendProjectRenderTask,
  markProjectRenderTaskExported,
  mergeImportedProjectAssets,
  removeProjectRenderTask,
  removeProjectAssets,
  replaceProjectRenderTaskProgress,
  removeProjectScript,
  replaceProcessedProjectAsset,
  replaceProjectRenderTask,
  replaceProjectScene,
  replaceProjectScenes,
  replaceProjectScript,
  upsertProjectRenderTask,
  upsertProjectAsset,
} from "./AppProjectMutationUtils";
import {
  selectActiveAssetCategoryAssets,
  selectCreationUsableAssets,
  selectCurrentBackgroundTaskTarget,
  selectHasPendingReferences,
  selectLoadedProjectWorkspaceState,
  selectPreparedProjectAssetsByBucket,
  selectScriptReferenceAssets,
  selectScriptReferenceLibrary,
  selectScriptTemplateLibrary,
  selectSmartEditAssetSlices,
  selectStudioAssets,
  selectWorkspaceAssetRefreshAction,
  selectWorkspaceScenes,
} from "./AppWorkspaceDerivedState";
import {
  createSmartEditRequestPayload,
} from "./AppSmartEditRequest";
import {
  createSmartEditResultFromCompletedSourceRender,
  isRenderTaskPollingActive,
  isSmartEditTask,
  needsSceneClipMaterialRefresh,
  selectInvalidSeedanceSceneDuration,
  selectStudioBaseRenderTask,
  smartEditResultFromRenderSnapshot,
} from "./AppRenderUtils";
export {
  createSmartEditResultFromCompletedSourceRender,
  hasCompletedSceneClips,
  isRenderTaskPollingActive,
  needsSceneClipMaterialRefresh,
  selectInvalidSeedanceSceneDuration,
  selectLatestCompletedSmartEditTask,
  selectStudioBaseRenderTask,
} from "./AppRenderUtils";
import { useAssetSearchState } from "./useAssetSearchState";
import {
  useBackgroundTaskTracker,
  type BackgroundTaskKind,
  type BackgroundTaskTarget,
} from "./useBackgroundTaskTracker";
import { useProjectStudioState, type ProjectStudioFlow } from "./useProjectStudioState";
import { useSettingsState } from "./useSettingsState";
import { useWorkspaceNavigationState } from "./useWorkspaceNavigationState";
export {
  importAndStructureFiles,
} from "./AppAssetImportUtils";
export {
  createAssetPrepSnapshotFromProjectAssets,
  getCreationUsableAssets,
  getPreparedAssetsByBucket,
  getReferenceScriptAssets,
  pruneAssetPrepSnapshotDeletedAssets,
} from "./AppProjectAssetUtils";
export {
  appendProjectAsset,
  mergeImportedProjectAssets,
  removeProjectAssets,
  removeProjectRenderTask,
  removeProjectScript,
  replaceProjectRenderTask,
  replaceProjectScene,
  replaceProjectScenes,
  replaceProjectScript,
  upsertProjectAsset,
} from "./AppProjectMutationUtils";
export {
  createBriefFromProject,
  replaceAssetCategoryInLibrary,
} from "./AppProjectLifecycleUtils";
export {
  createAssetInputFromFile,
  createScriptGenerationRequestPayload,
  getCreationAssetLibraryRefreshCategory,
  hasActivePendingReferenceAnalysis,
  mergeReferences,
} from "./AppSetupUtils";

export const hasUsableStockProviderCredential = hasSearchableStockProviderCredential;

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
  const {
    activePage,
    activeSection,
    language,
    pageTransitionDirection,
    setLanguage,
    updateActivePage,
  } = useWorkspaceNavigationState({ initialLanguage, initialPage });
  const [activeAssetCategory, setActiveAssetCategory] = useState<AssetCategory>("image");
  const {
    apiConfig,
    handleApiConfigChange,
    handleStockProviderConfigsChange,
    stockProviderConfigs,
  } = useSettingsState();
  const [assetDraft, setAssetDraft] = useState<CreateAssetInput>(() =>
    createDefaultAsset(language),
  );
  const {
    activeExternalAssetSearchResults,
    activeSearchResults,
    hasAssetSearchRun,
    resetAssetSearch,
    searchQuery: assetSearchQuery,
    setExternalAssetSearchResults,
    setHasAssetSearchRun,
    setSearchQuery: setAssetSearchQuery,
    setSearchResults: setAssetSearchResults,
  } = useAssetSearchState(activeAssetCategory);
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
  const {
    enterProjectStudioFlow,
    exitProjectStudioMode,
    isProjectStudioMode,
    projectStudioFlow,
    projectStudioPreviewScriptId,
    resetProjectStudioMode,
    setProjectStudioFlow,
    setProjectStudioPreviewScriptId,
  } = useProjectStudioState();
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
  const currentBackgroundTaskTarget = useMemo<BackgroundTaskTarget>(
    () =>
      selectCurrentBackgroundTaskTarget({
        flow: projectStudioFlow,
        isProjectStudioMode,
        page: activePage,
        projectDetailTab,
        section: activeSection,
      }),
    [activePage, activeSection, isProjectStudioMode, projectDetailTab, projectStudioFlow],
  );
  const getBackgroundTaskText = useCallback(
    (kind: BackgroundTaskKind) => getGenerationTaskText(kind, language),
    [language],
  );
  const {
    backgroundTasks,
    startBackgroundTask,
    startEstimatedBackgroundTaskProgress,
    stopEstimatedBackgroundTaskProgress,
    updateBackgroundTask,
  } = useBackgroundTaskTracker({
    currentTarget: currentBackgroundTaskTarget,
    getTaskText: getBackgroundTaskText,
    renderTask,
  });

  const scenes = useMemo(() => selectWorkspaceScenes(script, project), [project, script]);
  const activeAssets = useMemo(
    () => selectActiveAssetCategoryAssets(assetLibrary.assets, activeAssetCategory),
    [activeAssetCategory, assetLibrary.assets],
  );
  const creationUsableAssets = useMemo(
    () => selectCreationUsableAssets(project, assetLibrary),
    [assetLibrary, project],
  );
  const studioAssets = useMemo(
    () => selectStudioAssets(project, assetLibrary.assets),
    [assetLibrary.assets, project],
  );
  const smartEditAssetSlices = useMemo(
    () => selectSmartEditAssetSlices(project, assetLibrary),
    [assetLibrary, project],
  );
  const isSmartEditTaskRunning = isSmartEditTask(renderTask) && isRenderTaskPollingActive(renderTask);
  const preparedProjectAssetsByBucket = useMemo(
    () => selectPreparedProjectAssetsByBucket(project),
    [project],
  );
  const scriptReferenceLibrary = useMemo(
    () => selectScriptReferenceLibrary(project, referenceLibrary),
    [project, referenceLibrary],
  );
  const scriptReferenceAssets = useMemo(
    () => selectScriptReferenceAssets(project, assetLibrary.assets),
    [assetLibrary.assets, project],
  );
  const hasPendingReferences = useMemo(
    () => selectHasPendingReferences(scriptReferenceLibrary),
    [scriptReferenceLibrary],
  );
  const scriptTemplateLibrary = useMemo(
    () => selectScriptTemplateLibrary(project, viralTemplateLibrary),
    [project, viralTemplateLibrary],
  );
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    }
  }, [language]);

  const handlePageChange = (page: WorkspacePageId) => {
    if (page !== "studio" && page !== "delivery") {
      exitProjectStudioMode();
    }
    updateActivePage(page);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${page}`);
    }
  };

  const seedSmartEditFromSourceRender = (
    sourceRenderTask: RenderTask,
    sourceTraceEvents: TraceEvent[],
    options: { navigateToEdit?: boolean } = {},
  ): boolean => {
    const seededResult = createSmartEditResultFromCompletedSourceRender({
      language,
      mediaSettings,
      renderTask: sourceRenderTask,
      scenes,
      targetLanguage: smartEditTargetLanguage,
      traceEvents: sourceTraceEvents,
    });
    if (!seededResult) {
      return false;
    }

      setSmartEditResult(seededResult);
      setSelectedSmartEditSegmentId(seededResult.plan.segments[0]?.id);
      setExportResult(undefined);
      if (options.navigateToEdit) {
        exitProjectStudioMode();
        handlePageChange("edit");
      }
    return true;
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
    setAssetDraft((current) =>
      localizeDefaultAssetDraft({
        category: activeAssetCategory,
        currentDraft: current,
        nextLanguage,
        previousLanguage,
      }),
    );
    if (typeof window !== "undefined") {
      window.localStorage.setItem("shopclip-language", nextLanguage);
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
    setAssetDraft((current) => createAssetDraftForCategory(category, language, current.sizeBytes));
  };

  const runAction = async (
    key: string,
    busy: BusyState,
    action: () => Promise<void>,
    options?: {
      backgroundTask?: {
        id?: string;
        kind: BackgroundTaskKind;
        target?: BackgroundTaskTarget;
      };
    },
  ) => {
    const backgroundTask = options?.backgroundTask;
    const backgroundTaskId = backgroundTask
      ? startBackgroundTask(backgroundTask.kind, backgroundTask.target ?? currentBackgroundTaskTarget, {
          id: backgroundTask.id,
        })
      : undefined;
    if (backgroundTaskId) {
      startEstimatedBackgroundTaskProgress(backgroundTaskId);
    }
    setBusyState(busy);
    setErrors((current) => ({ ...current, [key]: undefined }));
    let didFail = false;
    try {
      await action();
      if (backgroundTaskId && project?.id) {
        await syncCurrentProjectSnapshot(project.id);
      }
    } catch (error) {
      didFail = true;
      setErrors((current) => ({
        ...current,
        [key]: error instanceof Error ? error.message : "Action failed.",
      }));
    } finally {
      if (backgroundTaskId) {
        stopEstimatedBackgroundTaskProgress(backgroundTaskId);
        updateBackgroundTask(backgroundTaskId, {
          progress: 100,
          status: didFail ? "failed" : "completed",
        });
      }
      setBusyState("idle");
    }
  };

  const refreshAssetLibrary = (category: AssetLibraryCategory) => {
    void runAction("asset", "asset", async () => {
      const response = await loadProjectAssets(undefined, category);
      setAssetLibrary((current) =>
        replaceAssetCategoryInLibrary(current, category, response.assets, response.assetSlices),
      );
      resetAssetSearch();
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

  const syncCurrentProjectSnapshot = async (projectId: string) => {
    const loadedProject = await loadProject(projectId);
    setProject(loadedProject);
    setBrief(createBriefFromProject(loadedProject));
    refreshProjectHistory();
    return loadedProject;
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
    const refreshAction = selectWorkspaceAssetRefreshAction({ activeAssetCategory, activePage });
    if (refreshAction.type === "reference") {
      refreshReferenceLibrary({ includeTemplates: refreshAction.includeTemplates });
    } else if (refreshAction.type === "asset") {
      refreshAssetLibrary(refreshAction.category);
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
        } else if (render.renderTask.status === "completed") {
          seedSmartEditFromSourceRender(render.renderTask, render.traceEvents, {
            navigateToEdit: isProjectStudioMode || activePage === "delivery",
          });
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
        setProject((current) => replaceProjectRenderTaskProgress(current, render.renderTask));
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
  }, [
    activePage,
    isProjectStudioMode,
    language,
    mediaSettings,
    renderTask?.id,
    renderTask?.status,
    scenes,
    smartEditTargetLanguage,
  ]);

  useEffect(() => {
    setProjectStudioPreviewScriptId(undefined);
  }, [project?.id]);

  const handleCreateProject = () =>
    runAction("project", "project", async () => {
      const createdProject = await createProject(brief);
      setProject(createdProject);
      setProjectDetailTab("overview");
      setIsProjectScriptComposerOpen(false);
      resetProjectStudioMode();
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
      resetAssetSearch();
      setEditingSuggestions([]);
      setAssetRecallCandidates([]);
      setAssetPrepSnapshot({ assetIds: [], keywords: [], materials: [] });
      setSelectedSceneId(undefined);
      setDirtySceneIds(new Set());
      refreshProjectHistory();
    });

  const applyLoadedProject = (loadedProject: ProjectSnapshot) => {
    const loadedWorkspaceState = selectLoadedProjectWorkspaceState({
      language,
      mediaSettings,
      project: loadedProject,
      smartEditTargetLanguage,
    });
    setProject(loadedProject);
    setProjectDetailTab("overview");
    setIsProjectScriptComposerOpen(false);
    resetProjectStudioMode();
    setBrief(createBriefFromProject(loadedProject));
    setScript(loadedWorkspaceState.latestScript);
    setScriptDraft(loadedWorkspaceState.scriptDraft);
    setScriptProductionMode("automatic");
    setSelectedReferenceIdForScript(undefined);
    setSelectedTemplateIdForScript(undefined);
    setRenderTask(loadedWorkspaceState.studioBaseRender);
    setTraceEvents([]);
    setSmartEditResult(loadedWorkspaceState.smartEditResult);
    setSelectedSmartEditSegmentId(loadedWorkspaceState.selectedSmartEditSegmentId);
    setDashboard(undefined);
    setExportResult(undefined);
    resetAssetSearch();
    setEditingSuggestions([]);
    setAssetRecallCandidates([]);
    setAssetPrepSnapshot(
      createAssetPrepSnapshotFromProjectAssets(loadedProject.assets, loadedProject.prepKeywords),
    );
    setSelectedSceneId(loadedWorkspaceState.selectedSceneId);
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
    resetProjectStudioMode();
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
      setBrief(createBriefFromProject(updatedProject));
      refreshProjectHistory();
    });
  };

  const refreshStudioBaseRenderMaterials = (candidate: RenderTask | undefined) => {
    if (!candidate || !needsSceneClipMaterialRefresh(candidate)) {
      return;
    }
    const renderTaskId = candidate.id;
    void runAction("render", "render", async () => {
      const render = await loadRenderTask(renderTaskId);
      setRenderTask(render.renderTask);
      setTraceEvents(render.traceEvents);
      if (render.renderTask.status === "completed") {
        seedSmartEditFromSourceRender(render.renderTask, render.traceEvents);
      }
      setProject((current) => replaceProjectRenderTask(current, render.renderTask));
    });
  };

  const handleGenerateProjectVideo = () => {
    const baseRender = project ? selectStudioBaseRenderTask(project.renderTasks) : renderTask;
    setRenderTask(baseRender);
    setSmartEditResult(undefined);
    setSelectedSmartEditSegmentId(undefined);
    setProjectDetailTab("videos");
    enterProjectStudioFlow("script");
    handlePageChange("studio");
    refreshStudioBaseRenderMaterials(baseRender);
  };

  const handleSaveVideoAndReturn = () => {
    exitProjectStudioMode();
    setProjectDetailTab("videos");
    handlePageChange("project");
    refreshProjectHistory();
  };

  const handleBackToProjectVideoLibrary = () => {
    exitProjectStudioMode();
    setProjectDetailTab("videos");
    handlePageChange("project");
  };

  const handleProjectStudioFlowChange = (flow: ProjectStudioFlow) => {
    enterProjectStudioFlow(flow);
    handlePageChange(flow === "render" ? "delivery" : "studio");
  };

  const handleOpenSmartEditFromProjectVideo = (renderTaskId: string) => {
    const selectedRenderTask = project?.renderTasks.find((candidate) => candidate.id === renderTaskId);
    if (!selectedRenderTask) {
      return;
    }

    exitProjectStudioMode();
    setRenderTask(selectedRenderTask);
    setTraceEvents([]);
    setExportResult(undefined);
    setErrors((current) => ({ ...current, smartEdit: undefined }));

    const initialSmartEdit = smartEditResultFromRenderSnapshot({
      renderTask: selectedRenderTask,
      traceEvents: [],
    });
    if (initialSmartEdit) {
      setSmartEditResult(initialSmartEdit);
      setSelectedSmartEditSegmentId(initialSmartEdit.plan.segments[0]?.id);
    } else if (!seedSmartEditFromSourceRender(selectedRenderTask, [])) {
      setSmartEditResult(undefined);
      setSelectedSmartEditSegmentId(undefined);
    }
    handlePageChange("edit");

    void loadRenderTask(renderTaskId)
      .then((render) => {
        setRenderTask(render.renderTask);
        setTraceEvents(render.traceEvents);
        const completedSmartEdit = smartEditResultFromRenderSnapshot(render);
        if (completedSmartEdit) {
          setSmartEditResult(completedSmartEdit);
          setSelectedSmartEditSegmentId(completedSmartEdit.plan.segments[0]?.id);
          return;
        }
        if (!seedSmartEditFromSourceRender(render.renderTask, render.traceEvents)) {
          setSmartEditResult(undefined);
          setSelectedSmartEditSegmentId(undefined);
        }
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "Failed to load video for smart edit.";
        setErrors((current) => ({ ...current, smartEdit: message }));
      });
  };

  const loadProjectScriptIntoStudio = (selectedScript: ScriptResult) => {
    setScript(selectedScript);
    setScriptDraft(selectedScript.narrative);
    setSelectedSceneId(selectedScript.scenes[0]?.id);
    setDirtySceneIds(new Set());
    setEditingSuggestions([]);
    setAssetRecallCandidates([]);
    setProject((current) => replaceProjectScenes(current, selectedScript.scenes));
    handleProjectStudioFlowChange("storyboard");
  };

  const handleSelectProjectScriptForStudio = (selectedScript: ScriptResult) => {
    if (!project) {
      return;
    }

    void runAction(
      "script",
      "script",
      async () => {
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
      },
      {
        backgroundTask: {
          kind: "storyboard",
        },
      },
    );
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
    setProject((current) => replaceProjectScene(current, updatedScene));
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
    const invalidScene = selectInvalidSeedanceSceneDuration(scenes);
    if (!invalidScene) {
      return true;
    }
    setErrors((current) => ({
      ...current,
      render: `Scene ${invalidScene.order} is ${invalidScene.durationSeconds}s. Doubao Seedance 1.5 Pro supports 4-12s per scene; adjust the scene duration first.`,
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
      setProject((current) => appendProjectAsset(current, asset));
    });
  };

  const handleImportFiles = (files: File[]) => {
    if (files.length === 0) {
      return;
    }

    void runAction(
      "asset",
      "asset",
      async () => {
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
          mergeImportedProjectAssets({
            assets: importedAssets,
            assetSlices: imported.assetSlices,
            project: current,
          }),
        );
        setAssetSearchResults([]);
        setHasAssetSearchRun(false);
      },
      {
        backgroundTask: {
          kind: "asset-analysis",
        },
      },
    );
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
    void runAction(
      "asset",
      "asset",
      async () => {
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
        setProject((current) => replaceProcessedProjectAsset(current, processed));
        resetAssetSearch();
      },
      {
        backgroundTask: {
          kind: "asset-analysis",
        },
      },
    );
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
      setProject((current) => appendProjectAsset(current, asset));
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
      setProject((current) => removeProjectAssets(current, deletedAssetIds));
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

  const handleDeleteProject = (projectId: string) => {
    const shouldDelete =
      typeof window === "undefined" ||
      window.confirm(
        language === "zh"
          ? "\u786e\u8ba4\u5220\u9664\u8fd9\u4e2a\u9879\u76ee\uff1f\u9879\u76ee\u5185\u7684\u5267\u672c\u3001\u89c6\u9891\u548c\u9879\u76ee\u7d20\u6750\u4f1a\u4e00\u5e76\u5220\u9664\u3002"
          : "Delete this project? Scripts, videos, and project materials will be deleted as well.",
      );
    if (!shouldDelete) {
      return;
    }

    void runAction("project", "project", async () => {
      const { deletedProject } = await deleteProjectRequest(projectId);
      setProjectHistory((current) =>
        current.filter((candidate) => candidate.id !== deletedProject.id),
      );
      if (project?.id === deletedProject.id) {
        setProject(undefined);
        setProjectDetailTab("overview");
        setIsProjectScriptComposerOpen(false);
        resetProjectStudioMode();
        setScript(undefined);
        setScriptDraft("");
        setRenderTask(undefined);
        setSmartEditResult(undefined);
        setSelectedSmartEditSegmentId(undefined);
        setTraceEvents([]);
        setDashboard(undefined);
        setExportResult(undefined);
        setAssetPrepSnapshot({ assetIds: [], keywords: [], materials: [] });
        setSelectedSceneId(undefined);
        setDirtySceneIds(new Set());
      }
      refreshProjectHistory();
    });
  };

  const handleDeleteProjectScript = (scriptId: string) => {
    const shouldDelete =
      typeof window === "undefined" ||
      window.confirm("Delete this script?");
    if (!shouldDelete) {
      return;
    }

    void runAction("script", "script", async () => {
      const { deletedScript } = await deleteScriptRequest(scriptId);
      setProject((current) => removeProjectScript(current, deletedScript.id));
      setScript((current) => (current?.id === deletedScript.id ? undefined : current));
      setScriptDraft((current) => (script?.id === deletedScript.id ? "" : current));
    });
  };

  const handleDeleteProjectRenderTask = (renderTaskId: string) => {
    const shouldDelete =
      typeof window === "undefined" ||
      window.confirm("Delete this video?");
    if (!shouldDelete) {
      return;
    }

    void runAction("render", "render", async () => {
      const { deletedRenderTask } = await deleteRenderTaskRequest(renderTaskId);
      setProject((current) => removeProjectRenderTask(current, deletedRenderTask.id));
      setRenderTask((current) => (current?.id === deletedRenderTask.id ? undefined : current));
      setTraceEvents((current) => (renderTask?.id === deletedRenderTask.id ? [] : current));
    });
  };

  const handleRenameProjectScript = (scriptId: string, displayName: string) => {
    const nextDisplayName = displayName.trim() || undefined;
    void runAction("script", "script", async () => {
      const { script: updatedScript } = await updateScriptDisplayName(scriptId, nextDisplayName);
      setProject((current) => replaceProjectScript(current, updatedScript));
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
      setProject((current) => replaceProjectRenderTask(current, updatedRenderTask));
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
    void runAction(
      "script",
      "reference",
      async () => {
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
      },
      {
        backgroundTask: {
          kind: "reference-analysis",
        },
      },
    );
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

    void runAction(
      "script",
      "reference",
      async () => {
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
      },
      {
        backgroundTask: {
          kind: "template",
        },
      },
    );
  };

  const handleExtractTemplateFromScripts = (assetIds: string[]) => {
    if (assetIds.length === 0) {
      return;
    }

    void runAction(
      "script",
      "script",
      async () => {
        const template = await extractTemplateFromScriptAssets({
          assetIds,
          category: project?.productName || brief.productName || undefined,
          templateName: `${project?.productName || brief.productName || "Script"} reusable template`,
          apiConfig,
        });
        setViralTemplateLibrary((current) => mergeTemplates([template], current));
        setActiveAssetCategory("template");
        setAssetSearchQuery("");
        resetAssetSearch();
      },
      {
        backgroundTask: {
          kind: "template",
        },
      },
    );
  };

  const handleUseReferenceForScript = (referenceId: string) => {
    void runAction("script", "asset", async () => {
      const asset = await addReferenceToScriptLibrary(referenceId, project?.id);
      setAssetLibrary((current) => ({
        ...current,
        assets: [...current.assets.filter((candidate) => candidate.id !== asset.id), asset],
      }));
      setProject((current) => upsertProjectAsset(current, asset));
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
        uniqueReferenceIds.length === 1
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

  const handleGenerateProjectScript = () => {
    if (!project) {
      setErrors((current) => ({ ...current, script: "Create or load a project first." }));
      return;
    }

    void runAction(
      "script",
      "script",
      async () => {
        const generated = await generateScript(project.id, createScriptGenerationRequest());
        setFallbackProvider(generated.fallback.used ? generated.fallback.provider : undefined);
        setDashboard(undefined);
        setScript(generated.script);
        setScriptDraft(generated.script.narrative);
        setSelectedSceneId(generated.script.scenes[0]?.id);
        setDirtySceneIds(new Set());
        setAssetRecallCandidates([]);
        setProject((current) => appendProjectScript(current, generated.script));
        setIsProjectScriptComposerOpen(false);
        setProjectDetailTab("scripts");
      },
      {
        backgroundTask: {
          kind: "script",
        },
      },
    );
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
      setProject((current) => appendProjectScript(current, saved.script));
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

    void runAction(
      "script",
      "script",
      async () => {
        const generated = await generateScript(project.id, createScriptGenerationRequest());
        setFallbackProvider(generated.fallback.used ? generated.fallback.provider : undefined);
        setDashboard(undefined);
        setScript(generated.script);
        setScriptDraft(generated.script.narrative);
        setSelectedSceneId(generated.script.scenes[0]?.id);
        setDirtySceneIds(new Set());
        setAssetRecallCandidates([]);
        setProject((current) => appendProjectScript(current, generated.script));
        setIsProjectScriptComposerOpen(false);
        setProjectDetailTab((current) => (current === "scripts" ? "scripts" : current));
        if (nextPage) {
          handlePageChange(nextPage);
        }
      },
      {
        backgroundTask: {
          kind: "storyboard",
        },
      },
    );
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
    void runAction(
      "studio",
      "scene",
      async () => {
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
      },
      {
        backgroundTask: {
          kind: "scene-regeneration",
        },
      },
    );
  };

  const handleLoadAssetCandidates = (sceneId: string) => {
    void runAction(
      "studio",
      "scene",
      async () => {
        const recall = await recallSceneAssets(sceneId);
        setAssetRecallCandidates(recall.candidates);
      },
      {
        backgroundTask: {
          kind: "asset-recall",
        },
      },
    );
  };

  const handleApplyAssetCandidate = (assetId: string) => {
    handleRecallAsset(assetId);
  };

  const handleLoadSuggestions = (sceneId: string) => {
    void runAction(
      "studio",
      "scene",
      async () => {
        setEditingSuggestions(await loadSceneSuggestions(sceneId));
      },
      {
        backgroundTask: {
          kind: "suggestions",
        },
      },
    );
  };

  const handleApplySuggestion = (suggestionId: string) => {
    if (!selectedSceneId) {
      return;
    }

    void runAction(
      "studio",
      "scene",
      async () => {
        const applied = await applySceneSuggestion(selectedSceneId, suggestionId);
        replaceSceneInState(applied.scene);
        setTraceEvents((current) => [...current, applied.traceEvent]);
        setEditingSuggestions((current) =>
          current.filter((suggestion) => suggestion.id !== suggestionId),
        );
      },
      {
        backgroundTask: {
          kind: "suggestions",
        },
      },
    );
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

    void runAction(
      "render",
      "render",
      async () => {
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
        if (render.renderTask.status === "completed") {
          seedSmartEditFromSourceRender(render.renderTask, render.traceEvents, {
            navigateToEdit: isProjectStudioMode,
          });
        }
        setProject((current) => appendProjectRenderTask(current, render.renderTask));
      },
      {
        backgroundTask: {
          kind: "video",
        },
      },
    );
  };

  const handleRetryRender = () => {
    if (!renderTask) {
      return;
    }
    if (!validateSeedanceSceneDurations()) {
      return;
    }

    void runAction(
      "render",
      "render",
      async () => {
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
        if (render.renderTask.status === "completed") {
          seedSmartEditFromSourceRender(render.renderTask, render.traceEvents, {
            navigateToEdit: isProjectStudioMode,
          });
        }
        setProject((current) => appendProjectRenderTask(current, render.renderTask));
      },
      {
        backgroundTask: {
          kind: "video",
        },
      },
    );
  };

  const handleRefreshRender = () => {
    if (!renderTask) {
      return;
    }
    void runAction("render", "render", async () => {
      const render = await loadRenderTask(renderTask.id);
      setRenderTask(render.renderTask);
      setTraceEvents(render.traceEvents);
      if (render.renderTask.status === "completed") {
        seedSmartEditFromSourceRender(render.renderTask, render.traceEvents, {
          navigateToEdit: isProjectStudioMode || activePage === "delivery",
        });
      }
    });
  };

  const createSmartEditRequest = () => {
    return createSmartEditRequestPayload({
      apiConfig,
      instructions: smartEditInstructions,
      language,
      mediaSettings,
      renderTask,
      scenes,
      smartEditResult,
      targetLanguage: smartEditTargetLanguage,
      videoSettings,
    });
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
    setProject((current) => upsertProjectRenderTask(current, render.renderTask));
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

    void runAction(
      "smartEdit",
      "smart-edit",
      async () => {
        await persistDirtyScenesForRender();
        setSmartEditResult(undefined);
        setSelectedSmartEditSegmentId(undefined);
        const render = await startSmartEdit(project.id, createSmartEditRequest());
        applySmartEditRenderSnapshot(render);
      },
      {
        backgroundTask: {
          kind: "smart-edit",
        },
      },
    );
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

    void runAction(
      "smartEdit",
      "smart-edit",
      async () => {
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
            timelineStartSecond: selectedSegment.timelineStartSecond,
            playbackRate: selectedSegment.playbackRate,
            captionHidden: selectedSegment.captionHidden,
            captionStartOffsetSeconds: selectedSegment.captionStartOffsetSeconds,
            captionDurationSeconds: selectedSegment.captionDurationSeconds,
            captionTextColor: selectedSegment.captionTextColor,
            captionTextFontSize: selectedSegment.captionTextFontSize,
            captionTextPositionYPercent: selectedSegment.captionTextPositionYPercent,
            voiceoverStartOffsetSeconds: selectedSegment.voiceoverStartOffsetSeconds,
            voiceoverDurationSeconds: selectedSegment.voiceoverDurationSeconds,
            voiceoverVolume: selectedSegment.voiceoverVolume,
            voiceoverVolumeKeyframes: selectedSegment.voiceoverVolumeKeyframes,
            voiceoverFadeInSeconds: selectedSegment.voiceoverFadeInSeconds,
            voiceoverFadeOutSeconds: selectedSegment.voiceoverFadeOutSeconds,
            source: selectedSegment.source,
            sourceAudioMuted: selectedSegment.sourceAudioMuted,
            sourceAudioStartOffsetSeconds: selectedSegment.sourceAudioStartOffsetSeconds,
            sourceAudioDurationSeconds: selectedSegment.sourceAudioDurationSeconds,
            sourceAudioVolume: selectedSegment.sourceAudioVolume,
            sourceAudioVolumeKeyframes: selectedSegment.sourceAudioVolumeKeyframes,
            sourceAudioFadeInSeconds: selectedSegment.sourceAudioFadeInSeconds,
            sourceAudioFadeOutSeconds: selectedSegment.sourceAudioFadeOutSeconds,
            subtitle: selectedSegment.subtitle,
            transition: selectedSegment.transition,
            voiceover: selectedSegment.voiceover,
          },
          segmentOutputs: smartEditResult.segmentOutputs,
          targetLanguage: smartEditTargetLanguage.trim() || undefined,
          videoSettings,
        });
        applySmartEditRenderSnapshot(render);
      },
      {
        backgroundTask: {
          kind: "smart-edit",
        },
      },
    );
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
        markProjectRenderTaskExported(current, {
          exportUrl: exported.exportUrl,
          renderTaskId: renderTask?.id,
        }),
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
  ];
  const projectScriptStudioFlow = projectStudioFlowItems[0]!;
  const projectStudioPreviewScript = project?.scripts.find(
    (candidate) => candidate.id === projectStudioPreviewScriptId,
  );
  const handleOpenBackgroundTask = (task: BackgroundTaskItem) => {
    const trackedTask = backgroundTasks.find((candidate) => candidate.id === task.id);
    if (!trackedTask) {
      return;
    }

    if (trackedTask.target.projectDetailTab) {
      setProjectDetailTab(trackedTask.target.projectDetailTab);
    }
    if (trackedTask.target.isProjectStudioMode) {
      enterProjectStudioFlow(trackedTask.target.flow ?? "script");
    } else {
      exitProjectStudioMode();
      if (trackedTask.target.flow) {
        setProjectStudioFlow(trackedTask.target.flow);
      }
    }
    handlePageChange(trackedTask.target.page);
  };

  const smartEditPanel = (
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
  );

  return (
    <AppShell
      activePage={activePage}
      activeSection={activeSection}
      backgroundTasks={backgroundTasks}
      copy={text}
      immersivePage={activePage === "edit"}
      language={language}
      onBackgroundTaskOpen={handleOpenBackgroundTask}
      onPageChange={handlePageChange}
      onSectionChange={handleSectionChange}
      projectStudioMode={isProjectStudioMode}
    >
      <div
        className={`workspace-grid workspace-page workspace-page-${pageTransitionDirection} page-${activePage}`}
        key={`${activePage}-${isProjectStudioMode ? projectStudioFlow : "standard"}`}
      >
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
              stockProviderConfigs={stockProviderConfigs ?? []}
              externalSearchResults={activeExternalAssetSearchResults ?? []}
              searchResults={activeSearchResults ?? []}
              templates={scriptTemplateLibrary ?? []}
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
                  onDeleteProject={handleDeleteProject}
                  onDeleteRenderTask={handleDeleteProjectRenderTask}
                  onDeleteScript={handleDeleteProjectScript}
                  onGenerateVideo={handleGenerateProjectVideo}
                  onLoadProject={handleLoadProjectFromHistory}
                  onRenameRenderTask={handleRenameProjectRenderTask}
                  onRenameScript={handleRenameProjectScript}
                  onSmartEditVideo={handleOpenSmartEditFromProjectVideo}
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
                      onGenerateScript={handleGenerateProjectScript}
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

              {(activePage === "studio" || activePage === "delivery") && project ? (
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
                    onGenerateScript={handleGenerateProjectScript}
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

        {activePage === "edit" ? (
          <section className="smart-edit-standalone-page" aria-label={text.smartEdit.title}>
            <header className="smart-edit-standalone-header">
              <Button
                icon={<ArrowLeft size={18} />}
                onClick={handleBackToProjectVideoLibrary}
                variant="secondary"
              >
                {language === "zh" ? "\u8fd4\u56de\u89c6\u9891\u5e93" : "Back to video library"}
              </Button>
            </header>
            {smartEditPanel}
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
