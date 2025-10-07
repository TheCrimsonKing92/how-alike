export type ProcessedImage = {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
};

export async function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = (e) => reject(e);
    img.src = url;
  });
  // Prefer decode when available for stronger readiness guarantees
  if (typeof (img as HTMLImageElement & { decode?: () => Promise<void> }).decode === "function") {
    try {
      await (img as HTMLImageElement & { decode: () => Promise<void> }).decode();
    } catch {
      // ignore decode errors; drawImage after onload still works
    }
  }
  URL.revokeObjectURL(url);
  return img;
}

export async function preprocessImage(img: HTMLImageElement, maxDim = 1280): Promise<ProcessedImage> {
  const { width: w, height: h } = img;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const width = Math.max(1, Math.round(w * scale));
  const height = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D context not available");
  ctx.drawImage(img, 0, 0, width, height);
  return { canvas, ctx, width, height };
}
