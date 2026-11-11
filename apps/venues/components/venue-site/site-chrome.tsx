"use client";
/**
 * Small interactive pieces of the venue website: the sticky nav with its
 * mobile menu, the live "Open now" chip, videos with a sound toggle, and the
 * scroll reveal. Everything else on the page is server-rendered.
 */
import { useEffect, useRef, useState } from "react";
import { Menu, Phone, Volume2, VolumeX, X, Play } from "lucide-react";
import type { HoursRow, MenuSection } from "@/lib/venue-site/content";
import { ampm, to12 } from "@/lib/venue-site/hours";
import { openBooking } from "./site-booking";
import { cn } from "@/lib/utils";

const fmtPhone = (raw: string) => {
  const d = raw.replace(/\D/g, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : raw;
};

/* ── Open now ──────────────────────────────────────────────────────── */

/** "Open now · till 8pm" / "Closed · opens 11am". Rendered after mount so server and browser agree. */
export function OpenNow({ hours, timezone, className }: { hours: HoursRow[]; timezone: string; className?: string }) {
  const [label, setLabel] = useState<{ open: boolean; text: string } | null>(null);
  useEffect(() => {
    const calc = () => {
      const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
      const wd = parts.find(p => p.type === "weekday")?.value ?? "Mon";
      const iso = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(wd) + 1;
      const hh = Number(parts.find(p => p.type === "hour")?.value ?? 0) % 24;
      const mm = Number(parts.find(p => p.type === "minute")?.value ?? 0);
      const now = hh * 60 + mm;
      const mins = (s: string) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
      const today = hours.find(r => r.isoDays.includes(iso));
      if (today && now >= mins(today.open) && now < mins(today.close)) {
        setLabel({ open: true, text: `Open now · till ${to12(today.close)}${ampm(today.close)}` });
        return;
      }
      if (today && now < mins(today.open)) { setLabel({ open: false, text: `Closed · opens ${to12(today.open)}${ampm(today.open)}` }); return; }
      const tomorrow = hours.find(r => r.isoDays.includes((iso % 7) + 1));
      setLabel({ open: false, text: tomorrow ? `Closed · opens ${to12(tomorrow.open)}${ampm(tomorrow.open)} tomorrow` : "Closed today" });
    };
    calc();
    const t = setInterval(calc, 60_000);
    return () => clearInterval(t);
  }, [hours, timezone]);
  if (!label) return <span className={cn("inline-block h-[22px] w-28", className)} />;
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap", className)}>
      <span className={cn("h-2 w-2 rounded-full", label.open ? "bg-emerald-400 shadow-[0_0_0_3px_rgba(52,211,153,0.25)]" : "bg-rose-400")} />
      {label.text}
    </span>
  );
}

/* ── Nav ───────────────────────────────────────────────────────────── */

export function SiteNav({ logoUrl, name, phone, links }: { logoUrl: string | null; name: string; phone: string; links: Array<{ href: string; label: string }> }) {
  const [solid, setSolid] = useState(false);
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    const on = () => setSolid(window.scrollY > 40);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMenu(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);

  return (
    <header className={cn("sticky top-0 z-50 transition-colors duration-300", solid || menu ? "bg-white/95 shadow-[0_8px_30px_-18px_rgba(11,37,64,0.5)] backdrop-blur" : "bg-white")}>
      <nav className="mx-auto flex h-[68px] max-w-[1200px] items-center gap-4 px-4 sm:px-6" aria-label="Main">
        <a href="#top" className="flex shrink-0 items-center" aria-label={`${name} home`}>
          {logoUrl
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={logoUrl} alt={name} className="h-12 w-auto object-contain" />
            : <span className="font-display text-2xl font-extrabold">{name}</span>}
        </a>
        <ul className="ml-2 hidden items-center gap-0.5 lg:flex">
          {links.map(l => (
            <li key={l.href}><a href={l.href} className="whitespace-nowrap rounded-full px-3 py-2 text-[15px] font-bold text-[var(--vs-ink)]/80 transition hover:bg-[var(--vs-sky-soft)] hover:text-[var(--vs-ink)]">{l.label}</a></li>
          ))}
        </ul>
        <div className="ml-auto flex items-center gap-2">
          <a href={`tel:${phone}`} className="hidden items-center gap-2 whitespace-nowrap rounded-full px-3 py-2 text-[15px] font-extrabold tabular-nums text-[var(--vs-ink)] hover:bg-[var(--vs-sky-soft)] md:inline-flex lg:hidden xl:inline-flex">
            <Phone className="h-4 w-4 text-[var(--vs-blue)]" /> {fmtPhone(phone)}
          </a>
          <button type="button" onClick={() => openBooking()} className="h-11 whitespace-nowrap rounded-full bg-[var(--vs-red)] px-5 text-[15px] font-extrabold text-white shadow-[0_10px_24px_-12px_var(--vs-red)] transition hover:brightness-105 active:scale-[0.98]">
            Book now
          </button>
          <button type="button" onClick={() => setMenu(m => !m)} aria-expanded={menu} aria-controls="vs-mobile-menu" aria-label={menu ? "Close menu" : "Open menu"}
            className="flex h-11 w-11 items-center justify-center rounded-full ring-1 ring-[var(--vs-line)] lg:hidden">
            {menu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>
      {menu && (
        <div id="vs-mobile-menu" className="border-t border-[var(--vs-line)] bg-white px-4 pb-5 pt-2 lg:hidden">
          <ul className="grid gap-1">
            {links.map(l => (
              <li key={l.href}><a href={l.href} onClick={() => setMenu(false)} className="block rounded-2xl px-4 py-3 font-display text-[19px] font-extrabold hover:bg-[var(--vs-sky-soft)]">{l.label}</a></li>
            ))}
          </ul>
          <a href={`tel:${phone}`} className="mt-3 flex h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--vs-sky-soft)] text-[16px] font-extrabold tabular-nums">
            <Phone className="h-4 w-4 text-[var(--vs-blue)]" /> Call {fmtPhone(phone)}
          </a>
        </div>
      )}
    </header>
  );
}

/* ── Video ─────────────────────────────────────────────────────────── */

/** Autoplays muted on loop (unless reduced motion), with an optional sound toggle. */
export function LoopVideo({ src, poster, className, sound = false, label, decorative = false }: { src: string; poster: string; className?: string; sound?: boolean; label: string; decorative?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    // React doesn't always reflect `muted` onto the element, and browsers only autoplay muted video.
    v.muted = true; v.defaultMuted = true;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { v.pause(); setPaused(true); return; }
    // Only play while on screen: saves battery and data on phones.
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) v.play().then(() => setPaused(false)).catch(() => setPaused(true));
      else v.pause();
    }, { threshold: 0.15 });
    io.observe(v);
    return () => io.disconnect();
  }, []);
  return (
    <div className="relative h-full w-full">
      <video ref={ref} src={src} poster={poster} muted={muted} loop playsInline autoPlay={false} preload="metadata" aria-label={label} aria-hidden={decorative || undefined} className={className} />
      {paused && !decorative && (
        <button type="button" onClick={() => { ref.current?.play(); setPaused(false); }} aria-label={`Play ${label}`}
          className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[var(--vs-ink)] shadow-xl">
          <Play className="ml-1 h-7 w-7" />
        </button>
      )}
      {sound && (
        <button type="button" onClick={() => { const v = ref.current; if (!v) return; v.muted = !muted; setMuted(!muted); if (v.paused) v.play(); }}
          aria-label={muted ? "Turn sound on" : "Turn sound off"}
          className="absolute bottom-3 right-3 flex h-10 items-center gap-1.5 rounded-full bg-black/55 px-3 text-[12px] font-bold text-white backdrop-blur hover:bg-black/70">
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />} {muted ? "Sound on" : "Mute"}
        </button>
      )}
    </div>
  );
}

/* ── Scroll reveal ─────────────────────────────────────────────────── */

export function RevealOnScroll() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(".vs-reveal"));
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
      els.forEach(e => e.classList.add("is-in"));
      return;
    }
    document.documentElement.classList.add("vs-js");
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    els.forEach(e => io.observe(e));
    return () => io.disconnect();
  }, []);
  return null;
}

/* ── Menu board ────────────────────────────────────────────────────── */

/** Phones: chips + one menu section at a time. Wider screens: every section in two columns. */
export function MenuBoard({ sections }: { sections: MenuSection[] }) {
  const [active, setActive] = useState(0);
  return (
    <>
      <div className="-mx-5 mb-4 overflow-x-auto px-5 sm:hidden" style={{ scrollbarWidth: "none" }}>
        <div role="tablist" aria-label="Menu sections" className="flex w-max gap-2">
          {sections.map((s, i) => (
            <button key={s.title} type="button" role="tab" aria-selected={i === active} onClick={() => setActive(i)}
              className={cn("h-10 shrink-0 rounded-full px-4 text-[14px] font-extrabold transition", i === active ? "bg-[var(--vs-ink)] text-white" : "bg-[#fff8dc] text-[var(--vs-ink)]")}>
              {s.title}
            </button>
          ))}
        </div>
      </div>
      <div className="columns-1 gap-8 sm:columns-2">
        {sections.map((s, i) => (
          <div key={s.title} className={cn("mb-7 break-inside-avoid", i === active ? "block" : "hidden sm:block")}>
            <div className="border-b-2 border-[var(--vs-sun)] pb-1.5">
              {s.soon && <span className="mb-1 inline-block rounded-full bg-[var(--vs-sun)] px-2 py-0.5 text-[10px] font-black uppercase">Coming soon</span>}
              <h3 className="font-display text-[20px] font-extrabold">{s.title}</h3>
            </div>
            {s.note && <div className="mt-1 text-[12px] text-[var(--vs-ink)]/55">{s.note}</div>}
            <ul className="mt-2 grid gap-2 sm:gap-1.5">
              {s.items.map(it => (
                <li key={it.name} className="flex items-baseline gap-2 text-[16px] sm:text-[15px]">
                  <span>{it.name}</span>
                  {it.price && <><span className="flex-1 border-b border-dotted border-[var(--vs-ink)]/20" /><span className="font-bold tabular-nums">{it.price}</span></>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </>
  );
}

/* ── Sticky booking bar (phones) ───────────────────────────────────── */

/** Slides up once the hero is out of view, so booking is always one thumb-tap away. */
export function MobileBookBar({ phone }: { phone: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const on = () => {
      const nearEnd = window.innerHeight + window.scrollY > document.documentElement.scrollHeight - 220;
      setShow(window.scrollY > 640 && !nearEnd);
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <div aria-hidden={!show}
      className={cn("fixed inset-x-0 bottom-0 z-40 border-t border-[var(--vs-line)] bg-white/95 px-4 pt-2.5 backdrop-blur transition-transform duration-300 md:hidden",
        "pb-[max(10px,env(safe-area-inset-bottom))]", show ? "translate-y-0" : "pointer-events-none translate-y-full")}>
      <div className="flex items-center gap-2.5">
        <a href={`tel:${phone}`} tabIndex={show ? 0 : -1} aria-label="Call us"
          className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl bg-[var(--vs-sky-soft)] text-[var(--vs-blue)]">
          <Phone className="h-5 w-5" />
        </a>
        <button type="button" tabIndex={show ? 0 : -1} onClick={() => openBooking()}
          className="h-[52px] flex-1 rounded-2xl bg-[var(--vs-red)] text-[17px] font-extrabold text-white shadow-[0_10px_24px_-12px_var(--vs-red)] active:scale-[0.99]">
          Book a cage, table or party
        </button>
      </div>
    </div>
  );
}
