"use client";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, Clock, Phone, CalendarClock, Sparkles, Loader2, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { Business, BookingTag } from "@/lib/types/database";

type Step = "pick-service" | "pick-time" | "confirm" | "done";

const DURATION_OTHER_PRESETS = [15, 30, 45, 60, 90];

type Slot = { iso: string; reserved: boolean };

/**
 * Customer-side booking flow.
 *
 *   Page top  – big "Call Now" widget (uses business contact_info.phone)
 *   Below     – "or book online" service tiles (with uploaded image)
 *   On pick   – date carousel + time-slot grid (open vs reserved)
 *   Confirm   – name / phone / optional notes
 *   Done      – success state
 *
 * Backend routing:
 *   • If the business has GHL configured (ghl_calendar_id + ghl_api_key on
 *     the business row), we hit /api/ghl/slots and /api/ghl/book — GHL is
 *     source of truth for free/busy and we mirror into bookings on confirm.
 *   • Otherwise we fall back to the Supabase RPCs (available_booking_slots
 *     + create_booking) so businesses without GHL still work day-1.
 */
export function BookFlow({ business: b, tags }: { business: Business; tags: BookingTag[] }) {
  const [step, setStep]               = useState<Step>("pick-service");
  const [tag, setTag]                 = useState<BookingTag | null>(null);
  const [otherDuration, setOtherDur]  = useState<number>(30);
  const [otherLabel, setOtherLabel]   = useState<string>("");
  const [selectedDay, setSelectedDay] = useState<string>(() => isoDate(new Date()));
  const [slots, setSlots]             = useState<Slot[]>([]);
  const [loadingSlots, setLoading]    = useState(false);
  const [pickedSlot, setPicked]       = useState<string | null>(null);
  const [name, setName]               = useState("");
  const [phone, setPhone]             = useState("");
  const [notes, setNotes]             = useState("");
  const [submitting, setSubmitting]   = useState(false);
  const [err, setErr]                 = useState<string | null>(null);

  const primary = b.brand_colors.primary;
  const ghlOn = !!(b.ghl_calendar_id && b.ghl_api_key);
  const days = useMemo(() => nextNDays(14), []);

  // Autofill name/phone from profile when we first land
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profile } = await supabase.from("profiles").select("full_name, phone").eq("id", user.id).single();
      if (profile?.full_name) setName(profile.full_name);
      if (profile?.phone)     setPhone(profile.phone);
    })();
  }, []);

  // Fetch slots whenever (tag or otherDuration) + day change and we're on the pick-time step
  useEffect(() => {
    if (step !== "pick-time") return;
    let cancelled = false;
    setLoading(true);
    setSlots([]);
    setPicked(null);

    const duration = tag?.duration_minutes ?? otherDuration;
    (async () => {
      try {
        if (ghlOn) {
          const r = await fetch(
            `/api/ghl/slots?business=${b.id}&day=${selectedDay}&duration=${duration}` +
            (tag ? `&tag=${tag.id}` : ""),
          );
          if (!r.ok) throw new Error("slot fetch failed");
          const { open, reserved } = await r.json() as { open: string[]; reserved: string[] };
          const merged: Slot[] = [
            ...open.map(iso => ({ iso, reserved: false })),
            ...reserved.map(iso => ({ iso, reserved: true })),
          ].sort((a, z) => a.iso.localeCompare(z.iso));
          if (!cancelled) setSlots(merged);
        } else {
          // Local fallback — RPC for open slots + list_busy_slots for reserved ones.
          const supabase = createClient();
          const [openRes, busyRes] = await Promise.all([
            tag
              ? supabase.rpc("available_booking_slots", { p_business_id: b.id, p_tag_id: tag.id, p_day: selectedDay })
              : Promise.resolve({ data: computeOtherSlots(b, selectedDay, otherDuration).map(iso => ({ slot_start: iso })) }),
            supabase.rpc("list_busy_slots", { p_business_id: b.id, p_day: selectedDay }),
          ]);
          const open = ((openRes.data ?? []) as { slot_start: string }[]).map(r => r.slot_start);
          const busy = ((busyRes.data ?? []) as { slot_start: string }[]).map(r => r.slot_start);
          // Filter out reserved ones that already appear in open (server already filters, but defensive).
          const openSet = new Set(open);
          const merged: Slot[] = [
            ...open.map(iso => ({ iso, reserved: false })),
            ...busy.filter(iso => !openSet.has(iso)).map(iso => ({ iso, reserved: true })),
          ].sort((a, z) => a.iso.localeCompare(z.iso));
          if (!cancelled) setSlots(merged);
        }
      } catch (e: any) {
        if (!cancelled) setErr(e?.message ?? "Could not load times. Try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [step, tag, otherDuration, selectedDay, b, ghlOn]);

  async function confirm() {
    if (!pickedSlot) return;
    setSubmitting(true); setErr(null);

    try {
      if (ghlOn) {
        const r = await fetch("/api/ghl/book", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            business_id: b.id,
            tag_id: tag?.id ?? null,
            scheduled_at: pickedSlot,
            duration: tag?.duration_minutes ?? otherDuration,
            name, phone,
            notes: (tag ? "" : (otherLabel ? `Other: ${otherLabel}. ` : "")) + (notes ?? ""),
          }),
        });
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          throw new Error(j.error ?? "Booking failed");
        }
      } else {
        const supabase = createClient();
        const dur = tag?.duration_minutes ?? otherDuration;
        const { error } = await supabase.rpc("create_booking", {
          p_business_id: b.id,
          p_tag_id: tag?.id ?? null,
          p_scheduled_at: pickedSlot,
          p_duration: tag ? null : dur,
          p_name: name || null,
          p_phone: phone || null,
          p_email: null,
          p_notes: (tag ? "" : (otherLabel ? `Other: ${otherLabel}. ` : "")) + (notes ?? ""),
        });
        if (error) throw new Error(error.message);
      }
      setStep("done");
    } catch (e: any) {
      setErr(e?.message ?? "Booking failed");
    } finally {
      setSubmitting(false);
    }
  }

  /* ============== render ============== */
  return (
    <div className="px-4 pt-4 pb-32">
      {step !== "pick-service" && step !== "done" && (
        <button onClick={() => setStep(step === "pick-time" ? "pick-service" : "pick-time")}
          className="flex items-center gap-1 text-sm font-semibold text-muted-foreground mb-3">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
      )}

      {step === "pick-service" && (
        <>
          {/* ============ CALL NOW HERO ============ */}
          {b.contact_info?.phone && (
            <a
              href={`tel:${b.contact_info.phone}`}
              className="block rounded-2xl p-5 text-white shadow-lg active:scale-[0.98] transition"
              style={{ background: `linear-gradient(135deg, ${primary}, ${darken(primary, 0.2)})` }}
            >
              <div className="flex items-center gap-3">
                <div className="h-14 w-14 rounded-full bg-white/20 flex items-center justify-center shrink-0 backdrop-blur-sm">
                  <Phone className="h-7 w-7" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs uppercase tracking-wider opacity-80 font-bold">Talk to us now</div>
                  <div className="text-2xl font-extrabold leading-tight truncate">
                    {b.contact_info.phone}
                  </div>
                  <div className="text-xs opacity-80 mt-0.5">Tap to call · usually answers fast</div>
                </div>
              </div>
            </a>
          )}

          {/* ============ "or book online" ============ */}
          <div className="mt-6 flex items-center gap-3">
            <div className="flex-1 h-px bg-zinc-200" />
            <div className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground">or book online</div>
            <div className="flex-1 h-px bg-zinc-200" />
          </div>

          <h1 className="text-xl font-bold mt-5">Pick a service</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Tap one to see open times.</p>

          {/* ============ SERVICE TILES ============ */}
          <div className="grid grid-cols-2 gap-3 mt-4">
            {tags.map(t => (
              <button key={t.id} type="button"
                onClick={() => { setTag(t); setStep("pick-time"); }}
                className="rounded-2xl overflow-hidden border bg-white text-left active:scale-95 transition shadow-sm hover:shadow-md">
                {/* Hero image (or emoji fallback) */}
                <div className="aspect-video relative bg-zinc-100 overflow-hidden">
                  {t.image_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={t.image_url} alt={t.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-5xl"
                      style={{ background: `${primary}10` }}>
                      {t.emoji ?? "✨"}
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <div className="text-sm font-bold leading-tight line-clamp-1">{t.name}</div>
                  <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {t.duration_minutes}m
                    {t.price_cents != null && <span>· ${(t.price_cents / 100).toFixed(0)}</span>}
                  </div>
                  {t.description && (
                    <div className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{t.description}</div>
                  )}
                </div>
              </button>
            ))}

            {/* Always-available "Other" tile */}
            <button type="button"
              onClick={() => { setTag(null); setStep("pick-time"); }}
              className="rounded-2xl border-2 border-dashed bg-white text-left active:scale-95 transition">
              <div className="aspect-video flex items-center justify-center bg-zinc-50">
                <div className="text-5xl">✨</div>
              </div>
              <div className="p-3">
                <div className="text-sm font-bold leading-tight">Other</div>
                <div className="text-[11px] text-muted-foreground mt-1">Tell us what you need</div>
              </div>
            </button>
          </div>
        </>
      )}

      {step === "pick-time" && (
        <>
          <h1 className="text-xl font-bold flex items-center gap-2">
            {tag ? <>{tag.emoji ?? "✨"} {tag.name}</> : <>✨ Other</>}
          </h1>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {tag ? `${tag.duration_minutes} minutes` : `${otherDuration} minutes`}
          </div>

          {!tag && (
            <div className="mt-3">
              <Label className="text-xs text-muted-foreground">How long do you need?</Label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {DURATION_OTHER_PRESETS.map(d => (
                  <button key={d} type="button"
                    onClick={() => setOtherDur(d)}
                    className={cn(
                      "px-3 h-9 rounded-full border text-xs font-semibold active:scale-95 transition",
                      otherDuration === d ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 text-zinc-700",
                    )}>
                    {d < 60 ? `${d}m` : `${d / 60}h${d % 60 ? ` ${d % 60}m` : ""}`}
                  </button>
                ))}
              </div>
              <Label className="text-xs text-muted-foreground mt-3 block">What's it for? (optional)</Label>
              <Input value={otherLabel} onChange={e => setOtherLabel(e.target.value)} placeholder="Quick consult, group of 6, …" />
            </div>
          )}

          {/* Date carousel */}
          <div className="mt-4">
            <Label className="text-xs text-muted-foreground">Pick a day</Label>
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 mt-1">
              {days.map(d => {
                const active = isoDate(d) === selectedDay;
                return (
                  <button key={d.toISOString()} type="button"
                    onClick={() => setSelectedDay(isoDate(d))}
                    className={cn(
                      "shrink-0 w-14 rounded-xl border py-2 text-center active:scale-95 transition",
                      active ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 bg-white text-zinc-700",
                    )}>
                    <div className="text-[10px] font-bold uppercase">{d.toLocaleDateString(undefined, { weekday: "short" })}</div>
                    <div className="text-lg font-bold leading-none">{d.getDate()}</div>
                    <div className="text-[10px] mt-0.5">{d.toLocaleDateString(undefined, { month: "short" })}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Slot list */}
          <div className="mt-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">Times</Label>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-white border" /> Open</span>
                <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-zinc-200" /> Reserved</span>
              </div>
            </div>
            {loadingSlots ? (
              <div className="mt-2 py-10 text-center text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mx-auto" />
              </div>
            ) : slots.length === 0 ? (
              <div className="mt-2 py-10 rounded-xl border-2 border-dashed text-center text-sm text-muted-foreground">
                <CalendarClock className="h-6 w-6 mx-auto mb-1 text-zinc-300" />
                Closed today. Try another date.
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1.5 mt-1">
                {slots.map(s => (
                  <button key={s.iso} type="button"
                    disabled={s.reserved}
                    onClick={() => { if (!s.reserved) { setPicked(s.iso); setStep("confirm"); } }}
                    className={cn(
                      "h-10 rounded-lg border text-sm font-semibold transition flex items-center justify-center gap-1",
                      s.reserved
                        ? "bg-zinc-100 border-zinc-200 text-zinc-400 cursor-not-allowed line-through"
                        : "bg-white active:scale-95 hover:border-zinc-400",
                    )}>
                    {s.reserved && <Lock className="h-3 w-3" />}
                    {new Date(s.iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {step === "confirm" && pickedSlot && (
        <>
          <h1 className="text-xl font-bold">Confirm</h1>
          <div className="mt-3 rounded-2xl border bg-white p-4">
            <div className="flex items-center gap-3">
              {tag?.image_url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={tag.image_url} alt={tag.name} className="h-12 w-12 rounded-lg object-cover" />
              ) : (
                <div className="h-12 w-12 rounded-lg flex items-center justify-center text-3xl bg-zinc-50">
                  {tag?.emoji ?? "✨"}
                </div>
              )}
              <div>
                <div className="font-bold">{tag?.name ?? "Other"}</div>
                <div className="text-[11px] text-muted-foreground">{tag?.duration_minutes ?? otherDuration} minutes</div>
              </div>
            </div>
            <div className="mt-3 text-sm flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              <span>
                {new Date(pickedSlot).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
                {" at "}
                {new Date(pickedSlot).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              </span>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">Your name</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="First Last" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Phone</Label>
              <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="(555) 555-5555" type="tel" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Anything we should know? (optional)</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Allergies, accessibility, etc." />
            </div>
          </div>

          {err && <p className="mt-3 text-sm text-red-600">{err}</p>}

          <Button onClick={confirm} disabled={submitting}
            className="mt-4 w-full h-12 text-base font-bold active:scale-95 transition"
            style={{ background: primary, color: "white" }}>
            {submitting ? "Booking…" : "Confirm booking"}
          </Button>
        </>
      )}

      {step === "done" && (
        <div className="pt-16 text-center">
          <div className="mx-auto h-20 w-20 rounded-full flex items-center justify-center"
            style={{ background: `${primary}15`, color: primary }}>
            <Check className="h-10 w-10" />
          </div>
          <h1 className="mt-4 text-2xl font-bold">You're booked!</h1>
          <p className="text-sm text-muted-foreground mt-1">
            We'll send a reminder. See you {pickedSlot && new Date(pickedSlot).toLocaleDateString(undefined, { month: "short", day: "numeric" })}.
          </p>
          <Button variant="outline" className="mt-6" onClick={() => {
            setStep("pick-service"); setTag(null); setPicked(null); setNotes("");
          }}>
            <Sparkles className="h-4 w-4 mr-1" /> Book another
          </Button>
        </div>
      )}
    </div>
  );
}

/* ----------------- helpers ----------------- */
function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
function nextNDays(n: number): Date[] {
  const out: Date[] = [];
  const t = new Date(); t.setHours(0, 0, 0, 0);
  for (let i = 0; i < n; i++) {
    const d = new Date(t); d.setDate(t.getDate() + i);
    out.push(d);
  }
  return out;
}

/**
 * Local fallback "Other"-slot computation when GHL is off. Mirrors
 * available_booking_slots without round-tripping a custom RPC. Conflicts
 * are caught server-side by create_booking.
 */
function computeOtherSlots(b: Business, day: string, durationMinutes: number): string[] {
  const hours = b.booking_hours ?? { start: "09:00", end: "19:00", slot_minutes: 15, days: [1,2,3,4,5,6] };
  const dayDate = new Date(day + "T00:00:00");
  const isoDow = ((dayDate.getDay() + 6) % 7) + 1;
  if (!hours.days.includes(isoDow)) return [];

  const [sh, sm] = hours.start.split(":").map(Number);
  const [eh, em] = hours.end.split(":").map(Number);
  const start = new Date(dayDate); start.setHours(sh, sm, 0, 0);
  const end   = new Date(dayDate); end.setHours(eh, em, 0, 0);
  const step  = (hours.slot_minutes ?? 15) * 60_000;
  const dur   = durationMinutes * 60_000;
  const now   = Date.now();

  const out: string[] = [];
  for (let t = start.getTime(); t + dur <= end.getTime(); t += step) {
    if (t > now) out.push(new Date(t).toISOString());
  }
  return out;
}

/** Darken a hex color by `amount` (0..1). Used for the Call-Now gradient. */
function darken(hex: string, amount: number): string {
  const c = hex.replace("#", "");
  if (c.length !== 6) return hex;
  const r = Math.max(0, Math.round(parseInt(c.slice(0, 2), 16) * (1 - amount)));
  const g = Math.max(0, Math.round(parseInt(c.slice(2, 4), 16) * (1 - amount)));
  const b = Math.max(0, Math.round(parseInt(c.slice(4, 6), 16) * (1 - amount)));
  return `#${[r, g, b].map(n => n.toString(16).padStart(2, "0")).join("")}`;
}
