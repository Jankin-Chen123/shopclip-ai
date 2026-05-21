import type { ChangeEvent } from "react";
import type { AssetMetadata, StoryboardScene } from "@shopclip/shared";
import { Clock3, Save, Video } from "lucide-react";

import { Button } from "../../components/ui/Button";
import { StatusPill } from "../../components/ui/StatusPill";
import type { AppCopy } from "../../app/i18n";

interface StudioWorkspaceProps {
  assets: AssetMetadata[];
  copy: AppCopy["studio"];
  dirtySceneIds: Set<string>;
  onSceneChange: (scene: StoryboardScene) => void;
  onSceneSave: (sceneId: string) => void;
  onSelectedSceneChange: (sceneId: string) => void;
  scenes: StoryboardScene[];
  selectedSceneId?: string;
}

export const StudioWorkspace = ({
  assets,
  copy,
  dirtySceneIds,
  onSceneChange,
  onSceneSave,
  onSelectedSceneChange,
  scenes,
  selectedSceneId,
}: StudioWorkspaceProps) => {
  const selectedScene = scenes.find((scene) => scene.id === selectedSceneId) ?? scenes[0];

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
        <div className="phone-preview" aria-label={copy.previewLabel}>
          <div className="phone-frame">
            <span className="preview-time">
              <Clock3 size={14} aria-hidden="true" />
              {selectedScene ? `${selectedScene.durationSeconds}s` : "0s"}
            </span>
            <div className="preview-art">
              <Video size={42} aria-hidden="true" />
            </div>
            <p>{selectedScene?.subtitle ?? copy.emptyPreview}</p>
          </div>
        </div>

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
                  min={1}
                  max={15}
                  type="number"
                  value={selectedScene.durationSeconds}
                  onChange={updateSelected("durationSeconds")}
                />
              </label>
              <label>
                {copy.subtitle}
                <textarea
                  rows={3}
                  value={selectedScene.subtitle}
                  onChange={updateSelected("subtitle")}
                />
              </label>
              <label>
                {copy.voiceover}
                <textarea
                  rows={3}
                  value={selectedScene.voiceover}
                  onChange={updateSelected("voiceover")}
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
              <Button
                disabled={!dirtySceneIds.has(selectedScene.id)}
                icon={<Save size={18} />}
                onClick={() => onSceneSave(selectedScene.id)}
              >
                {copy.saveLocalEdit}
              </Button>
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
