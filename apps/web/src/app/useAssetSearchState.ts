import { useMemo, useState, type Dispatch, type SetStateAction } from "react";

import {
  assetMatchesCategory,
  externalAssetMatchesCategory,
  type AssetCategory,
} from "../features/assets/AssetCategoryTabs";
import type { AssetSearchResult, ExternalAssetResult } from "../lib/api";

export interface AssetSearchState {
  activeExternalAssetSearchResults: ExternalAssetResult[];
  activeSearchResults: AssetSearchResult[];
  externalAssetSearchResults: ExternalAssetResult[];
  hasAssetSearchRun: boolean;
  resetAssetSearch: () => void;
  searchQuery: string;
  setExternalAssetSearchResults: Dispatch<SetStateAction<ExternalAssetResult[]>>;
  setHasAssetSearchRun: Dispatch<SetStateAction<boolean>>;
  setSearchQuery: Dispatch<SetStateAction<string>>;
  setSearchResults: Dispatch<SetStateAction<AssetSearchResult[]>>;
}

export const useAssetSearchState = (activeAssetCategory: AssetCategory): AssetSearchState => {
  const [searchQuery, setSearchQuery] = useState("");
  const [hasAssetSearchRun, setHasAssetSearchRun] = useState(false);
  const [searchResults, setSearchResults] = useState<AssetSearchResult[]>([]);
  const [externalAssetSearchResults, setExternalAssetSearchResults] = useState<
    ExternalAssetResult[]
  >([]);

  const activeSearchResults = useMemo(
    () =>
      searchResults.filter((result) => assetMatchesCategory(result.asset, activeAssetCategory)),
    [activeAssetCategory, searchResults],
  );

  const activeExternalAssetSearchResults = useMemo(
    () =>
      externalAssetSearchResults.filter((result) =>
        externalAssetMatchesCategory(result, activeAssetCategory),
      ),
    [activeAssetCategory, externalAssetSearchResults],
  );

  const resetAssetSearch = () => {
    setHasAssetSearchRun(false);
    setSearchResults([]);
    setExternalAssetSearchResults([]);
  };

  return {
    activeExternalAssetSearchResults,
    activeSearchResults,
    externalAssetSearchResults,
    hasAssetSearchRun,
    resetAssetSearch,
    searchQuery,
    setExternalAssetSearchResults,
    setHasAssetSearchRun,
    setSearchQuery,
    setSearchResults,
  };
};
