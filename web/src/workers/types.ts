export type AnalyzeInit = { type: 'INIT' };

export type AnalyzeRequest = {
  type: 'ANALYZE';
  payload: {
    jobId: string;
    fileA: File;
    fileB: File;
    maxDim?: number;
  };
};

export type AnalyzeProgress = {
  type: 'PROGRESS';
  jobId: string;
  stage: 'load' | 'preprocess' | 'detectA' | 'detectB' | 'score';
};

export type OverlayPoint = { x: number; y: number };

export type AnalyzeResult = {
  type: 'RESULT';
  jobId: string;
  pointsA: OverlayPoint[];
  pointsB: OverlayPoint[];
  scores: { region: string; score: number }[];
  overall: number;
};

export type AnalyzeError = { type: 'ERROR'; jobId: string; message: string };

export type AnalyzeMessage = AnalyzeInit | AnalyzeRequest;
export type AnalyzeResponse = AnalyzeProgress | AnalyzeResult | AnalyzeError;
