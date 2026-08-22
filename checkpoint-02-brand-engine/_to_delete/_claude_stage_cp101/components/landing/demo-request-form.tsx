"use client";
import { useState, type RefObject, type FormEvent } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { track } from "@/lib/landing/analytics";
import { CONTACT_EMAIL } from "@/lib/landing/config";

/**
 * Demo-request form — CP-100. POSTs to /api/landing/demo-request which
 * stores the lead in Supabase (`landing_demo_requests`) and emails
 * CONTACT_EMAIL when RESEND_API_KEY is configured.
 */
const INDUSTRIES = ["Restaurant / café", "Gym / fitness", "Salon / barber", "Med spa / wellness", "Retail", "Other"];
const TIMES = ["Mornings", "Afternoons", "Evenings", "Any time"];

const field =
  "lp-focus h-11 w-full rounded-lg border border-[#e8dfd1] bg-white px-3.5 text-[15px] text-[#14213d] placeholder:text-slate-500 focus:border-[#1f5f8b]/40";

export function DemoRequestForm({
  source,
  firstFieldRef,
  onDone,
  compact = false,
}: {
  source: string;
  firstFieldRef?: RefObject<HTMLInputElement>;
  onDone?: () => void;
  compact?: boolean;
}) {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const body = Object.fromEntries(fd.entries());
    // Honeypot — bots fill every field.
    if (body.website) return;
    setState("sending");
    setError(null);
    try {
      const r = await fetch("/api/landing/demo-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, source, path: window.location.pathname }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Something went wrong.");
      setState("done");
      track("demo_requested", { source, industry: String(body.industry ?? "") });
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  if (state === "done") {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-700" aria-hidden />
        <h3 className="mt-3 text-lg font-semibold">You&apos;re on the calendar request list</h3>
        <p className="mt-1 text-sm text-slate-700">
          We&apos;ll reach out within one business day to lock in a time. Questions now?{" "}
          <a className="text-[#1f5f8b] underline-offset-2 hover:underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
        </p>
        {onDone && (
          <button type="button" onClick={onDone} className="lp-focus mt-5 h-10 rounded-lg bg-[#1f5f8b] px-5 text-sm font-semibold text-white">
            Done
          </button>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className={cn("grid gap-4", compact ? "sm:grid-cols-2" : "sm:grid-cols-2")} noValidate={false}>
      <label className="grid gap-1.5 text-sm">
        <span className="text-slate-700">Your name</span>
        <input ref={firstFieldRef} name="name" required autoComplete="name" className={field} placeholder="Maria Lopez" />
      </label>
      <label className="grid gap-1.5 text-sm">
        <span className="text-slate-700">Business name</span>
        <input name="business" required autoComplete="organization" className={field} placeholder="Casa Verde" />
      </label>
      <label className="grid gap-1.5 text-sm">
        <span className="text-slate-700">Email</span>
        <input name="email" type="email" required autoComplete="email" className={field} placeholder="you@business.com" />
      </label>
      <label className="grid gap-1.5 text-sm">
        <span className="text-slate-700">Phone</span>
        <input name="phone" type="tel" required autoComplete="tel" className={field} placeholder="(555) 123-4567" />
      </label>
      <label className="grid gap-1.5 text-sm">
        <span className="text-slate-700">Industry</span>
        <select name="industry" className={cn(field, "appearance-none")} defaultValue="">
          <option value="" disabled>
            Choose one
          </option>
          {INDUSTRIES.map((i) => (
            <option key={i} value={i} className="bg-white">
              {i}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1.5 text-sm">
        <span className="text-slate-700">Best time to call</span>
        <select name="preferred_time" className={cn(field, "appearance-none")} defaultValue="Any time">
          {TIMES.map((t) => (
            <option key={t} value={t} className="bg-white">
              {t}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1.5 text-sm sm:col-span-2">
        <span className="text-slate-700">
          Anything we should know? <span className="text-slate-500">(optional)</span>
        </span>
        <textarea name="notes" rows={2} className={cn(field, "h-auto py-2.5")} placeholder="e.g. we have two locations and already use Square" />
      </label>
      {/* Honeypot (hidden from humans) */}
      <input name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      {error && (
        <p role="alert" className="sm:col-span-2 text-sm text-rose-600">
          {error}
        </p>
      )}
      <div className="sm:col-span-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-slate-500">No contracts to sign here — this just books a conversation.</p>
        <button
          type="submit"
          disabled={state === "sending"}
          className="lp-focus lp-cta-primary inline-flex h-12 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-[#1f5f8b] px-6 font-semibold text-white hover:bg-[#174a6e] disabled:opacity-60"
        >
          {state === "sending" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          Request my demo
        </button>
      </div>
    </form>
  );
}

// CP-101: light "Central Coast" palette pass — colors live in app/globals.css (.lp-root tokens).
