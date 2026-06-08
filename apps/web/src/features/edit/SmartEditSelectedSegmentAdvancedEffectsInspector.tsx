import type {
  SmartEditSegment,
  SmartEditVisualEffect,
} from "@shopclip/shared";
import {
  ArrowDown,
  ArrowUp,
  Trash2,
} from "lucide-react";

import { Button } from "../../components/ui/Button";
import {
  clampVisualEffectAmount,
  effectsForSegment,
  visualEffectKeyframes,
  visualEffectLabel,
  visualEffectOptions,
  visualEffectsForSegment,
  type SmartEditVisualEffectType,
} from "./SmartEditSegmentUtils";
import {
  clampBlur,
  clampEffectFade,
  clampSharpen,
} from "./SmartEditTimelineMath";

type UpdateSelectedSegment = (
  update: (segment: SmartEditSegment) => SmartEditSegment,
) => void;

interface SmartEditSelectedSegmentAdvancedEffectsInspectorProps {
  addVisualEffectAmountKeyframe: (effectId: string) => void;
  addVisualEffectToSelectedSegment: (type: SmartEditVisualEffectType) => void;
  moveVisualEffectOnSelectedSegment: (effectId: string, direction: -1 | 1) => void;
  removeVisualEffectAmountKeyframe: (effectId: string, keyframeId: string) => void;
  removeVisualEffectFromSelectedSegment: (effectId: string) => void;
  selectedSegment: SmartEditSegment;
  updateSelectedSegment: UpdateSelectedSegment;
  updateVisualEffectOnSelectedSegment: (
    effectId: string,
    update: (effect: SmartEditVisualEffect) => SmartEditVisualEffect,
    label: string,
  ) => void;
}

export const SmartEditSelectedSegmentAdvancedEffectsInspector = ({
  addVisualEffectAmountKeyframe,
  addVisualEffectToSelectedSegment,
  moveVisualEffectOnSelectedSegment,
  removeVisualEffectAmountKeyframe,
  removeVisualEffectFromSelectedSegment,
  selectedSegment,
  updateSelectedSegment,
  updateVisualEffectOnSelectedSegment,
}: SmartEditSelectedSegmentAdvancedEffectsInspectorProps) => {
  const visualEffects = visualEffectsForSegment(selectedSegment);

  return (
    <section className="smart-edit-inspector-section">
      <h4>Visual effects</h4>
      <div className="smart-edit-trim-grid">
        <label>
          Blur
          <input
            max={20}
            min={0}
            step={0.1}
            type="number"
            value={selectedSegment.effects?.blur ?? 0}
            onChange={(event) =>
              updateSelectedSegment((segment) => ({
                ...segment,
                effects: {
                  ...effectsForSegment(segment),
                  blur: clampBlur(Number(event.target.value)),
                },
              }))
            }
          />
        </label>
        <label>
          Sharpen
          <input
            max={2}
            min={0}
            step={0.1}
            type="number"
            value={selectedSegment.effects?.sharpen ?? 0}
            onChange={(event) =>
              updateSelectedSegment((segment) => ({
                ...segment,
                effects: {
                  ...effectsForSegment(segment),
                  sharpen: clampSharpen(Number(event.target.value)),
                },
              }))
            }
          />
        </label>
        <label>
          Fade in
          <input
            max={5}
            min={0}
            step={0.1}
            type="number"
            value={selectedSegment.effects?.fadeInSeconds ?? 0}
            onChange={(event) =>
              updateSelectedSegment((segment) => ({
                ...segment,
                effects: {
                  ...effectsForSegment(segment),
                  fadeInSeconds: clampEffectFade(Number(event.target.value)),
                },
              }))
            }
          />
        </label>
        <label>
          Fade out
          <input
            max={5}
            min={0}
            step={0.1}
            type="number"
            value={selectedSegment.effects?.fadeOutSeconds ?? 0}
            onChange={(event) =>
              updateSelectedSegment((segment) => ({
                ...segment,
                effects: {
                  ...effectsForSegment(segment),
                  fadeOutSeconds: clampEffectFade(Number(event.target.value)),
                },
              }))
            }
          />
        </label>
      </div>
      <div className="smart-edit-section-header">
        <h5>Effect stack</h5>
        <label>
          Add effect
          <select
            value=""
            onChange={(event) => {
              if (!event.target.value) {
                return;
              }
              addVisualEffectToSelectedSegment(event.target.value as SmartEditVisualEffectType);
              event.currentTarget.value = "";
            }}
          >
            <option value="">Choose</option>
            {visualEffectOptions.map((option) => (
              <option key={option.type} value={option.type}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="smart-edit-keyframe-list">
        {visualEffects.length > 0 ? (
          visualEffects.map((effect, index, effects) => (
            <div className="smart-edit-keyframe-row" key={effect.id}>
              <div>
                <strong>{visualEffectLabel(effect.type)}</strong>
                <span>
                  {effect.enabled ? "Enabled" : "Disabled"} / Amount{" "}
                  {effect.params.amount.toFixed(2)}
                </span>
              </div>
              <label className="smart-edit-checkbox-label">
                <input
                  checked={effect.enabled}
                  type="checkbox"
                  onChange={(event) =>
                    updateVisualEffectOnSelectedSegment(
                      effect.id,
                      (currentEffect) => ({
                        ...currentEffect,
                        enabled: event.target.checked,
                      }),
                      event.target.checked ? "Enable visual effect" : "Disable visual effect",
                    )
                  }
                />
                On
              </label>
              <label>
                Amount
                <input
                  max={
                    effect.type === "blur"
                      ? 20
                      : effect.type === "sharpen"
                        ? 2
                        : effect.type === "brightness" || effect.type === "vignette"
                          ? 1
                          : 3
                  }
                  min={effect.type === "brightness" ? -1 : 0}
                  step={0.05}
                  type="number"
                  value={effect.params.amount}
                  onChange={(event) =>
                    updateVisualEffectOnSelectedSegment(
                      effect.id,
                      (currentEffect) => ({
                        ...currentEffect,
                        params: {
                          ...currentEffect.params,
                          amount: clampVisualEffectAmount(
                            currentEffect.type,
                            Number(event.target.value),
                          ),
                        },
                      }),
                      "Update visual effect params",
                    )
                  }
                />
              </label>
              <div className="smart-edit-effect-keyframes">
                <div className="smart-edit-section-header">
                  <h6>Amount keyframes</h6>
                  <Button onClick={() => addVisualEffectAmountKeyframe(effect.id)}>
                    Add amount keyframe
                  </Button>
                </div>
                {visualEffectKeyframes(effect).length > 0 ? (
                  <div className="smart-edit-mini-keyframe-list">
                    {visualEffectKeyframes(effect).map((keyframe) => (
                      <article className="smart-edit-mini-keyframe-row" key={keyframe.id}>
                        <span>{keyframe.timeSecond.toFixed(1)}s</span>
                        <strong>{keyframe.value.toFixed(2)}</strong>
                        <button
                          type="button"
                          onClick={() => removeVisualEffectAmountKeyframe(effect.id, keyframe.id)}
                        >
                          Delete
                        </button>
                      </article>
                    ))}
                  </div>
                ) : (
                  <small>No amount keyframes.</small>
                )}
              </div>
              <div className="smart-edit-row-actions">
                <Button
                  disabled={index === 0}
                  icon={<ArrowUp size={14} />}
                  onClick={() => moveVisualEffectOnSelectedSegment(effect.id, -1)}
                >
                  Up
                </Button>
                <Button
                  disabled={index === effects.length - 1}
                  icon={<ArrowDown size={14} />}
                  onClick={() => moveVisualEffectOnSelectedSegment(effect.id, 1)}
                >
                  Down
                </Button>
                <Button
                  icon={<Trash2 size={14} />}
                  onClick={() => removeVisualEffectFromSelectedSegment(effect.id)}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))
        ) : (
          <p className="empty-state">No stacked effects.</p>
        )}
      </div>
    </section>
  );
};
