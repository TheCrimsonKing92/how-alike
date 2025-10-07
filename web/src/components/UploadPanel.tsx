import React from "react";
import { Button } from "@/components/ui/button";

export default function UploadPanel({ onFiles }: { onFiles: (a: File | null, b: File | null) => void }) {
  const [a, setA] = React.useState<File | null>(null);
  const [b, setB] = React.useState<File | null>(null);

  return (
    <section aria-label="Upload" className="w-full max-w-xl">
      <h2 className="text-xl font-semibold mb-2">Upload or Capture</h2>
      <p className="text-sm opacity-80 mb-4">Choose two front-facing, well-lit photos.</p>
      <div className="flex flex-col gap-3">
        <input aria-label="Select first photo" type="file" accept="image/*" onChange={(e) => setA(e.target.files?.[0] ?? null)} />
        <input aria-label="Select second photo" type="file" accept="image/*" onChange={(e) => setB(e.target.files?.[0] ?? null)} />
        <div className="flex gap-2">
          <Button variant="default" onClick={() => onFiles(a, b)} disabled={!a || !b}>
            Analyze
          </Button>
          <Button variant="secondary" disabled>
            Use Camera (soon)
          </Button>
        </div>
      </div>
    </section>
  );
}
