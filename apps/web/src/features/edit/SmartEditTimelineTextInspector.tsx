import type { SmartEditTimelineElement } from "@shopclip/shared";

import type { AppCopy } from "../../app/i18n";
import { Button } from "../../components/ui/Button";
import type { SmartEditTimelineElementPatch } from "./SmartEditTimelineOperations";

interface SmartEditTimelineTextInspectorProps {
  copy: AppCopy["smartEdit"];
  element: SmartEditTimelineElement;
  includeStyleControls?: boolean;
  includeTextField?: boolean;
  lineCount: number;
  onSplitByLines: () => void;
  onUpdateElement: (patch: SmartEditTimelineElementPatch) => void;
}

export const SmartEditTimelineTextInspector = ({
  copy,
  element,
  includeStyleControls = true,
  includeTextField = true,
  lineCount,
  onSplitByLines,
  onUpdateElement,
}: SmartEditTimelineTextInspectorProps) => (
  <>
    {includeTextField ? (
      <label>
        {copy.subtitle}
        <textarea
          rows={3}
          value={element.text ?? element.label}
          onChange={(event) => {
            const nextText = event.target.value;
            onUpdateElement({
              label: nextText.trim() || "Text clip",
              text: nextText,
            });
          }}
        />
      </label>
    ) : null}
    {includeStyleControls ? (
      <>
        <div className="smart-edit-linked-actions text-style-presets">
          <Button
            onClick={() =>
              onUpdateElement({
                textColor: "#ffffff",
                textFontSize: 42,
                textPositionYPercent: 82,
              })
            }
          >
            {copy.bottomWhiteTextStyle}
          </Button>
          <Button
            onClick={() =>
              onUpdateElement({
                textColor: "#facc15",
                textFontSize: 44,
                textPositionYPercent: 82,
              })
            }
          >
            {copy.highlightTextStyle}
          </Button>
          <Button
            onClick={() =>
              onUpdateElement({
                textColor: "#ffffff",
                textFontSize: 36,
                textPositionYPercent: 18,
              })
            }
          >
            {copy.topNoteTextStyle}
          </Button>
          <Button disabled={lineCount < 2} onClick={onSplitByLines}>
            {copy.splitTextClipByLines}
          </Button>
        </div>
        <div className="smart-edit-trim-grid">
          <label>
            {copy.textSize}
            <input
              min={12}
              max={72}
              step={1}
              type="number"
              value={element.textFontSize ?? 42}
              onChange={(event) =>
                onUpdateElement({
                  textFontSize: Number(event.target.value),
                })
              }
            />
          </label>
          <label>
            {copy.textPosition}
            <input
              min={8}
              max={92}
              step={1}
              type="number"
              value={element.textPositionYPercent ?? 12}
              onChange={(event) =>
                onUpdateElement({
                  textPositionYPercent: Number(event.target.value),
                })
              }
            />
          </label>
          <label>
            {copy.textColor}
            <input
              type="color"
              value={element.textColor ?? "#ffffff"}
              onChange={(event) =>
                onUpdateElement({
                  textColor: event.target.value,
                })
              }
            />
          </label>
        </div>
      </>
    ) : null}
  </>
);
