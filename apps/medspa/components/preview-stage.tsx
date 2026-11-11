"use client";
/**
 * Lead-magnet audit, step 2 · the money screen (/p/<slug>), around the real app:
 *
 *   PreviewStage  the phone, plus
 *     · "Wrong logo or color? Fix it": one tap, always there (a wrong logo kills "this is mine")
 *     · "Send me a test push": a tappable notification from their spa slides onto the phone;
 *       where the browser can show a real one (Android, desktop, an installed iPhone app) it
 *       fires for real; an iPhone in Safari gets the Add to Home Screen instruction in place
 *     · while the build is still adding treatments (phase 2), the app reloads itself when they land
 *   CtaBar  two equal buttons, always on screen on a phone: [Book 15 min] [Just look around]
 *
 * Calls go to the venue site's API (apiOrigin, CORS locked to this origin).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PhoneFrame } from "./phone-frame";
import { previewEvent } from "@/lib/preview-event";
import { useBonusClock } from "./launch-bonus";

type Push = "idle" | "show" | "done";

const PUSH_BODY = "Time for your touch-up? Book this week and earn double points.";

function initials(name: string) {
  return name.replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "A";
}

export function PreviewStage({ slug, businessName, logoUrl, primary, apiOrigin }: {
  slug: string; businessName: string; logoUrl: string | null; primary: string; apiOrigin: string;
}) {
  const router = useRouter();
  const [frameKey, setFrameKey] = useState(0);
  const [enriching, setEnriching] = useState(false);
  const [push, setPush] = useState<Push>("idle");
  const [help, setHelp] = useState<string | null>(null);
  const [fixOpen, setFixOpen] = useState(false);
  const reload = useCallback(() => { setFrameKey((k) => k + 1); router.refresh(); }, [router]);

  // Audit step 7: their app is on screen (the render-to-book denominator).
  useEffect(() => { previewEvent(apiOrigin, slug, "app_rendered"); }, [apiOrigin, slug]);

  // Build phase 2: brand is live, treatments and photos still coming. Reload once they land.
  useEffect(() => {
    let stop = false;
    let was = false;
    (async () => {
      for (let i = 0; i < 60 && !stop; i++) {
        try {
          const r = await fetch(`${apiOrigin}/api/preview/status?slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
          const j = (await r.json().catch(() => ({}))) as { enriching?: boolean };
          if (stop) return;
          setEnriching(!!j.enriching);
          if (j.enriching) was = true;
          else { if (was) reload(); return; }
        } catch { return; }
        await new Promise((res) => setTimeout(res, 4000));
      }
    })();
    return () => { stop = true; };
  }, [apiOrigin, slug, reload]);

  async function testPush() {
    previewEvent(apiOrigin, slug, "notif_previewed");
    setHelp(null);
    setPush("show");
    window.setTimeout(() => setPush((p) => (p === "show" ? "done" : p)), 6000);
    // The real thing where the browser allows it
    const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent) || (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      if (ios && !standalone) setHelp("On iPhone, notifications arrive once the app is on the Home Screen: tap Share, then Add to Home Screen, and open it from there.");
      return;
    }
    try {
      const perm = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
      if (perm !== "granted") { setHelp("Notifications are blocked for this site. Allow them in your browser settings to get the real one."); return; }
      const reg = await navigator.serviceWorker.register("/sw-push.js");
      await navigator.serviceWorker.ready;
      await reg.showNotification(businessName, { body: PUSH_BODY, icon: logoUrl ?? "/atlas-icon-512.png", badge: "/icons/icon-192.png", tag: "pv-demo", data: { url: `/p/${slug}` } });
    } catch {
      if (ios && !standalone) setHelp("On iPhone, notifications arrive once the app is on the Home Screen: tap Share, then Add to Home Screen.");
    }
  }

  const banner = push === "show" && (
    <button type="button" onClick={() => setPush("done")} aria-label={`Notification from ${businessName}: ${PUSH_BODY}`}
      className="pv-push absolute left-[10px] right-[10px] top-[56px] z-40 flex items-start gap-3 rounded-[24px] bg-white/85 p-[13px] text-left shadow-[0_18px_40px_-14px_rgba(0,0,0,.45)] ring-1 ring-black/5 backdrop-blur-xl">
      <span className="grid h-[38px] w-[38px] shrink-0 place-items-center overflow-hidden rounded-[10px] text-[14px] font-bold text-white" style={{ background: logoUrl ? "#fff" : primary }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {logoUrl ? <img src={logoUrl} alt="" className="h-full w-full object-contain p-[3px]" /> : initials(businessName)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[15px] font-semibold text-black">{businessName}</span>
          <span className="shrink-0 text-[13px] text-black/45">now</span>
        </span>
        <span className="mt-0.5 block text-[15px] leading-snug text-black/85">{PUSH_BODY}</span>
      </span>
    </button>
  );

  return (
    <div id="pv-phone" className="mx-auto w-full max-w-[418px] scroll-mt-20">
      <style>{`.pv-push{animation:pvpush .55s cubic-bezier(.2,.9,.25,1.08) both}@keyframes pvpush{0%{transform:translateY(-140%) scale(.96);opacity:0}100%{transform:none;opacity:1}}@media (prefers-reduced-motion:reduce){.pv-push{animation:none}}`}</style>
      {/* Above the phone, not on it: on the frame it covered the status-bar icons. */}
      <div className="mb-2.5 flex justify-center">
        <button type="button" onClick={() => setFixOpen(true)}
          className="rounded-full bg-white px-3.5 py-1.5 text-[12.5px] font-semibold text-ink shadow-soft ring-1 ring-line active:scale-[.98]">
          Wrong logo or color? <span style={{ color: primary }}>Fix it</span>
        </button>
      </div>
      <div className="relative">
        <PhoneFrame key={frameKey} src={`/${slug}`} title={`${businessName} app preview`} overlay={banner} />
      </div>
      {enriching && <p className="mt-3 text-center text-[13px] font-medium text-sub" role="status">Adding your treatments and photos… the app updates by itself.</p>}
      <div className="mt-4 flex flex-col items-center gap-2">
        <button type="button" onClick={testPush} className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-[14.5px] font-semibold text-ink shadow-soft ring-1 ring-line active:scale-[.98]">
          <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: primary }} />
          Send me a test push from {businessName.length > 28 ? "my spa" : businessName}
        </button>
        {help && <p className="max-w-[34ch] rounded-2xl bg-white p-3 text-center text-[13px] leading-snug text-sub shadow-soft" role="status">{help}</p>}
      </div>
      {fixOpen && <BrandFix slug={slug} primary={primary} apiOrigin={apiOrigin} onClose={() => setFixOpen(false)} onSaved={() => { setFixOpen(false); reload(); }} />}
    </div>
  );
}

/** Shrinks a picked image to ≤ 1024 px PNG in the browser, so uploads stay small. */
async function toPngDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * k));
    c.height = Math.max(1, Math.round(img.naturalHeight * k));
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

const SWATCHES = ["#1F3A5F", "#0B5FD6", "#447F72", "#7A3E5B", "#B5651D", "#2E2723"];

function BrandFix({ slug, primary, apiOrigin, onClose, onSaved }: { slug: string; primary: string; apiOrigin: string; onClose: () => void; onSaved: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [link, setLink] = useState("");
  const [color, setColor] = useState(primary);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function save() {
    setErr(null);
    setBusy(true);
    try {
      const body: Record<string, string> = { slug };
      if (file) body.logo_data = await toPngDataUrl(file);
      else if (link.trim()) body.logo_url = link.trim();
      if (color.toLowerCase() !== primary.toLowerCase()) body.primary = color;
      if (Object.keys(body).length === 1) { setErr("Upload a logo or pick a color."); return; }
      const r = await fetch(`${apiOrigin}/api/preview/brand`, { method: "POST", mode: "cors", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) { setErr(j.error ?? "Couldn't save. Please try again."); return; }
      onSaved();
    } catch {
      setErr("Couldn't save. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="pv-fix-title" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-[28px] bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))] shadow-card sm:rounded-[28px]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 id="pv-fix-title" className="text-[19px] font-semibold">Fix your logo and color</h2>
          <button type="button" onClick={onClose} className="rounded-full px-2 py-1 text-[14px] text-sub" aria-label="Close">Close</button>
        </div>
        <p className="mt-1 text-[13.5px] text-sub">Your app updates as soon as you save.</p>

        <p className="mt-5 text-[14px] font-semibold">Logo</p>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setLink(""); }} />
        <button type="button" onClick={() => fileRef.current?.click()} className="mt-2 flex h-12 w-full items-center justify-center rounded-2xl border border-dashed border-line text-[15px] font-semibold text-ink">
          {file ? `Selected: ${file.name.slice(0, 32)}` : "Upload your logo"}
        </button>
        <input value={link} onChange={(e) => { setLink(e.target.value); setFile(null); }} inputMode="url" placeholder="…or paste a link to it"
          className="mt-2 h-11 w-full rounded-2xl border border-line px-4 text-[15px] focus:outline-none focus:ring-2 focus:ring-black/10" />

        <p className="mt-5 text-[14px] font-semibold">Brand color</p>
        <div className="mt-2 flex items-center gap-2">
          {SWATCHES.map((c) => (
            <button key={c} type="button" onClick={() => setColor(c)} aria-label={`Use ${c}`} className={`h-9 w-9 rounded-full ring-offset-2 ${color.toLowerCase() === c.toLowerCase() ? "ring-2 ring-black" : ""}`} style={{ background: c }} />
          ))}
          <label className="relative grid h-9 w-9 cursor-pointer place-items-center overflow-hidden rounded-full ring-1 ring-line" aria-label="Pick any color" style={{ background: color }}>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0" />
            <span className="text-[16px] font-bold text-white mix-blend-difference">+</span>
          </label>
        </div>

        {err && <p role="alert" className="mt-4 text-[14px] font-medium text-red-700">{err}</p>}
        <button type="button" onClick={save} disabled={busy} className="mt-5 h-[52px] w-full rounded-full text-[16px] font-semibold text-white disabled:opacity-50" style={{ background: color }}>
          {busy ? "Saving…" : "Save and update my app"}
        </button>
      </div>
    </div>
  );
}

/**
 * Two equal buttons, side by side, always on screen on a phone (a bar at the bottom); inline
 * on a computer. No third option. A taken area swaps Book for the waitlist.
 */
export function CtaBar({ walkthroughUrl, primary, taken, bonus }: { walkthroughUrl: string; primary: string; taken: boolean; bonus?: { apiOrigin: string; slug: string } }) {
  // CP-245: while the launch-bonus window runs, Book says what booking now earns.
  const left = useBonusClock(bonus?.apiOrigin ?? "", bonus?.slug ?? "", !!bonus && !taken);
  const look = () => {
    const el = document.getElementById("pv-phone");
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => el?.querySelector("iframe")?.focus(), 450);
  };
  const btn = "flex h-[58px] min-w-0 flex-col items-center justify-center rounded-2xl px-2 text-center leading-tight active:scale-[.98]";
  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-white/95 px-3 pb-[calc(0.6rem+env(safe-area-inset-bottom,0px))] pt-2.5 backdrop-blur sm:static sm:mt-6 sm:max-w-[34rem] sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
      <div className="mx-auto grid max-w-md grid-cols-2 gap-2.5 sm:mx-0">
        <a href={walkthroughUrl} className={`${btn} text-white`} style={{ background: primary }}>
          {taken ? <span className="text-[15.5px] font-semibold">Join the waitlist</span> : <>
            <span className="text-[15.5px] font-semibold">Book 15 min</span>
            <span className="text-[12px] font-medium opacity-85">{left !== null ? "+ 3 free launch bonuses" : "turn it on live"}</span>
          </>}
        </a>
        <button type="button" onClick={look} className={`${btn} bg-white text-ink ring-1 ring-line`}>
          <span className="text-[15.5px] font-semibold">Just look around</span>
          <span className="text-[12px] font-medium text-sub">tap through your app</span>
        </button>
      </div>
    </div>
  );
}
