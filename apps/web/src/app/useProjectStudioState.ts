import { useState } from "react";

export type ProjectStudioFlow = "script" | "storyboard" | "render";

export interface ProjectStudioState {
  enterProjectStudioFlow: (flow: ProjectStudioFlow) => void;
  exitProjectStudioMode: () => void;
  isProjectStudioMode: boolean;
  projectStudioFlow: ProjectStudioFlow;
  projectStudioPreviewScriptId?: string;
  resetProjectStudioMode: () => void;
  setProjectStudioFlow: (flow: ProjectStudioFlow) => void;
  setProjectStudioPreviewScriptId: (scriptId: string | undefined) => void;
}

export const useProjectStudioState = (): ProjectStudioState => {
  const [isProjectStudioMode, setIsProjectStudioMode] = useState(false);
  const [projectStudioFlow, setProjectStudioFlow] = useState<ProjectStudioFlow>("script");
  const [projectStudioPreviewScriptId, setProjectStudioPreviewScriptId] = useState<
    string | undefined
  >();

  const enterProjectStudioFlow = (flow: ProjectStudioFlow) => {
    setIsProjectStudioMode(true);
    setProjectStudioFlow(flow);
  };

  const exitProjectStudioMode = () => {
    setIsProjectStudioMode(false);
  };

  const resetProjectStudioMode = () => {
    setIsProjectStudioMode(false);
    setProjectStudioFlow("script");
  };

  return {
    enterProjectStudioFlow,
    exitProjectStudioMode,
    isProjectStudioMode,
    projectStudioFlow,
    projectStudioPreviewScriptId,
    resetProjectStudioMode,
    setProjectStudioFlow,
    setProjectStudioPreviewScriptId,
  };
};
