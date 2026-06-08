import { useEffect, useState } from "react";

type SmartEditPanelResizeState = {
  startClientY: number;
  startHeight: number;
};

const SMART_EDIT_TIMELINE_HEIGHT_STORAGE_KEY = "shopclip-smart-edit-timeline-height";
const DEFAULT_TIMELINE_PANEL_HEIGHT = 420;
const MIN_TIMELINE_PANEL_HEIGHT = 280;
const MAX_TIMELINE_PANEL_HEIGHT = 640;

const clampTimelinePanelHeight = (height: number): number =>
  Math.max(MIN_TIMELINE_PANEL_HEIGHT, Math.min(MAX_TIMELINE_PANEL_HEIGHT, height));

export const useSmartEditTimelinePanelResize = (): {
  isPanelResizing: boolean;
  startPanelResize: (clientY: number) => void;
  timelinePanelHeight: number;
} => {
  const [timelinePanelHeight, setTimelinePanelHeight] = useState(() => {
    if (typeof window === "undefined") {
      return DEFAULT_TIMELINE_PANEL_HEIGHT;
    }
    const storedHeight = Number(window.localStorage.getItem(SMART_EDIT_TIMELINE_HEIGHT_STORAGE_KEY));
    return Number.isFinite(storedHeight)
      ? clampTimelinePanelHeight(storedHeight)
      : DEFAULT_TIMELINE_PANEL_HEIGHT;
  });
  const [panelResize, setPanelResize] = useState<SmartEditPanelResizeState | undefined>();

  useEffect(() => {
    if (!panelResize) {
      return;
    }
    const handlePointerMove = (event: PointerEvent) => {
      setTimelinePanelHeight(
        clampTimelinePanelHeight(
          panelResize.startHeight - (event.clientY - panelResize.startClientY),
        ),
      );
    };
    const handlePointerUp = () => {
      setPanelResize(undefined);
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [panelResize]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(
      SMART_EDIT_TIMELINE_HEIGHT_STORAGE_KEY,
      String(Math.round(timelinePanelHeight)),
    );
  }, [timelinePanelHeight]);

  return {
    isPanelResizing: Boolean(panelResize),
    startPanelResize: (clientY: number) => {
      setPanelResize({
        startClientY: clientY,
        startHeight: timelinePanelHeight,
      });
    },
    timelinePanelHeight,
  };
};
