import type { SmartEditTimelineElement } from "@shopclip/shared";
import { SkipBack, SkipForward } from "lucide-react";

import type { AppCopy } from "../../app/i18n";
import { Button } from "../../components/ui/Button";
import { TRIM_NUDGE_SECONDS, clampPlaybackRate } from "./SmartEditTimelineMath";

interface SmartEditTimelineSourceTrimInspectorProps {
  copy: AppCopy["smartEdit"];
  element: SmartEditTimelineElement;
  onSlipSource: (deltaSeconds: number) => void;
}

export const SmartEditTimelineSourceTrimInspector = ({
  copy,
  element,
  onSlipSource,
}: SmartEditTimelineSourceTrimInspectorProps) => (
  <div className="smart-edit-trim-grid">
    <label>
      {copy.sourceIn}
      <input
        min={0}
        step={0.1}
        type="number"
        value={element.trimStartSecond ?? 0}
        onChange={(event) =>
          onSlipSource(Number(event.target.value) - (element.trimStartSecond ?? 0))
        }
      />
    </label>
    <label>
      {copy.sourceOut}
      <input
        readOnly
        type="number"
        value={
          element.trimEndSecond ??
          (element.trimStartSecond ?? 0) +
            element.durationSeconds * clampPlaybackRate(element.playbackRate ?? 1)
        }
      />
    </label>
    <div className="smart-edit-linked-actions">
      <Button icon={<SkipBack size={16} />} onClick={() => onSlipSource(-TRIM_NUDGE_SECONDS)}>
        -0.1s
      </Button>
      <Button icon={<SkipForward size={16} />} onClick={() => onSlipSource(TRIM_NUDGE_SECONDS)}>
        +0.1s
      </Button>
    </div>
  </div>
);
