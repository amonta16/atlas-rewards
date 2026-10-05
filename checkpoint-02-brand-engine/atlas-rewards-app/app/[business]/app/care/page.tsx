/**
 * /<slug>/app/care — CP-185 · "My care" (med spa layout)
 *
 * The patient's own record: what's due and when, banked credit, the
 * treatments she's had with aftercare for each, and the menu with recall
 * windows so she can see the rhythm the practice recommends. Reads
 * businesses.medspa_config + medspa_treatment_log via getMedspaPatientContext.
 * Businesses on other layouts never link here; the page still renders a
 * plain "not set up" state rather than 404 if someone types the URL.
 */
import { notFound } from "next/navigation";
import { CalendarClock, ChevronRight, Sparkles, Wallet } from "lucide-react";
import { getCachedUser } from "@/lib/supabase/server";
import { getBusinessBySlug } from "@/lib/data/customer-app";
import { getMedspaPatientContext } from "@/lib/data/medspa";
import { AppLink } from "@/components/customer/app-link";
import { SectionHeading } from "@/components/customer/section-elements";
import { cents, describeDue, dueDateFor, weeksLabel } from "@/lib/medspa";

export const dynamic = "force-dynamic";

export default async function CarePage({ params }: { params: { business: string } }) {
  const business = await getBusinessBySlug(params.business);
  if (!business) notFound();
  const user = await getCachedUser();
  const ctx = await getMedspaPatientContext(business, user?.id ?? null);
  const { primary, secondary } = business.brand_colors;
  const slug = params.business;
  const byId = new Map(ctx.cfg.treatments.map((t) => [t.id, t]));
  const menu = ctx.cfg.treatments.filter((t) => t.is_active);
  const groups = [...new Set(menu.map((t) => t.category))];

  return (
    <div className="pb-8">
      <div className="px-4 pt-5">
        <h1 className="text-xl font-extrabold tracking-tight" style={{ color: "var(--surf-fg, #18181b)" }}>My care</h1>
        <p className="mt-0.5 text-sm text-zinc-500">Your treatments, aftercare and what&apos;s next.</p>
      </div>

      {/* Due now / next up */}
      {ctx.due.length > 0 ? (
        <section className="mt-4 px-4 space-y-2.5">
          {ctx.due.map(({ row, due, state }) => (
            <AppLink key={row.id} slug={slug} to="/book" className="flex items-center gap-3 rounded-3xl p-4 text-white shadow-md active:scale-[0.99] transition"
              style={{ background: state.tone === "overdue" ? "linear-gradient(135deg,#8c4a46,#5e2f2c)" : state.tone === "due" ? `linear-gradient(135deg, ${primary}, ${secondary})` : `linear-gradient(135deg, ${primary}cc, ${secondary}cc)` }}>
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/20 ring-1 ring-white/35"><CalendarClock className="h-5 w-5" /></div>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-black uppercase tracking-widest opacity-85">{state.label}</div>
                <div className="truncate text-base font-extrabold leading-tight">{row.treatment_name}</div>
                <div className="text-xs opacity-90">Around {due.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} · last done {new Date(row.performed_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</div>
              </div>
              <span className="rounded-full bg-white px-3 py-1.5 text-xs font-bold" style={{ color: primary }}>Book</span>
            </AppLink>
          ))}
        </section>
      ) : (
        <section className="mx-4 mt-4 rounded-3xl border bg-white p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-white" style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }}><Sparkles className="h-5 w-5" /></span>
            <div>
              <div className="font-bold text-zinc-900">Nothing on the calendar yet</div>
              <p className="mt-0.5 text-sm text-zinc-500">{ctx.cfg.welcome_note}</p>
              <AppLink slug={slug} to="/book" className="mt-3 inline-flex items-center gap-1 text-sm font-bold" style={{ color: primary }}>Book a visit <ChevronRight className="h-4 w-4" /></AppLink>
            </div>
          </div>
        </section>
      )}

      {/* Credits */}
      {ctx.credits && (
        <section className="mx-4 mt-4 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-xl" style={{ background: `${primary}1a`, color: primary }}><Wallet className="h-4 w-4" /></span>
              <div><div className="text-sm font-bold text-zinc-900">Banked credit</div><div className="text-[11px] text-zinc-500">{ctx.paid ? ctx.cfg.credits.note : "Join the membership to start banking credit each month."}</div></div>
            </div>
            <div className="text-right"><div className="text-xl font-extrabold text-zinc-900">{cents(ctx.credits.balance_cents)}</div>{ctx.credits.next_credit_on && <div className="text-[10px] text-zinc-500">+{cents(ctx.cfg.credits.monthly_credit_cents)} on {ctx.credits.next_credit_on.toLocaleDateString(undefined, { month: "short", day: "numeric" })}</div>}</div>
          </div>
          {!ctx.paid && <AppLink slug={slug} to="/membership" className="mt-3 block rounded-xl py-2 text-center text-xs font-bold text-white" style={{ background: primary }}>See the membership</AppLink>}
        </section>
      )}

      {/* History + aftercare */}
      {ctx.cfg.show_history && ctx.log.length > 0 && (
        <section className="mt-7">
          <div className="px-4"><SectionHeading business={business}>Your treatments</SectionHeading></div>
          <ol className="mt-3 space-y-3 px-4">
            {ctx.log.map((row, i) => {
              const t = byId.get(row.treatment_id);
              const due = dueDateFor(row);
              const care = t?.aftercare.filter(Boolean) ?? [];
              const recent = Date.now() - new Date(row.performed_at).getTime() < 14 * 86_400_000;
              return (
                <li key={row.id} className="rounded-3xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                  <div className="flex items-center gap-3">
                    {t?.image_url
                      /* eslint-disable-next-line @next/next/no-img-element */
                      ? <img src={t.image_url} alt="" className="h-11 w-11 rounded-xl object-cover" />
                      : <span className="grid h-11 w-11 place-items-center rounded-xl text-sm font-extrabold text-white" style={{ background: `linear-gradient(135deg, ${primary}, ${secondary})` }}>{row.treatment_name.slice(0, 2).toUpperCase()}</span>}
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-bold text-zinc-900">{row.treatment_name}</div>
                      <div className="text-xs text-zinc-500">{new Date(row.performed_at).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}{row.provider_name ? ` · ${row.provider_name}` : ""}</div>
                    </div>
                    {due && i === ctx.log.findIndex((r) => r.treatment_id === row.treatment_id) && (
                      <span className="rounded-full px-2.5 py-1 text-[10px] font-bold" style={{ background: `${primary}14`, color: primary }}>{describeDue(due).label}</span>
                    )}
                  </div>
                  {care.length > 0 && (recent || i === 0) && (
                    <details className="mt-3 group" open={recent}>
                      <summary className="cursor-pointer list-none text-xs font-bold" style={{ color: primary }}>Aftercare for this treatment</summary>
                      <ul className="mt-2 space-y-1.5">
                        {care.map((c, k) => <li key={k} className="flex gap-2 text-[13px] leading-snug text-zinc-700"><span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: primary }} />{c}</li>)}
                      </ul>
                    </details>
                  )}
                  {row.notes && <p className="mt-2 text-xs text-zinc-500">Note from your provider: {row.notes}</p>}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {/* The menu + rhythm */}
      {menu.length > 0 && (
        <section className="mt-7">
          <div className="px-4 flex items-baseline justify-between"><SectionHeading business={business}>Treatments &amp; how often</SectionHeading><span className="text-xs text-zinc-500">Recommended rhythm</span></div>
          <div className="mt-3 space-y-5 px-4">
            {groups.map((g) => (
              <div key={g}>
                <div className="mb-2 text-[11px] font-black uppercase tracking-widest text-zinc-400">{g}</div>
                <div className="overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-black/5 divide-y">
                  {menu.filter((t) => t.category === g).map((t) => (
                    <AppLink key={t.id} slug={slug} to="/book" className="flex items-center gap-3 p-3.5 active:bg-zinc-50">
                      {t.image_url
                        /* eslint-disable-next-line @next/next/no-img-element */
                        ? <img src={t.image_url} alt="" className="h-12 w-12 rounded-xl object-cover" />
                        : <span className="grid h-12 w-12 place-items-center rounded-xl text-xs font-extrabold" style={{ background: `${primary}14`, color: primary }}>{t.name.slice(0, 2).toUpperCase()}</span>}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-bold text-zinc-900">{t.name}</div>
                        <div className="truncate text-xs text-zinc-500">{t.description || `${t.duration_minutes} min`}</div>
                        <div className="mt-1 flex flex-wrap gap-x-2 text-[11px]">
                          <span className="font-semibold" style={{ color: primary }}>{weeksLabel(t.recall_weeks)}</span>
                          {t.price_cents != null && t.price_cents > 0 && <span className="text-zinc-500">{cents(t.price_cents)}{t.member_price_cents != null && <> · members {cents(t.member_price_cents)}</>}</span>}
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300" />
                    </AppLink>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {menu.length === 0 && ctx.log.length === 0 && (
        <p className="mt-8 px-6 text-center text-sm text-zinc-500">{business.name} is still setting up treatments. Check back soon.</p>
      )}
    </div>
  );
}
