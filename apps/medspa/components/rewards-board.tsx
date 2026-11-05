"use client";
/**
 * Rewards tab, the two lower halves:
 *   RewardsBoard  · two-up reward cards (points pill, Locked / Redeem), detail sheet, See more
 *   NeedMorePoints · the ways to earn, each with a black "+N points" pill
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { optimizedUrl } from "@atlas/core/img";
import type { ClinicReward } from "@/lib/clinic";
import { EarnedOverlay } from "./earned-overlay";
import { useGate } from "./gate";
import { IcBag, IcCheck, IcClose, IcGoogle, IcLock, IcNext, IcPeople, IcQr } from "./icons";
import { Portal } from "./portal";
import { RedeemButton } from "./redeem-button";

export function RewardsBoard({ slug, rewards, points, signedIn }: { slug: string; rewards: ClinicReward[]; points: number; signedIn: boolean }) {
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<ClinicReward | null>(null);
  if (!rewards.length) return <p className="py-14 text-center text-[15px] text-sub">Rewards are coming soon.</p>;
  return (
    <section className="pt-7">
      <div className="flex items-baseline justify-between px-5">
        <h2 className="text-[19px] font-semibold tracking-[-0.015em]">Rewards</h2>
        <button type="button" onClick={() => setAll((v) => !v)} className="flex items-center gap-0.5 text-[13px] font-medium">
          {all ? "See less" : "See more"} <IcNext className="h-3.5 w-3.5" strokeWidth={2.2} />
        </button>
      </div>
      <div className={all ? "mt-3 grid grid-cols-2 gap-2.5 px-4" : "no-scrollbar mt-3 flex gap-2.5 overflow-x-auto px-4 pb-1"}>
        {rewards.map((r) => <Tile key={r.id} r={r} points={points} signedIn={signedIn} wide={!all} onOpen={() => setOpen(r)} />)}
      </div>
      {open && <RewardSheet slug={slug} r={open} points={points} signedIn={signedIn} onClose={() => setOpen(null)} />}
    </section>
  );
}

function Tile({ r, points, signedIn, wide, onOpen }: { r: ClinicReward; points: number; signedIn: boolean; wide: boolean; onOpen: () => void }) {
  const unlocked = signedIn && points >= r.point_cost;
  return (
    <button type="button" id={r.id} onClick={onOpen} className={`${wide ? "w-[calc(50%-5px)] shrink-0" : ""} scroll-mt-24 overflow-hidden rounded-[14px] text-center transition active:scale-[0.99] ${unlocked ? "bg-white shadow-card ring-1 ring-line" : "bg-[#F1F2F3]"}`}>
      <div className="relative aspect-[5/4] overflow-hidden bg-[#DFE1E3]">
        {r.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={optimizedUrl(r.image_url, 340)} alt="" className={`h-full w-full object-cover ${unlocked ? "" : "opacity-70 grayscale"}`} loading="lazy" />
        )}
      </div>
      <div className="flex min-h-[76px] flex-col items-center px-2.5 pb-2 pt-2.5">
        <span className="inline-flex items-center gap-1 rounded-full bg-[#E4E6E8] px-2.5 py-[3px] text-[10.5px] font-bold uppercase tracking-[0.06em] text-ink">
          {!unlocked && <IcLock className="h-3 w-3" strokeWidth={2} />}{r.point_cost.toLocaleString("en-US")} points
        </span>
        <p className="mt-2 line-clamp-2 text-[13.5px] font-medium leading-snug">{r.name}</p>
      </div>
      <p className={`border-t py-2 text-[12.5px] font-medium ${unlocked ? "border-line font-semibold text-ink" : "border-[#E4E6E8] text-sub"}`}>{unlocked ? "Redeem" : "Locked"}</p>
    </button>
  );
}

function RewardSheet({ slug, r, points, signedIn, onClose }: { slug: string; r: ClinicReward; points: number; signedIn: boolean; onClose: () => void }) {
  const short = Math.max(0, r.point_cost - points);
  const ready = !signedIn || short === 0;
  return (
    <Portal>
      <div className="fixed inset-0 z-[55] animate-fade bg-black/45" onClick={onClose}>
        <div role="dialog" aria-modal onClick={(e) => e.stopPropagation()} className="absolute inset-x-0 bottom-0 mx-auto max-w-md animate-sheet overflow-hidden rounded-t-[26px] bg-white" style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom, 0px))" }}>
          <div className="relative aspect-[16/10] bg-page">
            {r.image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={optimizedUrl(r.image_url, 800)} alt="" className="h-full w-full object-cover" />
            )}
            <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/90"><IcClose className="h-4 w-4" /></button>
            <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-white">{r.point_cost.toLocaleString("en-US")} points</span>
          </div>
          <div className="px-5 pt-5">
            <h2 className="text-[22px] font-semibold leading-tight tracking-[-0.015em]">{r.name}</h2>
            {r.description && <p className="mt-2 text-[14.5px] leading-snug text-sub">{r.description}</p>}
            {r.terms && <p className="mt-2 text-[12.5px] leading-snug text-faint">{r.terms}</p>}
            <div className="mt-5">
              <RedeemButton slug={slug} rewardId={r.id} reward={r.name} cost={r.point_cost} points={points} ready={ready}
                label={ready ? "Redeem Reward now" : `${short.toLocaleString("en-US")} more points to unlock`} className="btn-ink" />
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}

export function NeedMorePoints({ slug, clinicName, rate, visit, review, referral, reviewUrl, memberCode, reviewDone, demo }: {
  slug: string; clinicName: string; rate: number; visit: number; review: number; referral: number; reviewUrl: string | null; memberCode: string | null; reviewDone: boolean; demo: boolean;
}) {
  const { require } = useGate();
  const router = useRouter();
  const [ask, setAsk] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(reviewDone);
  const [pending, setPending] = useState(false);
  const [earned, setEarned] = useState(0);
  const [copied, setCopied] = useState(false);
  const pendKey = `ms_review_${slug}`;
  useEffect(() => { try { if (localStorage.getItem(pendKey)) setPending(true); } catch { /* fine */ } }, [pendKey]);

  async function refer() {
    const url = `${window.location.origin}/${slug}${memberCode ? `?ref=${encodeURIComponent(memberCode)}` : ""}`;
    const text = `Join me at ${clinicName}. Get the app:`;
    if (navigator.share) { navigator.share({ title: clinicName, text, url }).catch(() => {}); return; }
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { window.prompt("Copy your link", url); }
  }
  function startReview() {
    if (reviewUrl) window.open(reviewUrl, "_blank", "noopener,noreferrer");
    setErr(null); setAsk(true);
  }
  async function submitReview() {
    const res = await fetch(`/api/${slug}/review`, { method: "POST" }).catch(() => null);
    const data = (await res?.json().catch(() => ({}))) as { earned?: number; pending?: boolean; error?: string } | undefined;
    if (data?.earned) { setAsk(false); setDone(true); setEarned(data.earned); return; }
    if (data?.pending) { setAsk(false); setPending(true); try { localStorage.setItem(pendKey, "1"); } catch { /* fine */ } return; }
    setErr(data?.error ?? "No connection. Please try again.");
  }

  const rowCls = "flex w-full items-center gap-3 rounded-[12px] bg-[#F4F5F6] px-3.5 py-3 text-left";
  const body = (Icon: React.ReactNode, title: string, sub: string | null, right: React.ReactNode) => (
    <>
      <span className="grid h-7 w-7 shrink-0 place-items-center">{Icon}</span>
      <span className="min-w-0 flex-1"><span className="block text-[14px] font-medium leading-tight">{title}</span>{sub && <span className="mt-0.5 block text-[12px] leading-tight text-sub">{sub}</span>}</span>
      {right}
    </>
  );

  return (
    <section className="px-4 pb-6 pt-8">
      <h2 className="px-1 text-[19px] font-semibold tracking-[-0.015em]">Need more points?</h2>
      <div className="mt-3 space-y-2">
        {referral > 0 && <button type="button" className={rowCls} onClick={() => require(refer)}>{body(<IcPeople className="h-6 w-6" />, "Refer a friend", copied ? "Link copied" : null, <span className="pill-ink">+{referral} points</span>)}</button>}
        {rate > 0 && <Link href={`/${slug}/shop?tab=browse`} className={rowCls}>{body(<IcBag className="h-6 w-6" />, "Make a purchase", `${rate === 1 ? "1 point" : `${rate} points`} per $1 spent`, <span className="pill-ink">+{rate} {rate === 1 ? "point" : "points"}</span>)}</Link>}
        {review > 0 && reviewUrl && (
          <button type="button" disabled={done || pending} className={rowCls} onClick={() => require(startReview)}>
            {body(<IcGoogle className="h-6 w-6" />, "Review on Google", done ? `${review} points added` : pending ? "The desk is confirming it" : null,
              done ? <span className="inline-flex h-[26px] items-center gap-1 rounded-full bg-emerald-50 px-3 text-[12px] font-semibold text-emerald-700 ring-1 ring-emerald-200">Done <IcCheck className="h-3.5 w-3.5" /></span>
              : pending ? <span className="inline-flex h-[26px] items-center rounded-full bg-amber-50 px-3 text-[12px] font-semibold text-amber-800">Pending</span>
              : <span className="pill-ink">+{review} points</span>)}
          </button>
        )}
        {visit > 0 && <Link href={`/${slug}/scan`} className={rowCls}>{body(<IcQr className="h-6 w-6" />, "Visit our clinic", "Scan to earn", <span className="pill-ink">+{visit} points</span>)}</Link>}
      </div>

      {ask && (
        <Portal><div className="fixed inset-0 z-[60] grid animate-fade place-items-center bg-black/45 px-6" onClick={() => setAsk(false)}>
          <div role="dialog" aria-modal className="w-full max-w-[340px] animate-rise rounded-[24px] bg-white p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <IcGoogle className="mx-auto h-9 w-9" />
            <h2 className="mt-3 text-[20px] font-semibold leading-tight">Did you post your review?</h2>
            <p className="mt-2 text-[14px] text-sub">{demo ? `Thanks for helping ${clinicName}. Your ${review} points are ready.` : `Thanks for helping ${clinicName}. The desk checks it, then your ${review} points land here.`}</p>
            {err && <p className="mt-3 text-[13.5px] text-red-600">{err}</p>}
            <button type="button" className="btn-ink mt-5" onClick={submitReview}>Yes, I posted it</button>
            <button type="button" className="mt-2 h-11 w-full text-[14.5px] font-medium text-sub" onClick={() => setAsk(false)}>Not yet</button>
          </div>
        </div></Portal>
      )}
      {earned > 0 && <EarnedOverlay points={earned} clinic={clinicName} onDone={() => { setEarned(0); router.refresh(); }} />}
    </section>
  );
}
