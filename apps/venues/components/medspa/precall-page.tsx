"use client";
/**
 * components/medspa/precall-page.tsx — CP-201 · "Your call isn't confirmed yet."
 *
 * Step 1 of the 2-step sale: the visitor arrives knowing what Atlas does, how
 * the call works and (if PRICE_BEFORE_CALL is set) what it costs, so the
 * walkthrough is a fit call, not a cold pitch. CP-264: just the video, then confirm and add to calendar:
 *   1. watch the short video (progress reported to /api/landing/precall)
 *   2. tap "Yes, I'll be there" (Andrew gets an email; Meta gets CallConfirmed)
 *   3. add it to the calendar
 */
import { useEffect, useRef, useState } from "react";
import { CalendarPlus, Check, CheckCircle2, Clock, Loader2, Play, Video } from "lucide-react";
import { IntroVideo } from "@/components/medspa/intro-video"; // CP-205
import { cn } from "@/lib/utils";
import { track } from "@/lib/landing/analytics";
import { CALL_MINUTES } from "@/lib/landing/availability";
import { OceanBackground } from "@/components/site/ocean-background";

type Props = {
  token: string; firstName: string; business: string; slotStart: string; timezone: string | null; meetUrl: string | null;
  confirmed: boolean; past: boolean; video: { embed: string | null; minutes: number }; prep: string[]; priceLine: string | null;
};

const post = (token: string, action: string, extra: Record<string, unknown> = {}) =>
  fetch("/api/landing/precall", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, action, ...extra }), keepalive: true }).catch(() => null);

export function PrecallPage(p: Props) {
  const [confirmed, setConfirmed] = useState(p.confirmed);
  const [sending, setSending] = useState(false);
  const [tz, setTz] = useState(p.timezone || "America/Los_Angeles");
  useEffect(() => { try { const d = Intl.DateTimeFormat().resolvedOptions().timeZone; if (d) setTz(d); } catch { /* keep */ } }, []);
  useEffect(() => { post(p.token, "view"); track("precall_viewed", { source: "medspa_precall" }); }, [p.token]);

  const start = new Date(p.slotStart);
  const end = new Date(start.getTime() + CALL_MINUTES * 60_000);
  const day = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "long", month: "long", day: "numeric" }).format(start);
  const time = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(start);
  const g = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const gcal = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent("Atlas walkthrough with Andrew")}&dates=${g(start)}/${g(end)}&details=${encodeURIComponent(p.meetUrl ? `Video: ${p.meetUrl}` : "Andrew will send the video link.")}`;
  const ics = `data:text/calendar;charset=utf-8,${encodeURIComponent(["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Atlas Engine//Walkthrough//EN", "BEGIN:VEVENT", `UID:${p.token}@atlas-engine.app`, `DTSTAMP:${g(new Date())}`, `DTSTART:${g(start)}`, `DTEND:${g(end)}`, "SUMMARY:Atlas walkthrough with Andrew", `DESCRIPTION:${p.meetUrl ? `Video: ${p.meetUrl}` : "Andrew will send the video link."}`, ...(p.meetUrl ? [`URL:${p.meetUrl}`] : []), "END:VEVENT", "END:VCALENDAR"].join("\r\n"))}`;

  async function confirm() {
    setSending(true);
    await post(p.token, "confirm");
    track("call_confirmed", { source: "medspa_precall" });
    setConfirmed(true); setSending(false);
  }

  return (
    <div className="site min-h-screen overflow-x-clip bg-[var(--s-paper)]">
      {/* CP-202: brand ocean band (CP-230: animated loop) behind the logo and the headline */}
      <div className="s-ocean relative overflow-hidden pb-40">
        <OceanBackground eager />
        <header className="relative">
          <div className="s-wrap flex h-16 items-center justify-between">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/atlas-engine-logo.png" alt="Atlas Engine" width={1315} height={494} className="h-7 w-auto" />
            <span className="hidden text-[13px] font-semibold text-white/85 sm:block">{p.business}</span>
          </div>
        </header>
        {!p.past && (
          <div className="s-wrap relative pt-8 text-center sm:pt-12">
            <p className={cn("s-load-1 mx-auto inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] font-bold", confirmed ? "bg-emerald-50 text-emerald-700" : "bg-[#FFF3DC] text-[#8A5A0B]")}>
              {confirmed ? <><CheckCircle2 className="h-4 w-4" aria-hidden /> Confirmed. See you then.</> : <><Clock className="h-4 w-4" aria-hidden /> One step left</>}
            </p>
            <h1 className="s-display s-load-2 mx-auto mt-5 max-w-[16ch] !text-[clamp(2.1rem,1.4rem+3vw,3.6rem)] text-white">
              {confirmed ? `You're locked in${p.firstName ? `, ${p.firstName}` : ""}.` : <>Watch this, then confirm your spot{p.firstName ? `, ${p.firstName}` : ""}.</>}
            </h1>
            <p className="s-lead s-load-3 mx-auto mt-4 max-w-[34rem]">{day} at {time} · {CALL_MINUTES} min on video with Andrew</p>
          </div>
        )}
      </div>

      <main className="s-wrap relative -mt-32 pb-10 sm:pb-16">
        <div className="mx-auto max-w-[760px]">
          {p.past ? (
            <div className="s-panel p-8 text-center">
              <h1 className="s-h3">Thanks for your time{p.firstName ? `, ${p.firstName}` : ""}.</h1>
              <p className="s-body mt-3">This walkthrough has passed. Questions or next steps? Reply to any of Andrew&apos;s emails, or write <a className="font-semibold text-[var(--s-ocean)]" href="mailto:andrew@atlas-engine.app">andrew@atlas-engine.app</a>.</p>
            </div>
          ) : (
            <>
              {/* CP-264: video first (placeholder until PRECALL_VIDEO.embed is set), then confirm + calendar. */}
              <div className="s-panel s-load-3 overflow-hidden p-2 sm:p-3">
                <PrecallVideo token={p.token} embed={p.video.embed} />
              </div>
              {p.priceLine && <p className="mt-4 rounded-2xl bg-[var(--s-ice)] px-4 py-3 text-[14px] font-semibold text-[var(--s-ocean-deep)]">{p.priceLine}</p>}

              <div className="s-panel mt-5 p-5 sm:p-6">
                <div className="flex items-center gap-4">
                  <span className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-2xl", confirmed ? "bg-emerald-50 text-emerald-600" : "bg-[var(--s-ice)] text-[var(--s-ocean)]")}>{confirmed ? <CheckCircle2 className="h-6 w-6" aria-hidden /> : <Video className="h-6 w-6" aria-hidden />}</span>
                  <div className="min-w-0"><div className="text-[17px] font-bold">{day}</div><div className="text-[14px] text-[var(--s-ink-3)]">{time} · {CALL_MINUTES} min · {p.business}</div></div>
                </div>
                {!confirmed && (
                  <button type="button" onClick={confirm} disabled={sending} className="s-btn s-btn-primary s-focus mt-5 w-full disabled:opacity-60">
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}Yes, I&apos;ll be there
                  </button>
                )}
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <a href={gcal} target="_blank" rel="noopener" className="s-btn s-btn-quiet s-focus !h-11 text-[14px]"><CalendarPlus className="h-4 w-4" aria-hidden />Google Calendar</a>
                  <a href={ics} download="atlas-walkthrough.ics" className="s-btn s-btn-quiet s-focus !h-11 text-[14px]"><CalendarPlus className="h-4 w-4" aria-hidden />Apple / Outlook</a>
                </div>
                {p.meetUrl && <a href={p.meetUrl} target="_blank" rel="noopener" className="mt-3 block text-center text-[14px] font-semibold text-[var(--s-ocean)] underline">Your video link</a>}
              </div>
              <p className="s-small mt-5 text-center">Need a different time? Reply to your confirmation email or write <a className="font-semibold text-[var(--s-ocean)]" href="mailto:andrew@atlas-engine.app">andrew@atlas-engine.app</a>.</p>
            </>
          )}
        </div>
      </main>
      <footer className="s-wrap pb-10 text-center text-[13px] text-[var(--s-ink-3)]">© {new Date().getFullYear()} Atlas Engine · Bakersfield · Morro Bay, California · <a className="underline" href="/legal/privacy">Privacy</a> · <a className="underline" href="/legal/terms">Terms</a> · <a className="underline" href="/legal/privacy#choices">Your privacy choices</a></footer>
    </div>
  );
}

/** The video. Loads the player only after a tap; Vimeo progress is reported at 25/50/75/100%. */
function PrecallVideo({ token, embed }: { token: string; embed: string | null }) {
  const [playing, setPlaying] = useState(false);
  const best = useRef(0);
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    if (!playing || !embed || !/vimeo\.com/.test(embed)) return;
    const report = (pct: number) => {
      const step = Math.floor(pct / 25) * 25;
      if (step > best.current) { best.current = step; post(token, "video", { pct: step }); track("precall_video", { source: "medspa_precall", pct: step }); }
    };
    const onMsg = (e: MessageEvent) => {
      if (!/vimeo\.com$/.test(new URL(e.origin).hostname)) return;
      let d: { event?: string; data?: { percent?: number } } = {};
      try { d = typeof e.data === "string" ? JSON.parse(e.data) : e.data; } catch { return; }
      if (d.event === "ready") ["timeupdate", "ended"].forEach((value) => frame.current?.contentWindow?.postMessage(JSON.stringify({ method: "addEventListener", value }), "*"));
      if (d.event === "timeupdate" && d.data?.percent != null) report(d.data.percent * 100);
      if (d.event === "ended") report(100);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [playing, embed, token]);

  if (!embed) {
    // CP-205: the Atlas logo animation + an end card until PRECALL_VIDEO.embed is set (the written version shows underneath).
    return <IntroVideo where="medspa_precall" tall={false} rounded="rounded-2xl" eyebrow="Video coming soon" title="Watch this before your call." body="A short video from Andrew: what happens on the call and what you walk away with." />;
  }
  const src = `${embed}${embed.includes("?") ? "&" : "?"}autoplay=1&playsinline=1&api=1`;
  return (
    <div className="relative aspect-video overflow-hidden rounded-2xl bg-[var(--s-ocean-deep)]">
      {playing ? (
        <iframe ref={frame} src={src} title="Before your call" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen className="absolute inset-0 h-full w-full" />
      ) : (
        <button type="button" onClick={() => { setPlaying(true); post(token, "video", { pct: 1 }); track("precall_video", { source: "medspa_precall", pct: 0 }); }} className="s-ocean s-focus absolute inset-0 grid place-items-center" aria-label="Play the video">
          <span className="s-ocean-img opacity-70" aria-hidden />
          <span className="relative grid h-16 w-16 place-items-center rounded-full bg-white text-[var(--s-ocean)] shadow-xl"><Play className="ml-1 h-7 w-7 fill-current" aria-hidden /></span>
        </button>
      )}
    </div>
  );
}
