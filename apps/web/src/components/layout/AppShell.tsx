import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  CheckCircle2,
  Clapperboard,
  Download,
  Film,
  FolderKanban,
  Images,
  ListChecks,
  Loader2,
  Lightbulb,
  Settings,
  Sparkles,
} from "lucide-react";

import type { AppCopy, Language } from "../../app/i18n";

export type WorkspacePageId =
  | "assets"
  | "inspiration"
  | "settings"
  | "project"
  | "create"
  | "studio"
  | "delivery"
  | "edit"
  | "dashboard";

export type WorkspaceSectionId = "assets" | "inspiration" | "settings" | "create";
export type CreationPageId = Exclude<
  WorkspacePageId,
  "assets" | "inspiration" | "settings" | "edit"
>;

export interface WorkspacePage {
  id: WorkspacePageId;
  accent: string;
  icon: LucideIcon;
}

export interface BackgroundTaskItem {
  description: string;
  id: string;
  progress: number;
  status: "running" | "completed" | "failed";
  title: string;
}

const backgroundTaskAnchorViewportMargin = 0;
const backgroundTaskPopoverViewportMargin = 8;
const backgroundTaskPopoverGap = 8;
const backgroundTaskPopoverWidth = 360;

interface BackgroundTaskRectInput {
  height: number;
  width: number;
}

interface BackgroundTaskViewportInput {
  viewportHeight: number;
  viewportWidth: number;
}

export const clampBackgroundTaskAnchorPosition = ({
  anchor,
  margin = backgroundTaskAnchorViewportMargin,
  position,
  viewport,
}: {
  anchor: BackgroundTaskRectInput;
  margin?: number;
  position: { x: number; y: number };
  viewport: BackgroundTaskViewportInput;
}): { x: number; y: number } => ({
  x: Math.max(margin, Math.min(viewport.viewportWidth - anchor.width - margin, position.x)),
  y: Math.max(margin, Math.min(viewport.viewportHeight - anchor.height - margin, position.y)),
});

export const getBackgroundTaskPopoverStyle = ({
  anchor,
  gap = backgroundTaskPopoverGap,
  margin = backgroundTaskPopoverViewportMargin,
  position,
  preferredWidth = backgroundTaskPopoverWidth,
  viewport,
}: {
  anchor: BackgroundTaskRectInput;
  gap?: number;
  margin?: number;
  position: { x: number; y: number };
  preferredWidth?: number;
  viewport: BackgroundTaskViewportInput;
}): {
  "--background-task-popover-bottom": string;
  "--background-task-popover-left": string;
  "--background-task-popover-top": string;
  "--background-task-popover-width": string;
} => {
  const width = Math.min(preferredWidth, Math.max(0, viewport.viewportWidth - margin * 2));
  const viewportLeft = Math.max(
    margin,
    Math.min(viewport.viewportWidth - width - margin, position.x),
  );
  const hasRoomBelow =
    position.y + anchor.height + gap + 180 <= viewport.viewportHeight - margin;

  return {
    "--background-task-popover-bottom": hasRoomBelow ? "auto" : `${anchor.height + gap}px`,
    "--background-task-popover-left": `${viewportLeft - position.x}px`,
    "--background-task-popover-top": hasRoomBelow ? `${anchor.height + gap}px` : "auto",
    "--background-task-popover-width": `${width}px`,
  };
};

interface WorkspaceSection {
  id: WorkspaceSectionId;
  accent: string;
  icon: LucideIcon;
}

interface CreationWorkspacePage {
  id: CreationPageId;
  accent: string;
  icon: LucideIcon;
}

export const workspacePages: CreationWorkspacePage[] = [
  {
    id: "project",
    accent: "rose",
    icon: FolderKanban,
  },
  {
    id: "create",
    accent: "amber",
    icon: Sparkles,
  },
  {
    id: "studio",
    accent: "cyan",
    icon: Film,
  },
  {
    id: "delivery",
    accent: "green",
    icon: Download,
  },
  {
    id: "dashboard",
    accent: "blue",
    icon: BarChart3,
  },
];

export const workspaceSections: WorkspaceSection[] = [
  {
    id: "assets",
    accent: "cyan",
    icon: Images,
  },
  {
    id: "inspiration",
    accent: "blue",
    icon: Lightbulb,
  },
  {
    id: "create",
    accent: "rose",
    icon: FolderKanban,
  },
];

interface AppShellProps {
  activePage: WorkspacePageId;
  activeSection: WorkspaceSectionId;
  backgroundTasks?: BackgroundTaskItem[];
  children: ReactNode;
  copy: AppCopy;
  language: Language;
  onBackgroundTaskOpen?: (task: BackgroundTaskItem) => void;
  onPageChange: (page: WorkspacePageId) => void;
  onSectionChange: (section: WorkspaceSectionId) => void;
  immersivePage?: boolean;
  projectStudioMode?: boolean;
}

export const AppShell = ({
  activePage,
  activeSection,
  backgroundTasks = [],
  children,
  copy,
  language,
  immersivePage = false,
  onBackgroundTaskOpen,
  onPageChange,
  onSectionChange,
  projectStudioMode = false,
}: AppShellProps) => {
  const showTopbar =
    ((activeSection === "create" && activePage !== "project") || activeSection === "settings") &&
    !projectStudioMode;

  const getSectionText = (section: WorkspaceSectionId) => {
    if (section === "assets") {
      return {
        label: copy.assets.title,
        title: copy.assets.searchRegion,
      };
    }

    if (section === "inspiration") {
      return language === "zh"
        ? { label: "灵感", title: "参考与视频拆解" }
        : { label: "Inspiration", title: "References and video breakdown" };
    }

    if (section === "settings") {
      return language === "zh"
        ? { label: "设置", title: "语言切换与 API 配置" }
        : { label: "Settings", title: "Language and API configuration" };
    }

    return {
      label: copy.pages.project.label,
      title: copy.pages.project.title,
    };
  };

  return (
    <div className={`workspace-shell ${immersivePage ? "workspace-shell-immersive" : ""}`.trim()}>
      <a className="skip-link" href="#workspace-content">
        {copy.app.skipLink}
      </a>
      {!immersivePage ? (
      <aside className="sidebar" aria-label="Workspace navigation">
        <div className="brand">
          <span className="brand-icon" aria-hidden="true">
            <Clapperboard size={24} strokeWidth={1.8} />
          </span>
          <div>
            <strong>ShopClip AI</strong>
            <span>{copy.app.workspaceBadge}</span>
          </div>
        </div>
        <nav className="nav-list">
          {workspaceSections.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === activeSection;
            const itemCopy = getSectionText(item.id);
            return (
              <a
                aria-current={isActive ? "page" : undefined}
                className={isActive ? "active" : undefined}
                href={
                  item.id === "assets"
                    ? "#assets"
                    : item.id === "inspiration"
                      ? "#inspiration"
                      : "#project"
                }
                key={item.id}
                onClick={(event) => {
                  event.preventDefault();
                  onSectionChange(item.id);
                }}
              >
                <Icon size={18} aria-hidden="true" />
                <span>
                  <strong>{itemCopy.label}</strong>
                  <small>{itemCopy.title}</small>
                </span>
              </a>
            );
          })}
        </nav>
        <button
          aria-pressed={activePage === "settings"}
          className={`sidebar-footer settings-entry ${activePage === "settings" ? "active" : ""}`}
          onClick={() => onSectionChange("settings")}
          type="button"
        >
          <Settings size={18} aria-hidden="true" />
          <span>{getSectionText("settings").label}</span>
        </button>
      </aside>
      ) : null}

      <main className={`workspace-main ${immersivePage ? "workspace-main-immersive" : ""}`.trim()} id="workspace-content">
        {!immersivePage && showTopbar ? (
          <header className="topbar">
            {activeSection === "create" ? (
              <nav className="flow-tabs" aria-label="Creation workflow">
                {workspacePages.map((page) => {
                  const Icon = page.icon;
                  const pageCopy = copy.pages[page.id];
                  const isActive = activePage === page.id;
                  return (
                    <button
                      aria-pressed={isActive}
                      className={isActive ? "active" : undefined}
                      key={page.id}
                      onClick={() => onPageChange(page.id)}
                      type="button"
                    >
                      <Icon size={16} aria-hidden="true" />
                      <span>{pageCopy.label}</span>
                    </button>
                  );
                })}
              </nav>
            ) : (
              <div className="section-title">
                <strong>{getSectionText(activeSection).label}</strong>
                <span>{getSectionText(activeSection).title}</span>
              </div>
            )}
          </header>
        ) : null}
        {!immersivePage && activeSection === "create" && activePage !== "project" && !projectStudioMode ? (
          <nav className="creation-stepper" aria-label="Creation progress">
            {workspacePages.map((page, index) => {
              const Icon = page.icon;
              const pageCopy = copy.pages[page.id];
              const activeIndex = workspacePages.findIndex((item) => item.id === activePage);
              const isActive = activePage === page.id;
              const isComplete = activeIndex > index;
              return (
                <button
                  aria-current={isActive ? "step" : undefined}
                  className={`${isActive ? "active" : ""} ${isComplete ? "complete" : ""}`.trim()}
                  key={page.id}
                  onClick={() => onPageChange(page.id)}
                  type="button"
                >
                  <span className="creation-stepper-index">
                    {isComplete ? (
                      <CheckCircle2 size={16} aria-hidden="true" />
                    ) : (
                      String(index + 1).padStart(2, "0")
                    )}
                  </span>
                  <span>
                    <strong>{pageCopy.label}</strong>
                    <small>{pageCopy.title}</small>
                  </span>
                  <Icon size={16} aria-hidden="true" />
                </button>
              );
            })}
          </nav>
        ) : null}
        {children}
      </main>
      <BackgroundTaskBar
        language={language}
        onOpenTask={onBackgroundTaskOpen}
        tasks={backgroundTasks}
      />
    </div>
  );
};

const BackgroundTaskBar = ({
  language,
  onOpenTask,
  tasks,
}: {
  language: Language;
  onOpenTask?: (task: BackgroundTaskItem) => void;
  tasks: BackgroundTaskItem[];
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number } | undefined>();
  const dragStateRef = useRef<
    | {
        height: number;
        offsetX: number;
        offsetY: number;
        startX: number;
        startY: number;
        width: number;
      }
    | undefined
  >(undefined);
  const didDragRef = useRef(false);
  const latestPositionRef = useRef<{ x: number; y: number } | undefined>(undefined);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const taskBarRef = useRef<HTMLDivElement | null>(null);
  const [anchorSize, setAnchorSize] = useState<BackgroundTaskRectInput>({
    height: 52,
    width: 174,
  });
  const runningTasks = tasks.filter((task) => task.status === "running");

  const runningCount = runningTasks.length;
  const runningProgress =
    runningCount > 0
      ? Math.round(
          runningTasks.reduce(
            (total, task) => total + Math.max(0, Math.min(100, task.progress)),
            0,
          ) / runningCount,
        )
      : 100;
  const copyText =
    language === "zh"
      ? {
          buttonLabel: runningCount > 0 ? `后台任务，${runningCount} 个执行中` : "后台任务已完成",
          complete: "全部完成",
          empty: "暂无后台任务",
          failed: "失败",
          openList: "后台任务",
          running: "执行中",
        }
      : {
          buttonLabel: runningCount > 0 ? `${runningCount} background task(s) running` : "Background tasks complete",
          complete: "All complete",
          empty: "No background tasks",
          failed: "Failed",
          openList: "Background tasks",
          running: "Running",
        };

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const fallbackWidth = 174;
    const fallbackPosition = {
      x: Math.max(12, window.innerWidth - fallbackWidth - 18),
      y: 18,
    };

    try {
      const storedPosition = window.localStorage.getItem("shopclip-background-task-position");
      if (storedPosition) {
        const parsedPosition = JSON.parse(storedPosition) as { x?: unknown; y?: unknown };
        if (typeof parsedPosition.x === "number" && typeof parsedPosition.y === "number") {
          setPosition({
            x: Math.max(
              backgroundTaskAnchorViewportMargin,
              Math.min(window.innerWidth - 80, parsedPosition.x),
            ),
            y: Math.max(
              backgroundTaskAnchorViewportMargin,
              Math.min(window.innerHeight - 52, parsedPosition.y),
            ),
          });
          return;
        }
      }
    } catch {
      // Ignore invalid persisted positions and fall back to the default top-right placement.
    }

    setPosition(fallbackPosition);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !position) {
      return;
    }

    const handleResize = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      const nextAnchorSize = {
        height: rect?.height ?? anchorSize.height,
        width: rect?.width ?? anchorSize.width,
      };
      setAnchorSize(nextAnchorSize);
      setPosition((current) => {
        if (!current) {
          return current;
        }
        return clampBackgroundTaskAnchorPosition({
          anchor: nextAnchorSize,
          position: current,
          viewport: {
            viewportHeight: window.innerHeight,
            viewportWidth: window.innerWidth,
          },
        });
      });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [anchorSize.height, anchorSize.width, position]);

  const persistPosition = (nextPosition: { x: number; y: number }) => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem("shopclip-background-task-position", JSON.stringify(nextPosition));
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) {
      return;
    }

    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    const nextAnchorSize = {
      height: rect.height,
      width: rect.width,
    };
    setAnchorSize(nextAnchorSize);
    dragStateRef.current = {
      height: rect.height,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      startX: event.clientX,
      startY: event.clientY,
      width: rect.width,
    };
    didDragRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const dragState = dragStateRef.current;
    if (!dragState || typeof window === "undefined") {
      return;
    }

    const nextPosition = clampBackgroundTaskAnchorPosition({
      anchor: {
        height: dragState.height,
        width: dragState.width,
      },
      position: {
        x: event.clientX - dragState.offsetX,
        y: event.clientY - dragState.offsetY,
      },
      viewport: {
        viewportHeight: window.innerHeight,
        viewportWidth: window.innerWidth,
      },
    });
    didDragRef.current =
      didDragRef.current ||
      Math.abs(event.clientX - dragState.startX) > 8 ||
      Math.abs(event.clientY - dragState.startY) > 8;
    latestPositionRef.current = nextPosition;
    setPosition(nextPosition);
  };

  const handlePointerEnd = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragStateRef.current = undefined;
    const latestPosition = latestPositionRef.current ?? position;
    if (latestPosition) {
      persistPosition(latestPosition);
    }
    window.setTimeout(() => {
      didDragRef.current = false;
    }, 0);
  };

  return (
    <div
      className={`background-task-bar ${isOpen ? "is-open" : ""} ${dragStateRef.current ? "is-dragging" : ""}`}
      ref={taskBarRef}
      style={
        position && typeof window !== "undefined"
          ? {
              ...getBackgroundTaskPopoverStyle({
                anchor: anchorSize,
                position,
                viewport: {
                  viewportHeight: window.innerHeight,
                  viewportWidth: window.innerWidth,
                },
              }),
              bottom: "auto",
              left: `${position.x}px`,
              right: "auto",
              top: `${position.y}px`,
            }
          : undefined
      }
    >
      <button
        aria-expanded={isOpen}
        aria-label={copyText.buttonLabel}
        className="background-task-trigger"
        ref={triggerRef}
        onPointerCancel={handlePointerEnd}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onClick={() => {
          if (didDragRef.current) {
            return;
          }
          setIsOpen((current) => !current);
        }}
        type="button"
      >
        <span className={`background-task-indicator ${runningCount > 0 ? "is-running" : ""}`}>
          {runningCount > 0 ? (
            <>
              <Loader2 className="spin" size={18} aria-hidden="true" />
              <strong>{runningCount}</strong>
            </>
          ) : (
            <CheckCircle2 size={19} aria-hidden="true" />
          )}
        </span>
        <span className="background-task-trigger-copy">
          <strong>
            {runningCount > 0 ? `${copyText.running} ${runningProgress}%` : copyText.complete}
          </strong>
          <small>{copyText.openList}</small>
          {runningCount > 0 ? (
            <span className="background-task-trigger-progress" aria-hidden="true">
              <i style={{ width: `${runningProgress}%` }} />
            </span>
          ) : null}
        </span>
      </button>
      {isOpen ? (
        <section className="background-task-popover" aria-label={copyText.openList}>
          <div className="background-task-popover-heading">
            <ListChecks size={18} aria-hidden="true" />
            <strong>{copyText.openList}</strong>
          </div>
          <div className="background-task-list">
            {tasks.length > 0 ? (
              tasks.map((task) => (
                <button
                  className={`background-task-item background-task-item-${task.status}`}
                  key={task.id}
                  onClick={() => {
                    onOpenTask?.(task);
                    setIsOpen(false);
                  }}
                  type="button"
                >
                  <span className="background-task-item-status">
                    {task.status === "running" ? (
                      <Loader2 className="spin" size={16} aria-hidden="true" />
                    ) : task.status === "failed" ? (
                      <span aria-hidden="true">!</span>
                    ) : (
                      <CheckCircle2 size={16} aria-hidden="true" />
                    )}
                  </span>
                  <span className="background-task-item-copy">
                    <strong>{task.title}</strong>
                    <small>{task.description}</small>
                    <span className="background-task-progress" aria-hidden="true">
                      <i style={{ width: `${Math.max(0, Math.min(100, task.progress))}%` }} />
                    </span>
                  </span>
                  <em>
                    {task.status === "running"
                      ? `${Math.round(task.progress)}%`
                      : task.status === "failed"
                        ? copyText.failed
                        : "100%"}
                  </em>
                </button>
              ))
            ) : (
              <p>{copyText.empty}</p>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
};
