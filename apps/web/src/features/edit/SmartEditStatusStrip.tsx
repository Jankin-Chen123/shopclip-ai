import { Clock3, Film, Music2, Scissors } from "lucide-react";

import type { AppCopy } from "../../app/i18n";

interface SmartEditStatusStripProps {
  audioLabel: string;
  copy: AppCopy["smartEdit"];
  enabledDurationSeconds: number;
  selectedBatchSegmentCount: number;
  selectedSegmentIndex: number;
  selectedSourceLabel: string;
  sortedSegmentCount: number;
  timelineDurationSeconds: number;
}

export const SmartEditStatusStrip = ({
  audioLabel,
  copy,
  enabledDurationSeconds,
  selectedBatchSegmentCount,
  selectedSegmentIndex,
  selectedSourceLabel,
  sortedSegmentCount,
  timelineDurationSeconds,
}: SmartEditStatusStripProps) => (
  <div className="smart-edit-status-strip" aria-label={copy.editorSummary}>
    <div>
      <Clock3 size={16} />
      <span>{copy.enabledCut}</span>
      <strong>{enabledDurationSeconds}s</strong>
    </div>
    <div>
      <Clock3 size={16} />
      <span>{copy.timelineTotal}</span>
      <strong>{timelineDurationSeconds.toFixed(1)}s</strong>
    </div>
    <div>
      <Film size={16} />
      <span>{copy.selectedSegment}</span>
      <strong>
        {selectedBatchSegmentCount > 1
          ? copy.selectedCount(selectedBatchSegmentCount)
          : selectedSegmentIndex > 0
            ? `${selectedSegmentIndex} / ${sortedSegmentCount}`
            : "-"}
      </strong>
    </div>
    <div>
      <Scissors size={16} />
      <span>{copy.source}</span>
      <strong>{selectedSourceLabel}</strong>
    </div>
    <div>
      <Music2 size={16} />
      <span>{copy.audio}</span>
      <strong>{audioLabel}</strong>
    </div>
  </div>
);
