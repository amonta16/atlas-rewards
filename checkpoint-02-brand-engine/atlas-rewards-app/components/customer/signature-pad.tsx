"use client";
/**
 * SignaturePad — CP-135
 *
 * Finger/mouse signature on a canvas. Emits a PNG data URL on every stroke
 * end (null when cleared). Pointer events cover touch, pen and mouse; the
 * canvas is drawn at device pixel ratio so the stored image is crisp.
 */
import { useEffect, useRef, useState } from "react";
import { Eraser } from "lucide-react";

export function SignaturePad({
  onChange, height = 160, primary = "#111827",
}: {
  onChange: (dataUrl: string | null) => void;
  height?: number;
  primary?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  // Size the bitmap to the element × DPR once mounted / on resize.
  useEffect(() => {
    const c = canvasRef.current; if (!c) return;
    const fit = () => {
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      const rect = c.getBoundingClientRect();
      const w = Math.round(rect.width * dpr), h = Math.round(height * dpr);
      if (c.width !== w || c.height !== h) {
        // Preserve existing ink across a resize.
        const prev = hasInk ? c.toDataURL("image/png") : null;
        c.width = w; c.height = h;
        const ctx = c.getContext("2d")!;
        ctx.scale(dpr, dpr);
        ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = 2.4; ctx.strokeStyle = primary;
        if (prev) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0, rect.width, height); img.src = prev; }
      }
    };
    fit();
    const ro = new ResizeObserver(fit); ro.observe(c);
    return () => ro.disconnect();
  }, [height, primary, hasInk]);

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    const ctx = e.currentTarget.getContext("2d")!;
    const { x, y } = pos(e);
    drawing.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    ctx.beginPath(); ctx.moveTo(x, y);
    // A tap should still leave a dot.
    ctx.lineTo(x + 0.1, y + 0.1); ctx.stroke();
    setHasInk(true);
  }
  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = e.currentTarget.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.lineTo(x, y); ctx.stroke();
  }
  function up(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    drawing.current = false;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    onChange(e.currentTarget.toDataURL("image/png"));
  }
  function clear() {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext("2d")!;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, c.width, c.height); ctx.restore();
    setHasInk(false);
    onChange(null);
  }

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        style={{ height, touchAction: "none" }}
        className="w-full rounded-xl border-2 border-dashed border-zinc-300 bg-white"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerLeave={up}
        aria-label="Signature area"
      />
      {!hasInk && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-sm text-zinc-400">
          Sign here with your finger
        </div>
      )}
      <div className="absolute bottom-2 left-3 right-14 border-t border-zinc-200 pointer-events-none" />
      {hasInk && (
        <button type="button" onClick={clear}
          className="absolute top-2 right-2 h-8 px-2.5 rounded-full bg-white border text-[11px] font-bold text-zinc-600 inline-flex items-center gap-1 shadow-sm">
          <Eraser className="h-3 w-3" /> Clear
        </button>
      )}
    </div>
  );
}
