"use client";
import React from "react";
import UploadPanel from "@/components/UploadPanel";
import ResultsPanel from "@/components/ResultsPanel";
import CanvasPanel from "@/components/CanvasPanel";
import type { OverlayPoint } from "@/components/CanvasPanel";
import type { AnalyzeResponse } from "@/workers/types";

export default function Home() {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [scores, setScores] = React.useState<{ region: string; score: number }[] | undefined>();
  const [overall, setOverall] = React.useState<number | undefined>();
  const [pointsA, setPointsA] = React.useState<OverlayPoint[] | undefined>();
  const [pointsB, setPointsB] = React.useState<OverlayPoint[] | undefined>();

  const workerRef = React.useRef<Worker | null>(null);
  const [progress, setProgress] = React.useState<string>("");

  React.useEffect(() => {
    if (typeof Worker === 'undefined') return;
    // Module worker with bundler URL
    const w = new Worker(new URL("../workers/analyze.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = w;
    w.postMessage({ type: "INIT" });
    return () => {
      w.terminate();
      workerRef.current = null;
    };
  }, []);

  const onFiles = async (fa: File | null, fb: File | null) => {
    if (!fa || !fb) return;
    setLoading(true);
    setError(null);
    try {
      setProgress("Starting…");
      await new Promise<void>((resolve, reject) => {
        const w = workerRef.current;
        if (!w) return reject(new Error("Worker not available"));
        const onMessage = (e: MessageEvent<AnalyzeResponse>) => {
          const msg = e.data;
          if (msg.type === "PROGRESS") {
            setProgress(msg.stage);
          } else if (msg.type === "RESULT") {
            setPointsA(msg.pointsA);
            setPointsB(msg.pointsB);
            setScores(msg.scores);
            setOverall(msg.overall);
            w.removeEventListener("message", onMessage as EventListener);
            resolve();
          } else if (msg.type === "ERROR") {
            w.removeEventListener("message", onMessage as EventListener);
            reject(new Error(msg.message));
          }
        };
        w.addEventListener("message", onMessage as EventListener);
        w.postMessage({ type: "ANALYZE", payload: { fileA: fa, fileB: fb, maxDim: 1280 } });
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setScores(undefined);
      setOverall(undefined);
      setPointsA(undefined);
      setPointsB(undefined);
    } finally {
      setLoading(false);
      setProgress("");
    }
  };

  return (
    <div className="font-sans mx-auto w-full max-w-6xl px-6 py-10 grid gap-8 md:gap-10">
      <div className="grid gap-8 md:grid-cols-2">
        <UploadPanel onFiles={onFiles} />
        <div>
          {loading ? <p className="text-sm">Analyzing… {progress}</p> : null}
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <ResultsPanel scores={scores} overall={overall} />
        </div>
      </div>
      <CanvasPanel pointsA={pointsA} pointsB={pointsB} />
    </div>
  );
}
