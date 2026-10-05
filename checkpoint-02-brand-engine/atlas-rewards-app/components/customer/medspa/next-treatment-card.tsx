/**
 * NextTreatmentCard — CP-185 · the med spa Home lead.
 *
 * "Every patient has a due date" on the patient's own phone: her next
 * treatment, when it's due, and (when the practice banks credits) what she
 * has toward it. Before any treatment is logged it invites her to book.
 * Server component; reads from getMedspaPatientContext.
 */
import { CalendarClock, ChevronRight, Wallet } from "lucide-react";
import { AppLink } from "@/components/customer/app-link";
import type { Business } from "@/lib/types/database";
import type { MedspaPatientContext } from "@/lib/data/medspa";
import { cents } from "@/lib/medspa";

export function NextTreatmentCard({ business, slug, ctx, firstName }: { business: Business; slug: string; ctx: MedspaPatientContext; firstName: string }) {
  const { primary, secondary } = business.brand_colors;
  const next = ctx.due[0] ?? null;
  const treatment = next ? ctx.cfg.treatments.find((t) => t.id === next.row.treatment_id) : null;
  const photo = treatment?.image_url ?? null;
  const credit = ctx.credits && ctx.credits.balance_cents > 0 ? ctx.credits : null;
  const tone = next?.state.tone ?? "fresh";
  const ringColor = tone === "overdue" ? "#d58c86" : tone === "due" ? "#e3b26a" : "rgba(255,255,255,.55)";
  const pct = next ? Math.max(0.04, Math.min(1, 1 - next.state.days / ((next.row.recall_weeks ?? 12) * 7))) : 0;

  return (
    <div className="px-4 mt-5">
      <AppLink slug={slug} to={next ? "/care" : "/book"} className="block relative overflow-hidden rounded-3xl p-5 text-white shadow-lg active:scale-[0.99] transition"
        style={{ background: `linear-gradient(135deg, ${primary} 0%, ${secondary} 100%)`, boxShadow: `0 14px 30px -12px ${primary}aa` }}>
        {photo && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0" style={{ background: `linear-gradient(90deg, ${primary}f2 0%, ${primary}cc 60%, ${primary}66 100%)` }} />
          </>
        )}
        <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/10 blur-2xl pointer-events-none" />
        <div className="relative flex items-center gap-4">
          {next ? (
            <Ring pct={pct} color={ringColor}>
              <div className="text-center leading-none">
                <div className="text-[17px] font-extrabold">{Math.abs(next.state.days) <= 21 ? Math.abs(next.state.days) : Math.round(Math.abs(next.state.days) / 7)}</div>
                <div className="text-[8px] font-bold uppercase tracking-wider opacity-80">{Math.abs(next.state.days) <= 21 ? (Math.abs(next.state.days) === 1 ? "day" : "days") : "wks"}</div>
              </div>
            </Ring>
          ) : (
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/20 ring-1 ring-white/40 backdrop-blur-sm"><CalendarClock className="h-6 w-6" /></div>
          )}
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-black uppercase tracking-widest opacity-85">{next ? (tone === "overdue" ? "You're past due" : tone === "due" ? "You're due" : "Your next treatment") : `Start your plan, ${firstName}`}</div>
            <div className="text-lg font-extrabold leading-tight truncate">{next ? next.row.treatment_name : "Book your first visit"}</div>
            <div className="mt-0.5 text-xs opacity-90">
              {next
                ? <>{next.state.label} · around {next.due.toLocaleDateString(undefined, { month: "short", day: "numeric" })}{next.row.provider_name ? ` with ${next.row.provider_name.split(" ")[0]}` : ""}</>
                : "Your due dates and aftercare will live here."}
            </div>
          </div>
          <ChevronRight className="h-5 w-5 shrink-0 opacity-90" />
        </div>
        {credit && (
          <div className="relative mt-4 flex items-center justify-between rounded-2xl bg-white/15 px-3.5 py-2.5 ring-1 ring-white/25 backdrop-blur-sm">
            <span className="flex items-center gap-2 text-xs font-semibold"><Wallet className="h-4 w-4" />Banked toward your next visit</span>
            <span className="text-base font-extrabold">{cents(credit.balance_cents)}</span>
          </div>
        )}
      </AppLink>
    </div>
  );
}

function Ring({ pct, color, children }: { pct: number; color: string; children: React.ReactNode }) {
  const r = 24, c = 2 * Math.PI * r;
  return (
    <div className="relative h-16 w-16 shrink-0">
      <svg viewBox="0 0 56 56" className="h-full w-full -rotate-90">
        <circle cx="28" cy="28" r={r} fill="rgba(255,255,255,.12)" stroke="rgba(255,255,255,.25)" strokeWidth="4" />
        <circle cx="28" cy="28" r={r} fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}
