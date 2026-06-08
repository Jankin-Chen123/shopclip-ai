import type { SmartEditSegment } from "@shopclip/shared";

import { Button } from "../../components/ui/Button";
import {
  visualKeyframesForSegment,
  visualMaskForSegment,
} from "./SmartEditSegmentUtils";
import { clampMaskPercentInput } from "./SmartEditTimelineMath";

type UpdateSelectedSegment = (
  update: (segment: SmartEditSegment) => SmartEditSegment,
) => void;

interface SmartEditSelectedSegmentMaskKeyframeInspectorProps {
  addVisualKeyframeAtPlayhead: () => void;
  removeVisualKeyframe: (keyframeId: string) => void;
  selectedSegment: SmartEditSegment;
  updateSelectedSegment: UpdateSelectedSegment;
}

export const SmartEditSelectedSegmentMaskKeyframeInspector = ({
  addVisualKeyframeAtPlayhead,
  removeVisualKeyframe,
  selectedSegment,
  updateSelectedSegment,
}: SmartEditSelectedSegmentMaskKeyframeInspectorProps) => {
  const visualKeyframes = visualKeyframesForSegment(selectedSegment);

  return (
    <>
      <section className="smart-edit-inspector-section">
        <h4>Visual mask</h4>
        <div className="smart-edit-trim-grid">
          <label>
            Mask type
            <select
              value={selectedSegment.visualMask?.type ?? "none"}
              onChange={(event) =>
                updateSelectedSegment((segment) => ({
                  ...segment,
                  visualMask:
                    event.target.value === "none"
                      ? undefined
                      : {
                          ...visualMaskForSegment(segment),
                          type: event.target.value as "rectangle" | "ellipse",
                        },
                }))
              }
            >
              <option value="none">None</option>
              <option value="rectangle">Rectangle</option>
              <option value="ellipse">Ellipse</option>
            </select>
          </label>
          <label className="smart-edit-checkbox-label">
            <input
              checked={selectedSegment.visualMask?.inverted ?? false}
              type="checkbox"
              onChange={(event) =>
                updateSelectedSegment((segment) => ({
                  ...segment,
                  visualMask: {
                    ...visualMaskForSegment(segment),
                    inverted: event.target.checked,
                  },
                }))
              }
            />
            Invert mask
          </label>
          <label>
            Mask X
            <input
              max={100}
              min={0}
              step={1}
              type="number"
              value={selectedSegment.visualMask?.xPercent ?? 50}
              onChange={(event) =>
                updateSelectedSegment((segment) => ({
                  ...segment,
                  visualMask: {
                    ...visualMaskForSegment(segment),
                    xPercent: clampMaskPercentInput(event.target.value, 50, 0),
                  },
                }))
              }
            />
          </label>
          <label>
            Mask Y
            <input
              max={100}
              min={0}
              step={1}
              type="number"
              value={selectedSegment.visualMask?.yPercent ?? 50}
              onChange={(event) =>
                updateSelectedSegment((segment) => ({
                  ...segment,
                  visualMask: {
                    ...visualMaskForSegment(segment),
                    yPercent: clampMaskPercentInput(event.target.value, 50, 0),
                  },
                }))
              }
            />
          </label>
          <label>
            Mask W
            <input
              max={100}
              min={1}
              step={1}
              type="number"
              value={selectedSegment.visualMask?.widthPercent ?? 80}
              onChange={(event) =>
                updateSelectedSegment((segment) => ({
                  ...segment,
                  visualMask: {
                    ...visualMaskForSegment(segment),
                    widthPercent: clampMaskPercentInput(event.target.value, 80, 1),
                  },
                }))
              }
            />
          </label>
          <label>
            Mask H
            <input
              max={100}
              min={1}
              step={1}
              type="number"
              value={selectedSegment.visualMask?.heightPercent ?? 80}
              onChange={(event) =>
                updateSelectedSegment((segment) => ({
                  ...segment,
                  visualMask: {
                    ...visualMaskForSegment(segment),
                    heightPercent: clampMaskPercentInput(event.target.value, 80, 1),
                  },
                }))
              }
            />
          </label>
        </div>
      </section>
      <section className="smart-edit-inspector-section">
        <div className="smart-edit-section-header">
          <h4>Visual keyframes</h4>
          <Button onClick={addVisualKeyframeAtPlayhead}>Add keyframe</Button>
        </div>
        <div className="smart-edit-keyframe-list">
          {visualKeyframes.length > 0 ? (
            visualKeyframes.map((keyframe) => (
              <article className="smart-edit-keyframe-row" key={keyframe.id}>
                <div>
                  <strong>{keyframe.timeSecond.toFixed(1)}s</strong>
                  <span>
                    Scale {keyframe.transform.scale.toFixed(2)} / Opacity{" "}
                    {keyframe.transform.opacity.toFixed(2)}
                  </span>
                  <small>
                    X {keyframe.transform.offsetXPercent.toFixed(0)} / Y{" "}
                    {keyframe.transform.offsetYPercent.toFixed(0)}
                  </small>
                </div>
                <button type="button" onClick={() => removeVisualKeyframe(keyframe.id)}>
                  Delete
                </button>
              </article>
            ))
          ) : (
            <p className="empty-state">No visual keyframes.</p>
          )}
        </div>
      </section>
    </>
  );
};
