import type { ChangeEvent } from "react";
import type { AssetMetadata, EditingSuggestion, StoryboardScene } from "@shopclip/shared";
import {
  ArrowLeft,
  ArrowRight,
  Clock3,
  Lightbulb,
  Replace,
  Save,
  Search,
  Trash2,
  Video,
  WandSparkles,
  X,
} from "lucide-react";

import { Button } from "../../components/ui/Button";
import { StatusPill } from "../../components/ui/StatusPill";
import type { AppCopy } from "../../app/i18n";
import type { AssetRecallCandidate } from "../../lib/api";

interface StudioWorkspaceProps {
  assets: AssetMetadata[];
  copy: AppCopy["studio"];
  dirtySceneIds: Set<string>;
  isBusy: boolean;
  onApplySuggestion: (suggestionId: string) => void;
  onDeleteScene: (sceneId: string) => void;
  onDismissSuggestion: (suggestionId: string) => void;
  onApplyAssetCandidate: (assetId: string) => void;
  onLoadAssetCandidates: (sceneId: string) => void;
  onLoadSuggestions: (sceneId: string) => void;
  onRegenerateScene: (scene: StoryboardScene) => void;
  onSceneChange: (scene: StoryboardScene) => void;
  onSceneSave: (sceneId: string) => void;
  onSceneMove: (sceneId: string, direction: "earlier" | "later") => void;
  onSelectedSceneChange: (sceneId: string) => void;
  scenes: StoryboardScene[];
  selectedSceneId?: string;
  assetCandidates: AssetRecallCandidate[];
  suggestions: EditingSuggestion[];
}

export const StudioWorkspace = ({
  assets,
  copy,
  dirtySceneIds,
  isBusy,
  onApplySuggestion,
  onDeleteScene,
  onDismissSuggestion,
  onApplyAssetCandidate,
  onLoadAssetCandidates,
  onLoadSuggestions,
  onRegenerateScene,
  onSceneChange,
  onSceneMove,
  onSceneSave,
  onSelectedSceneChange,
  scenes,
  selectedSceneId,
  assetCandidates = [],
  suggestions,
}: StudioWorkspaceProps) => {
  const selectedScene = scenes.find((scene) => scene.id === selectedSceneId) ?? scenes[0];
  const selectedSceneIndex = selectedScene
    ? scenes.findIndex((scene) => scene.id === selectedScene.id)
    : -1;

  const updateSelected =
    (field: keyof StoryboardScene) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      if (!selectedScene) {
        return;
      }
      const value = event.target.value;
      onSceneChange({
        ...selectedScene,
        [field]: field === "durationSeconds" ? Number(value) : value === "none" ? undefined : value,
        status: "edited",
      });
    };

  const updateSelectedCopy = (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    if (!selectedScene) {
      return;
    }
    const value = event.target.value;
    onSceneChange({
      ...selectedScene,
      subtitle: value,
      voiceover: value,
      status: "edited",
    });
  };

  return (
    <section className="studio-panel" id="studio" aria-labelledby="studio-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">{copy.step}</p>
          <h2 id="studio-title">{copy.title}</h2>
        </div>
        <StatusPill
          tone={dirtySceneIds.size > 0 ? "warning" : scenes.length ? "success" : "neutral"}
        >
          {dirtySceneIds.size > 0 ? copy.unsaved(dirtySceneIds.size) : copy.stable}
        </StatusPill>
      </div>

      <div className="studio-grid">
        <div className="scene-track" aria-label={copy.timelineLabel}>
          {scenes.length === 0 ? (
            <div className="empty-state">
              <strong>{copy.noSceneCards}</strong>
              <span>{copy.noSceneCardsBody}</span>
            </div>
          ) : (
            scenes.map((scene) => (
              <button
                className={`scene-card ${scene.id === selectedScene?.id ? "selected" : ""}`}
                key={scene.id}
                onClick={() => onSelectedSceneChange(scene.id)}
                type="button"
              >
                <span>{copy.scene(scene.order)}</span>
                <strong>{scene.subtitle}</strong>
                <small>{scene.durationSeconds}s</small>
              </button>
            ))
          )}
        </div>

        <div className="phone-preview" aria-label={copy.previewLabel}>
          <div className="phone-frame">
            <span className="preview-time">
              <Clock3 size={14} aria-hidden="true" />
              {selectedScene ? `${selectedScene.durationSeconds}s` : "0s"}
            </span>
            {selectedScene?.imageUrl ? (
              <img
                alt={`Scene ${selectedScene.order} generated visual: ${selectedScene.subtitle}`}
                className="preview-image"
                src={selectedScene.imageUrl}
              />
            ) : (
              <div className="preview-art">
                <Video size={42} aria-hidden="true" />
              </div>
            )}
            <p>{selectedScene?.subtitle ?? copy.emptyPreview}</p>
          </div>
        </div>

        <aside className="inspector" aria-label={copy.inspectorLabel}>
          {selectedScene ? (
            <>
              <div className="inspector-heading">
                <h3>{copy.fields}</h3>
                <StatusPill tone={dirtySceneIds.has(selectedScene.id) ? "warning" : "success"}>
                  {dirtySceneIds.has(selectedScene.id) ? copy.edited : selectedScene.status}
                </StatusPill>
              </div>
              <label>
                {copy.duration}
                <input
                  min={4}
                  max={12}
                  type="number"
                  value={selectedScene.durationSeconds}
                  onChange={updateSelected("durationSeconds")}
                />
              </label>
              <label>
                {copy.sceneCopy}
                <textarea
                  rows={3}
                  value={selectedScene.voiceover || selectedScene.subtitle}
                  onChange={updateSelectedCopy}
                />
              </label>
              <label>
                {copy.visualPrompt}
                <textarea
                  rows={4}
                  value={selectedScene.visualPrompt}
                  onChange={updateSelected("visualPrompt")}
                />
              </label>
              <label>
                {copy.assetSlot}
                <select
                  value={selectedScene.assetId ?? "none"}
                  onChange={updateSelected("assetId")}
                >
                  <option value="none">{copy.noLinkedAsset}</option>
                  {assets.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="asset-recall-panel">
                <div className="inspector-heading">
                  <h3>{copy.assetCandidates}</h3>
                  <Button
                    disabled={isBusy}
                    icon={<Search size={18} />}
                    onClick={() => onLoadAssetCandidates(selectedScene.id)}
                  >
                    {copy.loadAssetCandidates}
                  </Button>
                </div>
                {assetCandidates.length === 0 ? (
                  <div className="empty-state compact-empty">
                    <strong>{copy.noAssetCandidates}</strong>
                    <span>{copy.noAssetCandidatesBody}</span>
                  </div>
                ) : (
                  assetCandidates.map((candidate) => (
                    <article className="asset-recall-row" key={`${candidate.asset.id}-${candidate.slice?.id ?? "asset"}`}>
                      <div>
                        <h4>{candidate.asset.name}</h4>
                        <p>
                          {candidate.slice?.startSecond !== undefined &&
                          candidate.slice.endSecond !== undefined
                            ? copy.sliceTime(candidate.slice.startSecond, candidate.slice.endSecond)
                            : candidate.asset.type}
                          {" · "}
                          {candidate.reasons.slice(0, 3).join(" / ")}
                        </p>
                      </div>
                      <Button
                        disabled={isBusy}
                        icon={<Replace size={18} />}
                        onClick={() => onApplyAssetCandidate(candidate.asset.id)}
                      >
                        {copy.useCandidate}
                      </Button>
                    </article>
                  ))
                )}
              </div>
              <Button
                disabled={!dirtySceneIds.has(selectedScene.id) || isBusy}
                icon={<Save size={18} />}
                onClick={() => onSceneSave(selectedScene.id)}
              >
                {copy.saveLocalEdit}
              </Button>
              <div className="scene-action-grid">
                <Button
                  disabled={selectedSceneIndex <= 0 || isBusy}
                  icon={<ArrowLeft size={18} />}
                  onClick={() => onSceneMove(selectedScene.id, "earlier")}
                >
                  {copy.moveEarlier}
                </Button>
                <Button
                  disabled={
                    selectedSceneIndex === -1 || selectedSceneIndex >= scenes.length - 1 || isBusy
                  }
                  icon={<ArrowRight size={18} />}
                  onClick={() => onSceneMove(selectedScene.id, "later")}
                >
                  {copy.moveLater}
                </Button>
                <Button
                  disabled={isBusy}
                  icon={<WandSparkles size={18} />}
                  onClick={() => onRegenerateScene(selectedScene)}
                >
                  {copy.regenerateScene}
                </Button>
                <Button
                  disabled={scenes.length <= 1 || isBusy}
                  icon={<Trash2 size={18} />}
                  onClick={() => onDeleteScene(selectedScene.id)}
                  variant="danger"
                >
                  {copy.deleteScene}
                </Button>
              </div>
              <div className="agent-panel">
                <div className="inspector-heading">
                  <h3>{copy.suggestions}</h3>
                  <Button
                    disabled={isBusy}
                    icon={<Lightbulb size={18} />}
                    onClick={() => onLoadSuggestions(selectedScene.id)}
                  >
                    {copy.loadSuggestions}
                  </Button>
                </div>
                {suggestions.length === 0 ? (
                  <div className="empty-state compact-empty">
                    <strong>{copy.noSuggestions}</strong>
                    <span>{copy.noSuggestionsBody}</span>
                  </div>
                ) : (
                  suggestions.map((suggestion) => (
                    <article className="suggestion-row" key={suggestion.id}>
                      <div>
                        <h4>{suggestion.title}</h4>
                        <p>{suggestion.explanation}</p>
                      </div>
                      <div className="suggestion-actions">
                        <Button
                          disabled={isBusy}
                          icon={<Lightbulb size={18} />}
                          onClick={() => onApplySuggestion(suggestion.id)}
                        >
                          {copy.applySuggestion}
                        </Button>
                        <Button
                          disabled={isBusy}
                          icon={<X size={18} />}
                          onClick={() => onDismissSuggestion(suggestion.id)}
                          variant="ghost"
                        >
                          {copy.dismissSuggestion}
                        </Button>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </>
          ) : (
            <div className="empty-state">
              <strong>{copy.noSelectedScene}</strong>
              <span>{copy.noSelectedSceneBody}</span>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
};
