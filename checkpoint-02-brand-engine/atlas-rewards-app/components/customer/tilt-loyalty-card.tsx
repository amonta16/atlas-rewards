"use client";
import { useEffect, useRef, useState } from "react";
import type { Business } from "@/lib/types/database";

/**
 * 3D-realistic loyalty card.
 *
 * Tilt behavior (no gyroscope permission needed):
 *   • Pointer / finger drag over the card → live parallax tilt
 *   • Idle → a continuous subtle "breathing" tilt animates the shine across
 *     the surface so the card never looks flat
 *
 * We *don't* request DeviceOrientation permission anymore — iOS 13+ requires
 * an explicit user tap to enable it which felt like a friction wart. The
 * pointer-based tilt + ambient idle animation give the same premium feel
 * cross-platform.
 */
export function TiltLoyaltyCard({
  business,
  points,
  fullName,
  joinedDays,
  tierLabel,
  membershipImageUrl,
}: {
  business: Business;
  points: number;
  fullName: string;
  joinedDays: number;
  tierLabel: string;
  // CP-28: cashLabel / cashValue removed — Atlas is points-only now.
  membershipImageUrl?: string | null;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });
  const [interacting, setInteracting] = useState(false);
  const primary = business.brand_colors.primary;
  const secondary = business.brand_colors.secondary;

  /* ----- Pointer / touch follow-the-finger tilt ----- */
  function handlePointer(clientX: number, clientY: number) {
    const el = wrapRef.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const x = (clientX - r.left) / r.width;     // 0..1
    const y = (clientY - r.top)  / r.height;    // 0..1
    setTilt({
      rx: (0.5 - y) * 14,
      ry: (x - 0.5) * 20,
    });
  }
  function onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    setInteracting(true);
    handlePointer(e.clientX, e.clientY);
  }
  function onTouchMove(e: React.TouchEvent<HTMLDivElement>) {
    const t = e.touches[0]; if (!t) return;
    setInteracting(true);
    handlePointer(t.clientX, t.clientY);
  }
  function reset() {
    setInteracting(false);
    setTilt({ rx: 0, ry: 0 });
  }

  /* ----- Ambient idle "breathing" tilt when not interacting ----- */
  useEffect(() => {
    if (interacting) return;
    let raf: number;
    const start = performance.now();
    const tick = (now: number) => {
      const t = (now - start) / 1000;            // seconds
      // Lazy lemniscate: gentle, ~2.5° amplitude, slow period (~5s).
      const ry = Math.sin(t * 0.9) * 2.5;
      const rx = Math.sin(t * 0.6) * 1.5;
      setTilt({ rx, ry });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [interacting]);

  // Move the shine in the opposite direction of the tilt for a believable highlight.
  const shineX = 50 - tilt.ry * 2;
  const shineY = 50 + tilt.rx * 3;

  return (
    <div
      ref={wrapRef}
      onMouseMove={onMouseMove}
      onMouseLeave={reset}
      onTouchMove={onTouchMove}
      onTouchEnd={reset}
      onTouchCancel={reset}
      className="px-4 pt-3"
      style={{ perspective: "1200px" }}
    >
      <div
        className="relative rounded-2xl p-5 text-white overflow-hidden transition-transform duration-150 will-change-transform"
        style={{
          transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
          transformStyle: "preserve-3d",
          background: `linear-gradient(135deg, ${primary} 0%, ${secondary} 60%, ${primary} 100%)`,
          boxShadow: `0 30px 60px -20px ${primary}66, 0 12px 24px -10px rgba(0,0,0,0.3)`,
        }}
      >
        {/* Background art (uploaded membership image, or logo watermark) */}
        {membershipImageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={membershipImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />
        ) : business.logo_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={business.logo_url} alt="" className="absolute -right-6 -top-6 h-32 opacity-15 mix-blend-luminosity" />
        ) : null}

        {/* Moving shine sweep */}
        <div
          className="absolute inset-0 pointer-events-none transition-opacity"
          style={{
            background: `radial-gradient(circle at ${shineX}% ${shineY}%, rgba(255,255,255,0.55) 0%, rgba(255,255,255,0.15) 25%, transparent 55%)`,
            mixBlendMode: "overlay",
          }}
        />

        {/* Subtle holographic stripe */}
        <div
          className="absolute inset-0 opacity-25 pointer-events-none"
          style={{
            background: "linear-gradient(120deg, transparent 30%, rgba(255,255,255,0.4) 50%, transparent 70%)",
            transform: `translateX(${tilt.ry * 4}px)`,
          }}
        />

        <div className="relative" style={{ transform: "translateZ(20px)", transformStyle: "preserve-3d" }}>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-bold tracking-tight tabular-nums">{points.toLocaleString()}</span>
            <span className="text-xs font-medium opacity-90">{business.name.split(" ")[0]} Points</span>
          </div>
          <div className="mt-6 flex items-end justify-between">
            <div className="min-w-0">
              <div className="text-base font-semibold truncate">{fullName}</div>
              <div className="text-[10px] opacity-75 mt-0.5">
                Joined {joinedDays} day{joinedDays === 1 ? "" : "s"} ago
              </div>
            </div>
            {/* CP-28: cash subtitle removed (points-only). The tier badge takes
                the right slot so the card still has visual balance. */}
            <div className="text-right shrink-0 ml-3">
              <div className="text-[10px] opacity-75 uppercase tracking-widest font-bold">Tier</div>
              <div className="text-lg font-extrabold leading-none mt-1">{tierLabel}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
