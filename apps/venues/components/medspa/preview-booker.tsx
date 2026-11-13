"use client";
/**
 * components/medspa/preview-booker.tsx — CP-246 · /medspa/book/<slug>, booking for a preview owner.
 *
 * Before this, "Book 15 min" on a preview sent the owner through the whole /medspa/start quiz
 * (zip, 3 number questions, the results, a contact form, 2 more questions) before a calendar.
 * They already have their app; this page sells the call and asks only what the calendar needs:
 *
 *   the Launch Plan call (name, value, what they leave with, the guarantee, the bonus deadline)
 *   → name, mobile, role, practice today (+ email only if the preview has none), two optional SMS boxes
 *   → POST /api/landing/lead with preview_slug (practice, email and zip are filled on the server
 *     from the preview; qualifies as before; links the lead to the preview so booking ends the
 *     follow-up sequence and claims the launch bonus)
 *   → POST /api/preview/sms-optin when a box is ticked
 *   → the same calendar as /medspa/start (TimePicker), on this page.
 */
import { useEffect, useRef, useState } from "react";
import { ArrowRight, CalendarDays, Check, Gift, Loader2, Lock, Mail, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { GUARANTEES, LAUNCH_CALL, ROLES, STAGES } from "@/lib/landing/medspa-funnel";
import { CALL_MINUTES } from "@/lib/landing/availability";
import { SMS_INFO_CONSENT_TEXT, SMS_MARKETING_CONSENT_TEXT, SMS_PRIVACY_URL, SMS_TERMS_URL } from "@/lib/preview/consent";
import { track } from "@/lib/landing/analytics";
import { TimePicker } from "./medspa-funnel";

type Lead = { id: string; first: string; qualified: boolean; booked: boolean } | null;
type Phase = "form" | "time" | "booked" | "notfit";

const FIELD = "s-focus h-12 w-full rounded-xl border border-[var(--s-line)] bg-white px-3.5 text-[16px] text-[var(--s-ink)] placeholder:text-[var(--s-ink-3)]/70 focus:border-[var(--s-ocean)]/60";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function metaIds() {
  const c = (k: string) => document.cookie.split("; ").find((x) => x.startsWith(`${k}=`))?.split("=")[1] ?? "";
  let fbc = c("_fbc");
  const fbclid = new URLSearchParams(window.location.search).get("fbclid");
  if (!fbc && fbclid) fbc = `fb.1.${Date.now()}.${fbclid}`;
  return { fbp: c("_fbp"), fbc };
}

const fmtWhen = (iso: string) => new Intl.DateTimeFormat("en-US", { weekday: "long", hour: "numeric", minute: "2-digit" }).format(new Date(iso)).replace(" AM", "am").replace(" PM", "pm");

export function PreviewBooker({ slug, business, hasEmail, lead, bonusDeadline, src }: {
  slug: string; business: string; hasEmail: boolean; lead: Lead; bonusDeadline: string | null; src: string;
}) {
  const [phase, setPhase] = useState<Phase>(lead?.booked ? "booked" : lead?.qualified ? "time" : "form");
  const [leadId, setLeadId] = useState<string | null>(lead?.qualified ? lead.id : null);
  const [first, setFirst] = useState(lead?.first ?? "");
  const [role, setRole] = useState<string | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [info, setInfo] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [notFit, setNotFit] = useState<"area_taken" | "not_a_fit">("not_a_fit");
  const [bonusEnds, setBonusEnds] = useState<string | null>(null);
  const headRef = useRef<HTMLHeadingElement>(null);
  const source = `preview_book:${src}`;

  // The bonus deadline in the visitor's own time zone (client only, so server and browser agree).
  useEffect(() => { if (bonusDeadline && Date.parse(bonusDeadline) > Date.now()) setBonusEnds(fmtWhen(bonusDeadline)); }, [bonusDeadline]);
  useEffect(() => { if (phase !== "form") headRef.current?.focus({ preventScroll: true }); }, [phase]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string, string>;
    const name = (fd.name ?? "").trim();
    const phone = (fd.phone ?? "").trim();
    const email = (fd.email ?? "").trim();
    if (!name) return setErr("Please add your name.");
    if (phone.replace(/\D/g, "").length < 10) return setErr("Please enter a mobile number with area code.");
    if (!hasEmail && !EMAIL_RE.test(email)) return setErr("Please enter a valid email, so we can send the invite.");
    if (!role || !stage) return setErr("Tap your role and where your practice is today.");
    setBusy(true); setErr(null);
    track("lead_submitted", { source });
    try {
      const p = new URLSearchParams(window.location.search);
      const r = await fetch("/api/landing/lead", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, phone, ...(hasEmail ? {} : { email }), role, stage, practice_type: "Med spa",
          preview_slug: slug, source, path: window.location.pathname, website_url_hp: fd.website_url_hp || undefined,
          utm_source: p.get("utm_source") ?? "", utm_campaign: p.get("utm_campaign") ?? "", utm_content: p.get("utm_content") ?? "", ...metaIds(),
        }),
      });
      const j = (await r.json().catch(() => ({}))) as { qualified?: boolean; lead_id?: string; event_id?: string; reason?: string; error?: string };
      if (!r.ok) throw new Error(j.error || "Something went wrong. Please try again.");
      if ((info || marketing) && j.qualified !== undefined) {
        // Optional texts. A failure here never blocks booking.
        await fetch("/api/preview/sms-optin", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug, phone, sms_consent: info, sms_marketing_consent: marketing }) }).catch(() => null);
      }
      setFirst(name.split(/\s+/)[0] ?? "");
      if (j.qualified && j.lead_id) {
        track("lead_qualified", { source, event_id: j.event_id });
        setLeadId(j.lead_id); setPhase("time");
      } else {
        track("lead_unqualified", { source });
        setNotFit(j.reason === "area_taken" ? "area_taken" : "not_a_fit"); setPhase("notfit");
      }
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Something went wrong.");
    } finally { setBusy(false); }
  }

  const guarantee = GUARANTEES[0];
  const callTitle = `${business}'s ${LAUNCH_CALL.name}`;

  return (
    <div className="mx-auto max-w-[1060px]">
      {phase !== "time" && (
        <div className="mb-6 text-center sm:mb-8">
          <p className="s-load-1 text-[12.5px] font-bold uppercase tracking-[0.12em] text-white/80">{CALL_MINUTES} min · video · with Andrew</p>
          <h1 className="s-load-1 mx-auto mt-2 max-w-[22ch] text-[clamp(1.85rem,1.3rem+2.4vw,2.9rem)] font-bold leading-[1.06] tracking-[-0.035em] text-white">Book {callTitle}.</h1>
          <p className="s-load-2 mx-auto mt-3 max-w-[36rem] text-[1.02rem] text-white/85">
            Worth ${LAUNCH_CALL.value} on its own. Free with your app preview. You leave with all three below, whether or not you sign up.
          </p>
        </div>
      )}

      <div className={cn("s-load-2 rounded-[30px] bg-white text-[var(--s-ink)] shadow-[0_40px_90px_-40px_rgba(2,20,70,.7)] ring-1 ring-white/60", phase === "time" ? "p-3 sm:p-5" : "p-5 sm:p-9")}>
        {phase === "form" && (
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:gap-x-12 lg:gap-y-0">
            {/* The call, sold. On a phone: takeaways → the form → the guarantee and the steps. */}
            <section aria-labelledby="pb-get" className="lg:col-start-1 lg:row-start-1">
              <h2 id="pb-get" className="text-[13px] font-bold uppercase tracking-[0.1em] text-[var(--s-ocean)]">What you leave with</h2>
              <ol className="mt-3 space-y-3">
                {LAUNCH_CALL.takeaways.map((t, i) => (
                  <li key={t.t} className="flex gap-3 rounded-2xl bg-[var(--s-paper)] p-3.5 ring-1 ring-[var(--s-line)]">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--s-ocean)] text-[13px] font-bold text-white">{i + 1}</span>
                    <span><span className="block text-[15px] font-bold leading-snug">{t.t}</span><span className="mt-0.5 block text-[13.5px] leading-snug text-[var(--s-ink-3)]">{t.d}</span></span>
                  </li>
                ))}
              </ol>
              {bonusEnds && (
                <p className="mt-4 flex items-start gap-2.5 rounded-2xl bg-[#FFF6DD] p-3.5 text-[14px] font-semibold leading-snug text-[#5A4200] ring-1 ring-[#F2D27A]">
                  <Gift className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />Book before {bonusEnds} and your 3 launch bonuses (launch videos, desk banner, software audit) are locked in.
                </p>
              )}
            </section>

            <section aria-label="The promise and the steps" className="order-last lg:order-none lg:col-start-1 lg:row-start-2">
              <div className="rounded-2xl border border-[var(--s-line)] p-4 lg:mt-5">
                <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.08em] text-[var(--s-ocean)]"><ShieldCheck className="h-4 w-4" aria-hidden />If you go live</div>
                <p className="mt-1.5 text-[15px] font-bold leading-snug">{guarantee.title}</p>
                <p className="mt-1 text-[13.5px] leading-snug text-[var(--s-ink-3)]">{guarantee.body}</p>
              </div>
              <h2 className="mt-6 text-[13px] font-bold uppercase tracking-[0.1em] text-[var(--s-ocean)]">How it works</h2>
              <ol className="mt-2.5 space-y-1.5 text-[14.5px] text-[var(--s-ink-2)]">
                <li><b className="text-[var(--s-ink)]">1.</b> Tell us who you are (30 seconds) and pick a time.</li>
                <li><b className="text-[var(--s-ink)]">2.</b> The invite and video link land in your email.</li>
                <li><b className="text-[var(--s-ink)]">3.</b> On the call, we work through your numbers and your app together. You decide after.</li>
              </ol>
            </section>

            {/* The ask */}
            <form onSubmit={submit} noValidate aria-labelledby="pb-form-h" className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
              <h2 id="pb-form-h" className="text-[1.35rem] font-bold leading-tight tracking-[-0.02em]">Then pick a time</h2>
              <p className="mt-1 text-[14px] text-[var(--s-ink-3)]">We have {business} on file already.</p>
              <div className="mt-4 grid gap-3">
                <label className="grid gap-1.5"><span className="text-[13.5px] font-semibold">Your name</span><input name="name" autoComplete="name" className={FIELD} placeholder="Maria Lopez" /></label>
                <label className="grid gap-1.5"><span className="text-[13.5px] font-semibold">Mobile</span><input name="phone" type="tel" inputMode="tel" autoComplete="tel" className={FIELD} placeholder="(805) 555-0123" /></label>
                {!hasEmail && <label className="grid gap-1.5"><span className="text-[13.5px] font-semibold">Email (for the invite)</span><input name="email" type="email" inputMode="email" autoComplete="email" className={FIELD} placeholder="you@practice.com" /></label>}
              </div>
              <Chips legend="Your role" items={ROLES} value={role} onPick={setRole} />
              <Chips legend="Your practice today" items={STAGES} value={stage} onPick={setStage} />

              <fieldset className="mt-5 space-y-2.5 rounded-2xl bg-[var(--s-paper)] p-3.5 text-[12.5px] leading-snug text-[var(--s-ink-3)] ring-1 ring-[var(--s-line)]">
                <legend className="sr-only">Text messages (optional)</legend>
                <label className="flex gap-2.5"><input type="checkbox" checked={info} onChange={(e) => setInfo(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#0B5FD6]" /><span>{SMS_INFO_CONSENT_TEXT}</span></label>
                <label className="flex gap-2.5"><input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#0B5FD6]" /><span>{SMS_MARKETING_CONSENT_TEXT}</span></label>
                <p>Both optional. <a className="underline" href={SMS_TERMS_URL}>Terms</a> · <a className="underline" href={SMS_PRIVACY_URL}>Privacy</a></p>
              </fieldset>
              <input name="website_url_hp" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />

              {err && <p role="alert" className="mt-3 text-sm font-medium text-rose-600">{err}</p>}
              <button type="submit" disabled={busy} className="s-btn s-btn-primary s-focus mt-4 w-full disabled:opacity-60">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}See open times <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
              <p className="mt-2.5 flex items-center justify-center gap-1.5 text-center text-[12px] text-[var(--s-ink-3)]"><Lock className="h-3.5 w-3.5" aria-hidden />Only used to set up your call.</p>
            </form>
          </div>
        )}

        {phase === "time" && leadId && (
          <TimePicker leadId={leadId} firstName={first} practice={business} source={source} headRef={headRef}
            extraNotes={`From the app preview (${slug}). Their app is already built.`}
            call={{ title: callTitle, about: `${first ? `${first}, ` : ""}you leave with these, whether or not you sign up:`, perks: LAUNCH_CALL.takeaways.map((t) => t.t) }} />
        )}

        {phase === "booked" && (
          <div className="py-4 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-600"><CalendarDays className="h-6 w-6" aria-hidden /></span>
            <h2 ref={headRef} tabIndex={-1} className="mt-4 text-[1.6rem] font-bold leading-tight tracking-[-0.025em] outline-none">You&apos;re already booked{first ? `, ${first}` : ""}.</h2>
            <p className="mx-auto mt-3 max-w-[34rem] text-[15px] leading-relaxed text-[var(--s-ink-2)]">Your call details and the confirm link are in your email. Need a different time? Reply to that email and Andrew will move it.</p>
          </div>
        )}

        {phase === "notfit" && (
          <div className="py-4 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[var(--s-ice)] text-[var(--s-ocean)]"><Mail className="h-6 w-6" aria-hidden /></span>
            <h2 ref={headRef} tabIndex={-1} className="mt-4 text-[1.6rem] font-bold leading-tight tracking-[-0.025em] outline-none">
              {notFit === "area_taken" ? `You're on the waitlist${first ? `, ${first}` : ""}.` : `Thanks${first ? `, ${first}` : ""}. We've emailed you.`}
            </h2>
            <p className="mx-auto mt-3 max-w-[34rem] text-[15px] leading-relaxed text-[var(--s-ink-2)]">
              {notFit === "area_taken"
                ? "A practice near you holds this area right now. If it opens up, you'll hear from Andrew first."
                : "Launch Plan calls are for owners and managers of practices that are open today. If that's you after all, reply to the email and Andrew will set up a time."}
            </p>
          </div>
        )}
      </div>

      {phase === "form" && (
        <ul className="mx-auto mt-7 flex max-w-[860px] flex-wrap justify-center gap-x-6 gap-y-2 text-[13.5px] font-semibold text-white/90">
          {["No card", "Month to month if you go live", "One med spa per area"].map((t) => <li key={t} className="flex items-center gap-1.5"><Check className="h-4 w-4" strokeWidth={3} aria-hidden />{t}</li>)}
        </ul>
      )}
    </div>
  );
}

function Chips({ legend, items, value, onPick }: { legend: string; items: ReadonlyArray<{ id: string; label: string }>; value: string | null; onPick: (id: string) => void }) {
  return (
    <fieldset className="mt-5">
      <legend className="text-[13.5px] font-semibold">{legend}</legend>
      <div className="mt-2 flex flex-wrap gap-2" role="radiogroup">
        {items.map((it) => {
          const on = it.id === value;
          return (
            <button key={it.id} type="button" role="radio" aria-checked={on} onClick={() => onPick(it.id)}
              className={cn("s-focus inline-flex min-h-[40px] items-center gap-1.5 rounded-full border px-3.5 text-left text-[14px] font-semibold transition-colors",
                on ? "border-[var(--s-ocean)] bg-[var(--s-ocean)] text-white" : "border-[var(--s-line)] bg-white text-[var(--s-ink-2)] hover:border-[var(--s-ocean)]/40")}>
              {on && <Check className="h-3.5 w-3.5" aria-hidden />}{it.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
