"use client";
/**
 * Desk → Home → "Get started" (CP-238, managers). What a new owner sees first,
 * Dermis-style, so the next step is never a guess:
 *
 *   1. Three onboarding cards with a picture each: import treatments, connect
 *      booking, set up payments.
 *   2. A setup checklist (7 steps) with a progress bar and one "Next up" row.
 *   3. "Your access" card: what they have right now (preview / demo / live),
 *      what going live includes, and the one button that moves them forward.
 *   4. The explainer video.
 *
 * Once every step is done (live clinics only: a preview can't "go live" by itself),
 * the checklist and access card disappear and the three cards + video move under the
 * dashboard as "Your setup", so Home leads with the numbers.
 *
 * Done-ness: on a live clinic each step reads real data (treatments, booking,
 * rewards, automated offers, Stripe payouts). A preview or the demo saves
 * nothing, so there a step counts as done once the owner has opened it
 * (remembered in this browser only).
 */
import { useEffect, useMemo, useState } from "react";
import type { DeskApi } from "@/lib/desk-api";
import { IcCalendar, IcCard, IcCheck, IcClose, IcNext } from "../icons";

/** Where a step sends the owner. DeskApp maps these to a desk view or an App Builder section. */
export type SetupTarget = "treatments" | "booking" | "rewards" | "gifts" | "payouts" | "memberships";

export type GoLive = {
  /** preview = instant app preview (pv-…), demo = the built-in demo clinic, live = a real clinic. */
  kind: "preview" | "demo" | "live";
  /** Book a walkthrough (previews: the /medspa calendar, which holds their area). */
  walkthroughUrl: string;
  /** Self-serve activation, only when checkout is switched on (PREVIEW_SHOW_CHECKOUT=1 + STRIPE_FOUNDING_CHECKOUT_URL). */
  activateUrl: string | null;
  /** Previews only: when the preview is deleted. */
  expiresAt: string | null;
  helpEmail: string;
};

/**
 * The homepage explainer. TEMPORARY: this is the Dermis reference video, kept
 * only so the layout can be previewed. `internal: true` hides it from real
 * owners in production (Atlas admins, the demo clinic and local dev still see
 * it). Swap in the Atlas explainer's YouTube id and set internal to false.
 */
export const EXPLAINER = { youtubeId: "s_AEjkfhL2Q", title: "How Atlas works", internal: true };

type Cfg = {
  treatments?: unknown[];
  booking?: { default_url?: string; method?: string };
  memberships?: unknown[];
};

type Step = { id: string; title: string; sub: string; target?: SetupTarget; href?: string; done: boolean };

const card = "rounded-[18px] bg-white shadow-[0_10px_30px_-26px_rgba(23,27,38,.5)]";
const readSeen = (key: string): string[] => { try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; } };

type SetupProps = { api: DeskApi; slug: string; appName: string; cfg: Cfg; goLive: GoLive; isAdmin: boolean; onGo: (t: SetupTarget) => void };

function useSetup({ api, slug, cfg, goLive, onGo }: SetupProps) {
  const sandbox = goLive.kind !== "live";
  const seenKey = `atlas-setup:${slug}`;
  const hideKey = `atlas-setup-hidden:${slug}`;
  const [seen, setSeen] = useState<string[]>([]);
  const [hidden, setHidden] = useState(false);
  const [live, setLive] = useState<{ rewards: boolean; gifts: boolean; payouts: boolean } | null>(null);

  useEffect(() => {
    setSeen(readSeen(seenKey));
    try { setHidden(localStorage.getItem(hideKey) === "1"); } catch { /* private mode */ }
  }, [seenKey, hideKey]);

  useEffect(() => {
    if (sandbox) return;
    let off = false;
    Promise.all([
      api.rewardsList().then((r) => r.some((x) => x.is_active)).catch(() => false),
      api.giftOffers().then((g) => g.some((x) => x.is_active)).catch(() => false),
      api.payoutStatus().then((p) => !!p?.charges_enabled).catch(() => false),
    ]).then(([rewards, gifts, payouts]) => { if (!off) setLive({ rewards, gifts, payouts }); });
    return () => { off = true; };
  }, [api, sandbox]);

  const has = (id: string, real: boolean) => (sandbox ? seen.includes(id) : real);
  const bookingSet = !!(cfg.booking?.method || cfg.booking?.default_url);
  const steps: Step[] = useMemo(() => [
    { id: "built", title: "Your app is built", sub: "Logo, colors and treatments from your website.", href: `/${slug}`, done: true },
    { id: "treatments", title: "Check your treatments", sub: "We brought in your menu. Check prices, photos and when patients are due again.", target: "treatments", done: has("treatments", (cfg.treatments?.length ?? 0) > 0) },
    { id: "booking", title: "Connect your booking", sub: "Your booking link, or text and call. Patients book in one tap.", target: "booking", done: has("booking", bookingSet) },
    { id: "rewards", title: "Pick your rewards", sub: "What patients earn for visits, reviews and referrals.", target: "rewards", done: has("rewards", !!live?.rewards) },
    { id: "gifts", title: "Turn on automatic follow-up", sub: "Birthday, win-back and welcome gifts send themselves.", target: "gifts", done: has("gifts", !!live?.gifts) },
    { id: "payouts", title: "Set up payments", sub: "Memberships and shop sales pay out to your own bank.", target: "payouts", done: has("payouts", !!live?.payouts) },
    goLive.kind === "live"
      ? { id: "live", title: "Go live", sub: "Your app is live for patients.", done: true }
      : { id: "live", title: "Go live", sub: "A 15-minute walkthrough: we switch it on with you.", href: goLive.walkthroughUrl, done: false },
  ], [slug, cfg, bookingSet, live, goLive, seen]); // eslint-disable-line react-hooks/exhaustive-deps

  const doneCount = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done) ?? null;
  const allDone = !next;

  const go = (s: Step | { id: string; target?: SetupTarget; href?: string }) => {
    if (sandbox && s.target && !seen.includes(s.id)) {
      const n = [...seen, s.id]; setSeen(n);
      try { localStorage.setItem(seenKey, JSON.stringify(n)); } catch { /* private mode */ }
    }
    if (s.target) onGo(s.target);
    else if (s.href) window.open(s.href, "_blank", "noopener,noreferrer");
  };
  const hide = (v: boolean) => { setHidden(v); try { localStorage.setItem(hideKey, v ? "1" : "0"); } catch { /* private mode */ } };

  const byId = (id: string) => steps.find((s) => s.id === id)!;
  // Live clinics read their data first, so the checklist never flashes on a finished desk.
  const ready = sandbox || live !== null;
  return { sandbox, steps, doneCount, next, allDone, go, hidden, hide, byId, ready };
}
type Setup = ReturnType<typeof useSetup>;

/**
 * Home with setup around the dashboard: setup on top while there's something left to do,
 * "Your setup" (the three cards + video) underneath once it's all done.
 */
export function SetupHome(props: SetupProps & { children: React.ReactNode }) {
  const setup = useSetup(props);
  const done = setup.ready && setup.allDone;
  return (
    <>
      {setup.ready && !done && <GetStarted setup={setup} {...props} />}
      {props.children}
      {done && <SetupFooter setup={setup} {...props} />}
    </>
  );
}

function SetupFooter({ setup, goLive, isAdmin }: SetupProps & { setup: Setup }) {
  const showVideo = !EXPLAINER.internal || isAdmin || goLive.kind === "demo" || process.env.NODE_ENV !== "production";
  return (
    <section className="mt-6 space-y-3.5" aria-labelledby="setup-footer-h">
      <div className="flex items-center gap-2 px-1">
        <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-white"><IcCheck className="h-3 w-3" strokeWidth={3} /></span>
        <h2 id="setup-footer-h" className="text-[15px] font-semibold">Your setup</h2>
        <span className="text-[12.5px] text-sub">All {setup.steps.length} steps done. Revisit anything here.</span>
      </div>
      <SetupCards setup={setup} />
      {showVideo && <div className="max-w-[560px]"><VideoCard /></div>}
    </section>
  );
}

function SetupCards({ setup }: { setup: Setup }) {
  const { byId, go } = setup;
  return (
    <div className="grid gap-3.5 md:grid-cols-3">
      <SetupCard title="Your treatment menu" sub="We brought in your menu from your website. Check prices, photos and recall timing." button="Review treatments" done={byId("treatments").done} onClick={() => go(byId("treatments"))} art={<ArtTreatments />} />
      <SetupCard title="Connect your booking" sub="Send patients to the booking page you already use, or let them text you." button="Connect booking" done={byId("booking").done} onClick={() => go(byId("booking"))} art={<ArtBooking />} />
      <SetupCard title="Set up payments" sub="Connect your bank so patients can pay by card or over time." button="Activate payments" done={byId("payouts").done} onClick={() => go(byId("payouts"))} art={<ArtPayments />} />
    </div>
  );
}

function VideoCard() {
  return (
    <section className={`${card} overflow-hidden`}>
      <div className="relative aspect-video bg-ink">
        <iframe className="absolute inset-0 h-full w-full" src={`https://www.youtube-nocookie.com/embed/${EXPLAINER.youtubeId}?rel=0&modestbranding=1`} title={EXPLAINER.title}
          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen loading="lazy" />
      </div>
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <span className="text-[13.5px] font-semibold">{EXPLAINER.title} · 3 min</span>
        {EXPLAINER.internal && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800" title="Reference video. Only Atlas admins, the demo and local dev see it.">Placeholder</span>}
      </div>
    </section>
  );
}

function GetStarted({ setup, appName, goLive, isAdmin }: SetupProps & { setup: Setup }) {
  const { sandbox, steps, doneCount, next, allDone, go, hidden, hide } = setup;
  if (hidden) {
    return (
      <button type="button" onClick={() => hide(false)} className={`${card} mb-3.5 flex w-full items-center gap-3 px-4 py-3 text-left`}>
        <Ring done={doneCount} total={steps.length} />
        <span className="flex-1 text-[13.5px] font-semibold">Setup · {doneCount} of {steps.length} done</span>
        <span className="text-[12.5px] font-semibold text-brand">Show</span>
      </button>
    );
  }

  const showVideo = !EXPLAINER.internal || isAdmin || goLive.kind === "demo" || process.env.NODE_ENV !== "production";

  return (
    <div className="mb-3.5 space-y-3.5">
      {/* 1 · three onboarding cards */}
      <SetupCards setup={setup} />

      <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        {/* 2 · checklist */}
        <section className={`${card} p-4`} aria-labelledby="setup-h">
          <div className="flex items-center gap-3 px-1">
            <Ring done={doneCount} total={steps.length} />
            <div className="min-w-0 flex-1">
              <h2 id="setup-h" className="text-[15px] font-semibold">{allDone ? "You're all set" : "Finish setting up"}</h2>
              <p className="text-[12.5px] text-sub">{doneCount} of {steps.length} done{next ? ` · next: ${next.title.toLowerCase()}` : ""}</p>
            </div>
            <button type="button" onClick={() => hide(true)} aria-label="Hide setup" className="grid h-8 w-8 place-items-center rounded-full text-faint hover:bg-page hover:text-ink"><IcClose className="h-3.5 w-3.5" /></button>
          </div>
          <div className="mx-1 mt-3 h-1.5 overflow-hidden rounded-full bg-[#EEF0F1]" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={doneCount} aria-label="Setup progress">
            <div className="h-full rounded-full bg-brand transition-all duration-500" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
          </div>
          <ol className="mt-3 space-y-1">
            {steps.map((s, i) => {
              const isNext = next?.id === s.id;
              const clickable = !!(s.target || s.href);
              return (
                <li key={s.id}>
                  <button type="button" disabled={!clickable} onClick={() => go(s)}
                    className={`flex w-full items-center gap-3 rounded-[12px] border px-3 py-2.5 text-left transition ${isNext ? "border-brand/30 bg-brand/[.06]" : "border-transparent hover:bg-page"} ${clickable ? "" : "cursor-default"}`}>
                    <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11.5px] font-bold ${s.done ? "bg-brand text-white" : isNext ? "bg-white text-brand ring-[1.5px] ring-brand" : "bg-[#EEF0F1] text-sub"}`}>
                      {s.done ? <IcCheck className="h-3.5 w-3.5" strokeWidth={2.6} /> : i + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={`block text-[13.5px] font-semibold ${s.done ? "text-sub line-through decoration-[#C9CCD1]" : ""}`}>{s.title}</span>
                      {!s.done && <span className="block text-[12.5px] leading-snug text-sub">{s.sub}</span>}
                    </span>
                    {isNext && <span className="hidden shrink-0 rounded-full bg-brand px-2.5 py-1 text-[11.5px] font-semibold text-white sm:inline">Next up</span>}
                    {clickable && <IcNext className="h-3.5 w-3.5 shrink-0 text-faint" strokeWidth={2.2} />}
                  </button>
                </li>
              );
            })}
          </ol>
          {sandbox && <p className="mt-2 px-1 text-[12px] text-faint">In {goLive.kind === "preview" ? "a preview" : "the demo"}, a step ticks off once you open it. Nothing you change is saved.</p>}
        </section>

        {/* 3 · access + 4 · video */}
        <div className="min-w-0 space-y-3.5">
          <AccessCard goLive={goLive} appName={appName} doneCount={doneCount} total={steps.length} />
          {showVideo && <VideoCard />}
        </div>
      </div>
    </div>
  );
}

/* ───────────── Your access ───────────── */

const INCLUDED = [
  "Your branded patient app, on every patient's phone",
  "Recall reminders, memberships, rewards and gifts, all on",
  "We import your menu, set it up and train your team (about 15 min)",
  "Month to month. Cancel anytime.",
];

function AccessCard({ goLive, appName, doneCount, total }: { goLive: GoLive; appName: string; doneCount: number; total: number }) {
  const until = goLive.expiresAt ? new Date(goLive.expiresAt).toLocaleDateString("en-US", { month: "long", day: "numeric" }) : null;
  if (goLive.kind === "live") {
    return (
      <section className={`${card} p-4`}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold">Your access</h2>
          <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11.5px] font-semibold text-emerald-700">Full access</span>
        </div>
        <p className="mt-1.5 text-[13px] leading-snug text-sub">{appName} is live. Every feature is on; finish the checklist so patients get the most from it.</p>
        <a href={`mailto:${goLive.helpEmail}?subject=${encodeURIComponent(`Help setting up ${appName}`)}`} className="mt-3 inline-flex h-9 items-center rounded-full bg-ink px-4 text-[13px] font-semibold text-white">Get help setting up</a>
      </section>
    );
  }
  // Preview / demo. One primary button: the walkthrough, until there's a checkout and
  // the owner has done most of setup; then "Activate" leads and the walkthrough stays as the safety net.
  const activateFirst = !!goLive.activateUrl && doneCount >= Math.ceil(total / 2);
  const walk = <a href={goLive.walkthroughUrl} target="_blank" rel="noopener noreferrer" className={`inline-flex h-10 items-center justify-center rounded-full px-4 text-[13.5px] font-semibold ${activateFirst ? "bg-white text-ink ring-1 ring-line" : "bg-brand text-white"}`}>Book a 15-min walkthrough</a>;
  const activate = goLive.activateUrl && <a href={goLive.activateUrl} target="_blank" rel="noopener noreferrer" className={`inline-flex h-10 items-center justify-center rounded-full px-4 text-[13.5px] font-semibold ${activateFirst ? "bg-brand text-white" : "bg-white text-ink ring-1 ring-line"}`}>Activate {appName}</a>;
  return (
    <section className={`${card} p-4`} aria-labelledby="access-h">
      <div className="flex items-center justify-between gap-2">
        <h2 id="access-h" className="text-[15px] font-semibold">Your access</h2>
        <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11.5px] font-semibold text-amber-800">{goLive.kind === "preview" ? "Free preview" : "Demo"}</span>
      </div>
      <ul className="mt-2.5 space-y-1.5 text-[13px]">
        <li className="flex gap-2"><IcCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" strokeWidth={2.2} /><span><b>Every feature unlocked</b> to try, on this desk and in your app</span></li>
        <li className="flex gap-2"><IcClose className="mt-0.5 h-4 w-4 shrink-0 text-faint" strokeWidth={2.2} /><span className="text-sub">Changes aren&apos;t saved and patients can&apos;t join yet</span></li>
        {until && <li className="flex gap-2"><IcCalendar className="mt-0.5 h-4 w-4 shrink-0 text-faint" /><span className="text-sub">Your preview is kept until <b className="text-ink">{until}</b></span></li>}
      </ul>
      <div className="mt-3 rounded-[12px] bg-[#F7F8F8] p-3">
        <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-faint">Going live includes</p>
        <ul className="mt-1.5 space-y-1 text-[12.5px] leading-snug text-[#3F4450]">
          {INCLUDED.map((t) => <li key={t} className="flex gap-1.5"><span className="text-brand">•</span>{t}</li>)}
        </ul>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
        {activateFirst ? <>{activate}{walk}</> : <>{walk}{activate}</>}
      </div>
      <p className="mt-2.5 text-[12px] text-sub">
        On the call we go live together: your real treatments, rewards and payments. Questions first? <a className="font-semibold text-brand" href={`mailto:${goLive.helpEmail}`}>Email us</a>.
      </p>
    </section>
  );
}

/* ───────────── pieces ───────────── */

function Ring({ done, total }: { done: number; total: number }) {
  const r = 15, c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 36 36" className="h-10 w-10 shrink-0 -rotate-90" aria-hidden>
      <circle cx="18" cy="18" r={r} fill="none" stroke="#EEF0F1" strokeWidth="3.5" />
      <circle cx="18" cy="18" r={r} fill="none" stroke="rgb(var(--p-rgb))" strokeWidth="3.5" strokeLinecap="round" strokeDasharray={`${(done / total) * c} ${c}`} />
      <text x="18" y="18" textAnchor="middle" dominantBaseline="central" transform="rotate(90 18 18)" fontSize="10" fontWeight="700" fill="#171B26">{done}/{total}</text>
    </svg>
  );
}

function SetupCard({ title, sub, button, art, done, onClick }: { title: string; sub: string; button: string; art: React.ReactNode; done: boolean; onClick: () => void }) {
  return (
    <section className={`${card} relative flex min-h-[200px] flex-col md:min-h-[236px] overflow-hidden p-5`}>
      <div className="relative z-10 max-w-[92%]">
        <h2 className="flex items-center gap-2 text-[16.5px] font-semibold tracking-[-0.01em]">
          {title}
          {done && <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-500 text-white" aria-label="Done"><IcCheck className="h-3 w-3" strokeWidth={3} /></span>}
        </h2>
        <p className="mt-1.5 text-[13px] leading-snug text-sub">{sub}</p>
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[128px]">{art}</div>
      <button type="button" onClick={onClick} className="relative z-10 mt-auto w-fit rounded-full bg-white px-4 py-2 text-[13.5px] font-semibold shadow-[0_2px_10px_-2px_rgba(23,27,38,.18)] ring-1 ring-line transition hover:ring-ink/30">
        {done ? "Review" : button}
      </button>
    </section>
  );
}

/** A treatment list with an upload card beside it. */
function ArtTreatments() {
  return (
    <div className="absolute bottom-[-18px] right-[-10px] flex items-end gap-2">
      <div className="w-[176px] rotate-[-4deg] rounded-[12px] bg-white p-3 shadow-[0_6px_24px_-8px_rgba(23,27,38,.28)] ring-1 ring-line">
        {[70, 56, 64, 48].map((w, i) => (
          <div key={i} className="mb-2 flex items-center gap-2 last:mb-0">
            <span className="h-2.5 w-2.5 rounded-[3px] bg-brand/70" />
            <span className="h-1.5 rounded-full bg-[#E3E5E8]" style={{ width: `${w}%` }} />
            <span className="ml-auto h-2.5 w-5 rounded-[3px] bg-brand/20" />
          </div>
        ))}
      </div>
      <div className="mb-3 grid h-[84px] w-[70px] rotate-[5deg] place-items-center rounded-[12px] bg-white shadow-[0_6px_24px_-8px_rgba(23,27,38,.28)] ring-1 ring-line">
        <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="#171B26" strokeWidth="1.8" strokeLinecap="round"><path d="M12 16V5M7 9.5 12 4.5l5 5M6 19.5h12" /></svg>
      </div>
    </div>
  );
}

/** A booking-page address on a grid, with a cursor. */
function ArtBooking() {
  return (
    <div className="absolute inset-x-0 bottom-0 h-full [background-image:linear-gradient(#EDEFF1_1px,transparent_1px),linear-gradient(90deg,#EDEFF1_1px,transparent_1px)] [background-size:22px_22px] [mask-image:linear-gradient(to_bottom,transparent,black_40%)]">
      <div className="absolute left-[34%] top-[26px] flex h-9 w-[230px] items-center gap-2 rounded-full bg-white px-3.5 font-mono text-[11.5px] text-sub shadow-[0_4px_18px_-6px_rgba(23,27,38,.25)] ring-1 ring-line">
        <IcCalendar className="h-3.5 w-3.5 text-brand" />book.yourspa.com
      </div>
      <svg viewBox="0 0 24 24" className="absolute left-[62%] top-[52px] h-9 w-9 drop-shadow" aria-hidden><path d="M5 3l14 8.2-6.3 1.4L10 19z" fill="#fff" stroke="#171B26" strokeWidth="1.5" strokeLinejoin="round" /></svg>
    </div>
  );
}

/** Two cards and a "pay over time" tag. Generic shapes, no card-network logos. */
function ArtPayments() {
  return (
    <div className="absolute bottom-[-14px] right-[-8px] h-[124px] w-[250px]">
      <span className="absolute left-0 top-[14px] rotate-[-8deg] rounded-[10px] bg-[#FBD3E4] px-3 py-1.5 text-[13px] font-bold text-ink shadow-sm">Pay over time</span>
      <div className="absolute right-0 top-[8px] h-[78px] w-[118px] rotate-[3deg] rounded-[10px] bg-ink shadow-lg">
        <span className="absolute right-3 top-3 flex"><span className="h-5 w-5 rounded-full bg-[#F04E3E]" /><span className="-ml-2 h-5 w-5 rounded-full bg-[#F7A21B]/90" /></span>
      </div>
      <div className="absolute left-[64px] top-[40px] h-[84px] w-[136px] rotate-[-3deg] rounded-[12px] bg-brand p-3 text-white shadow-xl">
        <IcCard className="h-5 w-5 opacity-90" />
        <p className="mt-5 font-mono text-[11px] tracking-[0.14em] opacity-90">•••• 4242</p>
      </div>
    </div>
  );
}

