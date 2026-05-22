import type { ChangeEvent } from "react";
import type { AssetMetadata } from "@shopclip/shared";
import { ImageUp, Loader2, Search } from "lucide-react";

import { Button } from "../../components/ui/Button";
import { StatusPill } from "../../components/ui/StatusPill";
import type { AppCopy } from "../../app/i18n";
import type { AssetSearchResult, CreateAssetInput } from "../../lib/api";

interface AssetsPanelProps {
  assetDraft: CreateAssetInput;
  assets: AssetMetadata[];
  copy: AppCopy["assets"];
  disabled: boolean;
  error?: string;
  isLoading: boolean;
  isSearching: boolean;
  onAssetDraftChange: (asset: CreateAssetInput) => void;
  onRecallAsset?: (assetId: string) => void;
  onSearchAssets: () => void;
  onSearchQueryChange: (query: string) => void;
  onUploadAsset: () => void;
  searchQuery: string;
  searchResults: AssetSearchResult[];
}

const splitTags = (value: string): string[] =>
  value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

export const AssetsPanel = ({
  assetDraft,
  assets,
  copy,
  disabled,
  error,
  isLoading,
  isSearching,
  onAssetDraftChange,
  onRecallAsset,
  onSearchAssets,
  onSearchQueryChange,
  onUploadAsset,
  searchQuery,
  searchResults,
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
          <p className="eyebrow">{copy.step}</p>
          <h2 id="assets-title">{copy.title}</h2>
        </div>
        <StatusPill tone={assets.length > 0 ? "success" : "warning"}>
          {assets.length > 0 ? copy.ready(assets.length) : copy.empty}
        </StatusPill>
      </div>

      <div className="upload-zone" aria-label={copy.uploadForm}>
        <ImageUp size={28} aria-hidden="true" />
        <div className="form-grid compact">
          <label>
            {copy.assetName}
            <input value={assetDraft.name} onChange={updateField("name")} />
          </label>
          <label>
            {copy.mimeType}
            <input value={assetDraft.mimeType} onChange={updateField("mimeType")} />
          </label>
          <label>
            {copy.sizeBytes}
            <input
              min={1}
              type="number"
              value={assetDraft.sizeBytes}
              onChange={updateField("sizeBytes")}
            />
          </label>
          <label>
            {copy.tags}
            <input value={assetDraft.tags.join(", ")} onChange={updateField("tags")} />
          </label>
        </div>
        <Button
          disabled={disabled || isLoading}
          icon={isLoading ? <Loader2 className="spin" size={18} /> : <ImageUp size={18} />}
          onClick={onUploadAsset}
        >
          {copy.uploadMetadata}
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
            <strong>{copy.emptyTitle}</strong>
            <span>{copy.emptyBody}</span>
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

      <div className="asset-search" aria-label={copy.searchRegion}>
        <div className="asset-search-controls">
          <label>
            {copy.searchLabel}
            <input
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.target.value)}
              placeholder={copy.searchPlaceholder}
            />
          </label>
          <Button
            disabled={disabled || isSearching}
            icon={isSearching ? <Loader2 className="spin" size={18} /> : <Search size={18} />}
            onClick={onSearchAssets}
          >
            {copy.search}
          </Button>
        </div>
        <div className="search-results" aria-live="polite">
          {searchResults.length === 0 ? (
            <div className="empty-state compact-empty">
              <strong>{copy.noResults}</strong>
              <span>{copy.noResultsBody}</span>
            </div>
          ) : (
            searchResults.map((result) => (
              <article className="search-result-row" key={result.asset.id}>
                <div>
                  <h3>{result.asset.name}</h3>
                  <p>{copy.score(result.score)}</p>
                  <div className="constraint-list">
                    {result.reasons.slice(0, 3).map((reason: string) => (
                      <StatusPill key={reason} tone="info">
                        {reason}
                      </StatusPill>
                    ))}
                  </div>
                </div>
                <Button
                  disabled={!onRecallAsset}
                  icon={<ImageUp size={18} />}
                  onClick={() => onRecallAsset?.(result.asset.id)}
                >
                  {copy.useInScene}
                </Button>
              </article>
            ))
          )}
        </div>
      </div>
    </section>
  );
};
