import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Boxes,
  Clapperboard,
  Download,
  Film,
  FolderKanban,
  Rocket,
  Sparkles,
} from "lucide-react";

export type WorkspacePageId = "project" | "create" | "studio" | "delivery";

export interface WorkspacePage {
  id: WorkspacePageId;
  label: string;
  title: string;
  description: string;
  accent: string;
  icon: LucideIcon;
}

export const workspacePages: WorkspacePage[] = [
  {
    id: "project",
    label: "Project",
    title: "Project command center",
    description: "Brief, project status, and demo readiness.",
    accent: "rose",
    icon: FolderKanban,
  },
  {
    id: "create",
    label: "Create",
    title: "Creative prep",
    description: "Assets, script, and storyboard generation.",
    accent: "amber",
    icon: Sparkles,
  },
  {
    id: "studio",
    label: "Studio",
    title: "Generation studio",
    description: "Scene preview, timeline cards, and inspector edits.",
    accent: "cyan",
    icon: Film,
  },
  {
    id: "delivery",
    label: "Delivery",
    title: "Delivery room",
    description: "Render trace, preview artifact, and export.",
    accent: "green",
    icon: Download,
  },
];

interface AppShellProps {
  activePage: WorkspacePageId;
  children: ReactNode;
  onPageChange: (page: WorkspacePageId) => void;
  statusLabel: string;
}

export const AppShell = ({ activePage, children, onPageChange, statusLabel }: AppShellProps) => {
  const activePageMeta: WorkspacePage =
    workspacePages.find((page) => page.id === activePage) ?? workspacePages[0]!;
  const ActiveIcon = activePageMeta.icon;

  return (
    <div className="workspace-shell">
      <a className="skip-link" href="#workspace-content">
        Skip to workspace content
      </a>
      <aside className="sidebar" aria-label="Workspace navigation">
        <div className="brand">
          <span className="brand-icon" aria-hidden="true">
            <Clapperboard size={24} strokeWidth={1.8} />
          </span>
          <div>
            <strong>ShopClip AI</strong>
            <span>P0 workspace</span>
          </div>
        </div>
        <nav className="nav-list">
          {workspacePages.map((item) => {
            const Icon = item.icon;
            const isActive = item.id === activePage;
            return (
              <a
                aria-current={isActive ? "page" : undefined}
                className={isActive ? "active" : undefined}
                href={`#${item.id}`}
                key={item.id}
                onClick={(event) => {
                  event.preventDefault();
                  onPageChange(item.id);
                }}
              >
                <Icon size={18} aria-hidden="true" />
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.title}</small>
                </span>
              </a>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <Boxes size={18} aria-hidden="true" />
          <span>P0 grouped into 4 pages</span>
        </div>
      </aside>

      <main className="workspace-main" id="workspace-content">
        <header className="topbar">
          <div className={`page-hero hero-${activePageMeta.accent}`}>
            <div className="page-hero-icon" aria-hidden="true">
              <ActiveIcon size={24} />
            </div>
            <div>
              <p className="eyebrow">P0 ecommerce video generation</p>
              <h1>{activePageMeta.title}</h1>
              <p>{activePageMeta.description}</p>
            </div>
          </div>
          <div className="topbar-status" aria-live="polite">
            <Rocket size={16} aria-hidden="true" />
            {statusLabel}
          </div>
        </header>
        {children}
      </main>
    </div>
  );
};
