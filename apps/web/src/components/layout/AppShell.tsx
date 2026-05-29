import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  CheckCircle2,
  Clapperboard,
  Download,
  Film,
  FolderKanban,
  Images,
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
  | "dashboard";

export type WorkspaceSectionId = "assets" | "inspiration" | "settings" | "create";
export type CreationPageId = Exclude<WorkspacePageId, "assets" | "inspiration" | "settings">;

export interface WorkspacePage {
  id: WorkspacePageId;
  accent: string;
  icon: LucideIcon;
}

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
    accent: "amber",
    icon: Sparkles,
  },
];

interface AppShellProps {
  activePage: WorkspacePageId;
  activeSection: WorkspaceSectionId;
  children: ReactNode;
  copy: AppCopy;
  language: Language;
  onPageChange: (page: WorkspacePageId) => void;
  onSectionChange: (section: WorkspaceSectionId) => void;
}

export const AppShell = ({
  activePage,
  activeSection,
  children,
  copy,
  language,
  onPageChange,
  onSectionChange,
}: AppShellProps) => {
  const showTopbar = activeSection === "create" || activeSection === "settings";

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
      label: copy.pages.create.label,
      title: copy.pages.create.title,
    };
  };

  return (
    <div className="workspace-shell">
      <a className="skip-link" href="#workspace-content">
        {copy.app.skipLink}
      </a>
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

      <main className="workspace-main" id="workspace-content">
        {showTopbar ? (
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
        {activeSection === "create" ? (
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
    </div>
  );
};
