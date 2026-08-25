"use client";
import { useEffect, useRef, useState } from "react";
import {
  loyaltyCardRamp, loyaltyCardSurface, loyaltyCardSheen, loyaltyCardVolume,
} from "@/lib/loyalty-card";
import type { Business } from "@/lib/types/database";

/**
 * Membership card on the Rewards tab.
 *
 * CP-104 redesign (Andrew, against the Dermis reference): the card used to
 * feed raw brand colors into its gradient and then composite a white radial
 * at 0.55 alpha in `overlay` blend mode. On a saturated brand that produced a
 * blown-out hotspot — on a bright yellow or pale pink one it ate the member's
 * own name. The color is now normalized first (lib/loyalty-card.ts) and lit
 * with a broad low-alpha sheen instead of a spotlight, so EVERY brand color
 * lands somewhere premium.
 *
 * Also from that pass: the watermark used to sit at `-right-6 -top-6`, i.e.
 * deliberately cropped against two edges at once — it now sits fully inside
 * the card. Radius 16 → 24px, and the six stacked box-shadows collapsed to
 * one grounded shadow plus a faint brand tint.
 *
 * Tilt behavior is unchanged (no gyroscope permission needed):
 *   • Pointer / finger drag over the card → live parallax tilt
 *   • Idle → a slow "breathing" tilt drifts the sheen across the surface
 */
export function TiltLoyaltyCard({
  business,
  points,
  fullName,
  joinedDays,
  membershipImageUrl,
}: {
  business: Business;
  points: number;
  fullName: string;
  joinedDays: number;
  // CP-28: cashLabel / cashValue removed — Atlas is points-only now.
  // CP-73: tierLabel removed — Bronze/Silver/Gold tiers are gone.
  membershipImageUrl?: string | null;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0 });
  const [interacting, setInteracting] = useState(false);
  const ramp = loyaltyCardRamp(business.brand_colors.primary);

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

  // The lit corner drifts against the tilt so the surface feels solid.
  const volX = 14 + tilt.ry * 0.8;
  const volY = 8 - tilt.rx * 0.6;

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
        className="relative rounded-3xl p-6 min-h-[200px] flex flex-col justify-between text-white overflow-hidden transition-transform duration-150 will-change-transform"
        style={{
          transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
          transformStyle: "preserve-3d",
          ...loyaltyCardSurface(ramp),
        }}
      >
        {/* Background art. An uploaded membership image still takes over the
            whole face; otherwise the logo sits as a contained watermark in the
            bottom-right — the corner this layout deliberately keeps free. */}
        {membershipImageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={membershipImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />
        ) : business.logo_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={business.logo_url}
            alt=""
            className="absolute right-5 bottom-4 h-24 max-w-[45%] object-contain opacity-[0.13] pointer-events-none"
          />
        ) : null}

        {/* Soft corner volume, then the broad sheen — no blend modes. */}
        <div className="absolute inset-0 pointer-events-none" style={loyaltyCardVolume(volX, volY)} />
        <div className="absolute inset-0 pointer-events-none" style={loyaltyCardSheen(tilt.ry * 5)} />

        <div
          className="relative flex flex-col justify-between flex-1"
          style={{ transform: "translateZ(20px)", transformStyle: "preserve-3d" }}
        >
          {/* Points stacked above their label (Dermis composition), with the
              membership mark balancing the top-right. */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[40px] font-extrabold leading-none tracking-tight tabular-nums">
                {points.toLocaleString()}
              </div>
              <div className="text-xs font-medium opacity-80 mt-1.5 truncate">
                {business.name.split(" ")[0]} Points
              </div>
            </div>
            {/* CP-73: tier badge removed (tiers are gone) — an outlined
                MEMBER pill keeps the top-right slot deliberate. */}
            <div className="shrink-0 rounded-full border border-white/55 px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.14em]">
              Member
            </div>
          </div>

          <div className="mt-auto pt-6 min-w-0">
            <div className="text-base font-semibold truncate">{fullName}</div>
            <div className="text-[10px] opacity-75 mt-0.5">
              {/* CP-103 (QA M-03): 0 = joined today. */}
              {joinedDays === 0
                ? "Joined today"
                : `Joined ${joinedDays} day${joinedDays === 1 ? "" : "s"} ago`}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
