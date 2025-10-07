export type AnalyzeInit = { type: 'INIT' };

export type AnalyzeRequest = {
  type: 'ANALYZE';
  payload: {
    fileA: File;
    fileB: File;
    maxDim?: number;
  };
};

export type AnalyzeProgress = {
  type: 'PROGRESS';
  stage: 'load' | 'preprocess' | 'detectA' | 'detectB' | 'score';
};

export type OverlayPoint = { x: number; y: number };

export type AnalyzeResult = {
  type: 'RESULT';
  pointsA: OverlayPoint[];
  pointsB: OverlayPoint[];
  scores: { region: string; score: number }[];
  overall: number;
};

export type AnalyzeError = { type: 'ERROR'; message: string };

export type AnalyzeMessage = AnalyzeInit | AnalyzeRequest;
export type AnalyzeResponse = AnalyzeProgress | AnalyzeResult | AnalyzeError;

