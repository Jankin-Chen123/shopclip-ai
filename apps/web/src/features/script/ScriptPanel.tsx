import type { ScriptResult } from "@shopclip/shared";
import { Loader2, WandSparkles } from "lucide-react";

import { Button } from "../../components/ui/Button";
import { StatusPill } from "../../components/ui/StatusPill";
import type { AppCopy } from "../../app/i18n";

interface ScriptPanelProps {
  copy: AppCopy["script"];
  disabled: boolean;
  error?: string;
  fallbackProvider?: string;
  isLoading: boolean;
  onGenerateScript: () => void;
  script?: ScriptResult;
}

export const ScriptPanel = ({
  copy,
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
          <p className="eyebrow">{copy.step}</p>
          <h2 id="script-title">{copy.title}</h2>
        </div>
        <StatusPill tone={script ? "success" : "neutral"}>
          {script ? copy.sceneCount(script.scenes.length) : copy.notGenerated}
        </StatusPill>
      </div>

    <Button
      disabled={disabled || isLoading}
      icon={isLoading ? <Loader2 className="spin" size={18} /> : <WandSparkles size={18} />}
      onClick={onGenerateScript}
      variant="primary"
    >
      {copy.generate}
    </Button>

    {error ? (
      <p className="inline-error" role="alert">
        {error}
      </p>
    ) : null}

    {script ? (
      <div className="script-result">
        <div>
          <span className="section-label">{copy.hook}</span>
          <p>{script.hook}</p>
        </div>
        <div>
          <span className="section-label">{copy.narrative}</span>
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
          <p className="fallback-note">{copy.fallback(fallbackProvider)}</p>
        ) : null}
      </div>
    ) : (
      <div className="empty-state">
        <strong>{copy.emptyTitle}</strong>
        <span>{copy.emptyBody}</span>
      </div>
    )}
  </section>
);
