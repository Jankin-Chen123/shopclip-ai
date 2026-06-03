import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { ProjectBrief, ProjectSummary, RenderTask, ScriptResult } from "@shopclip/shared";
import {
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  Box,
  Check,
  Edit3,
  FileText,
  Film,
  Images,
  LayoutDashboard,
  Plus,
  X,
} from "lucide-react";

import { Button } from "../../components/ui/Button";
import { StatusPill } from "../../components/ui/StatusPill";
import type { Language } from "../../app/i18n";
import { getAssetContentUrl, type ProjectSnapshot } from "../../lib/api";

export type ProjectDetailTab = "overview" | "materials" | "scripts" | "videos";

interface ProjectWorkspaceProps {
  activeTab: ProjectDetailTab;
  dashboardPanel: ReactNode;
  disabled: boolean;
  error?: string;
  isHistoryLoading: boolean;
  language: Language;
  materialsPanel: ReactNode;
  onAddScript: () => void;
  onBackToProjects: () => void;
  onCreateProject: () => void;
  onGenerateVideo: () => void;
  onLoadProject: (projectId: string) => void;
  onTabChange: (tab: ProjectDetailTab) => void;
  onUpdateProjectBrief: (brief: ProjectBrief) => void;
  project?: ProjectSnapshot;
  projectHistory: ProjectSummary[];
  scriptPanel: ReactNode;
  showScriptComposer: boolean;
}

const getText = (language: Language) =>
  language === "zh"
    ? {
        portfolioTitle: "项目",
        portfolioSubtitle: "每张卡片代表一个商品项目，进入后管理素材、剧本和视频。",
        searchPlaceholder: "搜索商品名称或品牌...",
        allFilter: "全部",
        sortLatest: "最近更新",
        openProject: "打开项目工作区",
        createProject: "新建项目",
        loading: "项目加载中",
        emptyTitle: "还没有项目",
        emptyBody: "先创建一个商品项目，再导入素材并生成短视频。",
        projectId: "项目 ID",
        assets: "素材数",
        scripts: "脚本方案",
        videos: "视频项目",
        overview: "项目梗概",
        materials: "项目素材",
        scriptLibrary: "剧本库",
        videoLibrary: "视频库",
        productName: "产品名称",
        productType: "产品类型",
        sellingPoints: "卖点",
        audience: "目标人群",
        tone: "语气",
        dashboard: "数据看板",
        addScript: "添加剧本",
        generateVideo: "生成视频",
        noScripts: "还没有剧本，添加剧本后可复用脚本生成模块。",
        noVideos: "还没有保存的视频，生成视频后会回到这里沉淀成视频库条目。",
        back: "返回项目列表",
      }
    : {
        portfolioTitle: "Project portfolio",
        portfolioSubtitle:
          "Each card represents one product project with its materials, scripts, and videos.",
        searchPlaceholder: "Search product name or brand...",
        allFilter: "All",
        sortLatest: "Recently updated",
        openProject: "Open project workspace",
        createProject: "Create project",
        loading: "Loading projects",
        emptyTitle: "No projects yet",
        emptyBody: "Create a product project, then import materials and generate short videos.",
        projectId: "Project ID",
        assets: "Assets",
        scripts: "Scripts",
        videos: "Videos",
        overview: "Project overview",
        materials: "Project materials",
        scriptLibrary: "Script library",
        videoLibrary: "Video library",
        productName: "Product name",
        productType: "Product type",
        sellingPoints: "Selling points",
        audience: "Audience",
        tone: "Tone",
        dashboard: "Data dashboard",
        addScript: "Add script",
        generateVideo: "Generate video",
        noScripts: "No scripts yet. Add a script to reuse the script generation module.",
        noVideos:
          "No saved videos yet. Generated videos return here as reusable video library entries.",
        back: "Back to projects",
      };

const formatUpdatedAt = (value: string): string => {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
};

const plural = (count: number, label: string) =>
  `${count} ${count === 1 ? label.replace(/s$/, "") : label}`;

const getProjectImageClass = (index: number) => `project-card-media project-card-media-${index % 5}`;

const getProjectCoverUrl = (project: ProjectSummary): string | undefined =>
  project.coverAssetId ? getAssetContentUrl(project.coverAssetId) : project.coverAssetUrl;

export const ProjectWorkspace = ({
  activeTab,
  dashboardPanel,
  disabled,
  error,
  isHistoryLoading,
  language,
  materialsPanel,
  onAddScript,
  onBackToProjects,
  onCreateProject,
  onGenerateVideo,
  onLoadProject,
  onTabChange,
  onUpdateProjectBrief,
  project,
  projectHistory,
  scriptPanel,
  showScriptComposer,
}: ProjectWorkspaceProps) => {
  const text = getText(language);
  const uiText = useMemo(
    () =>
      language === "zh"
        ? {
            cancelEdit: "取消",
            editOverview: "编辑概梗",
            saveOverview: "保存概梗",
            scenes: "分镜",
            scriptDetail: "剧本详情",
            selectScript: "查看剧本详情",
          }
        : {
            cancelEdit: "Cancel",
            editOverview: "Edit overview",
            saveOverview: "Save overview",
            scenes: "scenes",
            scriptDetail: "Script detail",
            selectScript: "View script detail",
          },
    [language],
  );
  const [isOverviewEditing, setIsOverviewEditing] = useState(false);
  const [overviewDraft, setOverviewDraft] = useState<ProjectBrief>(() => ({
    audience: project?.audience ?? "",
    productName: project?.productName ?? "",
    sellingPoints: project?.sellingPoints ?? [],
    style: project?.style ?? "",
    targetDurationSeconds: project?.targetDurationSeconds ?? 15,
    title: project?.title ?? "",
    tone: project?.tone ?? "",
  }));
  const [selectedScriptId, setSelectedScriptId] = useState<string | undefined>();

  useEffect(() => {
    if (!project) {
      setIsOverviewEditing(false);
      setSelectedScriptId(undefined);
      return;
    }
    setOverviewDraft({
      audience: project.audience,
      productName: project.productName,
      sellingPoints: project.sellingPoints,
      style: project.style,
      targetDurationSeconds: project.targetDurationSeconds,
      title: project.title,
      tone: project.tone,
    });
    setIsOverviewEditing(false);
    setSelectedScriptId(project.scripts.at(-1)?.id);
  }, [project?.id]);

  useEffect(() => {
    if (!project || project.scripts.length === 0) {
      return;
    }
    setSelectedScriptId((current) =>
      current && project.scripts.some((script) => script.id === current)
        ? current
        : project.scripts.at(-1)?.id,
    );
  }, [project?.scripts.length]);

  if (!project) {
    return (
      <section className="project-portfolio" aria-labelledby="project-portfolio-title">
        <div className="project-portfolio-toolbar">
          <label className="project-search">
            <span className="sr-only">{text.searchPlaceholder}</span>
            <input placeholder={text.searchPlaceholder} readOnly />
          </label>
          <Button disabled icon={<LayoutDashboard size={17} />}>
            {text.allFilter}
          </Button>
          <Button disabled icon={<ArrowUpRight size={17} />}>
            {text.sortLatest}
          </Button>
        </div>
        <div className="project-portfolio-heading">
          <div>
            <h1 id="project-portfolio-title">{text.portfolioTitle}</h1>
            <p>{text.portfolioSubtitle}</p>
          </div>
          <Button
            disabled={disabled}
            icon={<Plus size={18} />}
            onClick={onCreateProject}
            variant="primary"
          >
            {text.createProject}
          </Button>
        </div>
        {error ? (
          <p className="inline-error" role="alert">
            {error}
          </p>
        ) : null}
        {projectHistory.length > 0 ? (
          <div className="project-card-grid">
            {projectHistory.map((historyProject, index) => {
              const coverUrl = getProjectCoverUrl(historyProject);
              return (
                <button
                  aria-label={historyProject.title}
                  className="project-card"
                  disabled={disabled || isHistoryLoading}
                  key={historyProject.id}
                  onClick={() => onLoadProject(historyProject.id)}
                  type="button"
                >
                  <span
                    className={getProjectImageClass(index)}
                    aria-hidden={coverUrl ? undefined : "true"}
                  >
                    {coverUrl ? <img alt="" src={coverUrl} /> : null}
                  </span>
                  <span className="project-card-body">
                    <span className="project-card-title">
                      <strong>{historyProject.title}</strong>
                      <StatusPill tone={historyProject.status === "completed" ? "success" : "info"}>
                        {historyProject.status}
                      </StatusPill>
                    </span>
                    <span className="project-card-product">{historyProject.productName}</span>
                    <span className="project-card-divider" />
                    <span className="project-card-stats">
                      <span>{plural(historyProject.assetCount, "assets")}</span>
                      <span>{historyProject.sceneCount > 0 ? "1 script" : "0 scripts"}</span>
                      <span>{historyProject.status === "completed" ? "1 video" : "0 videos"}</span>
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="project-empty-state">
            <strong>{isHistoryLoading ? text.loading : text.emptyTitle}</strong>
            <p>{text.emptyBody}</p>
          </div>
        )}
      </section>
    );
  }

  const scripts = project.scripts;
  const videos = project.renderTasks.filter((task) => task.status === "completed");
  const activeAsset = project.assets.find((asset) => asset.type === "image") ?? project.assets[0];
  const selectedScript = scripts.find((candidate) => candidate.id === selectedScriptId);
  const tabs: Array<{ id: ProjectDetailTab; icon: typeof Box; label: string }> = [
    { id: "overview", icon: Box, label: text.overview },
    { id: "materials", icon: Images, label: text.materials },
    { id: "scripts", icon: FileText, label: text.scriptLibrary },
    { id: "videos", icon: Film, label: text.videoLibrary },
  ];
  const updateOverviewDraft = <Key extends keyof ProjectBrief>(
    key: Key,
    value: ProjectBrief[Key],
  ) => setOverviewDraft((current) => ({ ...current, [key]: value }));
  const handleOverviewSave = () => {
    onUpdateProjectBrief({
      ...overviewDraft,
      sellingPoints: overviewDraft.sellingPoints
        .map((point) => point.trim())
        .filter((point) => point.length > 0),
      targetDurationSeconds: Number(overviewDraft.targetDurationSeconds) || 15,
    });
    setIsOverviewEditing(false);
  };

  return (
    <section className="project-detail-workspace" aria-label={project.title}>
      <aside className="project-detail-sidebar">
        <Button icon={<ArrowLeft size={18} />} onClick={onBackToProjects}>
          {text.back}
        </Button>
        <div className="project-product-card">
          {activeAsset?.url ? (
            <img alt={activeAsset.name} src={getAssetContentUrl(activeAsset.id)} />
          ) : (
            <span className="project-product-placeholder" aria-hidden="true" />
          )}
          <div>
            <h2>{project.productName}</h2>
            <p>{project.title}</p>
          </div>
        </div>
        <dl className="project-detail-metrics">
          <div>
            <dt>{text.projectId}</dt>
            <dd>{project.id}</dd>
          </div>
          <div>
            <dt>{text.assets}</dt>
            <dd>{plural(project.assets.length, "assets")}</dd>
          </div>
          <div>
            <dt>{text.scripts}</dt>
            <dd>{plural(project.scripts.length, "scripts")}</dd>
          </div>
          <div>
            <dt>{text.videos}</dt>
            <dd>{plural(videos.length, "videos")}</dd>
          </div>
        </dl>
      </aside>

      <div className="project-detail-main">
        <nav className="project-detail-tabs" aria-label="Project workspace tabs">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                aria-pressed={activeTab === tab.id}
                className={activeTab === tab.id ? "active" : undefined}
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                type="button"
              >
                <Icon size={18} aria-hidden="true" />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {activeTab === "overview" ? (
          <div className="project-overview-grid">
            <section className="project-info-panel">
              <div className="project-panel-titlebar">
                <h3>{text.overview}</h3>
                {isOverviewEditing ? (
                  <span className="project-panel-actions">
                    <Button icon={<X size={16} />} onClick={() => setIsOverviewEditing(false)}>
                      {uiText.cancelEdit}
                    </Button>
                    <Button icon={<Check size={16} />} onClick={handleOverviewSave} variant="primary">
                      {uiText.saveOverview}
                    </Button>
                  </span>
                ) : (
                  <Button icon={<Edit3 size={16} />} onClick={() => setIsOverviewEditing(true)}>
                    {uiText.editOverview}
                  </Button>
                )}
              </div>
              {isOverviewEditing ? (
                <div className="project-overview-form">
                  <label>
                    {text.productName}
                    <input
                      value={overviewDraft.productName}
                      onChange={(event) => updateOverviewDraft("productName", event.target.value)}
                    />
                  </label>
                  <label>
                    {text.productType}
                    <input
                      value={overviewDraft.style}
                      onChange={(event) => updateOverviewDraft("style", event.target.value)}
                    />
                  </label>
                  <label>
                    {text.audience}
                    <input
                      value={overviewDraft.audience}
                      onChange={(event) => updateOverviewDraft("audience", event.target.value)}
                    />
                  </label>
                  <label>
                    {text.tone}
                    <input
                      value={overviewDraft.tone}
                      onChange={(event) => updateOverviewDraft("tone", event.target.value)}
                    />
                  </label>
                  <label className="wide">
                    {text.sellingPoints}
                    <textarea
                      rows={4}
                      value={overviewDraft.sellingPoints.join("\n")}
                      onChange={(event) =>
                        updateOverviewDraft(
                          "sellingPoints",
                          event.target.value
                            .split(/[\n,，/]+/u)
                            .map((point) => point.trim())
                            .filter(Boolean),
                        )
                      }
                    />
                  </label>
                </div>
              ) : (
                <dl>
                  <div>
                    <dt>{text.productName}</dt>
                    <dd>{project.productName}</dd>
                  </div>
                  <div>
                    <dt>{text.productType}</dt>
                    <dd>{project.style}</dd>
                  </div>
                  <div>
                    <dt>{text.audience}</dt>
                    <dd>{project.audience}</dd>
                  </div>
                  <div>
                    <dt>{text.tone}</dt>
                    <dd>{project.tone}</dd>
                  </div>
                  <div className="wide">
                    <dt>{text.sellingPoints}</dt>
                    <dd>{project.sellingPoints.join(" / ")}</dd>
                  </div>
                </dl>
              )}
            </section>
            <section className="project-info-panel">
              <h3>
                <BarChart3 size={18} aria-hidden="true" />
                {text.dashboard}
              </h3>
              {dashboardPanel}
            </section>
          </div>
        ) : null}

        {activeTab === "materials" ? materialsPanel : null}

        {activeTab === "scripts" ? (
          <section className="project-library-panel">
            <div className="project-library-heading">
              <div>
                <h3>{text.scriptLibrary}</h3>
                <p>{scripts.length > 0 ? plural(scripts.length, "scripts") : text.noScripts}</p>
              </div>
              <Button icon={<Plus size={18} />} onClick={onAddScript} variant="primary">
                {text.addScript}
              </Button>
            </div>
            {scripts.length > 0 ? (
              <div className="project-script-library-layout">
                <ScriptList
                  scripts={scripts}
                  selectedScriptId={selectedScriptId}
                  onSelectScript={setSelectedScriptId}
                  selectLabel={uiText.selectScript}
                  sceneLabel={uiText.scenes}
                />
                {selectedScript ? (
                  <ScriptDetail script={selectedScript} title={uiText.scriptDetail} />
                ) : null}
              </div>
            ) : null}
            {showScriptComposer ? (
              <div className="project-script-composer">{scriptPanel}</div>
            ) : null}
          </section>
        ) : null}

        {activeTab === "videos" ? (
          <section className="project-library-panel">
            <div className="project-library-heading">
              <div>
                <h3>{text.videoLibrary}</h3>
                <p>{videos.length > 0 ? plural(videos.length, "videos") : text.noVideos}</p>
              </div>
              <Button icon={<Film size={18} />} onClick={onGenerateVideo} variant="primary">
                {text.generateVideo}
              </Button>
            </div>
            <VideoList videos={videos} />
          </section>
        ) : null}
      </div>
    </section>
  );
};

const ScriptList = ({
  onSelectScript,
  sceneLabel,
  scripts,
  selectedScriptId,
  selectLabel,
}: {
  onSelectScript: (scriptId: string) => void;
  sceneLabel: string;
  scripts: ScriptResult[];
  selectedScriptId?: string;
  selectLabel: string;
}) => (
  <div className="project-script-grid">
    {scripts.map((script, index) => (
      <button
        aria-label={`${selectLabel}: ${script.hook}`}
        className={`project-library-card project-script-card ${
          selectedScriptId === script.id ? "active" : ""
        }`.trim()}
        key={script.id}
        onClick={() => onSelectScript(script.id)}
        type="button"
      >
        <span>{`${script.scenes.length} ${sceneLabel}`}</span>
        <h4>{`v${index + 1} ${script.hook}`}</h4>
        <p>{script.constraints.slice(0, 2).join(" / ") || script.narrative}</p>
      </button>
    ))}
  </div>
);

const ScriptDetail = ({ script, title }: { script: ScriptResult; title: string }) => (
  <article className="project-script-detail">
    <span>{title}</span>
    <h4>{script.hook}</h4>
    <p>{script.narrative}</p>
    {script.constraints.length > 0 ? (
      <div className="project-script-constraints">
        {script.constraints.map((constraint) => (
          <span key={constraint}>{constraint}</span>
        ))}
      </div>
    ) : null}
    <ol>
      {script.scenes.map((scene) => (
        <li key={scene.id}>
          <strong>{`${scene.order}. ${scene.durationSeconds}s`}</strong>
          <p>{scene.subtitle}</p>
          <small>{scene.visualPrompt}</small>
        </li>
      ))}
    </ol>
  </article>
);

const VideoList = ({ videos }: { videos: RenderTask[] }) =>
  videos.length > 0 ? (
    <div className="project-video-grid">
      {videos.map((video, index) => (
        <article className="project-library-card" key={video.id}>
          <span>{video.provider ?? "renderer"}</span>
          <h4>{`Video ${index + 1}`}</h4>
          <p>{formatUpdatedAt(video.updatedAt)}</p>
          {video.previewUrl || video.exportUrl ? (
            <a href={video.exportUrl ?? video.previewUrl}>Open video</a>
          ) : null}
        </article>
      ))}
    </div>
  ) : (
    <div className="project-empty-state compact">
      <strong>No video items</strong>
    </div>
  );
