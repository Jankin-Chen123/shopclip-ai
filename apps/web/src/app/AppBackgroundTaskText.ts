import type { BackgroundTaskItem } from "../components/layout/AppShell";
import type { BackgroundTaskKind } from "./useBackgroundTaskTracker";
import type { Language } from "./i18n";

export const getGenerationTaskText = (
  kind: BackgroundTaskKind,
  language: Language,
): Pick<BackgroundTaskItem, "description" | "title"> => {
  if (language === "zh") {
    if (kind === "asset-analysis") {
      return {
        title: "\u5206\u6790\u7d20\u6750",
        description: "\u6b63\u5728\u8c03\u7528\u6a21\u578b\u7ed3\u6784\u5316\u7d20\u6750\u5185\u5bb9",
      };
    }
    if (kind === "asset-recall") {
      return {
        title: "\u53ec\u56de\u7d20\u6750",
        description: "\u6b63\u5728\u4e3a\u5206\u955c\u5339\u914d\u53ef\u7528\u7d20\u6750",
      };
    }
    if (kind === "inspiration") {
      return {
        title: "\u751f\u6210\u7075\u611f\u7d20\u6750",
        description: "\u6b63\u5728\u8c03\u7528\u5927\u6a21\u578b\u751f\u6210\u521b\u4f5c\u7d20\u6750",
      };
    }
    if (kind === "reference-analysis") {
      return {
        title: "\u62c6\u89e3\u53c2\u8003\u89c6\u9891",
        description: "\u6b63\u5728\u5206\u6790\u53c2\u8003\u89c6\u9891\u7ed3\u6784\u548c\u7206\u6b3e\u56e0\u7d20",
      };
    }
    if (kind === "scene-regeneration") {
      return {
        title: "\u91cd\u751f\u6210\u5206\u955c",
        description: "\u6b63\u5728\u8c03\u7528\u6a21\u578b\u91cd\u751f\u6210\u5355\u4e2a\u5206\u955c",
      };
    }
    if (kind === "script") {
      return {
        title: "\u751f\u6210\u811a\u672c",
        description: "\u6b63\u5728\u6839\u636e\u7d20\u6750\u548c\u4ea7\u54c1\u4fe1\u606f\u751f\u6210\u811a\u672c",
      };
    }
    if (kind === "smart-edit") {
      return {
        title: "\u667a\u80fd\u526a\u8f91",
        description: "\u6b63\u5728\u751f\u6210\u526a\u8f91\u65b9\u6848\u548c\u89c6\u9891\u7247\u6bb5",
      };
    }
    if (kind === "storyboard") {
      return {
        title: "\u751f\u6210\u5206\u955c",
        description: "\u6b63\u5728\u751f\u6210\u53ef\u7f16\u8f91\u7684\u89c6\u9891\u5206\u955c",
      };
    }
    if (kind === "suggestions") {
      return {
        title: "\u751f\u6210\u7f16\u8f91\u5efa\u8bae",
        description: "\u6b63\u5728\u8c03\u7528\u7f16\u8f91 Agent \u5206\u6790\u5206\u955c",
      };
    }
    if (kind === "template") {
      return {
        title: "\u751f\u6210\u6a21\u677f",
        description: "\u6b63\u5728\u63d0\u53d6\u53ef\u590d\u7528\u7684\u811a\u672c/\u89c6\u9891\u6a21\u677f",
      };
    }
    return {
      title: "\u751f\u6210\u89c6\u9891",
      description: "\u6b63\u5728\u751f\u6210\u5206\u955c\u89c6\u9891\u548c\u6700\u7ec8\u9884\u89c8",
    };
  }

  if (kind === "asset-analysis") {
    return { title: "Analyze asset", description: "Structuring asset content with AI" };
  }
  if (kind === "asset-recall") {
    return { title: "Recall assets", description: "Matching usable assets to the selected scene" };
  }
  if (kind === "inspiration") {
    return { title: "Generate inspiration", description: "Creating material with the model" };
  }
  if (kind === "reference-analysis") {
    return { title: "Analyze reference", description: "Breaking down reference video structure" };
  }
  if (kind === "scene-regeneration") {
    return { title: "Regenerate scene", description: "Regenerating the selected storyboard scene" };
  }
  if (kind === "script") {
    return { title: "Generate script", description: "Creating the script from product context" };
  }
  if (kind === "smart-edit") {
    return { title: "Smart edit", description: "Generating edit plan and video segments" };
  }
  if (kind === "storyboard") {
    return { title: "Generate storyboard", description: "Creating editable storyboard scenes" };
  }
  if (kind === "suggestions") {
    return { title: "Generate suggestions", description: "Running the Editing Agent for this scene" };
  }
  if (kind === "template") {
    return { title: "Generate template", description: "Extracting a reusable creative template" };
  }
  return { title: "Generate video", description: "Rendering scene videos and final preview" };
};
