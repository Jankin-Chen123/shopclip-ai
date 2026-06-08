import type { SmartEditTimelineElement } from "@shopclip/shared";

import type { AppCopy } from "../../app/i18n";
import type { SmartEditTimelineElementPatch } from "./SmartEditTimelineOperations";

interface SmartEditTimelineElementBaseInspectorProps {
  copy: AppCopy["smartEdit"];
  element: SmartEditTimelineElement;
  includeLabelField?: boolean;
  minDurationSeconds: number;
  onUpdateElement: (patch: SmartEditTimelineElementPatch) => void;
}

export const SmartEditTimelineElementBaseInspector = ({
  copy,
  element,
  includeLabelField = true,
  minDurationSeconds,
  onUpdateElement,
}: SmartEditTimelineElementBaseInspectorProps) => (
  <>
    {includeLabelField ? (
      <label>
        {copy.materialName}
        <input
          type="text"
          value={element.label}
          onChange={(event) =>
            onUpdateElement({
              label: event.target.value.trim() || element.label,
            })
          }
        />
      </label>
    ) : null}
    <label>
      {copy.timelineElementStart}
      <input
        min={0}
        step={0.1}
        type="number"
        value={element.startSecond}
        onChange={(event) =>
          onUpdateElement({ startSecond: Number(event.target.value) })
        }
      />
    </label>
    <label>
      {copy.timelineElementDuration}
      <input
        min={minDurationSeconds}
        step={0.1}
        type="number"
        value={element.durationSeconds}
        onChange={(event) =>
          onUpdateElement({ durationSeconds: Number(event.target.value) })
        }
      />
    </label>
  </>
);
