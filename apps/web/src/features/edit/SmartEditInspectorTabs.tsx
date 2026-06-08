import type { SmartEditSegment } from "@shopclip/shared";

import type { SmartEditTrackSegment } from "./SmartEditTimelineOperations";

interface SmartEditInspectorTabsProps {
  selectedBatchSegmentCount: number;
  selectedSegment?: SmartEditSegment;
  selectedTrackClip?: SmartEditTrackSegment;
}

export const SmartEditInspectorTabs = ({
  selectedBatchSegmentCount,
  selectedSegment,
  selectedTrackClip,
}: SmartEditInspectorTabsProps) => {
  const tabs = [
    {
      id: "clip",
      label: "Clip",
      active:
        !!selectedSegment &&
        (!selectedTrackClip || selectedTrackClip.trackId === "video"),
    },
    {
      id: "audio",
      label: "Audio",
      active:
        selectedTrackClip?.trackId === "sourceAudio" ||
        selectedTrackClip?.trackId === "voice" ||
        selectedTrackClip?.trackId === "bgm",
    },
    {
      id: "text",
      label: "Text",
      active: selectedTrackClip?.trackId === "caption",
    },
    {
      id: "effects",
      label: "Effects",
      active: !!selectedSegment?.visualEffects?.length,
    },
    {
      id: "state",
      label: "State",
      active: selectedBatchSegmentCount > 1,
    },
  ];

  return (
    <div className="smart-edit-properties-tabs" aria-label="Property groups">
      {tabs.map((tab) => (
        <button
          aria-pressed={tab.active}
          className={tab.active ? "active" : undefined}
          key={tab.id}
          type="button"
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
};
