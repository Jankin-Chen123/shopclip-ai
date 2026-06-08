import { useState } from "react";

import {
  createDefaultStockProviderConfigs,
  sanitizeApiConfig,
  sanitizeStockProviderConfigs,
} from "../features/settings/SettingsPanel";
import type { StockProviderConfig, UserApiConfig } from "../lib/api";
import { getStoredApiConfig } from "./AppSetupUtils";

const getStoredStockProviderConfigs = (): StockProviderConfig[] => {
  if (typeof window === "undefined") {
    return createDefaultStockProviderConfigs();
  }

  try {
    const storedConfig = window.localStorage.getItem("shopclip-stock-provider-config");
    if (!storedConfig) {
      return createDefaultStockProviderConfigs();
    }
    return sanitizeStockProviderConfigs(JSON.parse(storedConfig) as StockProviderConfig[]);
  } catch {
    return createDefaultStockProviderConfigs();
  }
};

export interface SettingsState {
  apiConfig: UserApiConfig;
  handleApiConfigChange: (nextApiConfig: UserApiConfig) => void;
  handleStockProviderConfigsChange: (nextConfigs: StockProviderConfig[]) => void;
  stockProviderConfigs: StockProviderConfig[];
}

export const useSettingsState = (): SettingsState => {
  const [apiConfig, setApiConfig] = useState<UserApiConfig>(() => getStoredApiConfig());
  const [stockProviderConfigs, setStockProviderConfigs] = useState<StockProviderConfig[]>(() =>
    getStoredStockProviderConfigs(),
  );

  const handleApiConfigChange = (nextApiConfig: UserApiConfig) => {
    const normalizedConfig = sanitizeApiConfig(nextApiConfig);
    setApiConfig(normalizedConfig);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("shopclip-api-config", JSON.stringify(normalizedConfig));
    }
  };

  const handleStockProviderConfigsChange = (nextConfigs: StockProviderConfig[]) => {
    const normalizedConfigs = sanitizeStockProviderConfigs(nextConfigs);
    setStockProviderConfigs(normalizedConfigs);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        "shopclip-stock-provider-config",
        JSON.stringify(normalizedConfigs),
      );
    }
  };

  return {
    apiConfig,
    handleApiConfigChange,
    handleStockProviderConfigsChange,
    stockProviderConfigs,
  };
};
