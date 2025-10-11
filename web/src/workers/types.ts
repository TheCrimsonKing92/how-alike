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
};

export type AnalyzeError = { type: 'ERROR'; jobId: string; message: string };

export type AnalyzeMessage = AnalyzeInit | AnalyzeRequest;
export type AnalyzeResponse = AnalyzeProgress | AnalyzeResult | AnalyzeError;
