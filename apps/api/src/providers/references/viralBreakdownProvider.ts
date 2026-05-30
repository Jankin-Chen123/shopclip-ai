import type {
  AssetMetadata,
  AssetSlice,
  ReferenceVideoAnalysis,
  ReferenceVideo,
} from "@shopclip/shared";

export interface ViralBreakdownContext {
  sourceAsset?: AssetMetadata;
  sourceSlices?: AssetSlice[];
}

export interface ViralBreakdownProvider {
  analyzeReference: (
    reference: ReferenceVideo,
    context?: ViralBreakdownContext,
  ) => Promise<ReferenceVideoAnalysis>;
}
