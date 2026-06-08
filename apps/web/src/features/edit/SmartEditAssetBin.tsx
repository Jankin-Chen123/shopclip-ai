import type {
  DragEvent as ReactDragEvent,
  MouseEvent as ReactMouseEvent,
} from "react";
import type {
  AssetMetadata,
  AssetSlice,
  MediaSettings,
  SmartEditSegment,
} from "@shopclip/shared";
import {
  Folder,
  Headphones,
  ListVideo,
  Scissors,
  SlidersHorizontal,
  Smile,
  SortAsc,
  Text,
  UploadCloud,
} from "lucide-react";

import type { AppCopy } from "../../app/i18n";
import { sourceLabel } from "./SmartEditSegmentUtils";
import { formatTimelineTime } from "./SmartEditTimelineMath";
import type { SmartEditTrack } from "./SmartEditTimelineOperations";

export type SmartEditAssetTab = "media" | "sounds" | "text" | "stickers" | "effects" | "captions" | "settings";

export const smartEditAssetTabs: Array<{
  id: SmartEditAssetTab;
  label: string;
  icon: typeof Folder;
}> = [
  { id: "media", label: "Media", icon: Folder },
  { id: "sounds", label: "Sounds", icon: Headphones },
  { id: "text", label: "Text", icon: Text },
  { id: "stickers", label: "Stickers", icon: Smile },
  { id: "effects", label: "Effects", icon: Scissors },
  { id: "captions", label: "Captions", icon: ListVideo },
  { id: "settings", label: "Settings", icon: SlidersHorizontal },
];

interface SmartEditAssetBinProps {
  activeAssetTab: SmartEditAssetTab;
  assetSlices: AssetSlice[];
  assets: AssetMetadata[];
  copy: AppCopy["smartEdit"];
  enabledDurationSeconds: number;
  handleAssetDragStart: (event: ReactDragEvent, assetId: string) => void;
  mediaSettings: MediaSettings;
  onMediaSettingsChange: (settings: MediaSettings) => void;
  selectTimelineSegment: (segmentId: string, event?: ReactMouseEvent<HTMLElement>) => void;
  selectedSegment?: SmartEditSegment;
  selectedSegmentIdSet: Set<string>;
  sortedSegments: SmartEditSegment[];
  timedTimelineSegments: Array<{ segment: SmartEditSegment; startSecond: number }>;
  timelineDurationSeconds: number;
  trackSegments: SmartEditTrack[];
}

export const SmartEditAssetBin = ({
  activeAssetTab,
  assetSlices,
  assets,
  copy,
  enabledDurationSeconds,
  handleAssetDragStart,
  mediaSettings,
  onMediaSettingsChange,
  selectTimelineSegment,
  selectedSegment,
  selectedSegmentIdSet,
  sortedSegments,
  timedTimelineSegments,
  timelineDurationSeconds,
  trackSegments,
}: SmartEditAssetBinProps) => (
  <aside className="smart-edit-bin" aria-label="Edit media bin">
    <div className="smart-edit-opencut-panel-toolbar">
      <strong>{smartEditAssetTabs.find((tab) => tab.id === activeAssetTab)?.label ?? "Media"}</strong>
      <span>
        <button type="button" aria-label="List view">
          <ListVideo size={16} aria-hidden="true" />
        </button>
        <button type="button" aria-label="Sort media">
          <SortAsc size={16} aria-hidden="true" />
        </button>
        <button type="button" className="smart-edit-opencut-import">
          <UploadCloud size={16} aria-hidden="true" />
          Import
        </button>
      </span>
    </div>
    {activeAssetTab === "media" ? (
      <>
        <div className="smart-edit-bin-header">
          <div>
            <h3>Clips</h3>
            <span>{sortedSegments.length} timeline clips</span>
          </div>
          <strong>{formatTimelineTime(timelineDurationSeconds)}</strong>
        </div>
        <div className="smart-edit-clip-bin-list" role="list">
          {sortedSegments.length > 0 ? (
            sortedSegments.map((segment) => {
              const segmentStart = timedTimelineSegments.find(
                (candidate) => candidate.segment.id === segment.id,
              )?.startSecond;
              return (
                <button
                  aria-current={selectedSegment?.id === segment.id ? "true" : undefined}
                  className={`${selectedSegment?.id === segment.id ? "active" : ""} ${
                    selectedSegmentIdSet.has(segment.id) ? "selected" : ""
                  }`.trim()}
                  key={segment.id}
                  onClick={(event) => selectTimelineSegment(segment.id, event)}
                  type="button"
                >
                  <span>{String(segment.order).padStart(2, "0")}</span>
                  <strong>{segment.subtitle || sourceLabel(segment, assets)}</strong>
                  <small>
                    {formatTimelineTime(segmentStart ?? 0)} / {segment.durationSeconds.toFixed(1)}s
                  </small>
                </button>
              );
            })
          ) : (
            <div className="empty-state compact">
              <strong>{copy.emptyTitle}</strong>
              <span>{copy.emptyBody}</span>
            </div>
          )}
        </div>
        <div className="smart-edit-bin-assets">
          <h3>Media inventory</h3>
          <div>
            <span>{assets.filter((asset) => asset.type === "video").length} video</span>
            <span>{assets.filter((asset) => asset.type === "image").length} image</span>
            <span>{assetSlices.length} slices</span>
          </div>
          <div className="smart-edit-draggable-assets" aria-label="Draggable media assets">
            {assets
              .filter((asset) => asset.type === "video" || asset.type === "image")
              .slice(0, 12)
              .map((asset) => (
                <button
                  draggable
                  key={asset.id}
                  type="button"
                  onDragStart={(event) => handleAssetDragStart(event, asset.id)}
                >
                  <strong>{asset.name}</strong>
                  <small>{asset.type}</small>
                </button>
              ))}
          </div>
        </div>
      </>
    ) : null}
    {activeAssetTab === "sounds" ? (
      <div className="smart-edit-opencut-tab-panel">
        <h3>Project audio</h3>
        <label>
          {copy.bgm}
          <select
            value={mediaSettings.bgmTrack}
            onChange={(event) =>
              onMediaSettingsChange({
                ...mediaSettings,
                bgmTrack: event.target.value as MediaSettings["bgmTrack"],
              })
            }
          >
            <option value="none">None</option>
            <option value="creator-pop">Creator pop</option>
            <option value="soft-lift">Soft lift</option>
            <option value="tech-pulse">Tech pulse</option>
          </select>
        </label>
        <span>{trackSegments.find((track) => track.id === "bgm")?.segments.length ?? 0} BGM timeline item</span>
        <span>{trackSegments.find((track) => track.id === "voice")?.segments.length ?? 0} voice clips</span>
      </div>
    ) : null}
    {activeAssetTab === "text" || activeAssetTab === "captions" ? (
      <div className="smart-edit-opencut-tab-panel">
        <h3>{activeAssetTab === "captions" ? "Captions" : "Text"}</h3>
        <span>{trackSegments.find((track) => track.id === "caption")?.segments.length ?? 0} caption clips</span>
        <span>{selectedSegment?.subtitle ? "Selected text clip available" : "Select a caption clip to edit text"}</span>
      </div>
    ) : null}
    {activeAssetTab === "effects" ? (
      <div className="smart-edit-opencut-tab-panel">
        <h3>Effects</h3>
        <span>{selectedSegment?.visualEffects?.length ?? 0} effects on selected clip</span>
        <span>Use the inspector to adjust effect amount and keyframes.</span>
      </div>
    ) : null}
    {activeAssetTab === "stickers" ? (
      <div className="smart-edit-opencut-tab-panel">
        <h3>Stickers</h3>
        <span>No sticker media has been added to this project.</span>
      </div>
    ) : null}
    {activeAssetTab === "settings" ? (
      <div className="smart-edit-opencut-tab-panel">
        <h3>Canvas settings</h3>
        <span>Timeline duration {formatTimelineTime(timelineDurationSeconds)}</span>
        <span>{enabledDurationSeconds}s enabled clip duration</span>
      </div>
    ) : null}
  </aside>
);
