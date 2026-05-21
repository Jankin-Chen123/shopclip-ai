import type { ChangeEvent } from "react";
import type { AssetMetadata, StoryboardScene } from "@shopclip/shared";
import { Clock3, Save, Video } from "lucide-react";

import { Button } from "../../components/ui/Button";
import { StatusPill } from "../../components/ui/StatusPill";

interface StudioWorkspaceProps {
  assets: AssetMetadata[];
  dirtySceneIds: Set<string>;
  onSceneChange: (scene: StoryboardScene) => void;
  onSceneSave: (sceneId: string) => void;
  onSelectedSceneChange: (sceneId: string) => void;
  scenes: StoryboardScene[];
  selectedSceneId?: string;
}

export const StudioWorkspace = ({
  assets,
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
          <p className="eyebrow">Step 04</p>
          <h2 id="studio-title">Studio editor</h2>
        </div>
        <StatusPill
          tone={dirtySceneIds.size > 0 ? "warning" : scenes.length ? "success" : "neutral"}
        >
          {dirtySceneIds.size > 0 ? `${dirtySceneIds.size} unsaved` : "Stable"}
        </StatusPill>
      </div>

      <div className="studio-grid">
        <div className="phone-preview" aria-label="9 by 16 preview">
          <div className="phone-frame">
            <span className="preview-time">
              <Clock3 size={14} aria-hidden="true" />
              {selectedScene ? `${selectedScene.durationSeconds}s` : "0s"}
            </span>
            <div className="preview-art">
              <Video size={42} aria-hidden="true" />
            </div>
            <p>{selectedScene?.subtitle ?? "Generate a storyboard to preview scenes."}</p>
          </div>
        </div>

        <div className="scene-track" aria-label="Scene timeline">
          {scenes.length === 0 ? (
            <div className="empty-state">
              <strong>No scene cards</strong>
              <span>Storyboard scenes will appear here with stable card dimensions.</span>
            </div>
          ) : (
            scenes.map((scene) => (
              <button
                className={`scene-card ${scene.id === selectedScene?.id ? "selected" : ""}`}
                key={scene.id}
                onClick={() => onSelectedSceneChange(scene.id)}
                type="button"
              >
                <span>Scene {scene.order}</span>
                <strong>{scene.subtitle}</strong>
                <small>{scene.durationSeconds}s</small>
              </button>
            ))
          )}
        </div>

        <aside className="inspector" aria-label="Scene inspector">
          {selectedScene ? (
            <>
              <div className="inspector-heading">
                <h3>Scene fields</h3>
                <StatusPill tone={dirtySceneIds.has(selectedScene.id) ? "warning" : "success"}>
                  {dirtySceneIds.has(selectedScene.id) ? "Edited" : selectedScene.status}
                </StatusPill>
              </div>
              <label>
                Duration
                <input
                  min={1}
                  max={15}
                  type="number"
                  value={selectedScene.durationSeconds}
                  onChange={updateSelected("durationSeconds")}
                />
              </label>
              <label>
                Subtitle
                <textarea
                  rows={3}
                  value={selectedScene.subtitle}
                  onChange={updateSelected("subtitle")}
                />
              </label>
              <label>
                Voiceover
                <textarea
                  rows={3}
                  value={selectedScene.voiceover}
                  onChange={updateSelected("voiceover")}
                />
              </label>
              <label>
                Visual prompt
                <textarea
                  rows={4}
                  value={selectedScene.visualPrompt}
                  onChange={updateSelected("visualPrompt")}
                />
              </label>
              <label>
                Asset slot
                <select
                  value={selectedScene.assetId ?? "none"}
                  onChange={updateSelected("assetId")}
                >
                  <option value="none">No linked asset</option>
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
                Save local edit
              </Button>
            </>
          ) : (
            <div className="empty-state">
              <strong>No selected scene</strong>
              <span>Generate the storyboard before editing scene fields.</span>
            </div>
          )}
        </aside>
      </div>
    </section>
  );
};
