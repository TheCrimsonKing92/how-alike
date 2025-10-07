import React from "react";
import UploadPanel from "@/components/UploadPanel";
import ResultsPanel from "@/components/ResultsPanel";
import CanvasPanel from "@/components/CanvasPanel";

export default function Home() {
  return (
    <div className="font-sans mx-auto w-full max-w-6xl px-6 py-10 grid gap-8 md:gap-10">
      <div className="grid gap-8 md:grid-cols-2">
        <UploadPanel />
        <ResultsPanel />
      </div>
      <CanvasPanel />
    </div>
  );
}
