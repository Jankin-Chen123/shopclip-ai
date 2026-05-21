import { useEffect, useMemo, useState } from "react";
import type {
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
import { RenderPanel } from "../features/render/RenderPanel";
import { ProjectSetup } from "../features/projects/ProjectSetup";
import { ScriptPanel } from "../features/script/ScriptPanel";
import { StudioWorkspace } from "../features/studio/StudioWorkspace";
import {
  addAsset,
  createProject,
  exportProject,
  generateScript,
  loadProject,
  loadRenderTask,
  startRender,
  type CreateAssetInput,
  type ExportResult,
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

type BusyState = "idle" | "project" | "asset" | "script" | "render" | "export";

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
  return "project";
};

interface WorkspaceSwitcherProps {
  activePage: WorkspacePageId;
  assetsCount: number;
  dirtySceneCount: number;
  onPageChange: (page: WorkspacePageId) => void;
  pages: WorkspacePage[];
  renderStatus: string;
  sceneCount: number;
}

const WorkspaceSwitcher = ({
  activePage,
  assetsCount,
  dirtySceneCount,
  onPageChange,
  pages,
  renderStatus,
  sceneCount,
}: WorkspaceSwitcherProps) => (
  <section className="page-switcher" aria-label="Workspace categories">
    {pages.map((page) => {
      const Icon = page.icon;
      const isActive = page.id === activePage;
      const metric =
        page.id === "project"
          ? "Brief and status"
          : page.id === "create"
            ? `${assetsCount} assets`
            : page.id === "studio"
              ? `${sceneCount} scenes · ${dirtySceneCount} edited`
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
            <strong>{page.title}</strong>
            <small>{page.description}</small>
          </span>
          <em>{metric}</em>
        </button>
      );
    })}
  </section>
);

export const App = () => {
  const [activePage, setActivePage] = useState<WorkspacePageId>(() => pageFromHash());
  const [assetDraft, setAssetDraft] = useState<CreateAssetInput>(defaultAsset);
  const [brief, setBrief] = useState<ProjectBrief>(defaultBrief);
  const [busyState, setBusyState] = useState<BusyState>("idle");
  const [dirtySceneIds, setDirtySceneIds] = useState<Set<string>>(() => new Set());
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [exportResult, setExportResult] = useState<ExportResult>();
  const [fallbackProvider, setFallbackProvider] = useState<string>();
  const [project, setProject] = useState<ProjectSnapshot>();
  const [projectIdToLoad, setProjectIdToLoad] = useState("");
  const [renderTask, setRenderTask] = useState<RenderTask>();
  const [script, setScript] = useState<ScriptResult>();
  const [selectedSceneId, setSelectedSceneId] = useState<string>();
  const [traceEvents, setTraceEvents] = useState<TraceEvent[]>([]);

  const scenes = useMemo(() => script?.scenes ?? project?.scenes ?? [], [project?.scenes, script]);
  const statusLabel = project
    ? `${project.productName} · ${project.status}`
    : "Create or load a project";

  useEffect(() => {
    const handleHashChange = () => setActivePage(pageFromHash());
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  const handlePageChange = (page: WorkspacePageId) => {
    setActivePage(page);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${page}`);
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
      setExportResult(undefined);
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
      setExportResult(undefined);
      setSelectedSceneId(latestScript?.scenes[0]?.id ?? loadedProject.scenes[0]?.id);
      setDirtySceneIds(new Set());
    });

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

  const handleGenerateScript = () => {
    if (!project) {
      setErrors((current) => ({ ...current, script: "Create or load a project first." }));
      return;
    }

    void runAction("script", "script", async () => {
      const generated = await generateScript(project.id);
      setFallbackProvider(generated.fallback.provider);
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
          }
        : current,
    );
    setDirtySceneIds((current) => new Set(current).add(updatedScene.id));
  };

  const handleSceneSave = (sceneId: string) => {
    setDirtySceneIds((current) => {
      const next = new Set(current);
      next.delete(sceneId);
      return next;
    });
  };

  const handleStartRender = () => {
    if (!project) {
      setErrors((current) => ({ ...current, render: "Create or load a project first." }));
      return;
    }

    void runAction("render", "render", async () => {
      const render = await startRender(project.id);
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

  return (
    <AppShell activePage={activePage} onPageChange={handlePageChange} statusLabel={statusLabel}>
      <WorkspaceSwitcher
        activePage={activePage}
        assetsCount={project?.assets.length ?? 0}
        dirtySceneCount={dirtySceneIds.size}
        onPageChange={handlePageChange}
        pages={workspacePages}
        renderStatus={renderTask?.status ?? "Not rendered"}
        sceneCount={scenes.length}
      />

      <div className={`workspace-grid workspace-page page-${activePage}`}>
        {activePage === "project" ? (
          <ProjectSetup
            brief={brief}
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
              disabled={!project || busyState !== "idle"}
              error={errors.asset}
              isLoading={busyState === "asset"}
              onAssetDraftChange={setAssetDraft}
              onUploadAsset={handleUploadAsset}
            />
            <ScriptPanel
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
            dirtySceneIds={dirtySceneIds}
            onSceneChange={handleSceneChange}
            onSceneSave={handleSceneSave}
            onSelectedSceneChange={setSelectedSceneId}
            scenes={scenes}
            selectedSceneId={selectedSceneId}
          />
        ) : null}

        {activePage === "delivery" ? (
          <RenderPanel
            disabled={!project || scenes.length === 0 || busyState !== "idle"}
            error={errors.render ?? errors.export}
            exportResult={exportResult}
            isExporting={busyState === "export"}
            isRendering={busyState === "render"}
            onExport={handleExport}
            onRefreshRender={handleRefreshRender}
            onStartRender={handleStartRender}
            renderTask={renderTask}
            traceEvents={traceEvents}
          />
        ) : null}
      </div>
    </AppShell>
  );
};
