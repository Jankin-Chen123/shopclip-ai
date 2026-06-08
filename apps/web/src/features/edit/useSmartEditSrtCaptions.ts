import { useState } from "react";

import type { SmartEditPlan } from "@shopclip/shared";

import type { AppCopy } from "../../app/i18n";
import {
  exportSmartEditTimelineCaptionsToSrt,
  importSmartEditSrtCaptionsToTimeline,
} from "./SmartEditTimelineOperations";

interface SmartEditSrtCaptionsInput {
  copy: AppCopy["smartEdit"];
  onPlanChange: (plan: SmartEditPlan, options: { label: string }) => void;
  plan?: SmartEditPlan;
}

export interface SmartEditSrtCaptionsState {
  exportSrtCaptions: () => void;
  importSrtCaptions: () => void;
  resetSrtCaptionsState: () => void;
  srtImportText: string;
  srtStatusMessage: string;
  setSrtImportText: (value: string) => void;
}

export const useSmartEditSrtCaptions = ({
  copy,
  onPlanChange,
  plan,
}: SmartEditSrtCaptionsInput): SmartEditSrtCaptionsState => {
  const [srtImportText, setSrtImportTextState] = useState("");
  const [srtImportMessage, setSrtImportMessage] = useState<string | undefined>();
  const [srtExportMessage, setSrtExportMessage] = useState<string | undefined>();

  const resetSrtCaptionsState = () => {
    setSrtImportTextState("");
    setSrtImportMessage(undefined);
    setSrtExportMessage(undefined);
  };

  const setSrtImportText = (value: string) => {
    setSrtImportTextState(value);
    setSrtImportMessage(undefined);
    setSrtExportMessage(undefined);
  };

  const importSrtCaptions = () => {
    if (!plan) {
      return;
    }
    const beforeCount =
      plan.timeline?.elements.filter((element) => element.id.startsWith("srt-")).length ?? 0;
    const nextPlan = importSmartEditSrtCaptionsToTimeline(
      plan,
      srtImportText,
      `import-${Date.now()}`,
    );
    const afterCount =
      nextPlan.timeline?.elements.filter((element) => element.id.startsWith("srt-")).length ?? 0;
    const importedCount = Math.max(0, afterCount - beforeCount);
    if (nextPlan === plan || importedCount === 0) {
      setSrtImportMessage("No valid SRT captions found.");
      return;
    }
    onPlanChange(nextPlan, { label: "Import SRT captions" });
    setSrtImportTextState("");
    setSrtImportMessage(`Imported ${importedCount} captions.`);
    setSrtExportMessage(undefined);
  };

  const exportSrtCaptions = () => {
    if (!plan || typeof document === "undefined") {
      return;
    }
    const srt = exportSmartEditTimelineCaptionsToSrt(plan);
    if (!srt.trim()) {
      setSrtExportMessage(copy.srtExportEmpty);
      return;
    }
    const blobUrl = URL.createObjectURL(new Blob([`${srt}\n`], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = `${plan.id}-captions.srt`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(blobUrl);
    setSrtExportMessage(copy.srtExportReady);
  };

  return {
    exportSrtCaptions,
    importSrtCaptions,
    resetSrtCaptionsState,
    srtImportText,
    srtStatusMessage: srtImportMessage ?? srtExportMessage ?? copy.srtImportHint,
    setSrtImportText,
  };
};
