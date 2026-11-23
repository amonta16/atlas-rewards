"use client";
/**
 * components/agency/outreach/find.tsx — CP-250 · Find leads: Places search by area, CSV import, manual add.
 * Added leads are read right away (site + email + AI draft), one at a time, so they land in Review.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, FileUp, Loader2, MapPin, Plus, Search, Star } from "lucide-react";
import { parseCsv, type Campaign } from "@/lib/outreach/shared";
import type { PlaceHit } from "@/lib/outreach/places-search";
import { api, btnGhost, btnPrimary, card, input, inputBase, Note, useBusy } from "./ui";

type Hit = PlaceHit & { have: boolean };

export function FindTab({ campaigns, disabled, placesReady, onDone }: { campaigns: Campaign[]; disabled: boolean; placesReady: boolean; onDone: () => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("med spa in ");
  const [hits, setHits] = useState<Hit[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [campaign, setCampaign] = useState<string>(campaigns[0]?.id ?? "");
  const [newCamp, setNewCamp] = useState("");
  const [progress, setProgress] = useState<string | null>(null);
  const { busy, setBusy, msg, setMsg } = useBusy();

  async function search(more = false) {
    setBusy("search"); setMsg(null);
    const r = await api<{ hits: Hit[]; next: string | null }>("search", { query, pageToken: more ? next : null });
    if (r.ok) {
      const list = more ? [...hits, ...r.data.hits] : r.data.hits;
      setHits(list); setNext(r.data.next);
      if (!more) setPicked(new Set(list.filter((h) => !h.have && h.website && h.open).map((h) => h.placeId)));
      if (!list.length) setMsg({ ok: false, text: "No results. Try a city and state, e.g. \"med spa in Fresno, CA\"." });
    } else setMsg({ ok: false, text: r.error });
    setBusy(null);
  }

  async function ensureCampaign(): Promise<string | null> {
    if (campaign !== "new") return campaign || null;
    const name = newCamp.trim() || query.replace(/^med ?spas? (in )?/i, "").trim() || "Med spas";
    const r = await api<{ id: string }>("campaign", { name: name.slice(0, 80), area: query.slice(0, 120) });
    if (!r.ok) { setMsg({ ok: false, text: r.error }); return null; }
    setCampaign(r.data.id);
    return r.data.id;
  }

  /** Read each new lead's site (and draft email 1) one at a time, so progress shows and nothing times out. */
  async function readAll(ids: string[]) {
    for (let i = 0; i < ids.length; i++) {
      setProgress(`Reading sites and drafting emails: ${i + 1} of ${ids.length}…`);
      await api("enrich", { lead_id: ids[i] });
    }
    setProgress(null);
  }

  async function add() {
    setBusy("add"); setMsg(null);
    const camp = await ensureCampaign();
    const places = hits.filter((h) => picked.has(h.placeId));
    const r = await api<{ added: number; dupes: number; ids: string[] }>("add_places", { campaign_id: camp, places });
    if (!r.ok) { setMsg({ ok: false, text: r.error }); setBusy(null); return; }
    setHits((hs) => hs.map((h) => (picked.has(h.placeId) ? { ...h, have: true } : h)));
    setPicked(new Set());
    await readAll(r.data.ids);
    setMsg({ ok: true, text: `Added ${r.data.added} spa${r.data.added === 1 ? "" : "s"}${r.data.dupes ? ` (${r.data.dupes} already in the list)` : ""}. Drafts are in Review.` });
    setBusy(null);
    router.refresh();
  }

  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="space-y-5">
      <section className={`${card} p-4`}>
        <h2 className="font-medium text-slate-900">Search Google for med spas</h2>
        <p className="mt-0.5 text-sm text-slate-500">A city, a neighborhood or a zip. Up to 60 results per search. Spas without a website are unchecked: there&apos;s nothing to read and usually no email.</p>
        {!placesReady && <p className="mt-2 text-sm text-amber-800">GOOGLE_PLACES_API_KEY isn&apos;t set here, so search won&apos;t work in this environment.</p>}
        <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); search(false); }}>
          <input className={input} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="med spa in Fresno, CA" aria-label="Search" />
          <button type="submit" className={btnPrimary} disabled={disabled || busy !== null || query.trim().length < 3}>
            {busy === "search" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Search
          </button>
        </form>

        {hits.length > 0 && (
          <>
            <div className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
              {hits.map((h) => (
                <label key={h.placeId} className={`flex cursor-pointer items-start gap-3 px-3 py-2.5 ${h.have ? "opacity-60" : "hover:bg-slate-50"}`}>
                  <input type="checkbox" className="mt-1 h-4 w-4 accent-sky-600" disabled={h.have} checked={picked.has(h.placeId)} onChange={() => toggle(h.placeId)} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 text-sm font-medium text-slate-900">
                      {h.name}
                      {h.have && <span className="inline-flex items-center gap-1 text-xs font-normal text-emerald-700"><Check className="h-3 w-3" /> in list</span>}
                      {!h.open && <span className="text-xs font-normal text-rose-700">closed</span>}
                    </span>
                    <span className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{h.address ?? "—"}</span>
                      {h.rating != null && <span className="inline-flex items-center gap-1"><Star className="h-3 w-3" />{h.rating} ({h.reviews ?? 0})</span>}
                      {h.website ? <span className="truncate text-sky-700">{h.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</span> : <span className="text-amber-700">no website</span>}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <select className={`${inputBase} w-auto`} value={campaign} onChange={(e) => setCampaign(e.target.value)} aria-label="Campaign">
                <option value="">No campaign</option>
                {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                <option value="new">+ New campaign…</option>
              </select>
              {campaign === "new" && <input className={`${inputBase} w-56`} value={newCamp} onChange={(e) => setNewCamp(e.target.value)} placeholder="e.g. Fresno med spas" aria-label="New campaign name" />}
              <button type="button" className={btnPrimary} onClick={add} disabled={disabled || busy !== null || !picked.size}>
                {busy === "add" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add {picked.size || ""} and draft emails
              </button>
              {next && <button type="button" className={btnGhost} onClick={() => search(true)} disabled={busy !== null}>More results</button>}
            </div>
          </>
        )}
        {progress && <p className="mt-3 inline-flex items-center gap-2 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" />{progress}</p>}
        <div className="mt-2"><Note msg={msg} /></div>
        {msg?.ok && <button type="button" className={`${btnGhost} mt-2`} onClick={onDone}>Go to Review</button>}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <ImportCsv campaigns={campaigns} disabled={disabled} readAll={readAll} />
        <ManualAdd campaigns={campaigns} disabled={disabled} readAll={readAll} />
      </div>
    </div>
  );
}

function ImportCsv({ campaigns, disabled, readAll }: { campaigns: Campaign[]; disabled: boolean; readAll: (ids: string[]) => Promise<void> }) {
  const router = useRouter();
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [campaign, setCampaign] = useState("");
  const { busy, setBusy, msg, setMsg } = useBusy();
  async function file(f: File | undefined) {
    if (!f) return;
    const parsed = parseCsv(await f.text());
    setRows(parsed);
    setMsg(parsed.length ? { ok: true, text: `${parsed.length} rows ready.` } : { ok: false, text: "No rows found." });
  }
  async function go() {
    setBusy("import"); setMsg(null);
    const r = await api<{ added: number; dupes: number; ids: string[] }>("import", { rows, campaign_id: campaign || null });
    if (r.ok) {
      await readAll(r.data.ids);
      setMsg({ ok: true, text: `Imported ${r.data.added}${r.data.dupes ? `, skipped ${r.data.dupes} already in the list` : ""}.` });
      setRows([]); router.refresh();
    } else setMsg({ ok: false, text: r.error });
    setBusy(null);
  }
  return (
    <section className={`${card} p-4`}>
      <h2 className="font-medium text-slate-900">Import a CSV</h2>
      <p className="mt-0.5 text-sm text-slate-500">Columns: <code>business_name</code>, <code>website</code>, <code>email</code>, <code>first_name</code>, <code>city</code>, <code>state</code>, <code>phone</code>. Only business contacts you&apos;re allowed to email.</p>
      <label className={`${btnGhost} mt-3 cursor-pointer`}>
        <FileUp className="h-4 w-4" /> Choose file
        <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => file(e.target.files?.[0])} />
      </label>
      {rows.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select className={`${inputBase} w-auto`} value={campaign} onChange={(e) => setCampaign(e.target.value)} aria-label="Campaign">
            <option value="">No campaign</option>
            {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button type="button" className={btnPrimary} onClick={go} disabled={disabled || busy !== null}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Import {rows.length}
          </button>
        </div>
      )}
      <div className="mt-2"><Note msg={msg} /></div>
    </section>
  );
}

function ManualAdd({ campaigns, disabled, readAll }: { campaigns: Campaign[]; disabled: boolean; readAll: (ids: string[]) => Promise<void> }) {
  const router = useRouter();
  const empty = { business_name: "", website: "", email: "", first_name: "", city: "", state: "", campaign_id: "" };
  const [f, setF] = useState(empty);
  const { busy, setBusy, msg, setMsg } = useBusy();
  async function go(e: React.FormEvent) {
    e.preventDefault();
    setBusy("add"); setMsg(null);
    const r = await api<{ ids: string[] }>("add_manual", { ...f, campaign_id: f.campaign_id || null });
    if (r.ok) { await readAll(r.data.ids); setF(empty); setMsg({ ok: true, text: "Added. Its draft is in Review." }); router.refresh(); }
    else setMsg({ ok: false, text: r.error });
    setBusy(null);
  }
  const field = (k: keyof typeof empty, label: string, ph = "") => (
    <label className="text-sm">
      <span className="text-slate-600">{label}</span>
      <input className={`${input} mt-1`} value={f[k]} placeholder={ph} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </label>
  );
  return (
    <form className={`${card} p-4`} onSubmit={go}>
      <h2 className="font-medium text-slate-900">Add one by hand</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {field("business_name", "Spa name *", "Glow Aesthetics")}
        {field("website", "Website", "glowaesthetics.com")}
        {field("email", "Email", "hello@glowaesthetics.com")}
        {field("first_name", "Owner's first name", "Optional")}
        {field("city", "City")}
        {field("state", "State", "CA")}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select className={`${inputBase} w-auto`} value={f.campaign_id} onChange={(e) => setF({ ...f, campaign_id: e.target.value })} aria-label="Campaign">
          <option value="">No campaign</option>
          {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button type="submit" className={btnPrimary} disabled={disabled || busy !== null || !f.business_name.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
        </button>
      </div>
      <div className="mt-2"><Note msg={msg} /></div>
    </form>
  );
}
