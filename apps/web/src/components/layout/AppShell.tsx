import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Boxes,
  Clapperboard,
  Download,
  Film,
  FolderKanban,
  Rocket,
  Sparkles,
} from "lucide-react";

import type { AppCopy, Language } from "../../app/i18n";
import { languageNames } from "../../app/i18n";

export type WorkspacePageId = "project" | "create" | "studio" | "delivery" | "dashboard";

export interface WorkspacePage {
  id: WorkspacePageId;
  accent: string;
  icon: LucideIcon;
}

export const workspacePages: WorkspacePage[] = [
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

interface AppShellProps {
  activePage: WorkspacePageId;
  children: ReactNode;
  copy: AppCopy;
  language: Language;
  onPageChange: (page: WorkspacePageId) => void;
  onLanguageChange: (language: Language) => void;
  statusLabel: string;
}

export const AppShell = ({
  activePage,
  children,
  copy,
  language,
  onLanguageChange,
  onPageChange,
  statusLabel,
}: AppShellProps) => {
  const activePageMeta: WorkspacePage =
    workspacePages.find((page) => page.id === activePage) ?? workspacePages[0]!;
  const activePageCopy = copy.pages[activePageMeta.id];
  const ActiveIcon = activePageMeta.icon;

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
        <fieldset className="language-switcher" aria-label={copy.app.languageLabel}>
          <legend>{copy.app.languageShortLabel}</legend>
          {(["en", "zh"] as const).map((option) => (
            <button
              aria-pressed={language === option}
              className={language === option ? "active" : undefined}
              key={option}
              onClick={() => onLanguageChange(option)}
              type="button"
            >
              {languageNames[option]}
            </button>
          ))}
        </fieldset>
        <nav className="nav-list">
          {workspacePages.map((item) => {
            const Icon = item.icon;
            const itemCopy = copy.pages[item.id];
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
                  <strong>{itemCopy.label}</strong>
                  <small>{itemCopy.title}</small>
                </span>
              </a>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <Boxes size={18} aria-hidden="true" />
          <span>{copy.app.sidebarFooter}</span>
        </div>
      </aside>

      <main className="workspace-main" id="workspace-content">
        <header className="topbar">
          <div className={`page-hero hero-${activePageMeta.accent}`}>
            <div className="page-hero-icon" aria-hidden="true">
              <ActiveIcon size={24} />
            </div>
            <div>
              <p className="eyebrow">{copy.app.eyebrow}</p>
              <h1>{activePageCopy.title}</h1>
              <p>{activePageCopy.description}</p>
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
