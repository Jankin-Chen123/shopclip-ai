import {
  smartEditAssetTabs,
  type SmartEditAssetTab,
} from "./SmartEditAssetBin";

interface SmartEditAssetTabRailProps {
  activeAssetTab: SmartEditAssetTab;
  onAssetTabChange: (tab: SmartEditAssetTab) => void;
}

export const SmartEditAssetTabRail = ({
  activeAssetTab,
  onAssetTabChange,
}: SmartEditAssetTabRailProps) => (
  <nav className="smart-edit-opencut-rail" aria-label="OpenCut tools">
    {smartEditAssetTabs.map((tab) => {
      const Icon = tab.icon;
      return (
        <button
          aria-label={tab.label}
          className={activeAssetTab === tab.id ? "active" : undefined}
          key={tab.id}
          type="button"
          onClick={() => onAssetTabChange(tab.id)}
        >
          <Icon size={18} aria-hidden="true" />
        </button>
      );
    })}
  </nav>
);
