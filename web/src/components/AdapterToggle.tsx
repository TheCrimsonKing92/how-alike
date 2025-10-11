"use client";
import React from "react";

type Adapter = "facemesh" | "parsing" | "transformers";

export default function AdapterToggle({ value, onChange }: { value: Adapter; onChange: (v: Adapter) => void }) {
  return (
    <div className="text-sm flex items-center gap-2" aria-label="Detector Adapter">
      <label htmlFor="adapter-select" className="opacity-80">Adapter</label>
      <select
        id="adapter-select"
        aria-label="Adapter"
        value={value}
        onChange={(e) => onChange((e.target.value as Adapter) || "transformers")}
        className="border rounded px-2 py-1 bg-background"
      >
        <option value="transformers">Transformers.js (SegFormer)</option>
        <option value="parsing">ONNX Runtime (ResNet34)</option>
        <option value="facemesh">Landmarks only (MediaPipe)</option>
      </select>
    </div>
  );
}

