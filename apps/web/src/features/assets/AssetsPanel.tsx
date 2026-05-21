import type { ChangeEvent } from "react";
import type { AssetMetadata } from "@shopclip/shared";
import { ImageUp, Loader2 } from "lucide-react";

import { Button } from "../../components/ui/Button";
import { StatusPill } from "../../components/ui/StatusPill";
import type { CreateAssetInput } from "../../lib/api";

interface AssetsPanelProps {
  assetDraft: CreateAssetInput;
  assets: AssetMetadata[];
  disabled: boolean;
  error?: string;
  isLoading: boolean;
  onAssetDraftChange: (asset: CreateAssetInput) => void;
  onUploadAsset: () => void;
}

const splitTags = (value: string): string[] =>
  value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

export const AssetsPanel = ({
  assetDraft,
  assets,
  disabled,
  error,
  isLoading,
  onAssetDraftChange,
  onUploadAsset,
}: AssetsPanelProps) => {
  const updateField =
    (field: keyof CreateAssetInput) =>
    (event: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const value = event.target.value;
      onAssetDraftChange({
        ...assetDraft,
        [field]:
          field === "sizeBytes" ? Number(value) : field === "tags" ? splitTags(value) : value,
      });
    };

  return (
    <section className="panel" id="assets" aria-labelledby="assets-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Step 02</p>
          <h2 id="assets-title">Asset library</h2>
        </div>
        <StatusPill tone={assets.length > 0 ? "success" : "warning"}>
          {assets.length > 0 ? `${assets.length} ready` : "Empty"}
        </StatusPill>
      </div>

      <div className="upload-zone" aria-label="Asset upload form">
        <ImageUp size={28} aria-hidden="true" />
        <div className="form-grid compact">
          <label>
            Asset name
            <input value={assetDraft.name} onChange={updateField("name")} />
          </label>
          <label>
            MIME type
            <input value={assetDraft.mimeType} onChange={updateField("mimeType")} />
          </label>
          <label>
            Size in bytes
            <input
              min={1}
              type="number"
              value={assetDraft.sizeBytes}
              onChange={updateField("sizeBytes")}
            />
          </label>
          <label>
            Tags
            <input value={assetDraft.tags.join(", ")} onChange={updateField("tags")} />
          </label>
        </div>
        <Button
          disabled={disabled || isLoading}
          icon={isLoading ? <Loader2 className="spin" size={18} /> : <ImageUp size={18} />}
          onClick={onUploadAsset}
        >
          Upload metadata
        </Button>
      </div>

      {error ? (
        <p className="inline-error" role="alert">
          {error}
        </p>
      ) : null}

      <div className="asset-list" aria-live="polite">
        {assets.length === 0 ? (
          <div className="empty-state">
            <strong>No assets yet</strong>
            <span>Create a project, then upload at least one product image metadata record.</span>
          </div>
        ) : (
          assets.map((asset) => (
            <article className="asset-row" key={asset.id}>
              <span className="asset-thumb" aria-hidden="true">
                <ImageUp size={18} />
              </span>
              <div>
                <h3>{asset.name}</h3>
                <p>{asset.mimeType ?? asset.type}</p>
              </div>
              <StatusPill tone={asset.status === "ready" ? "success" : "warning"}>
                {asset.status}
              </StatusPill>
            </article>
          ))
        )}
      </div>
    </section>
  );
};
