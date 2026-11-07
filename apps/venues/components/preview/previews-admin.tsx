"use client";
/**
 * PreviewsAdmin — CP-232/233 · the manual "make a preview" form + previews and leads.
 * A lead = an owner who left name, mobile and email on the progress screen.
 * Treatments are pasted one per line: "Botox | Injectables | 150" (category and
 * price optional). Blank fields are filled automatically from the website.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Loader2 } from "lucide-react";

export type AdminPreviewRow = {
  id: string; slug: string; url: string; business_name: string; website: string | null; source: string; status: string;
  build_error: string | null; area_open: boolean | null; treatments_are_examples: boolean; logo_is_monogram: boolean;
  phone: string | null; contact_name: string | null; contact_phone: string | null; contact_email: string | null; contact_at: string | null;
  claimed_at: string | null; created_at: string; expires_at: string;
  utm_campaign: string | null; utm_content: string | null;
};

const CATS = ["Injectables", "Skin", "Laser", "Body", "Wellness", "Consult"];

export function parseTreatmentLines(text: string) {
  return text.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 20).map((line) => {
    const [name, cat, price] = line.split("|").map((x) => x.trim());
    const category = CATS.find((c) => c.toLowerCase() === (cat ?? "").toLowerCase()) ?? "Skin";
    const n = Number((price ?? "").replace(/[^0-9.]/g, ""));
    return { name, category, price: price && Number.isFinite(n) && n > 0 ? n : null };
  });
}

const input = "h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200";

export function PreviewsAdmin({ rows }: { rows: AdminPreviewRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; url?: string } | null>(null);
  const [leadsOnly, setLeadsOnly] = useState(true);
  const leads = rows.filter((r) => r.contact_at);
  const weekAgo = Date.now() - 7 * 86_400_000;
  const shown = leadsOnly ? leads : rows;
  const [f, setF] = useState({ business_name: "", website: "", logo_url: "", primary: "", secondary: "", phone: "", treatments: "" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/preview/admin", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, treatments: parseTreatmentLines(f.treatments) }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setMsg({ ok: false, text: j.error ?? "Couldn't create it." });
      else {
        setMsg({ ok: true, text: j.build_error ? `Built (fell back: ${j.build_error})` : "Built.", url: j.url });
        setF({ business_name: "", website: "", logo_url: "", primary: "", secondary: "", phone: "", treatments: "" });
        router.refresh();
      }
    } catch {
      setMsg({ ok: false, text: navigator.onLine ? "Network error. Try again." : "You're offline." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form onSubmit={submit} className="mt-6 grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">Business name *<input required maxLength={160} value={f.business_name} onChange={set("business_name")} className={`${input} mt-1`} /></label>
        <label className="text-sm font-medium text-slate-700">Website<input value={f.website} onChange={set("website")} placeholder="glowaesthetics.com" className={`${input} mt-1`} /></label>
        <label className="text-sm font-medium text-slate-700">Logo URL<input value={f.logo_url} onChange={set("logo_url")} placeholder="https://…/logo.png (blank = find it)" className={`${input} mt-1`} /></label>
        <label className="text-sm font-medium text-slate-700">Business phone<input value={f.phone} onChange={set("phone")} className={`${input} mt-1`} /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-medium text-slate-700">Primary color<input value={f.primary} onChange={set("primary")} placeholder="#8A5A44" className={`${input} mt-1`} /></label>
          <label className="text-sm font-medium text-slate-700">Second color<input value={f.secondary} onChange={set("secondary")} placeholder="optional" className={`${input} mt-1`} /></label>
        </div>
        <label className="text-sm font-medium text-slate-700 md:col-span-2">Treatments (one per line: name | category | price)
          <textarea value={f.treatments} onChange={set("treatments")} rows={5} placeholder={"Botox | Injectables | 150\nHydraFacial | Skin | 180\nMicroneedling | Skin"} className="mt-1 w-full rounded-lg border border-slate-300 p-3 font-mono text-[13px] focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-200" />
        </label>
        <div className="flex flex-wrap items-center gap-3 md:col-span-2">
          <button disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-60">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}{busy ? "Building… (up to 2 minutes)" : "Create preview"}
          </button>
          {msg && (
            <span className={`text-sm ${msg.ok ? "text-emerald-700" : "text-red-700"}`}>
              {msg.text} {msg.url && <a href={msg.url} target="_blank" rel="noreferrer" className="font-semibold underline">Open</a>}
            </span>
          )}
        </div>
      </form>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm shadow-sm"><b className="text-slate-900">{leads.filter((r) => new Date(r.contact_at!).getTime() > weekAgo).length}</b> <span className="text-slate-500">leads this week</span></div>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm shadow-sm"><b className="text-slate-900">{leads.length}</b> <span className="text-slate-500">leads · {rows.length} previews</span></div>
        <div className="ml-auto inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm shadow-sm">
          <button type="button" onClick={() => setLeadsOnly(true)} className={`rounded-md px-3 py-1.5 ${leadsOnly ? "bg-slate-900 text-white" : "text-slate-600"}`}>Leads</button>
          <button type="button" onClick={() => setLeadsOnly(false)} className={`rounded-md px-3 py-1.5 ${!leadsOnly ? "bg-slate-900 text-white" : "text-slate-600"}`}>All previews</button>
        </div>
      </div>

      <div className="mt-3 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr><th className="px-4 py-3">Spa</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Built with</th><th className="px-4 py-3">Area</th><th className="px-4 py-3">Contact</th><th className="px-4 py-3">Ad</th><th className="px-4 py-3">Created</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shown.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">{leadsOnly ? "No leads yet." : "No previews yet."}</td></tr>}
            {shown.map((r) => {
              const expired = new Date(r.expires_at).getTime() < Date.now();
              return (
                <tr key={r.id} className="align-top">
                  <td className="px-4 py-3">
                    <a href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-slate-900 hover:underline">{r.business_name}<ExternalLink className="h-3.5 w-3.5" /></a>
                    <div className="text-xs text-slate-500">{r.website ?? "no website"} · {r.source}</div>
                  </td>
                  <td className="px-4 py-3">{expired ? "expired" : r.status}{r.claimed_at && <div className="text-xs text-emerald-700">claimed</div>}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {r.logo_is_monogram ? "monogram" : "logo"} · {r.treatments_are_examples ? "example menu" : "their menu"}
                    {r.build_error && <div className="mt-1 max-w-[260px] text-slate-400">{r.build_error}</div>}
                  </td>
                  <td className="px-4 py-3">{r.area_open == null ? "–" : r.area_open ? "open" : "taken"}</td>
                  <td className="px-4 py-3">
                    {r.contact_name || r.contact_phone || r.contact_email ? (
                      <div className="space-y-0.5">
                        {r.contact_name && <div className="font-medium text-slate-900">{r.contact_name}</div>}
                        {r.contact_phone && <a href={`tel:${r.contact_phone}`} className="block text-sky-700 hover:underline">{r.contact_phone}</a>}
                        {r.contact_email && <a href={`mailto:${r.contact_email}`} className="block break-all text-sky-700 hover:underline">{r.contact_email}</a>}
                      </div>
                    ) : <span className="text-slate-400">–</span>}
                    {r.phone && <div className="mt-1 text-xs text-slate-400">Spa: {r.phone}</div>}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">{[r.utm_campaign, r.utm_content].filter(Boolean).join(" / ") || "–"}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{new Date(r.created_at).toLocaleString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
