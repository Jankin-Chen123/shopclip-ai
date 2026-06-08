import type { SmartEditSegment } from "@shopclip/shared";

import {
  transformForSegment,
} from "./SmartEditSegmentUtils";
import {
  clampOpacity,
  clampPercentOffset,
  clampRotationDegrees,
  clampTransformScale,
} from "./SmartEditTimelineMath";

type UpdateSelectedSegment = (
  update: (segment: SmartEditSegment) => SmartEditSegment,
) => void;

interface SmartEditSelectedSegmentTransformInspectorProps {
  selectedSegment: SmartEditSegment;
  updateSelectedSegment: UpdateSelectedSegment;
}

export const SmartEditSelectedSegmentTransformInspector = ({
  selectedSegment,
  updateSelectedSegment,
}: SmartEditSelectedSegmentTransformInspectorProps) => (
  <section className="smart-edit-inspector-section">
    <h4>Visual transform</h4>
    <div className="smart-edit-trim-grid">
      <label>
        Scale
        <input
          max={4}
          min={0.1}
          step={0.05}
          type="number"
          value={selectedSegment.transform?.scale ?? 1}
          onChange={(event) =>
            updateSelectedSegment((segment) => ({
              ...segment,
              transform: {
                ...transformForSegment(segment),
                scale: clampTransformScale(Number(event.target.value)),
              },
            }))
          }
        />
      </label>
      <label>
        Rotation
        <input
          max={180}
          min={-180}
          step={1}
          type="number"
          value={selectedSegment.transform?.rotateDegrees ?? 0}
          onChange={(event) =>
            updateSelectedSegment((segment) => ({
              ...segment,
              transform: {
                ...transformForSegment(segment),
                rotateDegrees: clampRotationDegrees(Number(event.target.value)),
              },
            }))
          }
        />
      </label>
      <label>
        Offset X
        <input
          max={100}
          min={-100}
          step={1}
          type="number"
          value={selectedSegment.transform?.offsetXPercent ?? 0}
          onChange={(event) =>
            updateSelectedSegment((segment) => ({
              ...segment,
              transform: {
                ...transformForSegment(segment),
                offsetXPercent: clampPercentOffset(Number(event.target.value)),
              },
            }))
          }
        />
      </label>
      <label>
        Offset Y
        <input
          max={100}
          min={-100}
          step={1}
          type="number"
          value={selectedSegment.transform?.offsetYPercent ?? 0}
          onChange={(event) =>
            updateSelectedSegment((segment) => ({
              ...segment,
              transform: {
                ...transformForSegment(segment),
                offsetYPercent: clampPercentOffset(Number(event.target.value)),
              },
            }))
          }
        />
      </label>
    </div>
    <label>
      Opacity
      <input
        max={1}
        min={0}
        step={0.05}
        type="number"
        value={selectedSegment.transform?.opacity ?? 1}
        onChange={(event) =>
          updateSelectedSegment((segment) => ({
            ...segment,
            transform: {
              ...transformForSegment(segment),
              opacity: clampOpacity(Number(event.target.value)),
            },
          }))
        }
      />
    </label>
  </section>
);
