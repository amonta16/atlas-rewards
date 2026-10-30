"use client";
/**
 * MedspaBookFlow — CP-214 · in-app booking for med spas (Dermis pattern)
 *
 * Runs when the practice has Atlas booking on and the treatment has no
 * scheduling link of its own: pick a treatment → who with → a day → a time →
 * request. Times come from the practice's booking hours minus slots already
 * taken (booking_busy_times). The request lands as a pending booking
 * (create_booking) in the front desk's Bookings tab, where staff confirm it.
 */
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { optimizedUrl } from "@/lib/img";
import { businessDayWindow } from "@/lib/booking";
import { AppLink } from "@/components/customer/app-link";
import { cents, type MedspaProvider, type MedspaTreatment } from "@/lib/medspa";
import type { Business } from "@/lib/types/database";
import { MsTopBar } from "./chrome";
import { IcCalendar, IcCheck, IcChevronRight, IcSparkle } from "./icons";

const DAYS_AHEAD = 21;

function ymd(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function isoDow(d: Date) { return ((d.getDay() + 6) % 7) + 1; }

function slotsFor(business: Business, day: Date, minutes: number): Date[] {
  const win = businessDayWindow(business, isoDow(day));
  if (!win) return [];
  const step = (business.booking_hours?.slot_minutes || 30) * 60_000;
  const [sh, sm] = win[0].split(":").map(Number);
  const [eh, em] = win[1].split(":").map(Number);
  const start = new Date(day); start.setHours(sh, sm, 0, 0);
  const end = new Date(day); end.setHours(eh, em, 0, 0);
  const out: Date[] = [];
  const soon = Date.now() + 60 * 60_000; // nothing in the next hour
  for (let t = start.getTime(); t + minutes * 60_000 <= end.getTime(); t += step) if (t > soon) out.push(new Date(t));
  return out;
}

export function MedspaBookFlow({ business, menu, providers, initial, patient }: {
  business: Business; menu: MedspaTreatment[]; providers: MedspaProvider[]; initial: MedspaTreatment | null;
  patient: { name: string | null; phone: string | null };
}) {
  const slug = business.slug;
  const [treatment, setTreatment] = useState<MedspaTreatment | null>(initial);
  const team = useMemo(() => providers.filter((p) => p.is_active && (!treatment || p.treatment_ids.length === 0 || p.treatment_ids.includes(treatment.id))), [providers, treatment]);
  const [provider, setProvider] = useState<string>("any");
  const days = useMemo(() => {
    const out: Date[] = []; const d = new Date(); d.setHours(0, 0, 0, 0);
    for (let i = 0; i < DAYS_AHEAD; i++) { const x = new Date(d); x.setDate(d.getDate() + i); out.push(x); }
    return out;
  }, []);
  const openDays = useMemo(() => days.filter((d) => treatment && slotsFor(business, d, treatment.duration_minutes).length > 0), [days, business, treatment]);
  const [day, setDay] = useState<Date | null>(null);
  const [busy, setBusy] = useState<[number, number][]>([]);
  const [loading, setLoading] = useState(false);
  const [time, setTime] = useState<Date | null>(null);
  const [notes, setNotes] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => { if (!day && openDays[0]) setDay(openDays[0]); }, [openDays, day]);

  // Taken slots for the chosen day.
  useEffect(() => {
    if (!day) return;
    let off = false;
    setLoading(true); setTime(null);
    createClient().rpc("booking_busy_times", { p_business_id: business.id, p_day: ymd(day) })
      .then(({ data }) => {
        if (off) return;
        setBusy(((data ?? []) as { starts_at: string; ends_at: string }[]).map((r) => [new Date(r.starts_at).getTime(), new Date(r.ends_at).getTime()]));
      })
      .then(() => { if (!off) setLoading(false); }, () => { if (!off) setLoading(false); });
    return () => { off = true; };
  }, [day, business.id]);

  const times = day && treatment
    ? slotsFor(business, day, treatment.duration_minutes).filter((t) => {
        const a = t.getTime(), b = a + treatment.duration_minutes * 60_000;
        return !busy.some(([s, e]) => a < e && b > s);
      })
    : [];
  const who = provider === "any" ? null : team.find((p) => p.id === provider) ?? null;

  async function request() {
    if (!treatment || !time) return;
    setSending(true); setErr(null);
    const { error } = await createClient().rpc("create_booking", {
      p_business_id: business.id, p_tag_id: null, p_scheduled_at: time.toISOString(), p_duration: treatment.duration_minutes,
      p_name: patient.name, p_phone: patient.phone, p_email: null,
      p_notes: [treatment.name, who ? `with ${who.name}` : null, notes.trim() || null].filter(Boolean).join(" · "),
    });
    setSending(false);
    if (error) { setErr(/no longer available/i.test(error.message) ? "That time was just taken. Pick another." : "Couldn't send that. Try again."); return; }
    setDone(true); window.scrollTo({ top: 0 });
  }

  const when = time?.toLocaleString(undefined, { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });

  if (done && treatment && time) {
    return (
      <div className="min-h-[80vh] bg-[var(--ms-bg)] pb-12">
        <MsTopBar slug={slug} title="Book" back="/" />
        <div className="px-5 pt-10 text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-full text-white" style={{ background: "var(--ms-p)", animation: "ms-pop .45s cubic-bezier(.2,.9,.3,1.2) both" }}><IcCheck className="h-8 w-8" strokeWidth={2.4} /></span>
          <h1 className="mt-5 text-[28px] font-semibold tracking-[-0.015em]" style={{ color: "var(--ms-ink)" }}>Request sent</h1>
          <p className="mx-auto mt-2 max-w-[32ch] text-[16px] leading-relaxed" style={{ color: "var(--ms-sub)" }}>
            {treatment.name}{who ? ` with ${who.name}` : ""}, {when}. {business.name} will confirm it shortly.
          </p>
          <AppLink slug={slug} to="/" className="mt-8 flex h-14 w-full items-center justify-center rounded-2xl text-[17px] font-semibold text-white" style={{ background: "var(--ms-p)" }}>Back to home</AppLink>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] bg-[var(--ms-bg)] pb-40">
      <MsTopBar slug={slug} title="Book" back="/" />

      {!treatment ? (
        <section className="px-5 pt-6">
          <h1 className="text-[26px] font-semibold tracking-[-0.015em]" style={{ color: "var(--ms-ink)" }}>What would you like to book?</h1>
          <div className="mt-4 space-y-3">
            {menu.map((t) => (
              <button key={t.id} type="button" onClick={() => setTreatment(t)}
                className="flex w-full items-center gap-3.5 rounded-2xl bg-white p-3 text-left ring-1 ring-[var(--ms-line)] active:scale-[.99] transition">
                <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl" style={{ background: "color-mix(in srgb, var(--ms-p) 12%, #fff)", color: "var(--ms-p)" }}>
                  {t.image_url
                    /* eslint-disable-next-line @next/next/no-img-element */
                    ? <img src={optimizedUrl(t.image_url, 160)} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    : <span className="grid h-full place-items-center"><IcSparkle className="h-6 w-6" /></span>}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[17px] font-semibold" style={{ color: "var(--ms-ink)" }}>{t.name}</span>
                  <span className="block text-[14px]" style={{ color: "var(--ms-sub)" }}>{t.duration_minutes} min{t.price_cents ? ` · from ${cents(t.price_cents)}` : ""}</span>
                </span>
                <IcChevronRight className="h-5 w-5" style={{ color: "var(--ms-icon)" }} />
              </button>
            ))}
          </div>
        </section>
      ) : (
        <>
          {/* Treatment */}
          <section className="px-5 pt-6">
            <div className="flex items-center gap-3.5 rounded-2xl bg-white p-3 ring-1 ring-[var(--ms-line)]">
              <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl" style={{ background: "color-mix(in srgb, var(--ms-p) 12%, #fff)", color: "var(--ms-p)" }}>
                {treatment.image_url
                  /* eslint-disable-next-line @next/next/no-img-element */
                  ? <img src={optimizedUrl(treatment.image_url, 160)} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  : <span className="grid h-full place-items-center"><IcSparkle className="h-6 w-6" /></span>}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[18px] font-semibold" style={{ color: "var(--ms-ink)" }}>{treatment.name}</span>
                <span className="block text-[14px]" style={{ color: "var(--ms-sub)" }}>{treatment.duration_minutes} min{treatment.price_cents ? ` · from ${cents(treatment.price_cents)}` : ""}</span>
              </span>
              {!initial && <button type="button" onClick={() => { setTreatment(null); setDay(null); }} className="px-2 text-[15px]" style={{ color: "var(--ms-p)" }}>Change</button>}
            </div>
          </section>

          {/* Who with */}
          {team.length > 0 && (
            <section className="pt-7">
              <h2 className="px-5 text-[19px] font-semibold" style={{ color: "var(--ms-ink)" }}>Who with</h2>
              <div className="ms-rail mt-3 flex gap-3 overflow-x-auto px-5 pb-1">
                {[{ id: "any", name: "Anyone available", title: "First open time", photo_url: null } as const, ...team].map((p) => {
                  const on = provider === p.id;
                  return (
                    <button key={p.id} type="button" onClick={() => setProvider(p.id)} aria-pressed={on}
                      className="flex w-[132px] shrink-0 flex-col items-center rounded-2xl bg-white px-2 py-3 text-center transition"
                      style={{ boxShadow: on ? "inset 0 0 0 2px var(--ms-p)" : "inset 0 0 0 1px var(--ms-line)" }}>
                      <span className="grid h-14 w-14 place-items-center overflow-hidden rounded-full text-[20px] font-semibold" style={{ background: "color-mix(in srgb, var(--ms-p) 12%, #fff)", color: "var(--ms-p)" }}>
                        {p.photo_url
                          /* eslint-disable-next-line @next/next/no-img-element */
                          ? <img src={optimizedUrl(p.photo_url, 120)} alt="" className="h-full w-full object-cover" />
                          : p.id === "any" ? <IcCalendar className="h-6 w-6" /> : p.name.replace(/^(dr|mr|mrs|ms)\.?\s+/i, "").slice(0, 1)}
                      </span>
                      <span className="mt-2 w-full truncate text-[14px] font-semibold" style={{ color: "var(--ms-ink)" }}>{p.name}</span>
                      <span className="w-full truncate text-[12px]" style={{ color: "var(--ms-sub)" }}>{p.title}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Day */}
          <section className="pt-7">
            <h2 className="px-5 text-[19px] font-semibold" style={{ color: "var(--ms-ink)" }}>{day ? day.toLocaleDateString(undefined, { month: "long", year: "numeric" }) : "Pick a day"}</h2>
            {openDays.length === 0 ? (
              <p className="px-5 pt-2 text-[15px]" style={{ color: "var(--ms-sub)" }}>No open days in the next three weeks. Call {business.name} to book.</p>
            ) : (
              <div className="ms-rail mt-3 flex gap-2 overflow-x-auto px-5 pb-1">
                {days.map((d) => {
                  const open = openDays.some((o) => o.getTime() === d.getTime());
                  const on = day?.getTime() === d.getTime();
                  return (
                    <button key={d.getTime()} type="button" disabled={!open} onClick={() => setDay(d)} aria-pressed={on}
                      className="flex h-[72px] w-[56px] shrink-0 flex-col items-center justify-center rounded-2xl transition disabled:opacity-35"
                      style={on ? { background: "var(--ms-p)", color: "#fff" } : { background: "#fff", color: "var(--ms-ink)", boxShadow: "inset 0 0 0 1px var(--ms-line)" }}>
                      <span className="text-[12px] font-medium uppercase" style={{ opacity: on ? 0.85 : 0.6 }}>{d.toLocaleDateString(undefined, { weekday: "short" })}</span>
                      <span className="text-[20px] font-semibold tabular-nums">{d.getDate()}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* Time */}
          {day && (
            <section className="px-5 pt-7">
              <h2 className="text-[19px] font-semibold" style={{ color: "var(--ms-ink)" }}>Available times</h2>
              {loading ? (
                <div className="mt-3 grid grid-cols-3 gap-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-white" />)}</div>
              ) : times.length === 0 ? (
                <p className="pt-2 text-[15px]" style={{ color: "var(--ms-sub)" }}>Fully booked. Try another day.</p>
              ) : (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {times.map((t) => {
                    const on = time?.getTime() === t.getTime();
                    return (
                      <button key={t.getTime()} type="button" onClick={() => setTime(t)} aria-pressed={on}
                        className="h-12 rounded-xl text-[15px] font-medium tabular-nums transition"
                        style={on ? { background: "var(--ms-p)", color: "#fff" } : { background: "#fff", color: "var(--ms-ink)", boxShadow: "inset 0 0 0 1px var(--ms-line)" }}>
                        {t.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {time && (
            <section className="px-5 pt-7">
              <label className="text-[15px] font-medium" style={{ color: "var(--ms-sub)" }} htmlFor="ms-notes">Anything we should know? (optional)</label>
              <textarea id="ms-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={300}
                className="mt-2 w-full rounded-2xl bg-white px-4 py-3 text-[16px] outline-none ring-1 ring-[var(--ms-line)] focus:ring-2 focus:ring-[var(--ms-p)]" style={{ color: "var(--ms-ink)" }} />
            </section>
          )}

          {/* Sticky confirm */}
          <div className="fixed inset-x-0 z-30 mx-auto max-w-md px-5" style={{ bottom: "calc(6.9rem + env(safe-area-inset-bottom, 0px))" }}>
            {err && <p className="mb-2 rounded-xl bg-white px-3 py-2 text-center text-[14px] text-rose-600 shadow" role="alert">{err}</p>}
            <button type="button" onClick={request} disabled={!time || sending}
              className="h-14 w-full rounded-2xl text-[17px] font-semibold text-white shadow-[0_12px_30px_-12px_rgba(23,28,45,.5)] transition active:scale-[.99] disabled:opacity-50"
              style={{ background: "var(--ms-p)" }}>
              {sending ? "Sending…" : time ? `Request ${time.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}` : "Pick a time"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
