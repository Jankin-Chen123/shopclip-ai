import { Download, ListVideo } from "lucide-react";

interface SmartEditEditorChromeProps {
  exportUrl?: string;
  isBusy: boolean;
}

export const SmartEditEditorChrome = ({
  exportUrl,
  isBusy,
}: SmartEditEditorChromeProps) => (
  <div className="smart-edit-editor-chrome" aria-label="Editor actions">
    <span>{isBusy ? "Rendering" : "Ready"}</span>
    <button type="button" aria-label="Keyboard shortcuts">
      <ListVideo size={16} aria-hidden="true" />
      Shortcuts
    </button>
    {exportUrl ? (
      <a href={exportUrl} download>
        <Download size={16} aria-hidden="true" />
        Export
      </a>
    ) : (
      <button type="button" disabled>
        <Download size={16} aria-hidden="true" />
        Export
      </button>
    )}
  </div>
);
