"use client";
/**
 * Face finding for the skin scan, in the browser (Google MediaPipe Face
 * Landmarker, 478 points). Used to coach the selfie live and to crop the
 * photo so the face fills ~70% of its width, which Perfect Corp requires
 * (face wider than 60% of the image).
 */
import type { FaceLandmarker } from "@mediapipe/tasks-vision";

const VERSION = "0.10.21";
const WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm`;
const MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

let video: Promise<FaceLandmarker> | null = null;
let image: Promise<FaceLandmarker> | null = null;

async function make(mode: "VIDEO" | "IMAGE"): Promise<FaceLandmarker> {
  const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
  const files = await FilesetResolver.forVisionTasks(WASM);
  const opts = (delegate: "GPU" | "CPU") => ({ baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: mode, numFaces: 1 });
  try { return await FaceLandmarker.createFromOptions(files, opts("GPU")); }
  catch { return FaceLandmarker.createFromOptions(files, opts("CPU")); }
}

export function videoLandmarker() { return (video ??= make("VIDEO").catch((e) => { video = null; throw e; })); }
export function imageLandmarker() { return (image ??= make("IMAGE").catch((e) => { image = null; throw e; })); }

export type Pt = { x: number; y: number; z?: number };
export type FaceBox = { x: number; y: number; w: number; h: number; roll: number; yaw: number; pts: Pt[] };

/** Box (in pixels) and head angles from normalized landmarks. */
export function faceBox(pts: Pt[], width: number, height: number): FaceBox {
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
  for (const p of pts) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }
  // 33 / 263: outer eye corners. 1: nose tip. 234 / 454: cheek edges.
  const le = pts[33], re = pts[263], nose = pts[1], lc = pts[234], rc = pts[454];
  const roll = (Math.atan2((re.y - le.y) * height, (re.x - le.x) * width) * 180) / Math.PI;
  const mid = (lc.x + rc.x) / 2, half = Math.abs(rc.x - lc.x) / 2 || 1;
  const yaw = ((nose.x - mid) / half) * 45; // rough degrees: 0 = facing camera
  return { x: x0 * width, y: y0 * height, w: (x1 - x0) * width, h: (y1 - y0) * height, roll, yaw, pts };
}

/** Mean brightness 0-255 of a region, from a tiny sample. */
export function brightness(src: CanvasImageSource, sx: number, sy: number, sw: number, sh: number): number {
  const c = document.createElement("canvas");
  c.width = 24; c.height = 24;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(src, sx, sy, sw, sh, 0, 0, 24, 24);
  const d = g.getImageData(0, 0, 24, 24).data;
  let s = 0;
  for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  return s / (d.length / 4);
}

/** A 3:4 portrait crop around the face, face ≈ 70% of the width, clamped to the source. */
export function cropAround(box: FaceBox, srcW: number, srcH: number) {
  let w = box.w / 0.7;
  let h = (w * 4) / 3;
  if (h > srcH) { h = srcH; w = (h * 3) / 4; }
  if (w > srcW) { w = srcW; h = (w * 4) / 3; }
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h * 0.45; // a touch above centre leaves room for the chin
  const x = Math.min(Math.max(0, cx - w / 2), srcW - w);
  const y = Math.min(Math.max(0, cy - h / 2), srcH - h);
  return { x, y, w, h };
}

export type Shot = { dataUrl: string; width: number; height: number; hd: boolean };

/**
 * Draw the crop to a JPEG Perfect Corp accepts: short side ≥ 1080 → HD
 * analysis, else SD (scaled up to at least 480 if needed). Long side ≤ 1600.
 */
export function shoot(src: CanvasImageSource, crop: { x: number; y: number; w: number; h: number }, mirror: boolean): Shot {
  const hd = crop.w >= 1080;
  const outW = Math.round(Math.min(1200, Math.max(hd ? 1080 : 600, crop.w)));
  const outH = Math.round((outW * 4) / 3);
  const c = document.createElement("canvas");
  c.width = outW; c.height = outH;
  const g = c.getContext("2d")!;
  g.imageSmoothingQuality = "high";
  if (mirror) { g.translate(outW, 0); g.scale(-1, 1); }
  g.drawImage(src, crop.x, crop.y, crop.w, crop.h, 0, 0, outW, outH);
  return { dataUrl: c.toDataURL("image/jpeg", 0.92), width: outW, height: outH, hd: outW >= 1080 };
}

/** Mock-mode "after": a gentle soft-focus and lift, so the slider has something to show without the API. */
export async function mockAfter(dataUrl: string): Promise<string> {
  const img = await loadImage(dataUrl);
  const c = document.createElement("canvas");
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext("2d")!;
  g.drawImage(img, 0, 0);
  g.globalAlpha = 0.55;
  g.filter = `blur(${Math.max(1.5, c.width / 520)}px) brightness(1.05) saturate(0.96)`;
  g.drawImage(img, 0, 0);
  return c.toDataURL("image/jpeg", 0.9);
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, no) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => ok(i);
    i.onerror = () => no(new Error("image load failed"));
    i.src = src;
  });
}
