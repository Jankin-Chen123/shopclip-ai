import { useEffect, useMemo, useState } from "react";
import type {
  DashboardResponse,
  ProjectBrief,
  RenderTask,
  ScriptResult,
  StoryboardScene,
  TraceEvent,
} from "@shopclip/shared";

import {
  AppShell,
  workspacePages,
  type WorkspacePage,
  type WorkspacePageId,
} from "../components/layout/AppShell";
import { AssetsPanel } from "../features/assets/AssetsPanel";
import { DashboardPanel } from "../features/dashboard/DashboardPanel";
import { RenderPanel } from "../features/render/RenderPanel";
import { ProjectSetup } from "../features/projects/ProjectSetup";
import { ScriptPanel } from "../features/script/ScriptPanel";
import { StudioWorkspace } from "../features/studio/StudioWorkspace";
import { copy, isLanguage, type AppCopy, type Language } from "./i18n";
import {
  addAsset,
  applySceneSuggestion,
  createProject,
  deleteScene,
  exportProject,
  generateScript,
  loadDashboard,
  loadSceneSuggestions,
  loadProject,
  loadRenderTask,
  regenerateScene,
  reorderScenes,
  retryRenderTask,
  searchAssets,
  startRender,
  updateScene,
  type AssetSearchResult,
  type CreateAssetInput,
  type EditingSuggestion,
  type ExportResult,
  type MediaSettings,
  type ProjectSnapshot,
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

const defaultAsset: CreateAssetInput = {
  type: "image",
  name: "GlowGrip packshot",
  mimeType: "image/png",
  sizeBytes: 220_000,
  tags: ["product", "desk", "hero"],
};

const defaultMediaSettings: MediaSettings = {
  bgmTrack: "creator-pop",
  subtitleStyle: "clean-lower-third",
  subtitlesEnabled: true,
  ttsVoice: "clear-host",
};

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

const pageFromHash = (): WorkspacePageId => {
  if (typeof window === "undefined") {
    return "project";
  }

  const hash = window.location.hash.replace("#", "");
  if (hash === "assets" || hash === "script" || hash === "create") {
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

interface WorkspaceSwitcherProps {
  activePage: WorkspacePageId;
  assetsCount: number;
  copy: AppCopy;
  dirtySceneCount: number;
  onPageChange: (page: WorkspacePageId) => void;
  pages: WorkspacePage[];
  renderStatus: string;
  sceneCount: number;
  dashboardStatus: string;
}

const WorkspaceSwitcher = ({
  activePage,
  assetsCount,
  copy: text,
  dirtySceneCount,
  onPageChange,
  pages,
  renderStatus,
  sceneCount,
  dashboardStatus,
}: WorkspaceSwitcherProps) => (
  <section className="page-switcher" aria-label="Workspace categories">
    {pages.map((page) => {
      const Icon = page.icon;
      const isActive = page.id === activePage;
      const pageCopy = text.pages[page.id];
      const metric =
        page.id === "project"
          ? text.pages.project.metric
          : page.id === "create"
            ? text.pages.create.assetsMetric(assetsCount)
            : page.id === "studio"
              ? text.pages.studio.scenesMetric(sceneCount, dirtySceneCount)
              : page.id === "dashboard"
                ? dashboardStatus
                : renderStatus;

      return (
        <button
          aria-pressed={isActive}
          className={`page-card page-card-${page.accent} ${isActive ? "active" : ""}`}
          key={page.id}
          onClick={() => onPageChange(page.id)}
          type="button"
        >
          <span className="page-card-icon" aria-hidden="true">
            <Icon size={20} />
          </span>
          <span>
            <strong>{pageCopy.title}</strong>
            <small>{pageCopy.description}</small>
          </span>
          <em>{metric}</em>
        </button>
      );
    })}
  </section>
);

interface AppProps {
  initialLanguage?: Language;
}

export const App = ({ initialLanguage }: AppProps) => {
  const [activePage, setActivePage] = useState<WorkspacePageId>(() => pageFromHash());
  const [assetDraft, setAssetDraft] = useState<CreateAssetInput>(defaultAsset);
  const [assetSearchQuery, setAssetSearchQuery] = useState("desk stable creator table");
  const [assetSearchResults, setAssetSearchResults] = useState<AssetSearchResult[]>([]);
  const [brief, setBrief] = useState<ProjectBrief>(defaultBrief);
  const [busyState, setBusyState] = useState<BusyState>("idle");
  const [dashboard, setDashboard] = useState<DashboardResponse>();
  const [dirtySceneIds, setDirtySceneIds] = useState<Set<string>>(() => new Set());
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [exportResult, setExportResult] = useState<ExportResult>();
  const [fallbackProvider, setFallbackProvider] = useState<string>();
  const [forceRenderFailure, setForceRenderFailure] = useState(false);
  const [editingSuggestions, setEditingSuggestions] = useState<EditingSuggestion[]>([]);
  const [mediaSettings, setMediaSettings] = useState<MediaSettings>(defaultMediaSettings);
  const [project, setProject] = useState<ProjectSnapshot>();
  const [projectIdToLoad, setProjectIdToLoad] = useState("");
  const [renderTask, setRenderTask] = useState<RenderTask>();
  const [script, setScript] = useState<ScriptResult>();
  const [selectedSceneId, setSelectedSceneId] = useState<string>();
  const [traceEvents, setTraceEvents] = useState<TraceEvent[]>([]);
  const [language, setLanguage] = useState<Language>(() => initialLanguage ?? getStoredLanguage());
  const text = copy[language];

  const scenes = useMemo(() => script?.scenes ?? project?.scenes ?? [], [project?.scenes, script]);
  const statusLabel = project
    ? `${project.productName} / ${project.status}`
    : text.app.createOrLoadProject;
  const renderStatus = renderTask?.status ?? text.app.notRendered;

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

  const handleLanguageChange = (nextLanguage: Language) => {
    setLanguage(nextLanguage);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("shopclip-language", nextLanguage);
    }
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

  const handleCreateProject = () =>
    runAction("project", "project", async () => {
      const createdProject = await createProject(brief);
      setProject(createdProject);
      setScript(undefined);
      setRenderTask(undefined);
      setTraceEvents([]);
      setDashboard(undefined);
      setExportResult(undefined);
      setAssetSearchResults([]);
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
      setAssetSearchResults([]);
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
    if (!project) {
      setErrors((current) => ({ ...current, asset: "Create or load a project first." }));
      return;
    }

    void runAction("asset", "asset", async () => {
      const asset = await addAsset(project.id, assetDraft);
      setProject((current) =>
        current
          ? {
              ...current,
              assets: [...current.assets, asset],
            }
          : current,
      );
    });
  };

  const handleSearchAssets = () => {
    if (!project) {
      setErrors((current) => ({ ...current, asset: "Create or load a project first." }));
      return;
    }

    void runAction("asset", "search", async () => {
      const response = await searchAssets(project.id, assetSearchQuery);
      setAssetSearchResults(response.results);
    });
  };

  const handleGenerateScript = () => {
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
      copy={text}
      language={language}
      onLanguageChange={handleLanguageChange}
      onPageChange={handlePageChange}
      statusLabel={statusLabel}
    >
      <WorkspaceSwitcher
        activePage={activePage}
        assetsCount={project?.assets.length ?? 0}
        copy={text}
        dirtySceneCount={dirtySceneIds.size}
        onPageChange={handlePageChange}
        pages={workspacePages}
        renderStatus={renderStatus}
        sceneCount={scenes.length}
        dashboardStatus={dashboard ? text.dashboard.ready : text.dashboard.waiting}
      />

      <div className={`workspace-grid workspace-page page-${activePage}`}>
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
          <>
            <AssetsPanel
              assetDraft={assetDraft}
              assets={project?.assets ?? []}
              copy={text.assets}
              disabled={!project || busyState !== "idle"}
              error={errors.asset}
              isLoading={busyState === "asset"}
              isSearching={busyState === "search"}
              onAssetDraftChange={setAssetDraft}
              onRecallAsset={selectedSceneId ? handleRecallAsset : undefined}
              onSearchAssets={handleSearchAssets}
              onSearchQueryChange={setAssetSearchQuery}
              onUploadAsset={handleUploadAsset}
              searchQuery={assetSearchQuery}
              searchResults={assetSearchResults}
            />
            <ScriptPanel
              copy={text.script}
              disabled={!project || busyState !== "idle"}
              error={errors.script}
              fallbackProvider={fallbackProvider}
              isLoading={busyState === "script"}
              onGenerateScript={handleGenerateScript}
              script={script}
            />
          </>
        ) : null}

        {activePage === "studio" ? (
          <StudioWorkspace
            assets={project?.assets ?? []}
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
    </AppShell>
  );
};
