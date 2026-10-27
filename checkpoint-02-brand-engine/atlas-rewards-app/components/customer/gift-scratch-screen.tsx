"use client";
/**
 * GiftScratchScreen — CP-224 · notification → scratch → rewarded.
 *
 * Full-screen, on top of everything (it claims the popup coordinator at the
 * highest priority so the bell onboarding / confetti / offer reveals wait).
 * The front is the same wrapped-parcel art as the med spa scratch card
 * (giftFrontSvg + name tag, in the business's brand colour). At 45 % scratched
 * it reveals AND claims in one go — claim_gift credits the bonus points — so
 * there is no extra "Claim" step. The reward's desk code shows right after.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Gift, Coins, Loader2, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useAppBase } from "@/lib/use-app-base";
import { optimizedUrl } from "@/lib/img";
import { giftFrontSvg, drawNameTag } from "@/components/medspa-app/scratch-gift";
import { claimPopup, releasePopup, PopupPriority } from "@/lib/popup-coordinator";
import type { Business } from "@/lib/types/database";

export type GiftData = {
  id: string; business_id: string; slug: string; business_name: string;
  title: string; body: string | null; bonus_points: number;
  reward_name: string | null; reward_image: string | null; reward_description: string | null;
  code: string | null; reward_status: string | null;
  expires_at: string | null; expired: boolean; revealed_at: string | null; points_credited: boolean;
  new_balance?: number;
};

const CLEAR_AT = 0.45;
const BRUSH = 28;
type Phase = "covered" | "claiming" | "revealed";

export function GiftScratchScreen({ business, gift: initial, fullName }: { business: Business; gift: GiftData | null; fullName: string }) {
  const primary = business.brand_colors.primary;
  const secondary = business.brand_colors.secondary || primary;
  const base = useAppBase(business.slug);
  const router = useRouter();
  const [gift, setGift] = useState<GiftData | null>(initial);
  const [phase, setPhase] = useState<Phase>(initial?.revealed_at ? "revealed" : "covered");
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const moves = useRef(0);
  const done = useRef(false);
  const tagName = fullName.trim().split(" ")[0] || "For you";

  // Own the screen while open.
  useEffect(() => {
    claimPopup("push-gift", PopupPriority.pushGift);
    return () => releasePopup("push-gift");
  }, []);

  const close = () => router.replace(base);

  // Paint the wrapping once the card has a size.
  const paint = useCallback(() => {
    const c = canvas.current, w = wrap.current;
    if (!c || !w) return;
    const r = w.getBoundingClientRect();
    if (r.width < 10) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
    c.style.width = `${r.width}px`; c.style.height = `${r.height}px`;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Solid brand fill first, so nothing underneath ever peeks through before the art loads.
    ctx.fillStyle = primary; ctx.fillRect(0, 0, r.width, r.height);
    const img = new Image();
    img.onload = async () => {
      try { await document.fonts?.load("600 30px Caveat"); } catch { /* cursive fallback */ }
      if (done.current) return;
      ctx.globalCompositeOperation = "source-over";
      const s = Math.max(r.width / 600, r.height / 360);
      ctx.drawImage(img, (r.width - 600 * s) / 2, (r.height - 360 * s) / 2, 600 * s, 360 * s);
      drawNameTag(ctx, r.width, r.height, tagName);
    };
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(giftFrontSvg(primary))}`;
  }, [primary, tagName]);

  useEffect(() => { if (phase === "covered" && gift && !gift.expired) paint(); }, [phase, gift, paint]);

  const reveal = useCallback(async () => {
    if (done.current || !gift) return;
    done.current = true;
    drawing.current = false;
    setPhase("claiming");
    import("canvas-confetti").then(({ default: confetti }) => {
      const r = wrap.current?.getBoundingClientRect();
      confetti({ particleCount: 110, spread: 80, startVelocity: 34, origin: { x: 0.5, y: r ? (r.top + r.height / 2) / window.innerHeight : 0.45 },
        colors: [primary, secondary, "#ffffff", "#facc15"], disableForReducedMotion: true });
    }).catch(() => {});
    const { data, error: e } = await createClient().rpc("claim_gift", { p_message_id: gift.id });
    if (e) {
      setError(/expired/i.test(e.message) ? "This gift has expired." : "Couldn't add it just now — scratch again to retry.");
      done.current = false;
      setPhase("covered");
      return;
    }
    setGift(data as GiftData);
    setPhase("revealed");
  }, [gift, primary, secondary]);

  function pt(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function cleared() {
    const c = canvas.current, ctx = c?.getContext("2d");
    if (!c || !ctx) return 0;
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    let clear = 0, n = 0;
    for (let i = 3; i < data.length; i += 4 * 24) { n++; if (data[i] < 40) clear++; }
    return n ? clear / n : 0;
  }
  function scratch(p: { x: number; y: number }) {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    ctx.globalCompositeOperation = "destination-out";
    ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = BRUSH * 2;
    const from = last.current ?? p;
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    ctx.beginPath(); ctx.arc(p.x, p.y, BRUSH, 0, Math.PI * 2); ctx.fill();
    last.current = p;
    if (++moves.current % 6 === 0 && cleared() >= CLEAR_AT) void reveal();
  }

  const pts = gift?.bonus_points ?? 0;
  const hasReward = !!gift?.reward_name;
  const expLabel = gift?.expires_at ? new Date(gift.expires_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : null;

  return (
    <div className="fixed inset-0 z-[80] flex flex-col text-white overflow-y-auto"
      style={{ background: `radial-gradient(120% 80% at 50% 0%, ${primary} 0%, #0d0f1f 62%)` }}>
      <div className="flex items-center justify-between px-5 pt-[max(env(safe-area-inset-top),16px)] pb-2">
        <div className="flex items-center gap-2 min-w-0">
          {business.logo_url && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={optimizedUrl(business.logo_url, 96)} alt="" className="h-8 w-8 rounded-lg bg-white object-contain p-0.5" />
          )}
          <span className="truncate text-sm font-semibold opacity-90">{business.name}</span>
        </div>
        <button type="button" onClick={close} aria-label="Close" className="h-10 w-10 rounded-full bg-white/10 grid place-items-center hover:bg-white/20">
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-5 pb-10">
        {!gift ? (
          <div className="text-center max-w-xs">
            <Gift className="h-10 w-10 mx-auto opacity-70" />
            <h1 className="mt-3 text-2xl font-black">This gift isn&apos;t here</h1>
            <p className="mt-1 text-sm text-white/70">It may belong to another account, or it was already removed.</p>
            <button type="button" onClick={close} className="mt-6 h-12 px-8 rounded-full bg-white text-zinc-900 font-bold">Go to the app</button>
          </div>
        ) : (
          <>
            <div className="text-[11px] font-black uppercase tracking-[0.25em] text-yellow-300">{phase === "revealed" ? "Unwrapped" : "A gift for you"}</div>
            <h1 className="mt-1 text-center text-[28px] font-black leading-tight max-w-sm">{gift.title}</h1>
            {phase !== "revealed" && expLabel && !gift.expired && (
              <div className="mt-1 inline-flex items-center gap-1 text-xs text-white/70"><Clock className="h-3.5 w-3.5" /> Unwrap by {expLabel}</div>
            )}

            <div ref={wrap} className="relative mt-6 w-full max-w-sm aspect-[5/3] select-none overflow-hidden rounded-[24px] bg-white text-zinc-900 shadow-[0_30px_60px_-25px_rgba(0,0,0,.7)] ring-1 ring-white/20">
              {/* Underneath: the reward */}
              <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
                {gift.reward_image ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={optimizedUrl(gift.reward_image, 240)} alt="" className="h-16 w-16 rounded-2xl object-cover ring-1 ring-black/5" />
                ) : (
                  <span className="grid h-16 w-16 place-items-center rounded-2xl" style={{ background: `${primary}1f`, color: primary }}>
                    {hasReward ? <Gift className="h-8 w-8" /> : <Coins className="h-8 w-8" />}
                  </span>
                )}
                <div className="mt-3 text-[24px] font-black leading-tight" style={{ color: primary }}>
                  {hasReward ? gift.reward_name : pts > 0 ? `+${pts.toLocaleString()} points` : "A little something"}
                </div>
                {hasReward && pts > 0 && <div className="mt-1 text-[15px] font-bold text-zinc-700">+ {pts.toLocaleString()} bonus points</div>}
                {!hasReward && pts === 0 && gift.body && <p className="mt-1 text-sm text-zinc-600 line-clamp-2">{gift.body}</p>}
              </div>

              {/* On top: the wrapping */}
              {phase === "covered" && !gift.expired && (
                <canvas ref={canvas} role="img" aria-label="Gift wrapping. Scratch to unwrap."
                  className="absolute inset-0 h-full w-full cursor-grab touch-none"
                  onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drawing.current = true; last.current = null; setStarted(true); scratch(pt(e)); }}
                  onPointerMove={(e) => { if (drawing.current) scratch(pt(e)); }}
                  onPointerUp={() => { drawing.current = false; last.current = null; if (cleared() >= CLEAR_AT) void reveal(); }}
                  onPointerCancel={() => { drawing.current = false; last.current = null; }} />
              )}
              {phase === "covered" && !gift.expired && (
                <span aria-hidden className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 whitespace-nowrap rounded-lg bg-zinc-900/85 px-3.5 py-2 text-[14px] font-semibold text-white shadow-lg transition-opacity duration-300"
                  style={{ opacity: started ? 0 : 1 }}>
                  Scratch to unwrap
                </span>
              )}
              {gift.expired && phase === "covered" && (
                <div className="absolute inset-0 grid place-items-center bg-zinc-900/80 text-white text-center px-6">
                  <div><Clock className="h-7 w-7 mx-auto opacity-80" /><div className="mt-2 font-bold">This gift expired{expLabel ? ` on ${expLabel}` : ""}</div></div>
                </div>
              )}
            </div>

            {phase === "covered" && !gift.expired && (
              <button type="button" onClick={() => void reveal()} className="sr-only focus:not-sr-only focus:mt-3 focus:underline">Reveal without scratching</button>
            )}
            {phase === "claiming" && (
              <div className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-white/85"><Loader2 className="h-4 w-4 animate-spin" /> Adding it to your account…</div>
            )}
            {error && <p className="mt-4 text-sm font-semibold text-rose-300">{error}</p>}

            {phase === "revealed" && (
              <div className="mt-6 w-full max-w-sm" style={{ animation: "giftpop .45s cubic-bezier(.2,.9,.3,1.2) both" }}>
                {pts > 0 && (
                  <div className="rounded-2xl bg-white/10 ring-1 ring-white/15 px-4 py-3 flex items-center gap-3">
                    <span className="h-9 w-9 rounded-full bg-yellow-300 grid place-items-center text-zinc-900"><Coins className="h-5 w-5" /></span>
                    <div className="min-w-0">
                      <div className="font-bold">+{pts.toLocaleString()} points added</div>
                      {typeof gift.new_balance === "number" && <div className="text-xs text-white/70">Balance: {gift.new_balance.toLocaleString()} points</div>}
                    </div>
                  </div>
                )}
                {hasReward && gift.code && (
                  <div className="mt-3 rounded-2xl bg-white text-zinc-900 px-4 py-4 text-center">
                    <div className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500">Show this at the front desk</div>
                    <div className="mt-1 text-[34px] font-black tracking-[0.18em] tabular-nums" style={{ color: primary }}>{gift.code}</div>
                    <div className="text-xs text-zinc-500">{gift.reward_name}{expLabel ? ` · use by ${expLabel}` : ""}</div>
                  </div>
                )}
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => router.replace(`${base}/rewards`)} className="h-12 rounded-full bg-white/10 ring-1 ring-white/20 font-bold">My rewards</button>
                  <button type="button" onClick={close} className="h-12 rounded-full font-bold text-zinc-900" style={{ background: "#facc15" }}>Done</button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
      <style>{`@keyframes giftpop { from { opacity: 0; transform: translateY(10px) scale(.97); } to { opacity: 1; transform: none; } }`}</style>
    </div>
  );
}
