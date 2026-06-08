import type { SmartEditPlan } from "@shopclip/shared";

const MAX_PLAN_HISTORY_LENGTH = 40;

export type SmartEditCommandHistoryEntry = {
  after: SmartEditPlan;
  before: SmartEditPlan;
  label: string;
};

export class SmartEditCommandHistory {
  constructor(
    readonly undoStack: SmartEditCommandHistoryEntry[] = [],
    readonly redoStack: SmartEditCommandHistoryEntry[] = [],
  ) {}

  record(before: SmartEditPlan, after: SmartEditPlan, label: string): SmartEditCommandHistory {
    if (before === after) {
      return this;
    }
    return new SmartEditCommandHistory(
      [...this.undoStack.slice(-(MAX_PLAN_HISTORY_LENGTH - 1)), { after, before, label }],
      [],
    );
  }

  undoLabel(undoText = "Undo", formatLabel: (label: string) => string = (label) => label): string {
    const entry = this.undoStack.at(-1);
    return entry ? `${undoText} ${formatLabel(entry.label)}` : undoText;
  }

  redoLabel(redoText = "Redo", formatLabel: (label: string) => string = (label) => label): string {
    const entry = this.redoStack.at(-1);
    return entry ? `${redoText} ${formatLabel(entry.label)}` : redoText;
  }
}

export const createSmartEditCommandHistory = (): SmartEditCommandHistory =>
  new SmartEditCommandHistory();

export const formatSmartEditCommandHistoryLabel = (
  label: string,
  historyActions: Record<string, string>,
): string =>
  Object.prototype.hasOwnProperty.call(historyActions, label)
    ? historyActions[label]!
    : label;

export const applySmartEditCommandHistoryUndo = (
  history: SmartEditCommandHistory,
  currentPlan: SmartEditPlan,
): { history: SmartEditCommandHistory; plan: SmartEditPlan } | undefined => {
  const entry = history.undoStack.at(-1);
  if (!entry) {
    return undefined;
  }
  return {
    history: new SmartEditCommandHistory(
      history.undoStack.slice(0, -1),
      [...history.redoStack.slice(-(MAX_PLAN_HISTORY_LENGTH - 1)), { ...entry, after: currentPlan }],
    ),
    plan: entry.before,
  };
};

export const applySmartEditCommandHistoryRedo = (
  history: SmartEditCommandHistory,
  currentPlan: SmartEditPlan,
): { history: SmartEditCommandHistory; plan: SmartEditPlan } | undefined => {
  const entry = history.redoStack.at(-1);
  if (!entry) {
    return undefined;
  }
  return {
    history: new SmartEditCommandHistory(
      [...history.undoStack.slice(-(MAX_PLAN_HISTORY_LENGTH - 1)), { ...entry, before: currentPlan }],
      history.redoStack.slice(0, -1),
    ),
    plan: entry.after,
  };
};
