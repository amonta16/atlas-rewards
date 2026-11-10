"use client";
/**
 * Guided selfie camera. Tracks the face live (MediaPipe), coaches distance,
 * angle and light in one short line, and takes the photo by itself after a
 * 3-2-1 once everything holds. The shutter also works by hand.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { brightness, cropAround, faceBox, shoot, videoLandmarker, type FaceBox, type Shot } from "./face";
import { IcClose } from "../icons";

type Check = { ok: boolean; hint: string };

/** The oval guide, in screen pixels. The checks use the same numbers, so "fill the oval" is literally what's measured. */
export function ovalFor(W: number, H: number) {
  const w = Math.min(W * 0.72, H * 0.4);
  return { cx: W / 2, cy: H * 0.46, w, h: w * 1.33 };
}

/** Face box (video px) → screen px, for a mirrored object-cover video filling W×H. */
function toScreen(box: FaceBox, vw: number, vh: number, W: number, H: number) {
  const s = Math.max(W / vw, H / vh);
  const ox = (W - vw * s) / 2, oy = (H - vh * s) / 2;
  return { cx: W - ((box.x + box.w / 2) * s + ox), cy: (box.y + box.h / 2) * s + oy, w: box.w * s, h: box.h * s };
}

function judge(box: FaceBox | null, vw: number, vh: number, W: number, H: number, light: number | null): Check {
  if (!box) return { ok: false, hint: "Center your face in the oval" };
  const o = ovalFor(W, H), f = toScreen(box, vw, vh, W, H);
  if (Math.abs(f.cx - o.cx) > o.w * 0.16 || Math.abs(f.cy - o.cy) > o.h * 0.16) return { ok: false, hint: "Center your face in the oval" };
  if (f.w < o.w * 0.72) return { ok: false, hint: "Move a little closer" };
  if (f.w > o.w * 1.12) return { ok: false, hint: "Move back a little" };
  if (Math.abs(box.roll) > 8) return { ok: false, hint: "Keep your head level" };
  if (Math.abs(box.yaw) > 13) return { ok: false, hint: "Look straight at the camera" };
  if (light !== null && light < 70) return { ok: false, hint: "Find brighter, even light" };
  if (light !== null && light > 236) return { ok: false, hint: "Too bright. Step out of direct light" };
  return { ok: true, hint: "Perfect. Hold still" };
}

// A light sprinkle of mesh points for the "scanning" look (every 7th landmark).
const DOTS = Array.from({ length: 68 }, (_, i) => i * 7);

export function GuidedCamera({ onShot, onClose, onUpload }: { onShot: (s: Shot) => void; onClose: () => void; onUpload: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const boxRef = useRef<FaceBox | null>(null);
  const goodRef = useRef(0);
  const takenRef = useRef(false);
  const [state, setState] = useState<"starting" | "live" | "denied" | "error">("starting");
  const [tracking, setTracking] = useState<"loading" | "on" | "off">("loading");
  const [check, setCheck] = useState<Check>({ ok: false, hint: "Starting camera…" });
  const [count, setCount] = useState<number | null>(null);
  const [size, setSize] = useState({ W: 390, H: 844 });
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ W: el.clientWidth, H: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const oval = ovalFor(size.W, size.H);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const take = useCallback(() => {
    const v = videoRef.current;
    if (!v || takenRef.current || !v.videoWidth) return;
    takenRef.current = true;
    const vw = v.videoWidth, vh = v.videoHeight;
    const box = boxRef.current;
    const crop = box
      ? cropAround(box, vw, vh)
      : (() => { const h = vh, w = Math.min(vw, (h * 3) / 4); return { x: (vw - w) / 2, y: 0, w, h }; })();
    const shot = shoot(v, crop, true);
    stop();
    onShot(shot);
  }, [onShot, stop]);

  // Camera.
  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1080 } },
        });
        if (dead) { s.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = s;
        const v = videoRef.current!;
        v.srcObject = s;
        await v.play().catch(() => {});
        setState("live");
      } catch (e) {
        setState((e as DOMException)?.name === "NotAllowedError" ? "denied" : "error");
      }
    })();
    return () => { dead = true; stop(); };
  }, [stop]);

  // Face tracking loop.
  useEffect(() => {
    if (state !== "live") return;
    let raf = 0, dead = false, last = 0, lastLight = 0, light: number | null = null;
    videoLandmarker().then((lm) => {
      if (dead) return;
      setTracking("on");
      const loop = (t: number) => {
        if (dead) return;
        raf = requestAnimationFrame(loop);
        const v = videoRef.current, c = canvasRef.current;
        if (!v || !c || v.readyState < 2 || t - last < 66) return;
        last = t;
        const vw = v.videoWidth, vh = v.videoHeight;
        const res = lm.detectForVideo(v, t);
        const pts = res.faceLandmarks?.[0];
        const box = pts?.length ? faceBox(pts, vw, vh) : null;
        boxRef.current = box;
        if (box && t - lastLight > 400) { light = brightness(v, box.x, box.y, box.w, box.h); lastLight = t; }
        const ck = judge(box, vw, vh, c.clientWidth, c.clientHeight, box ? light : null);
        setCheck((p) => (p.hint === ck.hint && p.ok === ck.ok ? p : ck));
        goodRef.current = ck.ok ? goodRef.current + 1 : 0;
        draw(c, v, pts ?? null, ck.ok);
      };
      raf = requestAnimationFrame(loop);
    }).catch(() => { if (!dead) { setTracking("off"); setCheck({ ok: true, hint: "Fill the oval with your face, then tap the button" }); } });
    return () => { dead = true; cancelAnimationFrame(raf); };
  }, [state]);

  // Auto-capture: once the face has held still and in frame for ~0.6 s, count down.
  useEffect(() => {
    if (tracking !== "on") return;
    const id = setInterval(() => {
      if (takenRef.current) return;
      setCount((n) => {
        if (goodRef.current < 9) return null;
        if (n === null) return 3;
        if (n <= 1) { take(); return null; }
        return n - 1;
      });
    }, 700);
    return () => clearInterval(id);
  }, [tracking, take]);

  return (
    <div className="fixed inset-0 z-[70] bg-black text-white">
      <div ref={wrapRef} className="relative mx-auto h-full max-w-md overflow-hidden">
        <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full -scale-x-100 object-cover" />
        <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />

        {/* Oval guide */}
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox={`0 0 ${size.W} ${size.H}`} aria-hidden>
          <defs>
            <mask id="ss-oval"><rect width={size.W} height={size.H} fill="white" /><ellipse cx={oval.cx} cy={oval.cy} rx={oval.w / 2} ry={oval.h / 2} fill="black" /></mask>
          </defs>
          <rect width={size.W} height={size.H} fill="rgba(0,0,0,.52)" mask="url(#ss-oval)" />
          <ellipse cx={oval.cx} cy={oval.cy} rx={oval.w / 2} ry={oval.h / 2} fill="none" strokeWidth="3"
            stroke={check.ok ? "rgb(var(--p-rgb))" : "rgba(255,255,255,.75)"} strokeDasharray={check.ok ? "0" : "10 8"}
            style={{ transition: "stroke .25s" }} />
        </svg>

        <button type="button" onClick={() => { stop(); onClose(); }} aria-label="Close camera" className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-black/40 backdrop-blur" style={{ marginTop: "env(safe-area-inset-top, 0px)" }}>
          <IcClose className="h-5 w-5" strokeWidth={2} />
        </button>

        <div className="absolute inset-x-0 top-[9%] px-8 text-center" style={{ marginTop: "env(safe-area-inset-top, 0px)" }}>
          <p className="text-[12px] font-bold uppercase tracking-[0.14em] text-white/60">{tracking === "on" ? "Face tracking on" : tracking === "loading" ? "Loading face tracking" : "Skin scan"}</p>
          <p className="mt-1.5 text-[20px] font-semibold leading-tight" aria-live="polite">{state === "live" ? check.hint : state === "starting" ? "Starting camera…" : ""}</p>
        </div>

        {count !== null && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <span key={count} className="animate-rise text-[96px] font-semibold tabular-nums text-white drop-shadow-[0_4px_24px_rgba(0,0,0,.45)]">{count}</span>
          </div>
        )}

        {(state === "denied" || state === "error") && (
          <div className="absolute inset-0 grid place-items-center px-8 text-center">
            <div>
              <p className="text-[20px] font-semibold">{state === "denied" ? "Camera access is off" : "We couldn't start the camera"}</p>
              <p className="mt-2 text-[14.5px] leading-snug text-white/70">{state === "denied" ? "Allow camera access in your browser settings, or upload a selfie instead." : "Upload a selfie instead. A clear, front-facing photo works best."}</p>
              <button type="button" onClick={onUpload} className="mx-auto mt-6 flex h-[52px] w-full max-w-[280px] items-center justify-center rounded-[14px] bg-white text-[16px] font-semibold text-ink">Upload a photo</button>
            </div>
          </div>
        )}

        {state === "live" && (
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-10 pb-10" style={{ paddingBottom: "calc(2.5rem + env(safe-area-inset-bottom, 0px))" }}>
            <button type="button" onClick={() => { stop(); onUpload(); }} className="w-16 text-[13px] font-medium text-white/80">Upload</button>
            <button type="button" onClick={take} aria-label="Take photo" disabled={tracking === "on" && !boxRef.current}
              className="grid h-[74px] w-[74px] place-items-center rounded-full ring-4 ring-white/90 transition active:scale-95 disabled:opacity-40">
              <span className={`h-[60px] w-[60px] rounded-full ${check.ok ? "bg-brand" : "bg-white"}`} style={{ transition: "background .25s" }} />
            </button>
            <span className="w-16" />
          </div>
        )}
      </div>
    </div>
  );
}

/** Mesh dots drawn over the mirrored, object-cover video. */
function draw(c: HTMLCanvasElement, v: HTMLVideoElement, pts: { x: number; y: number }[] | null, ok: boolean) {
  const W = c.clientWidth, H = c.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
  if (c.width !== W * dpr) { c.width = W * dpr; c.height = H * dpr; }
  const g = c.getContext("2d")!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  if (!pts) return;
  const s = Math.max(W / v.videoWidth, H / v.videoHeight);
  const ox = (W - v.videoWidth * s) / 2, oy = (H - v.videoHeight * s) / 2;
  const rgb = getComputedStyle(c).getPropertyValue("--p-rgb").trim().replace(/\s+/g, ",") || "255,255,255";
  g.fillStyle = ok ? `rgba(${rgb},.95)` : "rgba(255,255,255,.55)";
  for (const i of DOTS) {
    const p = pts[i];
    if (!p) continue;
    const x = W - (p.x * v.videoWidth * s + ox), y = p.y * v.videoHeight * s + oy;
    g.beginPath(); g.arc(x, y, 1.6, 0, Math.PI * 2); g.fill();
  }
}
