import {
  clampTextFontSize,
  clampTextPositionYPercent,
  normalizeTextColor,
} from "./SmartEditTimelineMath";
import type { SmartEditTrackId } from "./SmartEditTrackUtils";

type SmartEditTextStyleSegment = {
  textColor?: string;
  textFontSize?: number;
  textPositionYPercent?: number;
  trackId: SmartEditTrackId;
};

export const SmartEditTextStyleStrip = ({ segment }: { segment: SmartEditTextStyleSegment }) => {
  if (segment.trackId !== "caption") {
    return null;
  }
  const color = normalizeTextColor(segment.textColor) ?? "#ffffff";
  const size = clampTextFontSize(segment.textFontSize ?? 42);
  const position = Math.round(clampTextPositionYPercent(segment.textPositionYPercent ?? 12));
  return (
    <div className="smart-edit-text-style-strip" title="Text style">
      <i aria-hidden="true" style={{ background: color }} />
      <span>{size}px</span>
      <span>Y {position}%</span>
    </div>
  );
};
