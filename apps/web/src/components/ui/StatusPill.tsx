import type { ReactNode } from "react";

interface StatusPillProps {
  children: ReactNode;
  tone?: "neutral" | "info" | "success" | "warning" | "danger";
}

export const StatusPill = ({ children, tone = "neutral" }: StatusPillProps) => (
  <span className={`status-pill status-${tone}`}>{children}</span>
);
