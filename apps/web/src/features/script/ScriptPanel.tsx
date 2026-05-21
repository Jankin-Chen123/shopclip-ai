import type { ScriptResult } from "@shopclip/shared";
import { Loader2, WandSparkles } from "lucide-react";

import { Button } from "../../components/ui/Button";
import { StatusPill } from "../../components/ui/StatusPill";

interface ScriptPanelProps {
  disabled: boolean;
  error?: string;
  fallbackProvider?: string;
  isLoading: boolean;
  onGenerateScript: () => void;
  script?: ScriptResult;
}

export const ScriptPanel = ({
  disabled,
  error,
  fallbackProvider,
  isLoading,
  onGenerateScript,
  script,
}: ScriptPanelProps) => (
  <section className="panel" id="script" aria-labelledby="script-title">
    <div className="panel-heading">
      <div>
        <p className="eyebrow">Step 03</p>
        <h2 id="script-title">Script and storyboard</h2>
      </div>
      <StatusPill tone={script ? "success" : "neutral"}>
        {script ? `${script.scenes.length} scenes` : "Not generated"}
      </StatusPill>
    </div>

    <Button
      disabled={disabled || isLoading}
      icon={isLoading ? <Loader2 className="spin" size={18} /> : <WandSparkles size={18} />}
      onClick={onGenerateScript}
      variant="primary"
    >
      Generate storyboard
    </Button>

    {error ? (
      <p className="inline-error" role="alert">
        {error}
      </p>
    ) : null}

    {script ? (
      <div className="script-result">
        <div>
          <span className="section-label">Hook</span>
          <p>{script.hook}</p>
        </div>
        <div>
          <span className="section-label">Narrative</span>
          <p>{script.narrative}</p>
        </div>
        <div className="constraint-list">
          {script.constraints.map((constraint) => (
            <StatusPill key={constraint} tone="info">
              {constraint}
            </StatusPill>
          ))}
        </div>
        {fallbackProvider ? (
          <p className="fallback-note">Generated with deterministic fallback: {fallbackProvider}</p>
        ) : null}
      </div>
    ) : (
      <div className="empty-state">
        <strong>Storyboard pending</strong>
        <span>Generate after project setup so the Studio editor can open scene cards.</span>
      </div>
    )}
  </section>
);
