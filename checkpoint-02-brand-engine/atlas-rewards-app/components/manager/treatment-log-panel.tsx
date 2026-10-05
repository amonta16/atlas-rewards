"use client";
/**
 * TreatmentLogPanel — CP-185 · front desk, med spa layout only.
 *
 * After the visit: tap the treatment, (optionally) the provider and credit
 * applied, and Atlas writes medspa_treatment_log. That one row is what
 * powers the patient's "next treatment" card, her aftercare, and the due
 * list. Keeps the desk's rule: one screen, big targets, no typing unless
 * you want to add a note.
 */
import { useEffect, useMemo, useState } from "react";
import { Check, Syringe, Undo2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { Business } from "@/lib/types/database";
import { cents, describeDue, dueDateFor, readMedspaConfig, type TreatmentLogRow } from "@/lib/medspa";

export function TreatmentLogPanel({ business, userId, memberName, onLogged }: { business: Business; userId: string; memberName: string; onLogged?: () => void }) {
  const cfg = useMemo(() => readMedspaConfig(business.medspa_config), [business.medspa_config]);
  const treatments = cfg.treatments.filter((t) => t.is_active);
  const providers = cfg.providers.filter((p) => p.is_active && p.name.trim());
  const [treatmentId, setTreatmentId] = useState<string | null>(null);
  const [providerId, setProviderId] = useState<string | null>(providers[0]?.id ?? null);
  const [credit, setCredit] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [recent, setRecent] = useState<TreatmentLogRow[]>([]);
  const [tick, setTick] = useState(0);
  // CP-190: paid packages with sessions left (from the Shop).
  const [pkgs, setPkgs] = useState<{ id: string; item_name: string; treatment_id: string | null; sessions_total: number; sessions_used: number }[]>([]);
  const [usePkg, setUsePkg] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.from("medspa_treatment_log").select("*").eq("business_id", business.id).eq("user_id", userId).order("performed_at", { ascending: false }).limit(5)
      .then(({ data }) => setRecent((data ?? []) as TreatmentLogRow[]));
    supabase.from("medspa_shop_orders").select("id,item_name,treatment_id,sessions_total,sessions_used").eq("business_id", business.id).eq("user_id", userId).eq("kind", "package").eq("status", "paid")
      .then(({ data }) => setPkgs(((data ?? []) as typeof pkgs).filter((o) => (o.sessions_total ?? 0) > o.sessions_used)));
  }, [business.id, userId, tick]);

  const primary = business.brand_colors.primary;
  const chosen = treatments.find((t) => t.id === treatmentId) ?? null;
  const pkgFor = chosen ? pkgs.filter((o) => !o.treatment_id || o.treatment_id === chosen.id) : [];
  const eligibleProviders = chosen ? providers.filter((p) => p.treatment_ids.length === 0 || p.treatment_ids.includes(chosen.id)) : providers;

  async function log() {
    if (!chosen) return;
    setBusy(true); setErr(null);
    const supabase = createClient();
    const prov = eligibleProviders.find((p) => p.id === providerId) ?? null;
    const creditCents = credit ? Math.round(parseFloat(credit) * 100) || 0 : 0;
    const { error } = await supabase.from("medspa_treatment_log").insert({
      business_id: business.id, user_id: userId, treatment_id: chosen.id, treatment_name: chosen.name,
      provider_id: prov?.id ?? null, provider_name: prov?.name ?? null, recall_weeks: chosen.recall_weeks,
      notes: notes.trim() || null, credit_used_cents: creditCents,
    });
    if (!error && usePkg) {
      const o = pkgs.find((x) => x.id === usePkg);
      if (o) {
        const used = o.sessions_used + 1;
        await supabase.from("medspa_shop_orders").update({ sessions_used: used, ...(used >= o.sessions_total ? { status: "fulfilled", fulfilled_at: new Date().toISOString() } : {}) }).eq("id", o.id);
      }
      setUsePkg(null);
    }
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setTreatmentId(null); setCredit(""); setNotes(""); setTick((k) => k + 1); onLogged?.();
  }

  async function undo(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from("medspa_treatment_log").delete().eq("id", id);
    if (error) setErr(error.message); else setTick((k) => k + 1);
  }

  if (treatments.length === 0) {
    return (
      <div className="mt-6 rounded-2xl border border-dashed bg-white p-4 text-sm text-zinc-500">
        <b className="text-zinc-800">Log a treatment</b> — add your treatment menu in the app builder (Treatments tab) and it shows up here.
      </div>
    );
  }

  return (
    <div className="mt-6">
      <h3 className="text-sm font-bold tracking-wide text-zinc-500 uppercase">Treatment today</h3>
      <div className="mt-2 rounded-2xl border bg-white p-4 shadow-sm">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {treatments.map((t) => {
            const on = t.id === treatmentId;
            return (
              <button key={t.id} type="button" onClick={() => setTreatmentId(on ? null : t.id)}
                className={cn("rounded-xl border px-3 py-2.5 text-left transition", on ? "text-white shadow" : "bg-white hover:bg-zinc-50")}
                style={on ? { background: primary, borderColor: primary } : undefined}>
                <div className="text-sm font-semibold leading-tight">{t.name}</div>
                <div className={cn("text-[11px]", on ? "text-white/80" : "text-zinc-500")}>{t.recall_weeks ? `due again in ${t.recall_weeks} wks` : "no recall"}</div>
              </button>
            );
          })}
        </div>

        {chosen && (
          <div className="mt-4 space-y-3 border-t pt-4">
            {eligibleProviders.length > 0 && (
              <div>
                <div className="mb-1.5 text-xs font-semibold text-zinc-500">Provider</div>
                <div className="flex flex-wrap gap-1.5">
                  {eligibleProviders.map((p) => (
                    <button key={p.id} type="button" onClick={() => setProviderId(p.id)} className={cn("rounded-full border px-3 py-1.5 text-xs font-semibold", providerId === p.id ? "border-zinc-900 bg-zinc-900 text-white" : "bg-white text-zinc-700")}>{p.name}</button>
                  ))}
                </div>
              </div>
            )}
            {pkgFor.length > 0 && (
              <div className="space-y-1.5">
                {pkgFor.map((o) => (
                  <label key={o.id} className={cn("flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm", usePkg === o.id && "ring-2")} style={usePkg === o.id ? { borderColor: primary, boxShadow: `0 0 0 2px ${primary}33` } : undefined}>
                    <input type="checkbox" checked={usePkg === o.id} onChange={(e) => setUsePkg(e.target.checked ? o.id : null)} />
                    <span className="flex-1"><b>Use a package session</b> · {o.item_name}</span>
                    <span className="text-xs font-semibold text-zinc-500">{o.sessions_total - o.sessions_used} of {o.sessions_total} left</span>
                  </label>
                ))}
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {cfg.credits.enabled && (
                <label className="block">
                  <span className="text-xs font-semibold text-zinc-500">Membership credit applied</span>
                  <div className="relative mt-1"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">$</span><input inputMode="decimal" value={credit} onChange={(e) => setCredit(e.target.value.replace(/[^\d.]/g, ""))} className="w-full rounded-lg border py-2 pl-7 pr-3 text-sm" placeholder="0" /></div>
                </label>
              )}
              <label className="block">
                <span className="text-xs font-semibold text-zinc-500">Note for the patient (optional)</span>
                <input value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" placeholder="20 units, forehead + glabella" />
              </label>
            </div>
            <div className="rounded-xl bg-zinc-50 p-3 text-xs text-zinc-600">
              {chosen.recall_weeks
                ? <>{memberName.split(" ")[0]} will see <b className="text-zinc-900">due around {new Date(Date.now() + chosen.recall_weeks * 7 * 86_400_000).toLocaleDateString(undefined, { month: "long", day: "numeric" })}</b>{chosen.aftercare.length ? ` and ${chosen.aftercare.length} aftercare steps` : ""} in the app right away.</>
                : <>No recall window on this treatment; it&apos;s added to her history{chosen.aftercare.length ? " with aftercare" : ""}.</>}
            </div>
            {err && <div className="text-sm text-red-600">{err}</div>}
            <Button onClick={log} disabled={busy} className="w-full text-white" style={{ background: primary }}><Syringe className="mr-2 h-4 w-4" />{busy ? "Saving…" : `Log ${chosen.name}`}</Button>
          </div>
        )}

        {recent.length > 0 && (
          <div className="mt-4 border-t pt-3">
            <div className="text-xs font-semibold text-zinc-500">Recent</div>
            <ul className="mt-1.5 divide-y">
              {recent.map((r) => {
                const due = dueDateFor(r);
                const fresh = Date.now() - new Date(r.created_at ?? r.performed_at).getTime() < 15 * 60_000;
                return (
                  <li key={r.id} className="flex items-center gap-3 py-2 text-sm">
                    <Check className="h-4 w-4 text-emerald-600" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{r.treatment_name}{r.provider_name ? <span className="text-zinc-400"> · {r.provider_name}</span> : null}</div>
                      <div className="text-[11px] text-zinc-500">{new Date(r.performed_at).toLocaleDateString()}{due ? ` · ${describeDue(due).label}` : ""}{r.credit_used_cents ? ` · ${cents(r.credit_used_cents)} credit` : ""}</div>
                    </div>
                    {fresh && <button type="button" onClick={() => undo(r.id)} className="flex items-center gap-1 text-xs text-zinc-500 hover:text-red-600"><Undo2 className="h-3.5 w-3.5" />Undo</button>}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
