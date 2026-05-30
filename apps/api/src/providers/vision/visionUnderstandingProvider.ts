import type {
  AssetMetadata,
  StructuredAssetMetadata,
  StructuredSliceMetadata,
} from "@shopclip/shared";

import type { ExtractedAudioSummary } from "../../modules/media/audioExtractor.js";
import type { SampledFrame } from "../../modules/media/frameSampler.js";
import type { MediaProbeResult } from "../../modules/media/mediaProbe.js";

export interface SliceUnderstandingInput {
  asset: AssetMetadata;
  audio: ExtractedAudioSummary;
  endSecond: number;
  frameKeys: string[];
  frames?: SampledFrame[];
  index: number;
  sliceId: string;
  startSecond: number;
}

export interface VisionUnderstandingProvider {
  understandAsset: (input: {
    asset: AssetMetadata;
    audio: ExtractedAudioSummary;
    frames: SampledFrame[];
    probe: MediaProbeResult;
  }) => Promise<StructuredAssetMetadata>;
  understandSlice: (input: SliceUnderstandingInput) => Promise<StructuredSliceMetadata>;
}
