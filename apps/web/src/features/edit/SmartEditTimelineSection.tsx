import type { ReactNode } from "react";

import type { AppCopy } from "../../app/i18n";

interface SmartEditTimelineSectionProps {
  children: ReactNode;
  copy: AppCopy["smartEdit"];
}

export const SmartEditTimelineSection = ({
  children,
  copy,
}: SmartEditTimelineSectionProps) => (
  <div className="smart-edit-timeline" aria-label={copy.timeline}>
    <div className="timeline-header">
      <h3>{copy.timeline}</h3>
      <span>{copy.deleteHint}</span>
    </div>
    {children}
  </div>
);
