"use client";
/**
 * Realistic message previews for the Automation Hub (CP-217):
 *  · PushPreview  — iPhone lock screen with the clinic's app icon + a frosted notification
 *  · BellPreview  — the same message as it lands in the in-app bell
 *  · EmailPreview — inbox header (From / Reply-to / To / Subject) + the real
 *                   branded email (renderEmail) in a sandboxed, scaled iframe
 * Text arrives already variable-rendered by the caller.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, ChevronLeft, Reply, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { emailFrom, renderEmail } from "@/lib/automations/email-template";

export type PreviewBrand = { name: string; logoUrl: string | null; primary: string; heroUrl: string | null };

const safeHex = (h: string | null | undefined) => (h && /^#[0-9a-f]{6}$/i.test(h) ? h : "#0B5FD6");
function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v + amt * 255)));
  return `rgb(${c(n >> 16)}, ${c((n >> 8) & 255)}, ${c(n & 255)})`;
}
const monogram = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "A";

export function AppIcon({ brand, size = 20, radius }: { brand: PreviewBrand; size?: number; radius?: number }) {
  const p = safeHex(brand.primary);
  const r = radius ?? Math.round(size * 0.225);
  return brand.logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={brand.logoUrl} alt="" width={size} height={size} className="shrink-0 bg-white object-contain" style={{ width: size, height: size, borderRadius: r }} />
  ) : (
    <span className="grid shrink-0 place-items-center font-semibold text-white" style={{ width: size, height: size, borderRadius: r, fontSize: size * 0.42, background: `linear-gradient(140deg, ${shade(p, 0.12)}, ${shade(p, -0.12)})` }}>{monogram(brand.name)}</span>
  );
}

/* ───────────── push: iPhone lock screen ───────────── */
export function PushPreview({ brand, title, body, className }: { brand: PreviewBrand; title: string; body: string; className?: string }) {
  const p = safeHex(brand.primary);
  const date = useMemo(() => new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }), []);
  return (
    <div className={cn("relative mx-auto w-[300px] overflow-hidden rounded-[44px] bg-black p-[9px] shadow-[0_30px_60px_-30px_rgba(15,23,42,.55)]", className)}>
      <div className="relative h-[372px] overflow-hidden rounded-[36px]">
        {/* wallpaper: blurred hero, or a brand gradient */}
        {brand.heroUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={brand.heroUrl} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover blur-[14px]" />
        ) : (
          <div className="absolute inset-0" style={{ background: `radial-gradient(120% 80% at 20% 0%, ${shade(p, 0.28)} 0%, transparent 60%), radial-gradient(100% 70% at 100% 100%, ${shade(p, -0.18)} 0%, transparent 65%), linear-gradient(160deg, ${shade(p, 0.08)}, ${shade(p, -0.22)})` }} />
        )}
        <div className="absolute inset-0 bg-black/10" />
        {/* status bar + dynamic island */}
        <div className="relative flex items-center justify-between px-7 pt-3 text-[12px] font-semibold text-white">
          <span>9:41</span>
          <span className="absolute left-1/2 top-2.5 h-[22px] w-[84px] -translate-x-1/2 rounded-full bg-black" />
          <span className="flex items-center gap-1"><Signal /><Wifi /><Battery /></span>
        </div>
        {/* clock */}
        <div className="relative mt-5 text-center text-white">
          <div className="text-[13px] font-medium opacity-90">{date}</div>
          <div className="mt-[-2px] text-[68px] font-semibold leading-none tracking-[-0.02em]" style={{ fontFamily: "-apple-system, 'SF Pro Display', system-ui, sans-serif" }}>9:41</div>
        </div>
        {/* notification */}
        <div className="absolute inset-x-2.5 bottom-[72px]">
          <div className="rounded-[20px] bg-white/[0.72] px-3 py-2.5 shadow-[0_8px_24px_-12px_rgba(0,0,0,.35)] backdrop-blur-xl" style={{ fontFamily: "-apple-system, 'SF Pro Text', system-ui, sans-serif" }}>
            <div className="flex items-start gap-2.5">
              <AppIcon brand={brand} size={36} radius={8} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[11.5px] font-medium uppercase tracking-[0.02em] text-black/50">{brand.name}</span>
                  <span className="shrink-0 text-[11.5px] text-black/45">now</span>
                </div>
                <div className="truncate text-[13px] font-semibold leading-tight text-black">{title || <span className="text-black/40">Title</span>}</div>
                <p className="mt-px line-clamp-4 break-words text-[13px] leading-[1.28] text-black/90">{body || <span className="text-black/40">Message…</span>}</p>
              </div>
            </div>
          </div>
          <div className="mx-auto mt-1.5 h-2 w-[92%] rounded-b-[16px] bg-white/35 backdrop-blur" />
        </div>
        <div className="absolute inset-x-0 bottom-2 flex justify-between px-10 pb-2">
          <span className="grid h-10 w-10 place-items-center rounded-full bg-black/25 text-white backdrop-blur"><Torch /></span>
          <span className="grid h-10 w-10 place-items-center rounded-full bg-black/25 text-white backdrop-blur"><Camera /></span>
        </div>
        <span className="absolute bottom-1.5 left-1/2 h-1 w-28 -translate-x-1/2 rounded-full bg-white/90" />
      </div>
    </div>
  );
}

/* ───────────── push: in-app bell row ───────────── */
export function BellPreview({ brand, title, body }: { brand: PreviewBrand; title: string; body: string }) {
  return (
    <div className="mx-auto w-[300px] overflow-hidden rounded-2xl border border-zinc-200 bg-white">
      <div className="flex items-center gap-2 border-b border-zinc-100 px-3.5 py-2 text-[11px] font-semibold text-zinc-500"><Bell className="h-3.5 w-3.5" />In the app · Notifications</div>
      <div className="flex items-start gap-2.5 px-3.5 py-3">
        <AppIcon brand={brand} size={30} radius={15} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2"><span className="truncate text-[13px] font-semibold text-[#14213d]">{title}</span><span className="shrink-0 text-[10.5px] text-zinc-400">Just now</span></div>
          <p className="mt-0.5 line-clamp-2 break-words text-[12px] leading-snug text-zinc-600">{body}</p>
        </div>
        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: safeHex(brand.primary) }} />
      </div>
    </div>
  );
}

/* ───────────── email: inbox frame + the real template ───────────── */
export function EmailPreview({ brand, toName, sender, subject, preheader, heading, body, ctaLabel, ctaUrl, footnote }: {
  brand: PreviewBrand; toName: string; sender: { from_name: string; from_address: string; reply_to: string | null };
  subject: string; preheader: string; heading: string | null; body: string; ctaLabel: string | null; ctaUrl: string | null; footnote: string | null;
}) {
  const from = emailFrom(sender.from_name || brand.name);
  const { html } = useMemo(() => renderEmail(
    { businessName: brand.name, logoUrl: brand.logoUrl, primary: safeHex(brand.primary), heroUrl: brand.heroUrl },
    { subject, preheader, heading, body, ctaLabel, ctaUrl, footnote, unsubscribeUrl: "#unsubscribe" },
  ), [brand, subject, preheader, heading, body, ctaLabel, ctaUrl, footnote]);

  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [scale, setScale] = useState(0.8);
  const [h, setH] = useState(640);
  useEffect(() => {
    const el = box.current; if (!el) return;
    const ro = new ResizeObserver(() => setScale(Math.min(1, el.clientWidth / 600)));
    ro.observe(el); return () => ro.disconnect();
  }, []);
  // srcDoc changes re-fire onLoad; also re-measure after webfonts/images settle.
  useEffect(() => { const t = setTimeout(() => measure(), 300); return () => clearTimeout(t); });
  const measure = () => { try { const d = frame.current?.contentDocument; if (d?.body) setH(Math.max(320, Math.ceil(d.body.getBoundingClientRect().height))); } catch { /* sandboxed */ } };

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
      {/* inbox chrome */}
      <div className="flex items-center gap-2 border-b border-zinc-100 bg-[#fafbfc] px-4 py-2 text-[11px] text-zinc-500">
        <ChevronLeft className="h-3.5 w-3.5" />Inbox<span className="ml-auto flex items-center gap-3"><Star className="h-3.5 w-3.5" /><Reply className="h-3.5 w-3.5" /></span>
      </div>
      <div className="px-4 pb-3 pt-3.5">
        <div className="text-[16px] font-semibold leading-snug text-[#14213d]">{subject || <span className="text-zinc-400">Subject</span>}</div>
        <div className="mt-3 flex items-start gap-3">
          <AppIcon brand={brand} size={36} radius={18} />
          <div className="min-w-0 flex-1 text-[12px] leading-[1.55]">
            <div className="flex items-baseline justify-between gap-2"><span className="truncate"><b className="font-semibold text-[#14213d]">{from.name}</b> <span className="text-zinc-500">&lt;{from.address}&gt;</span></span><span className="shrink-0 text-[11px] text-zinc-400">9:41 AM</span></div>
            <div className="text-zinc-500">To: <span className="text-zinc-700">{toName}</span></div>
            {sender.reply_to && <div className="text-zinc-500">Reply-to: <span className="text-zinc-700">{sender.reply_to}</span></div>}
          </div>
        </div>
        {preheader && <div className="mt-2.5 rounded-lg bg-zinc-50 px-3 py-1.5 text-[11.5px] text-zinc-500"><span className="font-semibold text-zinc-400">Preview text · </span>{preheader}</div>}
      </div>
      <div ref={box} className="overflow-hidden border-t border-zinc-100 bg-[#f4f6f6]" style={{ height: h * scale }}>
        <iframe ref={frame} title="Email preview" srcDoc={html} sandbox="allow-same-origin" onLoad={measure} scrolling="no"
          style={{ width: 600, height: h, border: 0, transform: `scale(${scale})`, transformOrigin: "top left", display: "block" }} />
      </div>
    </div>
  );
}

/* tiny iOS glyphs */
const Signal = () => <svg width="17" height="11" viewBox="0 0 17 11" fill="currentColor"><rect x="0" y="7" width="3" height="4" rx="1" /><rect x="4.5" y="5" width="3" height="6" rx="1" /><rect x="9" y="2.5" width="3" height="8.5" rx="1" /><rect x="13.5" y="0" width="3" height="11" rx="1" /></svg>;
const Wifi = () => <svg width="15" height="11" viewBox="0 0 15 11" fill="currentColor"><path d="M7.5 2.2c2.2 0 4.2.8 5.7 2.2l1.1-1.1A9.6 9.6 0 0 0 7.5.6 9.6 9.6 0 0 0 .7 3.3l1.1 1.1a8 8 0 0 1 5.7-2.2Zm0 3.2c1.3 0 2.5.5 3.4 1.3l1.1-1.1a6.5 6.5 0 0 0-9 0l1.1 1.1c.9-.8 2.1-1.3 3.4-1.3Zm0 3.2c.5 0 .9.2 1.2.5L7.5 10.3 6.3 9.1c.3-.3.7-.5 1.2-.5Z" /></svg>;
const Battery = () => <svg width="25" height="12" viewBox="0 0 25 12" fill="none"><rect x=".5" y=".5" width="21" height="11" rx="3.5" stroke="currentColor" opacity=".4" /><rect x="2" y="2" width="18" height="8" rx="2" fill="currentColor" /><rect x="23" y="4" width="1.5" height="4" rx=".75" fill="currentColor" opacity=".45" /></svg>;
const Torch = () => <svg width="14" height="18" viewBox="0 0 14 18" fill="currentColor"><path d="M2 1h10v3l-2 3v10H4V7L2 4V1Zm5 8a1 1 0 0 0-1 1v2a1 1 0 0 0 2 0v-2a1 1 0 0 0-1-1Z" /></svg>;
const Camera = () => <svg width="18" height="15" viewBox="0 0 18 15" fill="currentColor"><path d="M6 1h6l1.5 2H16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h2.5L6 1Zm3 4a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" /></svg>;
