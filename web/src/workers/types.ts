import type { ParsingLogits } from '@/models/detector-types';
import type { SyntheticJawResult } from '@/lib/jaw-from-masks';

export type AnalyzeInit = { type: 'INIT'; payload?: { adapter?: 'facemesh' | 'parsing' } };

export type AnalyzeRequest = {
  type: 'ANALYZE';
  payload: {
    jobId: string;
    fileA: File;
    fileB: File;
    maxDim?: number;
    settings?: {
      buffers?: Partial<Record<'brows' | 'eyes' | 'mouth' | 'nose' | 'jaw', number>>;
    };
  };
};

export type AnalyzeProgress = {
  type: 'PROGRESS';
  jobId: string;
  stage: 'load' | 'preprocess' | 'detectA' | 'detectB' | 'score';
};

export type OverlayPoint = { x: number; y: number };
export type RegionPoly = { region: string; points: OverlayPoint[]; open?: boolean };

export type MaskOverlay = {
  width: number;
  height: number;
  labels: Uint8Array;
  crop: { sx: number; sy: number; sw: number; sh: number };
};

export type DetailedNarrative = {
  shared: string[];
  imageA: string[];
  imageB: string[];
  agreement?: number; // 0-1 score for this feature's overall agreement
};

export type FacialMaturityEstimate = {
  score: number;           // 0-1 scale (0=child, 1=adult)
  confidence: number;      // 0-1 how confident we are
  indicators: string[];    // Descriptive indicators
};

export type AgeEstimate = {
  age: number;             // Predicted age (continuous value)
  confidence: number;      // 0-1 how confident we are
  gender: 'male' | 'female';  // Predicted gender
  genderConfidence: number;   // Gender prediction confidence
  rawAge?: number;
};

export type PoseEstimate = {
  yaw: number;      // Left-right rotation in degrees (-90 to +90, 0 = frontal)
  pitch: number;    // Up-down rotation in degrees (-90 to +90, 0 = level)
  roll: number;     // Tilt rotation in degrees (-180 to +180, 0 = upright)
  confidence: number;  // 0-1 confidence in pose estimation
};

export type FeatureNarrative = {
  overall: string;
  featureSummaries: Record<string, string>;
  axisDetails: Record<string, DetailedNarrative>;
  sharedCharacteristics?: string;
};

export type AnalyzeResult = {
  type: 'RESULT';
  jobId: string;
  imageA: ImageBitmap;
  imageB: ImageBitmap;
  pointsA: OverlayPoint[];
  pointsB: OverlayPoint[];
  scores: { region: string; score: number }[];
  overall: number;
  regionsA: RegionPoly[];
  regionsB: RegionPoly[];
  texts?: { region: string; text: string }[];
  adapter?: 'facemesh' | 'parsing';
  parseMsA?: number;
  parseMsB?: number;
  hintsSourceA?: string;
  hintsSourceB?: string;
  ortA?: string;
  ortB?: string;
  maskA?: MaskOverlay;
  maskB?: MaskOverlay;
  logitsA?: ParsingLogits;
  logitsB?: ParsingLogits;
  syntheticJawA?: SyntheticJawResult;
  syntheticJawB?: SyntheticJawResult;
  featureNarrative?: FeatureNarrative;
  congruenceScore?: number;
  ageWarning?: string;
  maturityA?: FacialMaturityEstimate;
  maturityB?: FacialMaturityEstimate;
  agePenalty?: number;
  ageEstimateA?: AgeEstimate;
  ageEstimateB?: AgeEstimate;
  ageGap?: number;
  poseA?: PoseEstimate;
  poseB?: PoseEstimate;
  poseDisparity?: number;  // Angular distance between poses in degrees
  poseWarning?: string;    // Warning message if pose disparity is significant
};

export type AnalyzeError = { type: 'ERROR'; jobId: string; message: string };

export type AnalyzeMessage = AnalyzeInit | AnalyzeRequest;
export type AnalyzeResponse = AnalyzeProgress | AnalyzeResult | AnalyzeError;
