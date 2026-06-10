import type { ChangeEvent } from "react";
import { useState } from "react";
import type { AssetMetadata, AssetSlice, EditingSuggestion, StoryboardScene } from "@shopclip/shared";
import {
  ArrowLeft,
  ArrowRight,
  Clock3,
  Eye,
  FileText,
  Image as ImageIcon,
  Lightbulb,
  Play,
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
import { getAssetThumbnailUrl } from "../../lib/api";
import type { AssetRecallCandidate } from "../../lib/api";

type StudioWorkspaceCopy = Omit<AppCopy["studio"], "step"> & { step: string };

interface PreviewMaterial {
  asset: AssetMetadata;
  slice?: AssetSlice;
}

interface AssetVisualProps {
  asset: AssetMetadata;
  className: string;
  isImageAsset: (asset: AssetMetadata) => boolean;
  isVideoAsset: (asset: AssetMetadata) => boolean;
  visualUrl: string;
}

const AssetVisual = ({
  asset,
  className,
  isImageAsset,
  isVideoAsset,
  visualUrl,
}: AssetVisualProps) => {
  if (visualUrl) {
    return <img alt={asset.name} className={className} loading="lazy" src={visualUrl} />;
  }

  return (
    <span className={`${className} asset-visual-fallback`}>
      {isVideoAsset(asset) ? (
        <Play size={22} aria-hidden="true" />
      ) : isImageAsset(asset) ? (
        <ImageIcon size={22} aria-hidden="true" />
      ) : (
        <FileText size={22} aria-hidden="true" />
      )}
    </span>
  );
};

interface StudioWorkspaceProps {
  assets: AssetMetadata[];
  copy: StudioWorkspaceCopy;
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
  const [previewMaterial, setPreviewMaterial] = useState<PreviewMaterial | undefined>();
  const selectedScene = scenes.find((scene) => scene.id === selectedSceneId) ?? scenes[0];
  const selectedSceneIndex = selectedScene
    ? scenes.findIndex((scene) => scene.id === selectedScene.id)
    : -1;
  const selectedAsset = selectedScene?.assetId
    ? assets.find((asset) => asset.id === selectedScene.assetId)
    : undefined;

  const isImageAsset = (asset: AssetMetadata) =>
    asset.type === "image" || Boolean(asset.mimeType?.startsWith("image/"));

  const isVideoAsset = (asset: AssetMetadata) =>
    asset.type === "video" || Boolean(asset.mimeType?.startsWith("video/"));

  const assetVisualUrl = (asset: AssetMetadata) => {
    if (isImageAsset(asset)) {
      return asset.url;
    }
    if (isVideoAsset(asset) && asset.thumbnailKey) {
      return getAssetThumbnailUrl(asset.id);
    }
    return "";
  };

  const assetTypeLabel = (asset: AssetMetadata) => {
    if (isImageAsset(asset)) {
      return copy.assetTypeLabels.image;
    }
    if (isVideoAsset(asset)) {
      return copy.assetTypeLabels.video;
    }
    return copy.assetTypeLabels.reference;
  };

  const candidateSummary = (candidate: AssetRecallCandidate) =>
    candidate.slice?.metadata?.summary ||
    candidate.asset.structuredMetadata?.overallSummary ||
    candidate.asset.embeddingText ||
    candidate.asset.tags.slice(0, 3).join(" / ") ||
    copy.assetSummaryFallback;

  const materialMeta = (material: PreviewMaterial) => {
    const timeRange =
      material.slice?.startSecond !== undefined && material.slice.endSecond !== undefined
        ? copy.sliceTime(material.slice.startSecond, material.slice.endSecond)
        : undefined;
    return [assetTypeLabel(material.asset), timeRange].filter(Boolean).join(" / ");
  };

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
              {selectedAsset ? (
                <div className="linked-asset-preview">
                  <AssetVisual
                    asset={selectedAsset}
                    className="linked-asset-thumb"
                    isImageAsset={isImageAsset}
                    isVideoAsset={isVideoAsset}
                    visualUrl={assetVisualUrl(selectedAsset)}
                  />
                  <div>
                    <span>{copy.currentAsset}</span>
                    <strong>{selectedAsset.name}</strong>
                    <p>{assetTypeLabel(selectedAsset)}</p>
                  </div>
                  <Button
                    disabled={isBusy}
                    icon={<Eye size={18} />}
                    onClick={() => setPreviewMaterial({ asset: selectedAsset })}
                    variant="ghost"
                  >
                    {copy.previewAsset}
                  </Button>
                </div>
              ) : (
                <div className="linked-asset-preview empty-linked-asset">
                  <ImageIcon size={22} aria-hidden="true" />
                  <span>{copy.noCurrentAsset}</span>
                </div>
              )}
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
                    <article
                      className="asset-recall-row"
                      key={`${candidate.asset.id}-${candidate.slice?.id ?? "asset"}`}
                    >
                      <button
                        aria-label={`${copy.previewAsset}: ${candidate.asset.name}`}
                        className="asset-recall-preview-button"
                        onClick={() =>
                          setPreviewMaterial({ asset: candidate.asset, slice: candidate.slice })
                        }
                        type="button"
                      >
                        <AssetVisual
                          asset={candidate.asset}
                          className="asset-recall-thumb"
                          isImageAsset={isImageAsset}
                          isVideoAsset={isVideoAsset}
                          visualUrl={assetVisualUrl(candidate.asset)}
                        />
                      </button>
                      <div>
                        <h4>{candidate.asset.name}</h4>
                        <p className="asset-recall-meta">
                          {candidate.slice?.startSecond !== undefined &&
                          candidate.slice.endSecond !== undefined
                            ? copy.sliceTime(candidate.slice.startSecond, candidate.slice.endSecond)
                            : assetTypeLabel(candidate.asset)}
                        </p>
                        <p>{candidateSummary(candidate)}</p>
                      </div>
                      <div className="asset-recall-actions">
                        <Button
                          disabled={isBusy}
                          icon={<Eye size={18} />}
                          onClick={() =>
                            setPreviewMaterial({ asset: candidate.asset, slice: candidate.slice })
                          }
                          variant="ghost"
                        >
                          {copy.previewAsset}
                        </Button>
                        <Button
                          disabled={isBusy}
                          icon={<Replace size={18} />}
                          onClick={() => onApplyAssetCandidate(candidate.asset.id)}
                        >
                          {copy.useCandidate}
                        </Button>
                      </div>
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
      {previewMaterial ? (
        <div className="studio-asset-preview-backdrop" role="presentation">
          <section
            aria-labelledby="studio-asset-preview-title"
            aria-modal="true"
            className="studio-asset-preview-dialog"
            role="dialog"
          >
            <div className="asset-prep-library-heading">
              <div>
                <p className="eyebrow">{copy.assetPreviewTitle}</p>
                <h3 id="studio-asset-preview-title">{previewMaterial.asset.name}</h3>
                <span>{materialMeta(previewMaterial)}</span>
              </div>
              <button
                aria-label={copy.closePreview}
                className="icon-button"
                onClick={() => setPreviewMaterial(undefined)}
                type="button"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="studio-asset-preview-media">
              {isImageAsset(previewMaterial.asset) ? (
                <img alt={previewMaterial.asset.name} src={previewMaterial.asset.url} />
              ) : isVideoAsset(previewMaterial.asset) ? (
                <video
                  controls
                  poster={assetVisualUrl(previewMaterial.asset) || undefined}
                  src={previewMaterial.asset.url}
                />
              ) : (
                <div className="asset-prep-document-preview">
                  <FileText size={42} aria-hidden="true" />
                  <strong>{previewMaterial.asset.name}</strong>
                  <span>{previewMaterial.asset.mimeType ?? previewMaterial.asset.type}</span>
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
};
