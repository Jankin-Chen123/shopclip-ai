import type { SmartEditSegment } from "@shopclip/shared";

import type { AppCopy } from "../../app/i18n";
import { clampInSegmentOffset } from "./SmartEditTimelineMath";

type UpdateSelectedSegment = (
  update: (segment: SmartEditSegment) => SmartEditSegment,
) => void;

interface SmartEditSelectedSegmentCopyStateInspectorProps {
  copy: AppCopy["smartEdit"];
  selectedSegment: SmartEditSegment;
  updateSelectedSegment: UpdateSelectedSegment;
}

export const SmartEditSelectedSegmentCopyStateInspector = ({
  copy,
  selectedSegment,
  updateSelectedSegment,
}: SmartEditSelectedSegmentCopyStateInspectorProps) => (
  <>
    <section className="smart-edit-inspector-section">
      <h4>{copy.copyAndVoice}</h4>
      <label>
        {copy.subtitle}
        <textarea
          rows={2}
          value={selectedSegment.subtitle}
          onChange={(event) =>
            updateSelectedSegment((segment) => ({
              ...segment,
              subtitle: event.target.value,
            }))
          }
        />
      </label>
      <label>
        {copy.voiceover}
        <textarea
          rows={2}
          value={selectedSegment.voiceover}
          onChange={(event) =>
            updateSelectedSegment((segment) => ({
              ...segment,
              voiceover: event.target.value,
            }))
          }
        />
      </label>
      <div className="smart-edit-trim-grid">
        <label>
          {copy.captionStart}
          <input
            min={0}
            max={Math.max(0, selectedSegment.durationSeconds - 0.1)}
            step={0.1}
            type="number"
            value={selectedSegment.captionStartOffsetSeconds ?? 0}
            onChange={(event) =>
              updateSelectedSegment((segment) => ({
                ...segment,
                captionStartOffsetSeconds: clampInSegmentOffset(
                  Number(event.target.value),
                  segment.durationSeconds,
                ),
              }))
            }
          />
        </label>
        <label>
          {copy.voiceoverStart}
          <input
            min={0}
            max={Math.max(0, selectedSegment.durationSeconds - 0.1)}
            step={0.1}
            type="number"
            value={selectedSegment.voiceoverStartOffsetSeconds ?? 0}
            onChange={(event) =>
              updateSelectedSegment((segment) => ({
                ...segment,
                voiceoverStartOffsetSeconds: clampInSegmentOffset(
                  Number(event.target.value),
                  segment.durationSeconds,
                ),
              }))
            }
          />
        </label>
      </div>
    </section>
    <section className="smart-edit-inspector-section">
      <h4>{copy.segmentState}</h4>
      <label className="toggle-row">
        <input
          checked={selectedSegment.enabled}
          type="checkbox"
          onChange={(event) =>
            updateSelectedSegment((segment) => ({
              ...segment,
              enabled: event.target.checked,
            }))
          }
        />
        {selectedSegment.enabled ? copy.disable : copy.enable}
      </label>
      <label className="toggle-row">
        <input
          checked={!selectedSegment.captionHidden}
          type="checkbox"
          onChange={(event) =>
            updateSelectedSegment((segment) => ({
              ...segment,
              captionHidden: !event.target.checked,
            }))
          }
        />
        {selectedSegment.captionHidden ? copy.showCaption : copy.hideCaption}
      </label>
    </section>
  </>
);
