"use client";
import React from "react";
import UploadPanel from "@/components/UploadPanel";
import ResultsPanel from "@/components/ResultsPanel";
import FeatureDetailPanel from "@/components/FeatureDetailPanel";
import OverlayControls, { BufferSettings } from "@/components/OverlayControls";
import ImageOverlayPanel from "@/components/ImageOverlayPanel";
import type { OverlayPoint } from "@/components/CanvasPanel";
import type { AnalyzeResponse, MaskOverlay, FeatureNarrative } from "@/workers/types";
import AdapterToggle from "@/components/AdapterToggle";

export default function Home() {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [scores, setScores] = React.useState<{ region: string; score: number }[] | undefined>();
  const [overall, setOverall] = React.useState<number | undefined>();
  const [pointsA, setPointsA] = React.useState<OverlayPoint[] | undefined>();
  const [pointsB, setPointsB] = React.useState<OverlayPoint[] | undefined>();
  const [imageA, setImageA] = React.useState<ImageBitmap | undefined>();
  const [imageB, setImageB] = React.useState<ImageBitmap | undefined>();
  const [regionsA, setRegionsA] = React.useState<import("@/workers/types").RegionPoly[] | undefined>();
  const [regionsB, setRegionsB] = React.useState<import("@/workers/types").RegionPoly[] | undefined>();
  const [texts, setTexts] = React.useState<{ region: string; text: string }[] | undefined>();
  const [buffers, setBuffers] = React.useState<BufferSettings>({ brows: 0.08, mouth: 0.025, jaw: 0.018 });
  const [devAdapter, setDevAdapter] = React.useState<string | undefined>(undefined);
  const [parseMsA, setParseMsA] = React.useState<number | undefined>(undefined);
  const [parseMsB, setParseMsB] = React.useState<number | undefined>(undefined);
  const [hintsA, setHintsA] = React.useState<string | undefined>(undefined);
  const [hintsB, setHintsB] = React.useState<string | undefined>(undefined);
  const [ortA, setOrtA] = React.useState<string | undefined>(undefined);
  const [ortB, setOrtB] = React.useState<string | undefined>(undefined);
  const [maskA, setMaskA] = React.useState<MaskOverlay | undefined>(undefined);
  const [maskB, setMaskB] = React.useState<MaskOverlay | undefined>(undefined);
  const [maskClass, setMaskClass] = React.useState<number | null>(null);
  const [showSegmentation, setShowSegmentation] = React.useState(false);
  const [mounted, setMounted] = React.useState(false);
  const [featureNarrative, setFeatureNarrative] = React.useState<FeatureNarrative | undefined>(undefined);
  const [congruenceScore, setCongruenceScore] = React.useState<number | undefined>(undefined);
  const [ageWarning, setAgeWarning] = React.useState<string | undefined>(undefined);
  const [agePenalty, setAgePenalty] = React.useState<number | undefined>(undefined);
  const [poseWarning, setPoseWarning] = React.useState<string | undefined>(undefined);

  const workerRef = React.useRef<Worker | null>(null);
  const [progress, setProgress] = React.useState<string>("");
  const jobIdRef = React.useRef(0);
  const [adapter, setAdapter] = React.useState<"facemesh" | "parsing" | "transformers">(() => {
    if (typeof window === "undefined") return "transformers";
    const saved = window.localStorage.getItem("adapter");
    return saved === "parsing" || saved === "facemesh" || saved === "transformers" ? saved : "transformers";
  });

  React.useEffect(() => {
    if (typeof Worker === "undefined") return;
    // Module worker with bundler URL
    const w = new Worker(new URL("../workers/analyze.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = w;
    w.postMessage({ type: "INIT", payload: { adapter } });
    return () => {
      w.terminate();
      workerRef.current = null;
    };
  }, [adapter]);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("showMask");
    if (!raw) return;
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed)) {
      setMaskClass(parsed);
    }
  }, []);

  const onAdapterChange = (v: "facemesh" | "parsing" | "transformers") => {
    setAdapter(v);
    try {
      window.localStorage.setItem("adapter", v);
    } catch {}
    // Clear any prior results
    setScores(undefined);
    setOverall(undefined);
    setPointsA(undefined);
    setPointsB(undefined);
    setImageA(undefined);
    setImageB(undefined);
    setRegionsA(undefined);
    setRegionsB(undefined);
    setTexts(undefined);
    setDevAdapter(undefined);
    setParseMsA(undefined);
    setParseMsB(undefined);
    setHintsA(undefined);
    setHintsB(undefined);
    setOrtA(undefined);
    setOrtB(undefined);
    setMaskA(undefined);
    setMaskB(undefined);
    setFeatureNarrative(undefined);
    setCongruenceScore(undefined);
    setAgeWarning(undefined);
    setAgePenalty(undefined);
    setPoseWarning(undefined);
  };

  const onFiles = async (fa: File | null, fb: File | null) => {
    if (!fa || !fb) return;
    setLoading(true);
    setError(null);
    setMaskA(undefined);
    setMaskB(undefined);
    try {
      setProgress("Starting...");
      const jobId = String(++jobIdRef.current);
      await new Promise<void>((resolve, reject) => {
        const w = workerRef.current;
        if (!w) return reject(new Error("Worker not available"));
        const onMessage = (e: MessageEvent<AnalyzeResponse>) => {
          const msg = e.data;
          if ('jobId' in msg && msg.jobId !== jobId) return;
          if (msg.type === "PROGRESS") {
            setProgress(msg.stage);
          } else if (msg.type === "RESULT") {
            setPointsA(msg.pointsA);
            setPointsB(msg.pointsB);
            setImageA(msg.imageA);
            setImageB(msg.imageB);
            setRegionsA(msg.regionsA);
            setRegionsB(msg.regionsB);
            setScores(msg.scores);
            setOverall(msg.overall);
            setTexts(msg.texts);
            setDevAdapter(msg.adapter || adapter);
            setParseMsA(msg.parseMsA);
            setParseMsB(msg.parseMsB);
            setHintsA(msg.hintsSourceA);
            setHintsB(msg.hintsSourceB);
            setOrtA(msg.ortA);
            setOrtB(msg.ortB);
            setMaskA(msg.maskA);
            setMaskB(msg.maskB);
            setFeatureNarrative(msg.featureNarrative);
            setCongruenceScore(msg.congruenceScore);
            setAgeWarning(msg.ageWarning);
            setAgePenalty(msg.agePenalty);
            setPoseWarning(msg.poseWarning);
            w.removeEventListener("message", onMessage as EventListener);
            resolve();
          } else if (msg.type === "ERROR") {
            w.removeEventListener("message", onMessage as EventListener);
            reject(new Error(msg.message));
          }
        };
        w.addEventListener("message", onMessage as EventListener);
        w.postMessage({ type: "ANALYZE", payload: { jobId, fileA: fa, fileB: fb, maxDim: 1280, settings: { buffers } } });
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setScores(undefined);
      setOverall(undefined);
      setPointsA(undefined);
      setPointsB(undefined);
      setTexts(undefined);
      setMaskA(undefined);
      setMaskB(undefined);
      setFeatureNarrative(undefined);
      setCongruenceScore(undefined);
      setAgeWarning(undefined);
      setAgePenalty(undefined);
      setPoseWarning(undefined);
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
          {loading ? <p className="text-sm">Analyzing... {progress}</p> : null}
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {ageWarning ? (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-md">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-amber-800 mb-1">Age Difference Detected</h3>
                  <p className="text-sm text-amber-700">{ageWarning}</p>
                  {typeof agePenalty === 'number' && agePenalty > 0 ? (
                    <p className="text-xs text-amber-600 mt-1">Similarity score adjusted by {(agePenalty * 100).toFixed(0)}% to account for age difference.</p>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
          {poseWarning ? (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="flex-1">
                  <h3 className="text-sm font-semibold text-blue-800 mb-1">Pose Variation Detected</h3>
                  <p className="text-sm text-blue-700">{poseWarning}</p>
                  <p className="text-xs text-blue-600 mt-1">Landmarks have been normalized to frontal view for comparison.</p>
                </div>
              </div>
            </div>
          ) : null}
          <ResultsPanel scores={scores} overall={overall} texts={texts} hasDetailedAnalysis={!!featureNarrative} />
          <div className="mt-4">
            <OverlayControls value={buffers} onChange={setBuffers} />
          </div>
          <div className="mt-4">
            <AdapterToggle value={adapter} onChange={onAdapterChange} />
            {mounted ? (
              <p data-testid="dev-log" className="mt-1 text-xs opacity-70">
                Adapter: {devAdapter || adapter}
                {hintsA || hintsB ? (
                  <>
                    {" "}• Hints:{" "}
                    {hintsA && hintsB
                      ? hintsA === hintsB
                        ? hintsA
                        : `A: ${hintsA}, B: ${hintsB}`
                      : (hintsA || hintsB)}
                  </>
                ) : null}
                {typeof parseMsA === "number" && typeof parseMsB === "number" ? (
                  <>
                    {" "}• Parse A: {parseMsA}ms, B: {parseMsB}ms
                  </>
                ) : null}
                {ortA || ortB ? (
                  <>
                    {" "}• ORT:{" "}
                    {ortA && ortB
                      ? ortA === ortB
                        ? ortA
                        : `A: ${ortA}, B: ${ortB}`
                      : (ortA || ortB)}
                  </>
                ) : null}
                {typeof maskClass === "number" && process.env.NODE_ENV !== "production" ? (
                  <>
                    {" "}• Mask class: {maskClass}
                  </>
                ) : null}
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className={`rounded border px-3 py-1.5 text-sm font-medium transition ${
                  showSegmentation
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                }`}
                onClick={() => setShowSegmentation(!showSegmentation)}
              >
                {showSegmentation ? "Hide" : "Show"} Face Parsing
              </button>
            </div>
            {process.env.NODE_ENV !== "production" ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <label htmlFor="mask-class" className="font-medium">
                  Debug mask overlay
                </label>
                <select
                  id="mask-class"
                  className="rounded border px-1 py-0.5 text-xs"
                  value={typeof maskClass === "number" ? String(maskClass) : ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (!val) {
                      setMaskClass(null);
                      return;
                    }
                    const parsed = Number.parseInt(val, 10);
                    setMaskClass(Number.isFinite(parsed) ? parsed : null);
                  }}
                  disabled={showSegmentation}
                >
                  <option value="">Off</option>
                  <option value="10">Class 10 (nose)</option>
                  <option value="6">Class 6 (glasses)</option>
                </select>
                <input
                  type="number"
                  placeholder="custom"
                  className="w-16 rounded border px-1 py-0.5 text-xs"
                  onBlur={(e) => {
                    const val = e.target.value.trim();
                    if (!val) return;
                    const parsed = Number.parseInt(val, 10);
                    if (Number.isFinite(parsed)) {
                      setMaskClass(parsed);
                    }
                  }}
                  disabled={showSegmentation}
                />
                <button
                  type="button"
                  className="rounded border px-2 py-0.5"
                  onClick={() => setMaskClass(null)}
                  disabled={showSegmentation}
                >
                  Clear
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <FeatureDetailPanel narrative={featureNarrative} congruenceScore={congruenceScore} />
      <section aria-label="Visualization" className="w-full grid gap-6 md:grid-cols-2">
        <ImageOverlayPanel
          title="Image A"
          bitmap={imageA}
          regions={regionsA}
          scoreMap={Object.fromEntries((scores ?? []).map((s) => [s.region, s.score]))}
          mask={maskA}
          maskClass={typeof maskClass === "number" ? maskClass : undefined}
          showFullSegmentation={showSegmentation}
        />
        <ImageOverlayPanel
          title="Image B"
          bitmap={imageB}
          regions={regionsB}
          scoreMap={Object.fromEntries((scores ?? []).map((s) => [s.region, s.score]))}
          mask={maskB}
          maskClass={typeof maskClass === "number" ? maskClass : undefined}
          showFullSegmentation={showSegmentation}
        />
      </section>
    </div>
  );
}
