import type { KeyboardEvent as ReactKeyboardEvent } from "react";

import type { SmartEditSegment } from "@shopclip/shared";
import {
  isPlaybackShortcutControlTarget,
  isTextEditingTarget,
  type SmartEditTrackSegment,
} from "./SmartEditTimelineOperations";
import { smartEditTimelineKeyboardNudgeSeconds } from "./SmartEditTimelineMath";

export type SmartEditKeyboardShortcutState = {
  selectedSegment?: SmartEditSegment;
  selectedTrackClip?: SmartEditTrackSegment;
};

export type SmartEditKeyboardShortcutActions = {
  clearMultiSelection: () => void;
  copySelectedSegmentsToLocalClipboard: () => void;
  cutSelectedTimelineMaterialsToLocalClipboard: () => void;
  jumpPlayheadToEditPoint: (direction: "previous" | "next") => void;
  moveSelectedTrackClips: (deltaSeconds: number) => void;
  pasteClipboardAtPlayhead: () => void;
  redoPlanChange: () => void;
  removeSelectedSegment: () => void;
  removeSelectedTrackClip: () => void;
  selectAllSegments: () => void;
  selectAllTimelineElements: () => boolean;
  selectByOffset: (offset: number) => void;
  setPreviewRangePoint: (point: "in" | "out") => void;
  splitAtPlayhead: () => void;
  togglePreviewPlayback: () => boolean;
  trimAtPlayhead: (side: "left" | "right") => void;
  undoPlanChange: () => void;
};

export const handleSmartEditKeyboardShortcut = (
  event: ReactKeyboardEvent<HTMLElement>,
  state: SmartEditKeyboardShortcutState,
  actions: SmartEditKeyboardShortcutActions,
) => {
  const isCommandKey = event.ctrlKey || event.metaKey;
  if (isTextEditingTarget(event.target)) {
    return;
  }
  if (!isCommandKey && event.key === " " && !isPlaybackShortcutControlTarget(event.target)) {
    if (actions.togglePreviewPlayback()) {
      event.preventDefault();
    }
    return;
  }
  if (isCommandKey && event.key.toLowerCase() === "c") {
    event.preventDefault();
    actions.copySelectedSegmentsToLocalClipboard();
    return;
  }
  if (isCommandKey && event.key.toLowerCase() === "x") {
    event.preventDefault();
    actions.cutSelectedTimelineMaterialsToLocalClipboard();
    return;
  }
  if (isCommandKey && event.key.toLowerCase() === "v") {
    event.preventDefault();
    actions.pasteClipboardAtPlayhead();
    return;
  }
  if (isCommandKey && event.key.toLowerCase() === "z") {
    event.preventDefault();
    if (event.shiftKey) {
      actions.redoPlanChange();
    } else {
      actions.undoPlanChange();
    }
    return;
  }
  if (isCommandKey && event.key.toLowerCase() === "y") {
    event.preventDefault();
    actions.redoPlanChange();
    return;
  }
  if (isCommandKey && event.key.toLowerCase() === "a") {
    event.preventDefault();
    if (!state.selectedSegment && actions.selectAllTimelineElements()) {
      return;
    }
    actions.selectAllSegments();
    return;
  }
  if (!isCommandKey && event.key.toLowerCase() === "s") {
    event.preventDefault();
    actions.splitAtPlayhead();
    return;
  }
  if (!isCommandKey && event.key.toLowerCase() === "q") {
    event.preventDefault();
    actions.trimAtPlayhead("right");
    return;
  }
  if (!isCommandKey && event.key.toLowerCase() === "w") {
    event.preventDefault();
    actions.trimAtPlayhead("left");
    return;
  }
  if (!isCommandKey && event.altKey && event.key === "ArrowLeft") {
    event.preventDefault();
    actions.jumpPlayheadToEditPoint("previous");
    return;
  }
  if (!isCommandKey && event.altKey && event.key === "ArrowRight") {
    event.preventDefault();
    actions.jumpPlayheadToEditPoint("next");
    return;
  }
  if (!isCommandKey && event.key.toLowerCase() === "i") {
    event.preventDefault();
    actions.setPreviewRangePoint("in");
    return;
  }
  if (!isCommandKey && event.key.toLowerCase() === "o") {
    event.preventDefault();
    actions.setPreviewRangePoint("out");
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    actions.clearMultiSelection();
    return;
  }
  const keyboardNudgeSeconds = smartEditTimelineKeyboardNudgeSeconds(event.key, event.shiftKey);
  if (
    keyboardNudgeSeconds !== undefined &&
    state.selectedTrackClip &&
    !state.selectedTrackClip.segmentId
  ) {
    event.preventDefault();
    actions.moveSelectedTrackClips(keyboardNudgeSeconds);
    return;
  }
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    actions.selectByOffset(-1);
    return;
  }
  if (event.key === "ArrowRight") {
    event.preventDefault();
    actions.selectByOffset(1);
    return;
  }
  if ((event.key === "Delete" || event.key === "Backspace") && state.selectedTrackClip) {
    event.preventDefault();
    actions.removeSelectedTrackClip();
    return;
  }
  if ((event.key === "Delete" || event.key === "Backspace") && state.selectedSegment) {
    event.preventDefault();
    actions.removeSelectedSegment();
  }
};
