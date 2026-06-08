import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  WorkspacePageId,
  WorkspaceSectionId,
} from "../components/layout/AppShell";
import { getPageTransitionDirection, pageFromHash, type PageTransitionDirection } from "./AppSetupUtils";
import { isLanguage, type Language } from "./i18n";

const getStoredLanguage = (): Language => {
  if (typeof window === "undefined") {
    return "en";
  }
  const storedLanguage = window.localStorage.getItem("shopclip-language");
  return isLanguage(storedLanguage) ? storedLanguage : "en";
};

interface WorkspaceNavigationStateInput {
  initialLanguage?: Language;
  initialPage?: WorkspacePageId;
}

export interface WorkspaceNavigationState {
  activePage: WorkspacePageId;
  activeSection: WorkspaceSectionId;
  language: Language;
  pageTransitionDirection: PageTransitionDirection;
  setLanguage: (language: Language) => void;
  updateActivePage: (nextPage: WorkspacePageId) => void;
}

export const useWorkspaceNavigationState = ({
  initialLanguage,
  initialPage,
}: WorkspaceNavigationStateInput): WorkspaceNavigationState => {
  const [language, setLanguage] = useState<Language>(() => initialLanguage ?? getStoredLanguage());
  const [activePage, setActivePage] = useState<WorkspacePageId>(
    () => initialPage ?? pageFromHash(),
  );
  const [pageTransitionDirection, setPageTransitionDirection] =
    useState<PageTransitionDirection>("neutral");

  const updateActivePage = useCallback((nextPage: WorkspacePageId) => {
    setActivePage((previousPage) => {
      setPageTransitionDirection(getPageTransitionDirection(previousPage, nextPage));
      return nextPage;
    });
  }, []);

  useEffect(() => {
    const handleHashChange = () => updateActivePage(pageFromHash());
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, [updateActivePage]);

  const activeSection = useMemo<WorkspaceSectionId>(
    () =>
      activePage === "assets"
        ? "assets"
        : activePage === "inspiration"
          ? "inspiration"
          : activePage === "settings"
            ? "settings"
            : "create",
    [activePage],
  );

  return {
    activePage,
    activeSection,
    language,
    pageTransitionDirection,
    setLanguage,
    updateActivePage,
  };
};
