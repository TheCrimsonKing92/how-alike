"use client";
import React from "react";
import UploadPanel from "@/components/UploadPanel";
import ResultsPanel from "@/components/ResultsPanel";
import CanvasPanel from "@/components/CanvasPanel";
import { loadImageFromFile, preprocessImage } from "@/lib/image";
import { detect } from "@/models/facemesh-adapter";
import { eyeCenter, fromKeypoints, normalizeByEyes, summarizeRegions, Vec2 } from "@/lib/geometry";
import { REGION_INDICES } from "@/lib/regions";

export default function Home() {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [scores, setScores] = React.useState<{ region: string; score: number }[] | undefined>();
  const [overall, setOverall] = React.useState<number | undefined>();
  const [pointsA, setPointsA] = React.useState<Vec2[] | undefined>();
  const [pointsB, setPointsB] = React.useState<Vec2[] | undefined>();

  const onFiles = async (fa: File | null, fb: File | null) => {
    if (!fa || !fb) return;
    setLoading(true);
    setError(null);
    try {
      const isDev = process.env.NODE_ENV !== "production";
      const t0 = performance.now();
      const imgA = await loadImageFromFile(fa);
      const imgB = await loadImageFromFile(fb);
      const t1 = performance.now();
      const procA = await preprocessImage(imgA);
      const procB = await preprocessImage(imgB);
      const t2 = performance.now();

      const detA = await detect(procA.canvas);
      const detB = await detect(procB.canvas);
      const t3 = performance.now();
      if (!detA || !detB || !detA.annotations || !detB.annotations) {
        throw new Error("Could not detect a single face in one or both images.");
      }
      const leftA = eyeCenter(detA.annotations, "left");
      const rightA = eyeCenter(detA.annotations, "right");
      const leftB = eyeCenter(detB.annotations, "left");
      const rightB = eyeCenter(detB.annotations, "right");
      if (!leftA || !rightA || !leftB || !rightB) throw new Error("Failed to locate eyes.");

      const ptsA = fromKeypoints(detA.keypoints);
      const ptsB = fromKeypoints(detB.keypoints);
      const nA = normalizeByEyes(ptsA, leftA, rightA);
      const nB = normalizeByEyes(ptsB, leftB, rightB);
      setPointsA(nA);
      setPointsB(nB);

      const { scores, overall } = summarizeRegions(nA, nB, REGION_INDICES);
      const t4 = performance.now();
      if (isDev) {
        const loadMs = Math.round(t1 - t0);
        const prepMs = Math.round(t2 - t1);
        const detectMs = Math.round(t3 - t2);
        const scoreMs = Math.round(t4 - t3);
        const totalMs = Math.round(t4 - t0);
        console.info(
          `[analyze] load=${loadMs}ms preprocess=${prepMs}ms detect=${detectMs}ms score=${scoreMs}ms total=${totalMs}ms`
        );
      }
      setScores(scores);
      setOverall(overall);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setScores(undefined);
      setOverall(undefined);
      setPointsA(undefined);
      setPointsB(undefined);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="font-sans mx-auto w-full max-w-6xl px-6 py-10 grid gap-8 md:gap-10">
      <div className="grid gap-8 md:grid-cols-2">
        <UploadPanel onFiles={onFiles} />
        <div>
          {loading ? <p className="text-sm">Analyzing…</p> : null}
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <ResultsPanel scores={scores} overall={overall} />
        </div>
      </div>
      <CanvasPanel pointsA={pointsA} pointsB={pointsB} />
    </div>
  );
}
