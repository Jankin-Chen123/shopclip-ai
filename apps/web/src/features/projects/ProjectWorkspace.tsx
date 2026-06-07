import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { ProjectBrief, ProjectSummary, RenderTask, ScriptResult } from "@shopclip/shared";
import {
  ArrowLeft,
  BarChart3,
  Box,
  Check,
  Download,
  Edit3,
  FileText,
  Film,
  Images,
  Plus,
  Scissors,
  Trash2,
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
  onCloseScriptComposer: () => void;
  onDeleteRenderTask: (renderTaskId: string) => void;
  onDeleteProject: (projectId: string) => void;
  onDeleteScript: (scriptId: string) => void;
  onGenerateVideo: () => void;
  onLoadProject: (projectId: string) => void;
  onRenameRenderTask: (renderTaskId: string, displayName: string) => void;
  onRenameScript: (scriptId: string, displayName: string) => void;
  onSmartEditVideo: (renderTaskId: string) => void;
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
        openProject: "打开项目工作区",
        createProject: "新建项目",
        searchPlaceholder: "搜索产品名称或品牌",
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
        openProject: "Open project workspace",
        createProject: "Create project",
        searchPlaceholder: "Search product name or brand",
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
        smartEdit: "Smart edit",
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

interface MarkdownTableBlock {
  type: "table";
  headers: string[];
  rows: string[][];
}

interface MarkdownParagraphBlock {
  type: "paragraph";
  text: string;
}

type MarkdownBlock = MarkdownTableBlock | MarkdownParagraphBlock;

const isMarkdownDividerCell = (value: string): boolean => /^:?-{3,}:?$/u.test(value.trim());

const splitMarkdownTableCells = (line: string): string[] =>
  line
    .trim()
    .replace(/^\|/u, "")
    .replace(/\|$/u, "")
    .split("|")
    .map((cell) => cell.trim());

const visualColumnIndexForHeaders = (headers: string[]): number => {
  const normalizedHeaders = headers.map((header) => header.toLowerCase());
  const visualIndex = normalizedHeaders.findIndex(
    (header) =>
      header.includes("画面") ||
      header.includes("visual") ||
      header.includes("prompt"),
  );
  if (visualIndex >= 0) {
    return visualIndex;
  }
  return headers.length >= 5 ? 3 : Math.max(0, headers.length - 2);
};

const normalizeMarkdownTableRow = (headers: string[], row: string[]): string[] => {
  if (row.length === headers.length) {
    return row;
  }
  if (row.length < headers.length) {
    return [...row, ...Array.from({ length: headers.length - row.length }, () => "")];
  }

  const visualIndex = visualColumnIndexForHeaders(headers);
  const tailColumnCount = headers.length - visualIndex - 1;
  if (visualIndex <= 0 || tailColumnCount < 1) {
    return [...row.slice(0, headers.length - 1), row.slice(headers.length - 1).join(" | ")];
  }

  const head = row.slice(0, visualIndex);
  const tail = row.slice(row.length - tailColumnCount);
  const mergedVisual = row.slice(visualIndex, row.length - tailColumnCount).join(" | ");
  return [...head, mergedVisual, ...tail];
};

const isLikelyTableRowStart = (value: string): boolean =>
  /^\d+(?:\.\d+)?\s*(?:s|秒)?(?:\s*[-~至到]\s*\d+(?:\.\d+)?\s*(?:s|秒)?)?$/iu.test(
    value.trim(),
  );

const parseInlineMarkdownTable = (text: string): MarkdownTableBlock | undefined => {
  const cells = splitMarkdownTableCells(text);
  const dividerIndex = cells.findIndex(isMarkdownDividerCell);
  if (dividerIndex <= 0) {
    return undefined;
  }

  const headers = cells.slice(0, dividerIndex);
  const rowWidth = headers.length;
  if (rowWidth === 0 || dividerIndex + rowWidth >= cells.length) {
    return undefined;
  }

  const rows: string[][] = [];
  const dataCells = cells.slice(dividerIndex + rowWidth);
  const rawRows: string[][] = [];
  let currentRow: string[] = [];
  for (const cell of dataCells) {
    if (currentRow.length > 0 && isLikelyTableRowStart(cell)) {
      rawRows.push(currentRow);
      currentRow = [cell];
    } else {
      currentRow.push(cell);
    }
  }
  if (currentRow.length > 0) {
    rawRows.push(currentRow);
  }

  for (const rawRow of rawRows) {
    const row = normalizeMarkdownTableRow(headers, rawRow);
    if (row.some((cell) => cell.length > 0)) {
      rows.push(row);
    }
  }

  return rows.length > 0 ? { type: "table", headers, rows } : undefined;
};

const parseMarkdownBlocks = (value: string): MarkdownBlock[] => {
  const normalized = value.trim();
  if (!normalized) {
    return [];
  }

  const inlineTable = parseInlineMarkdownTable(normalized);
  if (inlineTable) {
    return [inlineTable];
  }

  const lines = normalized
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
  const blocks: MarkdownBlock[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const current = lines[index] ?? "";
    const next = lines[index + 1] ?? "";
    if (current.includes("|") && next.split("|").some(isMarkdownDividerCell)) {
      const headers = splitMarkdownTableCells(current);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && (lines[index] ?? "").includes("|")) {
        const row = normalizeMarkdownTableRow(headers, splitMarkdownTableCells(lines[index] ?? ""));
        if (row.some((cell) => cell.length > 0)) {
          rows.push(row);
        }
        index += 1;
      }
      index -= 1;
      blocks.push({ type: "table", headers, rows });
    } else {
      blocks.push({ type: "paragraph", text: current });
    }
  }
  return blocks;
};

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
  onCloseScriptComposer,
  onCreateProject,
  onDeleteRenderTask,
  onDeleteProject,
  onDeleteScript,
  onGenerateVideo,
  onLoadProject,
  onRenameRenderTask,
  onRenameScript,
  onSmartEditVideo,
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
  const [selectedVideoId, setSelectedVideoId] = useState<string | undefined>();

  useEffect(() => {
    if (!project) {
      setIsOverviewEditing(false);
      setSelectedScriptId(undefined);
      setSelectedVideoId(undefined);
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
    setSelectedScriptId(undefined);
    setSelectedVideoId(undefined);
  }, [project?.id]);

  useEffect(() => {
    if (!project || project.scripts.length === 0 || !selectedScriptId) {
      return;
    }
    if (!project.scripts.some((script) => script.id === selectedScriptId)) {
      setSelectedScriptId(undefined);
    }
  }, [project?.scripts.length, selectedScriptId]);

  if (!project) {
    return (
      <section className="project-portfolio" aria-labelledby="project-portfolio-title">
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
        <label className="project-search">
          <span>{text.searchPlaceholder}</span>
          <input placeholder={text.searchPlaceholder} type="search" />
        </label>
        {projectHistory.length > 0 ? (
          <div className="project-card-grid">
            {projectHistory.map((historyProject, index) => {
              const coverUrl = getProjectCoverUrl(historyProject);
              const deleteLabel =
                language === "zh"
                  ? `\u5220\u9664\u9879\u76ee ${historyProject.title}`
                  : `Delete project ${historyProject.title}`;
              return (
                <article className="project-card-shell" key={historyProject.id}>
                  <button
                    aria-label={historyProject.title}
                    className="project-card"
                    disabled={disabled || isHistoryLoading}
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
                  <Button
                    aria-label={deleteLabel}
                    className="project-card-delete project-card-delete-project"
                    disabled={disabled || isHistoryLoading}
                    icon={<Trash2 size={16} />}
                    onClick={() => onDeleteProject(historyProject.id)}
                    variant="danger"
                  >
                    <span className="sr-only">{language === "zh" ? "\u5220\u9664\u9879\u76ee" : "Delete project"}</span>
                  </Button>
                </article>
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
  const selectedVideo = videos.find((candidate) => candidate.id === selectedVideoId);
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
        <Button
          className="project-detail-delete"
          disabled={disabled}
          icon={<Trash2 size={18} />}
          onClick={() => onDeleteProject(project.id)}
          variant="danger"
        >
          {language === "zh" ? "\u5220\u9664\u9879\u76ee" : "Delete project"}
        </Button>
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
                  onDeleteScript={onDeleteScript}
                  onRenameScript={onRenameScript}
                  onSelectScript={setSelectedScriptId}
                  selectLabel={uiText.selectScript}
                  sceneLabel={uiText.scenes}
                />
              </div>
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
            <VideoList
              videos={videos}
              onDeleteRenderTask={onDeleteRenderTask}
              onRenameRenderTask={onRenameRenderTask}
              onPreviewVideo={setSelectedVideoId}
              onSmartEditVideo={onSmartEditVideo}
              downloadLabel={language === "zh" ? "\u4e0b\u8f7d\u89c6\u9891" : "Download video"}
              smartEditLabel={language === "zh" ? "\u667a\u80fd\u526a\u8f91" : "Smart edit"}
            />
          </section>
        ) : null}
      </div>

      {selectedScript ? (
        <ProjectModal title={uiText.scriptDetail} onClose={() => setSelectedScriptId(undefined)}>
          <ScriptDetail script={selectedScript} />
        </ProjectModal>
      ) : null}

      {showScriptComposer ? (
        <ProjectModal title={text.addScript} onClose={onCloseScriptComposer}>
          <div className="project-script-composer">{scriptPanel}</div>
        </ProjectModal>
      ) : null}

      {selectedVideo ? (
        <ProjectModal
          title={language === "zh" ? "\u89c6\u9891\u9884\u89c8" : "Video preview"}
          onClose={() => setSelectedVideoId(undefined)}
        >
          <VideoPreview
            noPreviewText={
              language === "zh"
                ? "\u8be5\u89c6\u9891\u6682\u65e0\u53ef\u9884\u89c8\u5730\u5740\u3002"
                : "This video has no preview URL yet."
            }
            downloadLabel={language === "zh" ? "\u4e0b\u8f7d\u89c6\u9891" : "Download video"}
            title={language === "zh" ? "\u89c6\u9891\u9884\u89c8" : "Video preview"}
            video={selectedVideo}
          />
        </ProjectModal>
      ) : null}
    </section>
  );
};

const ScriptList = ({
  onDeleteScript,
  onRenameScript,
  onSelectScript,
  sceneLabel,
  scripts,
  selectedScriptId,
  selectLabel,
}: {
  onDeleteScript: (scriptId: string) => void;
  onRenameScript: (scriptId: string, displayName: string) => void;
  onSelectScript: (scriptId: string) => void;
  sceneLabel: string;
  scripts: ScriptResult[];
  selectedScriptId?: string;
  selectLabel: string;
}) => (
  <div className="project-script-grid">
    {scripts.map((script) => {
      const cardTitle = script.displayName ?? script.hook;
      return (
      <article
        aria-label={`${selectLabel}: ${cardTitle}`}
        className={`project-library-card project-script-card ${
          selectedScriptId === script.id ? "active" : ""
        }`.trim()}
        key={script.id}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelectScript(script.id);
          }
        }}
        onClick={() => onSelectScript(script.id)}
        role="button"
        tabIndex={0}
      >
        <button
          aria-label={`Delete ${script.hook}`}
          className="project-card-delete"
          onClick={(event) => {
            event.stopPropagation();
            onDeleteScript(script.id);
          }}
          type="button"
        >
          <Trash2 size={15} aria-hidden="true" />
        </button>
        <span>{`${script.scenes.length} ${sceneLabel}`}</span>
        <EditableLibraryTitle
          defaultValue={script.hook}
          onSave={(displayName) => onRenameScript(script.id, displayName)}
          title={cardTitle}
        />
      </article>
      );
    })}
  </div>
);

export const ScriptDetail = ({
  script,
}: {
  script: ScriptResult;
}) => {
  const keywordConstraints = script.constraints.filter((constraint) =>
    /关键词|keyword/iu.test(constraint),
  );

  return (
    <article className="project-script-detail">
      <h4>{script.hook}</h4>
      <MarkdownContent value={script.narrative} />
      {keywordConstraints.length > 0 ? (
      <div className="project-script-constraints">
        {keywordConstraints.map((constraint) => (
          <span key={constraint}>{constraint}</span>
        ))}
      </div>
    ) : null}
    </article>
  );
};

const EditableLibraryTitle = ({
  defaultValue,
  onSave,
  title,
}: {
  defaultValue: string;
  onSave: (displayName: string) => void;
  title: string;
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onSave(draft);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <form className="project-card-name-editor" onClick={(event) => event.stopPropagation()} onSubmit={handleSubmit}>
        <input
          aria-label="Card name"
          autoFocus
          maxLength={80}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setDraft(title);
              setIsEditing(false);
            }
          }}
          placeholder={defaultValue}
          value={draft}
        />
        <button aria-label="Save name" type="submit">
          <Check size={15} aria-hidden="true" />
        </button>
        <button
          aria-label="Cancel rename"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setDraft(title);
            setIsEditing(false);
          }}
          type="button"
        >
          <X size={15} aria-hidden="true" />
        </button>
      </form>
    );
  }

  return (
    <div className="project-card-name-row">
      <h4>{title}</h4>
      <button
        aria-label="Rename card"
        className="project-card-rename"
        onClick={(event) => {
          event.stopPropagation();
          setDraft(title);
          setIsEditing(true);
        }}
        type="button"
      >
        <Edit3 size={15} aria-hidden="true" />
      </button>
    </div>
  );
};

const MarkdownContent = ({ value }: { value: string }) => {
  const blocks = parseMarkdownBlocks(value);
  return (
    <div className="project-markdown-content">
      {blocks.map((block, blockIndex) =>
        block.type === "table" ? (
          <div className="project-markdown-table-wrap" key={`table-${blockIndex}`}>
            <table>
              <thead>
                <tr>
                  {block.headers.map((header, headerIndex) => (
                    <th key={`${header}-${headerIndex}`}>{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, rowIndex) => (
                  <tr key={`row-${rowIndex}`}>
                    {block.headers.map((header, cellIndex) => (
                      <td key={`${header}-${cellIndex}`}>{row[cellIndex] ?? ""}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p key={`paragraph-${blockIndex}`}>{block.text}</p>
        ),
      )}
    </div>
  );
};

const VideoList = ({
  downloadLabel,
  onDeleteRenderTask,
  onRenameRenderTask,
  onPreviewVideo,
  onSmartEditVideo,
  smartEditLabel,
  videos,
}: {
  downloadLabel: string;
  onDeleteRenderTask: (renderTaskId: string) => void;
  onRenameRenderTask: (renderTaskId: string, displayName: string) => void;
  onPreviewVideo: (renderTaskId: string) => void;
  onSmartEditVideo: (renderTaskId: string) => void;
  smartEditLabel: string;
  videos: RenderTask[];
}) =>
  videos.length > 0 ? (
    <div className="project-video-grid">
      {videos.map((video, index) => {
        const defaultTitle = `Video ${index + 1}`;
        const cardTitle = video.displayName ?? defaultTitle;
        return (
        <article
          aria-label={cardTitle}
          className="project-library-card project-video-card"
          key={video.id}
          onClick={() => onPreviewVideo(video.id)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onPreviewVideo(video.id);
            }
          }}
          role="button"
          tabIndex={0}
        >
          <button
            aria-label={`Delete ${cardTitle}`}
            className="project-card-delete"
            onClick={(event) => {
              event.stopPropagation();
              onDeleteRenderTask(video.id);
            }}
            type="button"
          >
            <Trash2 size={15} aria-hidden="true" />
          </button>
          <span>{video.provider ?? "renderer"}</span>
          <EditableLibraryTitle
            defaultValue={defaultTitle}
            onSave={(displayName) => onRenameRenderTask(video.id, displayName)}
            title={cardTitle}
          />
          <p>{formatUpdatedAt(video.updatedAt)}</p>
          <div className="project-video-actions">
            <button
              className="project-video-link project-video-smart-edit"
              onClick={(event) => {
                event.stopPropagation();
                onSmartEditVideo(video.id);
              }}
              type="button"
            >
              <Scissors size={15} aria-hidden="true" />
              {smartEditLabel}
            </button>
            {video.previewUrl || video.exportUrl ? (
              <a
                className="project-video-link"
                download
                href={video.exportUrl ?? video.previewUrl}
                onClick={(event) => event.stopPropagation()}
              >
                <Download size={15} aria-hidden="true" />
                {downloadLabel}
              </a>
            ) : null}
          </div>
        </article>
        );
      })}
    </div>
  ) : (
    <div className="project-empty-state compact">
      <strong>No video items</strong>
    </div>
  );

const VideoPreview = ({
  downloadLabel,
  noPreviewText,
  title,
  video,
}: {
  downloadLabel: string;
  noPreviewText: string;
  title: string;
  video: RenderTask;
}) => {
  const videoUrl = video.previewUrl ?? video.exportUrl;
  return (
    <article className="project-video-preview">
      <div className="project-detail-card-heading">
        <span>{title}</span>
        {videoUrl ? (
          <a className="project-video-link" download href={videoUrl}>
            <Download size={15} aria-hidden="true" />
            {downloadLabel}
          </a>
        ) : null}
      </div>
      <h4>{video.displayName ?? video.provider ?? "renderer"}</h4>
      <p>{formatUpdatedAt(video.updatedAt)}</p>
      {videoUrl ? (
        <video controls preload="metadata" src={videoUrl}>
          {noPreviewText}
        </video>
      ) : (
        <div className="project-empty-state compact">
          <strong>{noPreviewText}</strong>
        </div>
      )}
    </article>
  );
};

export const ProjectModal = ({
  children,
  onClose,
  title,
}: {
  children: ReactNode;
  onClose: () => void;
  title: string;
}) => {
  const modal = (
    <div className="project-modal-backdrop" role="presentation">
      <section className="project-modal" role="dialog" aria-modal="true" aria-label={title}>
        <button aria-label="Close" className="project-modal-close" onClick={onClose} type="button">
          <X size={18} aria-hidden="true" />
        </button>
        {children}
      </section>
    </div>
  );

  return typeof document === "undefined" ? modal : createPortal(modal, document.body);
};
