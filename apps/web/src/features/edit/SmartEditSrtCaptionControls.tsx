import { Download, Plus } from "lucide-react";

import type { AppCopy } from "../../app/i18n";
import { Button } from "../../components/ui/Button";

interface SmartEditSrtCaptionControlsProps {
  copy: AppCopy["smartEdit"];
  canExport: boolean;
  importText: string;
  statusMessage: string;
  onExport: () => void;
  onImport: () => void;
  onImportTextChange: (value: string) => void;
}

export const SmartEditSrtCaptionControls = ({
  copy,
  canExport,
  importText,
  statusMessage,
  onExport,
  onImport,
  onImportTextChange,
}: SmartEditSrtCaptionControlsProps) => (
  <details className="timeline-srt-import">
    <summary>
      <strong>Import SRT captions</strong>
      <span>{statusMessage}</span>
    </summary>
    <div className="timeline-srt-import-body">
      <textarea
        aria-label="SRT caption text"
        placeholder={"1\n00:00:01,000 --> 00:00:02,500\nCaption text"}
        rows={5}
        value={importText}
        onChange={(event) => onImportTextChange(event.target.value)}
      />
      <Button
        disabled={!canExport || !importText.trim()}
        icon={<Plus size={16} />}
        onClick={onImport}
      >
        Import captions
      </Button>
      <Button disabled={!canExport} icon={<Download size={16} />} onClick={onExport}>
        {copy.exportSrtCaptions}
      </Button>
    </div>
  </details>
);
