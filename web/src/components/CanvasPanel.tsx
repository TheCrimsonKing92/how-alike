"use client";
import React, { useEffect, useRef } from "react";

export type OverlayPoint = { x: number; y: number };

export default function CanvasPanel({ pointsA, pointsB }: { pointsA?: OverlayPoint[]; pointsB?: OverlayPoint[] }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    const draw = (pts: OverlayPoint[] | undefined, color: string) => {
      if (!pts || pts.length === 0) return;
      ctx.fillStyle = color;
      for (const p of pts) {
        ctx.beginPath();
        ctx.arc(p.x * 100, p.y * 100, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    draw(pointsA, "#22c55e");
    draw(pointsB, "#3b82f6");
    ctx.restore();
  }, [pointsA, pointsB]);

  return (
    <section aria-label="Canvas" className="w-full max-w-3xl">
      <h2 className="text-xl font-semibold mb-2">Visualization</h2>
      <canvas ref={canvasRef} className="bg-black/5 dark:bg-white/10 rounded w-full h-64" width={800} height={256} />
    </section>
  );
}
