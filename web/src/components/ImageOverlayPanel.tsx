"use client";
import React from "react";
import type { RegionPoly, MaskOverlay } from "@/workers/types";

export type OverlayPoint = { x: number; y: number };

function describeSimilarity(score: number) {
  if (score >= 0.9) return "very similar";
  if (score >= 0.75) return "similar";
  if (score >= 0.5) return "somewhat similar";
  if (score >= 0.3) return "different";
  return "very different";
}

// Color palette for CelebAMask-HQ face parsing (19 classes)
// Correct class IDs: 0=background, 1=skin, 2=nose, 3=eyeglasses, 4=l_eye, 5=r_eye,
// 6=l_brow, 7=r_brow, 8=l_ear, 9=r_ear, 10=mouth, 11=u_lip, 12=l_lip,
// 13=hair, 14=hat, 15=earring, 16=necklace, 17=neck, 18=cloth
const PARSING_COLORS: Record<number, [number, number, number]> = {
  0: [0, 0, 0],           // background (transparent)
  1: [204, 0, 0],         // skin (red)
  2: [102, 204, 0],       // nose (lime green)
  3: [0, 255, 255],       // eyeglasses (cyan)
  4: [51, 51, 255],       // l_eye (blue)
  5: [204, 0, 204],       // r_eye (magenta)
  6: [76, 153, 0],        // l_brow (green)
  7: [204, 204, 0],       // r_brow (yellow)
  8: [255, 204, 204],     // l_ear (light pink)
  9: [102, 51, 0],        // r_ear (brown)
  10: [255, 255, 0],      // mouth (yellow)
  11: [0, 0, 153],        // u_lip (dark blue)
  12: [0, 0, 204],        // l_lip (medium blue)
  13: [255, 153, 51],     // hair (orange)
  14: [0, 204, 0],        // hat (bright green)
  15: [255, 0, 0],        // earring (bright red)
  16: [0, 204, 204],      // necklace (teal)
  17: [255, 51, 153],     // neck (pink)
  18: [0, 51, 0],         // cloth (dark green)
};

export default function ImageOverlayPanel({
  title,
  bitmap,
  regions,
  scoreMap,
  mask,
  maskClass,
  showFullSegmentation,
  showOutlines = true,
}: {
  title: string;
  bitmap?: ImageBitmap;
  regions?: RegionPoly[];
  scoreMap?: Record<string, number>;
  mask?: MaskOverlay;
  maskClass?: number | null;
  showFullSegmentation?: boolean;
  showOutlines?: boolean;
}) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const [hover, setHover] = React.useState<{ region: string; x: number; y: number } | null>(null);

  // Full segmentation visualization (all classes with distinct colors)
  const fullSegCanvas = React.useMemo<HTMLCanvasElement | null>(() => {
    if (!mask || !showFullSegmentation) return null;
    if (typeof document === "undefined") return null;
    const { width, height, labels } = mask;
    const data = new Uint8ClampedArray(width * height * 4);

    for (let i = 0; i < labels.length; i++) {
      const classId = labels[i];
      const color = PARSING_COLORS[classId];
      if (!color || classId === 0) continue; // Skip background

      const idx = i * 4;
      data[idx + 0] = color[0];
      data[idx + 1] = color[1];
      data[idx + 2] = color[2];
      data[idx + 3] = 180; // alpha (70% opacity)
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const img = new ImageData(data, width, height);
    ctx.putImageData(img, 0, 0);
    return canvas;
  }, [mask, showFullSegmentation]);

  // Single-class debug visualization
  const maskCanvas = React.useMemo<HTMLCanvasElement | null>(() => {
    if (!mask) return null;
    if (showFullSegmentation) return null; // Use full seg instead
    if (typeof maskClass !== "number") return null;
    if (typeof document === "undefined") return null;
    const { width, height, labels } = mask;
    const data = new Uint8ClampedArray(width * height * 4);
    let hits = 0;
    for (let i = 0; i < labels.length; i++) {
      if (labels[i] === maskClass) {
        const idx = i * 4;
        data[idx + 0] = 59;  // teal-ish overlay
        data[idx + 1] = 130;
        data[idx + 2] = 246;
        data[idx + 3] = 128; // alpha
        hits += 1;
      }
    }
    if (hits === 0) return null;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const img = new ImageData(data, width, height);
    ctx.putImageData(img, 0, 0);
    return canvas;
  }, [mask, maskClass, showFullSegmentation]);

  function drawSmooth(ctx: CanvasRenderingContext2D, pts: {x:number;y:number}[], tension = 0.5, closed = false) {
    if (pts.length < 3) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      if (closed) ctx.closePath();
      return;
    }
    const p = pts;
    const get = (i: number) => closed ? p[(i + p.length) % p.length] : p[Math.max(0, Math.min(p.length - 1, i))];
    ctx.beginPath();
    ctx.moveTo(p[0].x, p[0].y);
    const end = closed ? p.length : p.length - 1;
    for (let i = 0; i < end; i++) {
      const p0 = get(i - 1);
      const p1 = get(i);
      const p2 = get(i + 1);
      const p3 = get(i + 2);
      const c1x = p1.x + (p2.x - p0.x) * (tension / 6);
      const c1y = p1.y + (p2.y - p0.y) * (tension / 6);
      const c2x = p2.x - (p3.x - p1.x) * (tension / 6);
      const c2y = p2.y - (p3.y - p1.y) * (tension / 6);
      ctx.bezierCurveTo(c1x, c1y, c2x, c2y, p2.x, p2.y);
    }
    if (closed) ctx.closePath();
  }

  const draw = React.useCallback(
    (highlight?: string) => {
      const canvas = canvasRef.current;
      if (!canvas || !bitmap) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0);

      // Render full segmentation (all classes) if enabled
      if (mask && fullSegCanvas) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(
          fullSegCanvas,
          0,
          0,
          mask.width,
          mask.height,
          mask.crop.sx,
          mask.crop.sy,
          mask.crop.sw,
          mask.crop.sh
        );
        ctx.restore();
      }
      // Render single-class debug overlay if enabled
      else if (mask && maskCanvas) {
        ctx.save();
        ctx.globalAlpha = 0.45;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(
          maskCanvas,
          0,
          0,
          mask.width,
          mask.height,
          mask.crop.sx,
          mask.crop.sy,
          mask.crop.sw,
          mask.crop.sh
        );
        ctx.restore();
      }
      // Skip region outlines when showing full segmentation or when outlines are disabled
      if (regions && showOutlines && !showFullSegmentation) {
        // Draw order: eyes, nose, mouth, jaw, brows (brows on top for visibility/hover)
        const order = ['eyes','nose','mouth','jaw','brows'];
        const sorted = [...regions].sort((a,b)=> order.indexOf(a.region)-order.indexOf(b.region));
        const tensionFor = (name: string) => {
          switch (name) {
            case 'brows': return 0.6; // reduce overshoot
            case 'mouth': return 0.6;
            case 'jaw': return 0.35; // reduce overshoot further
            default: return 0.55;
          }
        };
        const widthFor = (name: string, highlight?: boolean) => {
          const base = (() => {
            switch (name) {
              case 'brows': return 3.6;
              case 'eyes': return 2.8;
              case 'mouth': return 3.0;
              case 'nose': return 2.6;
              case 'jaw': return 3.0;
              default: return 2.6;
            }
          })();
          return highlight ? base + 1.2 : base;
        };
        const colorFor = (name: string) => {
          const s = scoreMap?.[name] ?? 0.5;
          if (s >= 0.85) return '#16a34a'; // green-600
          if (s >= 0.7) return '#22c55e';  // green-500
          if (s >= 0.5) return '#3b82f6';  // blue-500
          return '#94a3b8';               // slate-400
        };
        for (const r of sorted) {
          const pts = r.points;
          if (pts.length < 2) continue;
          const stroke = r.region === highlight ? '#10b981' : colorFor(r.region);
          ctx.strokeStyle = stroke;
          ctx.lineWidth = widthFor(r.region, r.region === highlight);
          ctx.lineJoin = 'round';
          ctx.lineCap = 'round';
          const closed = !(r.open === true);
          drawSmooth(ctx, pts, tensionFor(r.region), closed);
          ctx.stroke();
        }
      }
    },
    [bitmap, regions, mask, maskCanvas, fullSegCanvas, scoreMap, showFullSegmentation, showOutlines]
  );

  React.useEffect(() => {
    draw();
  }, [draw]);

  const onMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !regions || !showOutlines) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) * canvas.width) / rect.width;
    const y = ((e.clientY - rect.top) * canvas.height) / rect.height;
    let hit: RegionPoly | null = null;
    const pointInPoly = (px: number, py: number, pts: { x: number; y: number }[]) => {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const xi = pts[i].x, yi = pts[i].y;
        const xj = pts[j].x, yj = pts[j].y;
        const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-9) + xi;
        if (intersect) inside = !inside;
      }
      return inside;
    };
    const distToSeg = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
      const vx = bx - ax, vy = by - ay;
      const wx = px - ax, wy = py - ay;
      const c1 = vx * wx + vy * wy;
      const c2 = vx * vx + vy * vy || 1e-9;
      const t = Math.max(0, Math.min(1, c1 / c2));
      const cx = ax + t * vx, cy = ay + t * vy;
      const dx = px - cx, dy = py - cy;
      return Math.hypot(dx, dy);
    };
    // Hover priority: brows over eyes to avoid overlap swallowing
    const hoverOrder = ['brows','eyes','mouth','nose','jaw'];
    const sorted = [...regions].sort((a,b)=> hoverOrder.indexOf(a.region)-hoverOrder.indexOf(b.region));
    for (const r of sorted) {
      const closed = !(r.open === true);
      if (closed) {
        if (r.points.length >= 3 && pointInPoly(x, y, r.points)) { hit = r; break; }
      } else {
        // line-distance hit-test for open paths
        for (let i = 1; i < r.points.length; i++) {
          const a = r.points[i-1], b = r.points[i];
          if (distToSeg(x, y, a.x, a.y, b.x, b.y) <= 6) { hit = r; break; }
        }
        if (hit) break;
      }
    }
    if (hit) {
      draw(hit.region);
      setHover({ region: hit.region, x: e.clientX - rect.left + 8, y: e.clientY - rect.top + 8 });
    } else {
      draw();
      setHover(null);
    }
  };

  return (
    <section aria-label={title} className="w-full">
      <h3 className="text-base font-semibold mb-2">{title}</h3>
      <div className="relative inline-block max-w-full">
        <canvas ref={canvasRef} onMouseMove={onMouseMove} className="max-w-full h-auto rounded shadow bg-black/5" />
        {hover && scoreMap && (
          <div
            className="absolute bg-black text-white text-xs px-2 py-1 rounded pointer-events-none"
            style={{ left: hover.x, top: hover.y }}
          >
            <span className="font-semibold capitalize">{hover.region}</span>{": "}
            {Math.round((scoreMap[hover.region] ?? 0) * 100)}% — {describeSimilarity(scoreMap[hover.region] ?? 0)}
          </div>
        )}
      </div>
    </section>
  );
}
