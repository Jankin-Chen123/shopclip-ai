import type { ChangeEvent } from "react";
import type { ScriptResult } from "@shopclip/shared";
import { ArrowRight, Loader2, WandSparkles } from "lucide-react";

import { Button } from "../../components/ui/Button";
import { StatusPill } from "../../components/ui/StatusPill";
import type { AppCopy } from "../../app/i18n";

interface ScriptPanelProps {
  copy: AppCopy["script"];
  disabled: boolean;
  error?: string;
  fallbackProvider?: string;
  isLoading: boolean;
  isStoryboardGenerating: boolean;
  onGenerateScript: () => void;
  onGenerateStoryboard: () => void;
  onScriptDraftChange: (scriptDraft: string) => void;
  script?: ScriptResult;
  scriptDraft: string;
}

export const ScriptPanel = ({
  copy,
  disabled,
  error,
  fallbackProvider,
  isLoading,
  isStoryboardGenerating,
  onGenerateScript,
  onGenerateStoryboard,
  onScriptDraftChange,
  script,
  scriptDraft,
}: ScriptPanelProps) => {
  const handleDraftChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    onScriptDraftChange(event.target.value);
  };

  return (
    <section className="panel script-generation-panel" id="script" aria-labelledby="script-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{copy.step}</p>
          <h2 id="script-title">{copy.title}</h2>
          <p className="concept-panel-subtitle">{copy.body}</p>
        </div>
        <StatusPill tone={scriptDraft.trim() ? "success" : "neutral"}>
          {scriptDraft.trim() ? copy.ready : copy.draft}
        </StatusPill>
      </div>

      <label className="script-draft-editor">
        <span>{copy.editorLabel}</span>
        <textarea
          onChange={handleDraftChange}
          placeholder={copy.placeholder}
          rows={8}
          value={scriptDraft}
        />
      </label>

      <div className="script-generation-actions">
        <Button
          disabled={disabled || isLoading}
          icon={isLoading ? <Loader2 className="spin" size={18} /> : <WandSparkles size={18} />}
          onClick={onGenerateScript}
          variant="primary"
        >
          {copy.oneClickGenerate}
        </Button>
        <Button
          disabled={disabled || isLoading || isStoryboardGenerating}
          icon={
            isStoryboardGenerating ? (
              <Loader2 className="spin" size={18} />
            ) : (
              <WandSparkles size={18} />
            )
          }
          onClick={onGenerateStoryboard}
        >
          {copy.generateStoryboard}
          <ArrowRight size={18} aria-hidden="true" />
        </Button>
      </div>

      {error ? (
        <p className="inline-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="script-result">
        {script ? (
          <div className="constraint-list">
            <StatusPill tone="info">{copy.sceneCount(script.scenes.length)}</StatusPill>
            {script.constraints.slice(0, 2).map((constraint) => (
              <StatusPill key={constraint} tone="info">
                {constraint}
              </StatusPill>
            ))}
          </div>
        ) : null}
        {fallbackProvider ? (
          <p className="fallback-note">{copy.fallback(fallbackProvider)}</p>
        ) : null}
      </div>
    </section>
  );
};
