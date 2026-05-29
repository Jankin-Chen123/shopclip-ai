import type { ReferenceVideoAnalysis, ReferenceVideo } from "@shopclip/shared";

export interface ViralBreakdownProvider {
  analyzeReference: (reference: ReferenceVideo) => Promise<ReferenceVideoAnalysis>;
}
