"use client";
/**
 * components/medspa/precall-page.tsx — CP-201 · "Your call isn't confirmed yet."
 *
 * Step 1 of the 2-step sale: the visitor arrives knowing what Atlas does, how
 * the call works and (if PRICE_BEFORE_CALL is set) what it costs, so the
 * walkthrough is a fit call, not a cold pitch. Three things to do here:
 *   1. watch the short video (progress reported to /api/landing/precall)
 *   2. tap "Yes, I'll be there" (Andrew gets an email; Meta gets CallConfirmed)
 *   3. add it to the calendar
 */
import { useEffect, useRef, useState } from "react";
import { CalendarPlus, Check, CheckCircle2, Clock, Loader2, Play, Video } from "lucide-react";
import { cn } from "@/lib/utils";
import { track } from "@/lib/landing/analytics";
import { CALL_MINUTES } from "@/lib/landing/availability";

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
      <header className="border-b border-[var(--s-line)] bg-white/80 backdrop-blur-xl">
        <div className="s-wrap flex h-16 items-center justify-between">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/landing/atlas-engine-logo-navy.png" alt="Atlas Engine" width={1315} height={494} className="h-7 w-auto" />
          <span className="hidden text-[13px] font-semibold text-[var(--s-ink-3)] sm:block">{p.business}</span>
        </div>
      </header>

      <main className="s-wrap py-10 sm:py-16">
        <div className="mx-auto max-w-[760px]">
          {p.past ? (
            <div className="s-panel p-8 text-center">
              <h1 className="s-h3">Thanks for your time{p.firstName ? `, ${p.firstName}` : ""}.</h1>
              <p className="s-body mt-3">This walkthrough has passed. Questions or next steps? Reply to any of Andrew&apos;s emails, or write <a className="font-semibold text-[var(--s-ocean)]" href="mailto:andrew@atlas-engine.app">andrew@atlas-engine.app</a>.</p>
            </div>
          ) : (
            <>
              <div className="text-center">
                <p className={cn("s-load-1 mx-auto inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] font-bold", confirmed ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200" : "bg-[#FFF3DC] text-[#8A5A0B] ring-1 ring-[#F5D9A6]")}>
                  {confirmed ? <><CheckCircle2 className="h-4 w-4" aria-hidden /> Confirmed. See you then.</> : <><Clock className="h-4 w-4" aria-hidden /> One step left</>}
                </p>
                <h1 className="s-display s-load-2 mx-auto mt-5 max-w-[16ch] !text-[clamp(2.1rem,1.4rem+3vw,3.6rem)]">
                  {confirmed ? `You're all set${p.firstName ? `, ${p.firstName}` : ""}.` : <>Your call isn&apos;t confirmed yet{p.firstName ? `, ${p.firstName}` : ""}.</>}
                </h1>
                <p className="s-lead s-load-3 mx-auto mt-4 max-w-[34rem]">{confirmed ? "Andrew will bring your app and your numbers. Here's everything in one place." : `Watch the short video, then tap confirm so Andrew holds ${day} for ${p.business}.`}</p>
              </div>

              <div className="s-panel s-load-3 mt-8 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                <div className="flex items-center gap-4">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[var(--s-ice)] text-[var(--s-ocean)]"><Video className="h-6 w-6" aria-hidden /></span>
                  <div><div className="text-[17px] font-bold">{day}</div><div className="text-[14px] text-[var(--s-ink-3)]">{time} · {CALL_MINUTES} min on video with Andrew</div></div>
                </div>
                {p.meetUrl && <a href={p.meetUrl} target="_blank" rel="noopener" className="s-btn s-btn-quiet s-focus !h-11 text-[14px]">Video link</a>}
              </div>

              <ol className="mt-10 space-y-5">
                <Step n={1} done={false} title="Watch this first" sub={`${p.video.minutes} minutes: what Atlas does, how the call works${p.priceLine ? ", what it costs" : ""}.`}>
                  <PrecallVideo token={p.token} embed={p.video.embed} />
                  {!p.video.embed && (
                    <ul className="mt-4 grid gap-3 sm:grid-cols-3">
                      {[["What Atlas is", "Your practice's own patient app: due-date reminders, memberships billed to your Stripe, rewards, and a front-desk list of who to call."], ["What the call is", "Not a pitch. Andrew shows the app he built for you, checks your numbers, and you decide if it's a fit."], ["What happens after", "If it's a yes, you're live at checkout in about a week. Month to month, cancel anytime."]].map(([t, d]) => (
                        <li key={t} className="rounded-2xl bg-[var(--s-paper)] p-4 ring-1 ring-[var(--s-line)]"><div className="text-[14px] font-bold">{t}</div><p className="mt-1 text-[13.5px] leading-relaxed text-[var(--s-ink-2)]">{d}</p></li>
                      ))}
                    </ul>
                  )}
                  {p.priceLine && <p className="mt-4 rounded-2xl bg-[var(--s-ice)] px-4 py-3 text-[14px] font-semibold text-[var(--s-ocean-deep)]">{p.priceLine}</p>}
                </Step>

                <Step n={2} done={confirmed} title={confirmed ? "Confirmed" : "Confirm you'll be there"} sub={confirmed ? "Andrew has your spot held." : "So Andrew knows to hold the time. It takes one tap."}>
                  {!confirmed && (
                    <button type="button" onClick={confirm} disabled={sending} className="s-btn s-btn-primary s-focus mt-1 disabled:opacity-60">
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Check className="h-4 w-4" aria-hidden />}Yes, I&apos;ll be there
                    </button>
                  )}
                </Step>

                <Step n={3} done={false} title="Add it to your calendar" sub="The invite from andrew@atlas-engine.app works too.">
                  <div className="mt-1 flex flex-wrap gap-2">
                    <a href={gcal} target="_blank" rel="noopener" className="s-btn s-btn-quiet s-focus !h-11 text-[14px]"><CalendarPlus className="h-4 w-4" aria-hidden />Google Calendar</a>
                    <a href={ics} download="atlas-walkthrough.ics" className="s-btn s-btn-quiet s-focus !h-11 text-[14px]"><CalendarPlus className="h-4 w-4" aria-hidden />Apple / Outlook</a>
                  </div>
                </Step>
              </ol>

              <section className="s-panel mt-10 p-6 sm:p-8" aria-labelledby="prep-title">
                <h2 id="prep-title" className="s-h3">To get the most out of 20 minutes</h2>
                <ul className="mt-4 space-y-3">
                  {p.prep.map((t) => <li key={t} className="flex gap-3 text-[15px] text-[var(--s-ink-2)]"><span className="mt-1 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[var(--s-ice)] text-[var(--s-ocean)]"><Check className="h-3 w-3" strokeWidth={3} aria-hidden /></span>{t}</li>)}
                </ul>
                <p className="s-small mt-6">Need a different time? Reply to your confirmation email or write <a className="font-semibold text-[var(--s-ocean)]" href="mailto:andrew@atlas-engine.app">andrew@atlas-engine.app</a>.</p>
              </section>
            </>
          )}
        </div>
      </main>
      <footer className="s-wrap pb-10 text-center text-[13px] text-[var(--s-ink-3)]">© {new Date().getFullYear()} Atlas Engine · Bakersfield · Morro Bay, California</footer>
    </div>
  );
}

function Step({ n, done, title, sub, children }: { n: number; done: boolean; title: string; sub: string; children?: React.ReactNode }) {
  return (
    <li className="s-panel flex gap-4 p-5 sm:p-6">
      <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full text-[15px] font-bold", done ? "bg-emerald-500 text-white" : "bg-[var(--s-ocean)] text-white")}>{done ? <Check className="h-4 w-4" strokeWidth={3} aria-hidden /> : n}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[17px] font-bold">{title}</div>
        <p className="mt-0.5 text-[14px] text-[var(--s-ink-3)]">{sub}</p>
        {children && <div className="mt-4">{children}</div>}
      </div>
    </li>
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

  if (!embed) return null;
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
