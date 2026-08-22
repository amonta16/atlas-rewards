"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Building2, CheckCircle2, Layers, Loader2, Lock } from "lucide-react";
import { ANCHORS, WAITLIST } from "@/lib/landing/config";
import { track } from "@/lib/landing/analytics";
import { Reveal } from "./reveal";
import { INDUSTRIES } from "@/lib/landing/industries";

/**
 * Agency tool waitlist — CP-100.
 * Real, live count from /api/landing/waitlist (Supabase `landing_waitlist`).
 * Capped at WAITLIST.cap. Never shows a fake number: while loading it shows
 * "—", and the count is whatever is actually in the table.
 */
export function AgencyWaitlist() {
  const [count, setCount] = useState<number | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/landing/waitlist", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setCount(typeof j.count === "number" ? j.count : 0))
      .catch(() => setCount(0));
  }, []);

  const full = count !== null && count >= WAITLIST.cap;
  const pct = count === null ? 0 : Math.min(100, (count / WAITLIST.cap) * 100);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = Object.fromEntries(fd.entries());
    if (body.website) return; // honeypot
    setState("sending");
    setError(null);
    try {
      const r = await fetch("/api/landing/waitlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Something went wrong.");
      setState("done");
      if (typeof j.count === "number") setCount(j.count);
      track("waitlist_joined");
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  return (
    <section id={ANCHORS.waitlist} className="relative scroll-mt-24 py-20 md:py-28" aria-labelledby="waitlist-title">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" aria-hidden />
      <div className="lp-container">
        <Reveal className="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-[#0a0f17]">
          <div className="lp-grid absolute inset-0 opacity-30" aria-hidden />
          <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-[radial-gradient(closest-side,rgba(129,140,248,0.25),transparent)] blur-2xl" aria-hidden />
          <div className="relative grid gap-10 p-6 sm:p-10 lg:grid-cols-[1.1fr_0.9fr] lg:p-14">
            <div>
              <p className="lp-eyebrow">
                <Layers className="h-3.5 w-3.5 text-indigo-300" aria-hidden /> For agencies · coming soon
              </p>
              <h2 id="waitlist-title" className="lp-h2 mt-4">Run Atlas for your own clients.</h2>
              <p className="mt-4 text-lg text-zinc-400">
                The same engine behind every app on this page, as a white-label platform: launch a branded rewards app for
                each of your clients from one dashboard. We&apos;re opening it to a small first group.
              </p>

              {/* Brand stack visual */}
              <div className="mt-8 flex items-center gap-3">
                <div className="flex -space-x-3">
                  {INDUSTRIES.map((b) => (
                    <span key={b.id} className="grid h-11 w-11 place-items-center rounded-xl text-[11px] font-bold ring-2 ring-[#0a0f17]" style={{ background: b.primary, color: b.secondary }} aria-hidden>
                      {b.initials}
                    </span>
                  ))}
                </div>
                <span className="text-sm text-zinc-400">One dashboard. Every client brand.</span>
              </div>

              <ul className="mt-7 grid gap-2 text-sm text-zinc-300 sm:grid-cols-2">
                {["Per-client branding, rewards and offers", "Folders for multi-location clients", "Team roles for your staff", `Waitlist gets ${WAITLIST.perk}`].map((t) => (
                  <li key={t} className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-indigo-300" aria-hidden /> {t}
                  </li>
                ))}
              </ul>
            </div>

            {/* Counter + form */}
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 sm:p-7">
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-xs uppercase tracking-wider text-zinc-500">Waitlist</div>
                  <div className="mt-1 text-4xl font-semibold tabular-nums text-white" aria-live="polite">
                    {count === null ? "—" : count}
                    <span className="text-lg font-medium text-zinc-500"> / {WAITLIST.cap}</span>
                  </div>
                </div>
                <div className="text-right text-xs text-zinc-500">
                  {full ? "Waitlist full" : `${count === null ? "" : WAITLIST.cap - count} spots left`}
                </div>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                <div className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-cyan-400" style={{ width: `${pct}%`, transition: "width 1.2s cubic-bezier(0.22,1,0.36,1)" }} />
              </div>

              {state === "done" ? (
                <div className="mt-6 rounded-xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-zinc-200" role="status">
                  <b className="text-white">You&apos;re on the list.</b> We&apos;ll email you before it opens, with your founding-member offer.
                </div>
              ) : full ? (
                <div className="mt-6 flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-zinc-300">
                  <Lock className="h-4 w-4 text-zinc-500" aria-hidden /> The first group is full — email us and we&apos;ll let you know about the next one.
                </div>
              ) : (
                <form onSubmit={submit} className="mt-6 grid gap-3">
                  <label className="grid gap-1.5 text-sm">
                    <span className="text-zinc-300">Work email</span>
                    <input name="email" type="email" required autoComplete="email" placeholder="you@agency.com" className="lp-focus h-11 rounded-lg border border-white/10 bg-white/[0.04] px-3.5 text-white placeholder:text-zinc-500 focus:border-indigo-300/50" />
                  </label>
                  <label className="grid gap-1.5 text-sm">
                    <span className="text-zinc-300">
                      Agency name <span className="text-zinc-500">(optional)</span>
                    </span>
                    <div className="relative">
                      <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden />
                      <input name="agency" autoComplete="organization" placeholder="Northstar Media" className="lp-focus h-11 w-full rounded-lg border border-white/10 bg-white/[0.04] pl-9 pr-3.5 text-white placeholder:text-zinc-500 focus:border-indigo-300/50" />
                    </div>
                  </label>
                  <label className="grid gap-1.5 text-sm">
                    <span className="text-zinc-300">How many clients could use this?</span>
                    <select name="clients" defaultValue="1-5" className="lp-focus h-11 appearance-none rounded-lg border border-white/10 bg-white/[0.04] px-3.5 text-white focus:border-indigo-300/50">
                      {["1-5", "6-20", "21-50", "50+"].map((o) => (
                        <option key={o} value={o} className="bg-[#0b1017]">
                          {o}
                        </option>
                      ))}
                    </select>
                  </label>
                  <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
                  {error && (
                    <p role="alert" className="text-sm text-rose-300">
                      {error}
                    </p>
                  )}
                  <button type="submit" disabled={state === "sending" || count === null} className="lp-focus mt-1 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-400 to-cyan-400 px-6 font-semibold text-[#06101a] hover:brightness-110 disabled:opacity-60">
                    {state === "sending" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                    Join the agency waitlist
                  </button>
                  <p className="text-center text-xs text-zinc-500">No spam. One email when it opens.</p>
                </form>
              )}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
