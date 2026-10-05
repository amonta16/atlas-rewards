/**
 * /<slug>/app/care — CP-185, refined CP-191 · "My care" (med spa layout)
 *
 * The patient's own record: what's due and when, banked credit, the
 * treatments she's had with aftercare for each, and how often the practice
 * recommends each treatment.
 *
 * CP-191 (design critique + UX copy pass): fewer weights (semibold tops out),
 * sentence-case group labels instead of tracked caps, the recommended
 * interval shown as the row's tile ("3 mo") instead of initials + a repeated
 * teal line, an empty state that says what this is and what to do, and the
 * page headings set plainly rather than through the business's decorative
 * heading style.
 */
import { notFound } from "next/navigation";
import { ChevronRight, Wallet } from "lucide-react";
import { getCachedUser } from "@/lib/supabase/server";
import { getBusinessBySlug } from "@/lib/data/customer-app";
import { getMedspaPatientContext } from "@/lib/data/medspa";
import { AppLink } from "@/components/customer/app-link";
import { MsTopBar } from "@/components/medspa-app/chrome";
import { isMedspaApp } from "@/lib/medspa-app/route";
import { cents, describeDue, dueDateFor, type MedspaTreatment } from "@/lib/medspa";

export const dynamic = "force-dynamic";

/** "3 mo" / "4 wk" / "Once" — the tile on each treatment row. */
function interval(w: number | null): { n: string; unit: string; label: string } {
  if (!w) return { n: "1×", unit: "", label: "As needed" };
  if (w >= 8) { const m = Math.round(w / 4.33); return { n: String(m), unit: "mo", label: `Every ${m} month${m === 1 ? "" : "s"}` }; }
  return { n: String(w), unit: "wk", label: `Every ${w} week${w === 1 ? "" : "s"}` };
}

const fmt = (d: Date, o: Intl.DateTimeFormatOptions) => d.toLocaleDateString("en-US", o);

export default async function CarePage({ params }: { params: { business: string } }) {
  const business = await getBusinessBySlug(params.business);
  if (!business || !isMedspaApp(business)) notFound();
  const user = await getCachedUser();
  const ctx = await getMedspaPatientContext(business, user?.id ?? null);
  const { primary } = business.brand_colors;
  const slug = params.business;
  const byId = new Map(ctx.cfg.treatments.map((t) => [t.id, t]));
  const menu = ctx.cfg.treatments.filter((t) => t.is_active);
  const groups = [...new Set(menu.map((t) => t.category))];
  const ink = "var(--ms-ink)";

  return (
    <div className="pb-10">
      {/* CP-193: pushed from Profile, so it gets the back bar. */}
      <MsTopBar slug={slug} title="My care" back="/profile" />
      <p className="px-5 pt-4 text-[16px] leading-snug" style={{ color: "var(--ms-sub)" }}>Your treatments, aftercare, and when you&apos;re due next.</p>

      {/* What's due */}
      {ctx.due.length > 0 ? (
        <section className="mt-5 space-y-2.5 px-4" aria-label="Coming up">
          {ctx.due.map(({ row, due, state }) => {
            const tone = state.tone === "overdue" ? "#9a4a44" : state.tone === "due" ? primary : "#52525b";
            return (
              <div key={row.id} className="flex items-center gap-4 rounded-2xl bg-white p-4 shadow-[0_1px_0_rgba(0,0,0,.04),0_12px_28px_-20px_rgba(0,0,0,.25)] ring-1 ring-black/5">
                <span aria-hidden className="h-11 w-1 shrink-0 rounded-full" style={{ background: tone }} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium" style={{ color: tone }}>{state.label}</div>
                  <div className="truncate text-[17px] font-semibold text-zinc-900">{row.treatment_name}</div>
                  <div className="text-[13px] text-zinc-500">Around {fmt(due, { weekday: "short", month: "short", day: "numeric" })} · last visit {fmt(new Date(row.performed_at), { month: "short", day: "numeric" })}</div>
                </div>
                <AppLink slug={slug} to="/book" className="shrink-0 rounded-full px-4 py-2 text-[14px] font-semibold text-white" style={{ background: primary }}>Book</AppLink>
              </div>
            );
          })}
        </section>
      ) : (
        <section className="mx-4 mt-5 rounded-2xl bg-white p-5 shadow-[0_1px_0_rgba(0,0,0,.04),0_12px_28px_-20px_rgba(0,0,0,.25)] ring-1 ring-black/5">
          <h2 className="text-[17px] font-semibold text-zinc-900">Your care plan starts at your first visit</h2>
          <p className="mt-1.5 text-[15px] leading-relaxed text-zinc-600">After each treatment, your aftercare shows up here, and we&apos;ll let you know when you&apos;re due again.</p>
          <AppLink slug={slug} to="/book" className="mt-4 inline-flex h-11 items-center gap-1 rounded-full px-5 text-[15px] font-semibold text-white" style={{ background: primary }}>
            Book your first visit <ChevronRight className="h-4 w-4" />
          </AppLink>
        </section>
      )}

      {/* Banked credit */}
      {ctx.credits && (
        <section className="mx-4 mt-3 flex items-center gap-3 rounded-2xl bg-white p-4 ring-1 ring-black/5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full" style={{ background: `${primary}14`, color: primary }}><Wallet className="h-[18px] w-[18px]" /></span>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold text-zinc-900">Membership credit</div>
            <div className="text-[13px] text-zinc-500">{ctx.paid ? ctx.cfg.credits.note : "Join the membership to bank credit each month."}</div>
          </div>
          {ctx.paid
            ? <div className="text-right"><div className="text-[20px] font-semibold tabular-nums text-zinc-900">{cents(ctx.credits.balance_cents)}</div>{ctx.credits.next_credit_on && <div className="text-[12px] text-zinc-500">+{cents(ctx.cfg.credits.monthly_credit_cents)} on {fmt(ctx.credits.next_credit_on, { month: "short", day: "numeric" })}</div>}</div>
            : <AppLink slug={slug} to="/membership" className="text-[14px] font-semibold" style={{ color: primary }}>See it</AppLink>}
        </section>
      )}

      {/* History + aftercare */}
      {ctx.cfg.show_history && ctx.log.length > 0 && (
        <section className="mt-9">
          <h2 className="px-5 text-[20px] font-semibold tracking-[-0.01em]" style={{ color: ink }}>Your treatments</h2>
          <ol className="mt-3 space-y-3 px-4">
            {ctx.log.map((row, i) => {
              const t = byId.get(row.treatment_id);
              const due = dueDateFor(row);
              const care = t?.aftercare.filter(Boolean) ?? [];
              const recent = Date.now() - new Date(row.performed_at).getTime() < 14 * 86_400_000;
              const latestOfKind = i === ctx.log.findIndex((r) => r.treatment_id === row.treatment_id);
              return (
                <li key={row.id} className="rounded-2xl bg-white p-4 ring-1 ring-black/5">
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-[16px] font-semibold text-zinc-900">{row.treatment_name}</div>
                      <div className="text-[13px] text-zinc-500">{fmt(new Date(row.performed_at), { month: "long", day: "numeric", year: "numeric" })}{row.provider_name ? ` · ${row.provider_name}` : ""}</div>
                    </div>
                    {due && latestOfKind && <span className="shrink-0 text-[13px] font-medium" style={{ color: primary }}>{describeDue(due).label}</span>}
                  </div>
                  {care.length > 0 && (recent || i === 0) && (
                    <details className="group mt-3 border-t border-zinc-100 pt-3" open={recent}>
                      <summary className="flex cursor-pointer list-none items-center justify-between text-[14px] font-semibold text-zinc-800">
                        Aftercare
                        <ChevronRight className="h-4 w-4 text-zinc-400 transition-transform group-open:rotate-90" />
                      </summary>
                      <ul className="mt-2 space-y-2">
                        {care.map((c, k) => <li key={k} className="flex gap-2.5 text-[14px] leading-snug text-zinc-700"><span className="mt-[8px] h-1 w-1 shrink-0 rounded-full bg-zinc-400" />{c}</li>)}
                      </ul>
                    </details>
                  )}
                  {row.notes && <p className="mt-2 text-[13px] text-zinc-500">From your provider: {row.notes}</p>}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {/* How often to come back */}
      {menu.length > 0 && (
        <section className="mt-9">
          <div className="px-5">
            <h2 className="text-[20px] font-semibold tracking-[-0.01em]" style={{ color: ink }}>How often to come back</h2>
            <p className="mt-1 text-[14px] text-zinc-500">What we usually recommend. Your provider will tailor it to you.</p>
          </div>
          <div className="mt-4 space-y-6 px-4">
            {groups.map((g) => (
              <div key={g}>
                <h3 className="px-1 text-[13px] font-semibold text-zinc-500">{g}</h3>
                <div className="mt-2 divide-y divide-zinc-100 overflow-hidden rounded-2xl bg-white ring-1 ring-black/5">
                  {menu.filter((t) => t.category === g).map((t) => <TreatmentRow key={t.id} t={t} slug={slug} primary={primary} />)}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {menu.length === 0 && ctx.log.length === 0 && (
        <p className="mt-8 px-6 text-center text-[15px] text-zinc-500">{business.name} is adding its treatments. Check back soon.</p>
      )}
    </div>
  );
}

function TreatmentRow({ t, slug, primary }: { t: MedspaTreatment; slug: string; primary: string }) {
  const iv = interval(t.recall_weeks);
  return (
    <AppLink slug={slug} to="/book" className="flex items-center gap-3.5 px-4 py-3.5 active:bg-zinc-50">
      <span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl leading-none" style={{ background: `${primary}10`, color: primary }} aria-label={iv.label} title={iv.label}>
        <span className="text-[17px] font-semibold tabular-nums">{iv.n}</span>
        {iv.unit && <span className="mt-0.5 text-[11px] font-medium">{iv.unit}</span>}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[16px] font-medium text-zinc-900">{t.name}</div>
        <div className="truncate text-[13px] text-zinc-500">{t.description || iv.label}</div>
      </div>
      {t.price_cents != null && t.price_cents > 0 && <span className="shrink-0 text-[14px] tabular-nums text-zinc-500">{cents(t.price_cents)}</span>}
      <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300" />
    </AppLink>
  );
}
