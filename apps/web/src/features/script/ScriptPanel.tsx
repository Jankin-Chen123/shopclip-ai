import type { ChangeEvent } from "react";
import type {
  AssetMetadata,
  ScriptGenerationRequest,
  ScriptResult,
  ViralTemplate,
} from "@shopclip/shared";
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
  onProductionModeChange: (mode: NonNullable<ScriptGenerationRequest["productionMode"]>) => void;
  onReferenceChange: (referenceId: string | undefined) => void;
  onScriptDraftChange: (scriptDraft: string) => void;
  onTemplateChange: (templateId: string | undefined) => void;
  productionMode: NonNullable<ScriptGenerationRequest["productionMode"]>;
  referenceScriptAssets: AssetMetadata[];
  script?: ScriptResult;
  scriptDraft: string;
  selectedReferenceId?: string;
  selectedTemplateId?: string;
  primaryActionLabel?: string;
  showStoryboardAction?: boolean;
  templates: ViralTemplate[];
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
  onProductionModeChange,
  onReferenceChange,
  onScriptDraftChange,
  onTemplateChange,
  productionMode,
  referenceScriptAssets,
  script,
  scriptDraft,
  selectedReferenceId,
  selectedTemplateId,
  primaryActionLabel,
  showStoryboardAction = true,
  templates,
}: ScriptPanelProps) => {
  const handleDraftChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    onScriptDraftChange(event.target.value);
  };
  const referenceScriptOptions = referenceScriptAssets
    .map((asset) => {
      const referenceId =
        asset.metadata &&
        typeof asset.metadata === "object" &&
        "referenceId" in asset.metadata &&
        typeof asset.metadata.referenceId === "string"
          ? asset.metadata.referenceId
          : undefined;
      return referenceId ? { asset, referenceId } : undefined;
    })
    .filter((option): option is { asset: AssetMetadata; referenceId: string } =>
      Boolean(option),
    );

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

      <div className="script-context-grid">
        <label>
          {copy.productionMode}
          <select
            onChange={(event) =>
              onProductionModeChange(
                event.target.value as NonNullable<ScriptGenerationRequest["productionMode"]>,
              )
            }
            value={productionMode}
          >
            <option value="automatic">{copy.modes.automatic}</option>
            <option value="viral-remix">{copy.modes.viralRemix}</option>
            <option value="template">{copy.modes.template}</option>
          </select>
        </label>
        {productionMode === "viral-remix" ? (
          <label>
            {copy.referenceVideo}
            <select
              onChange={(event) => onReferenceChange(event.target.value || undefined)}
              value={selectedReferenceId ?? ""}
            >
              <option value="">{copy.noReferenceVideo}</option>
              {referenceScriptOptions.map(({ asset, referenceId }) => (
                <option key={asset.id} value={referenceId}>
                  {asset.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {productionMode === "template" ? (
          <label>
            {copy.viralTemplate}
            <select
              onChange={(event) => onTemplateChange(event.target.value || undefined)}
              value={selectedTemplateId ?? ""}
            >
              <option value="">{copy.noViralTemplate}</option>
              {templates.map((template) => (
                <option key={template.templateId} value={template.templateId}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      <div className="script-generation-actions">
        <Button
          disabled={disabled || isLoading}
          icon={isLoading ? <Loader2 className="spin" size={18} /> : <WandSparkles size={18} />}
          onClick={onGenerateScript}
          variant="primary"
        >
          {primaryActionLabel ?? copy.oneClickGenerate}
        </Button>
        {showStoryboardAction ? (
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
        ) : null}
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
