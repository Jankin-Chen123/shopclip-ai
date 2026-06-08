import type {
  AssetMetadata,
  AssetSlice,
  SmartEditSegment,
} from "@shopclip/shared";
import {
  Copy,
  Film,
  Scissors,
  SkipBack,
  SkipForward,
  Trash2,
} from "lucide-react";

import type { AppCopy } from "../../app/i18n";
import { Button } from "../../components/ui/Button";
import {
  durationFromSourceRange,
  sourceLabel,
} from "./SmartEditSegmentUtils";
import {
  MAX_SMART_EDIT_CLIP_SECONDS,
  MIN_SMART_EDIT_CLIP_SECONDS,
  clampPlaybackRate,
  clampSmartEditDuration,
} from "./SmartEditTimelineMath";
import type { SmartEditTrackSegment } from "./SmartEditTimelineOperations";

type UpdateSelectedSegment = (
  update: (segment: SmartEditSegment) => SmartEditSegment,
) => void;

interface SmartEditSelectedSegmentTimingInspectorProps {
  assets: AssetMetadata[];
  copy: AppCopy["smartEdit"];
  copySelectedSegmentsToLocalClipboard: () => void;
  detachSelectedSceneVideo: () => void;
  duplicateSelectedSegment: () => void;
  moveSelectedSegmentEarlier: () => void;
  moveSelectedSegmentLater: () => void;
  removeSelectedSegment: () => void;
  selectedSegment: SmartEditSegment;
  selectedSlices: AssetSlice[];
  selectedTrackClip?: SmartEditTrackSegment;
  sortedSegmentCount: number;
  splitSelectedSegment: () => void;
  updateSelectedSegment: UpdateSelectedSegment;
  updateSelectedSegmentTimelineStart: (nextStartSecond: number) => void;
}

export const SmartEditSelectedSegmentTimingInspector = ({
  assets,
  copy,
  copySelectedSegmentsToLocalClipboard,
  detachSelectedSceneVideo,
  duplicateSelectedSegment,
  moveSelectedSegmentEarlier,
  moveSelectedSegmentLater,
  removeSelectedSegment,
  selectedSegment,
  selectedSlices,
  selectedTrackClip,
  sortedSegmentCount,
  splitSelectedSegment,
  updateSelectedSegment,
  updateSelectedSegmentTimelineStart,
}: SmartEditSelectedSegmentTimingInspectorProps) => (
  <>
    <div className="segment-inspector-actions">
      <Button icon={<SkipBack size={16} />} onClick={moveSelectedSegmentEarlier}>
        {copy.moveEarlier}
      </Button>
      <Button icon={<SkipForward size={16} />} onClick={moveSelectedSegmentLater}>
        {copy.moveLater}
      </Button>
      <Button
        disabled={selectedSegment.durationSeconds < MIN_SMART_EDIT_CLIP_SECONDS * 2}
        icon={<Scissors size={16} />}
        onClick={splitSelectedSegment}
      >
        {copy.splitClip}
      </Button>
      <Button icon={<Copy size={16} />} onClick={copySelectedSegmentsToLocalClipboard}>
        {copy.copySelected}
      </Button>
      <Button icon={<Copy size={16} />} onClick={duplicateSelectedSegment}>
        {copy.duplicateSegment}
      </Button>
      {selectedTrackClip?.trackId === "video" &&
      (selectedSegment.source.sceneClipVideoOnlyUrl || selectedSegment.source.sceneClipUrl) ? (
        <Button icon={<Film size={16} />} onClick={detachSelectedSceneVideo}>
          {copy.detachVideo}
        </Button>
      ) : null}
      <Button
        disabled={sortedSegmentCount <= 1}
        icon={<Trash2 size={16} />}
        onClick={removeSelectedSegment}
      >
        {copy.removeClip}
      </Button>
    </div>
    <section className="smart-edit-inspector-section">
      <h4>{copy.timingAndSource}</h4>
      <label>
        {copy.duration}
        <input
          max={MAX_SMART_EDIT_CLIP_SECONDS}
          min={MIN_SMART_EDIT_CLIP_SECONDS}
          step={0.1}
          type="number"
          value={selectedSegment.durationSeconds}
          onChange={(event) =>
            updateSelectedSegment((segment) => ({
              ...segment,
              durationSeconds: clampSmartEditDuration(Number(event.target.value)),
            }))
          }
        />
      </label>
      <label>
        {copy.timelineStart}
        <input
          max={600}
          min={0}
          step={0.1}
          type="number"
          value={selectedSegment.timelineStartSecond ?? 0}
          onChange={(event) => updateSelectedSegmentTimelineStart(Number(event.target.value))}
        />
      </label>
      <label>
        {copy.speed}
        <input
          max={4}
          min={0.25}
          step={0.25}
          type="number"
          value={selectedSegment.playbackRate ?? 1}
          onChange={(event) => {
            const nextPlaybackRate = clampPlaybackRate(Number(event.target.value));
            updateSelectedSegment((segment) => ({
              ...segment,
              durationSeconds: durationFromSourceRange(
                segment.source.startSecond ?? 0,
                segment.source.endSecond,
                nextPlaybackRate,
                segment.durationSeconds,
              ),
              playbackRate: nextPlaybackRate,
            }));
          }}
        />
      </label>
      <label className="smart-edit-checkbox-label">
        <input
          checked={selectedSegment.sourceAudioMuted ?? false}
          type="checkbox"
          onChange={(event) =>
            updateSelectedSegment((segment) => ({
              ...segment,
              sourceAudioMuted: event.target.checked,
            }))
          }
        />
        {copy.muteOriginalAudio}
      </label>
      <div className="smart-edit-trim-grid">
        <label>
          {copy.sourceIn}
          <input
            min={0}
            step={0.1}
            type="number"
            value={selectedSegment.source.startSecond ?? 0}
            onChange={(event) => {
              const nextStart = Math.max(0, Number(event.target.value) || 0);
              updateSelectedSegment((segment) => {
                const playbackRate = clampPlaybackRate(segment.playbackRate ?? 1);
                const currentEnd =
                  segment.source.endSecond ?? nextStart + segment.durationSeconds * playbackRate;
                const nextEnd =
                  currentEnd > nextStart
                    ? currentEnd
                    : nextStart + MIN_SMART_EDIT_CLIP_SECONDS * playbackRate;
                return {
                  ...segment,
                  durationSeconds: durationFromSourceRange(
                    nextStart,
                    nextEnd,
                    playbackRate,
                    segment.durationSeconds,
                  ),
                  source: {
                    ...segment.source,
                    endSecond: nextEnd,
                    startSecond: nextStart,
                  },
                };
              });
            }}
          />
        </label>
        <label>
          {copy.sourceOut}
          <input
            min={0}
            step={0.1}
            type="number"
            value={
              selectedSegment.source.endSecond ??
              (selectedSegment.source.startSecond ?? 0) +
                selectedSegment.durationSeconds * clampPlaybackRate(selectedSegment.playbackRate ?? 1)
            }
            onChange={(event) => {
              const sourceStart = selectedSegment.source.startSecond ?? 0;
              const minEnd =
                sourceStart +
                MIN_SMART_EDIT_CLIP_SECONDS *
                  clampPlaybackRate(selectedSegment.playbackRate ?? 1);
              const nextEnd = Math.max(minEnd, Number(event.target.value) || minEnd);
              updateSelectedSegment((segment) => ({
                ...segment,
                durationSeconds: durationFromSourceRange(
                  segment.source.startSecond ?? 0,
                  nextEnd,
                  segment.playbackRate,
                  segment.durationSeconds,
                ),
                source: {
                  ...segment.source,
                  endSecond: nextEnd,
                },
              }));
            }}
          />
        </label>
      </div>
      <label>
        {copy.transition}
        <select
          value={selectedSegment.transition}
          onChange={(event) =>
            updateSelectedSegment((segment) => ({
              ...segment,
              transition: event.target.value as SmartEditSegment["transition"],
            }))
          }
        >
          <option value="cut">Cut</option>
          <option value="fade">Fade</option>
          <option value="crossfade">Crossfade</option>
          <option value="wipe">Wipe</option>
        </select>
      </label>
      <label>
        {copy.source}
        <select
          value={selectedSegment.source.assetId ?? ""}
          onChange={(event) => {
            const asset = assets.find((candidate) => candidate.id === event.target.value);
            if (!asset) {
              return;
            }
            updateSelectedSegment((segment) => ({
              ...segment,
              assetTags: asset.tags,
              source:
                asset.type === "video"
                  ? {
                      assetId: asset.id,
                      kind: "video-slice",
                    }
                  : {
                      assetId: asset.id,
                      imageUrl: asset.url,
                      kind: "image-asset",
                    },
            }));
          }}
        >
          <option value="">{sourceLabel(selectedSegment, assets)}</option>
          {assets.map((asset) => (
            <option key={asset.id} value={asset.id}>
              {asset.name}
            </option>
          ))}
        </select>
      </label>
      {selectedSlices.length > 0 ? (
        <label>
          Slice
          <select
            value={selectedSegment.source.sliceId ?? ""}
            onChange={(event) => {
              const slice = selectedSlices.find((candidate) => candidate.id === event.target.value);
              if (!slice) {
                return;
              }
              updateSelectedSegment((segment) => ({
                ...segment,
                source: {
                  ...segment.source,
                  assetId: slice.assetId,
                  endSecond: slice.endSecond,
                  kind: "video-slice",
                  sliceId: slice.id,
                  startSecond: slice.startSecond,
                },
              }));
            }}
          >
            <option value="">Auto slice</option>
            {selectedSlices.map((slice) => (
              <option key={slice.id} value={slice.id}>
                {slice.startSecond}-{slice.endSecond}s
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </section>
  </>
);
