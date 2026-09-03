"use client";
/**
 * field-batch-modal.tsx — CP-114 (batch demo pre-generator)
 *
 * The "pre-generate a whole street" tool. Paste a target list — one business
 * per line, optionally "Name, niche" — and it loops the CP-113
 * create_demo_business RPC to build every demo up front, into the Demos
 * folder, so each door is already ready during the day.
 *
 * No new SQL: it reuses the verified generator. Batch skips the logo step
 * (you can't snap 20 logos in advance), so each demo gets a color theme +
 * a monogram tile; the on-the-spot button is still there for real logos.
 */

import { useMemo, useState } from "react";
import { Loader2, Layers, Check, X, ExternalLink, Copy, AlertCircle, MapPin } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  NICHE_ORDER, NICHE_META, PRESET_THEMES, themeForIndex,
  getDemoPack, packPayload, guessNiche, demoDesignPayload, type DemoNiche,
} from "@/lib/demo-packs";
import { monogramDataUrl } from "@/lib/logo-colors";
import { cityFromAddress, fileDemoIntoFolders } from "@/lib/demo-folders";

function slugify(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "demo";
}

type Row = { name: string; niche: DemoNiche };
type RowResult = { name: string; niche: DemoNiche; ok: boolean; slug?: string; url?: string; error?: string };

/** Parse the textarea: one business per line, optional trailing ", niche". */
function parseRows(text: string, fallback: DemoNiche): Row[] {
  return text.split("\n").map((raw) => {
    const line = raw.trim();
    if (!line) return null;
    const comma = line.lastIndexOf(",");
    if (comma > 0) {
      const name = line.slice(0, comma).trim();
      const hint = line.slice(comma + 1).trim();
      if (name) return { name, niche: guessNiche(hint, fallback) };
    }
    return { name: line, niche: guessNiche(line, fallback) };
  }).filter(Boolean) as Row[];
}

export function FieldBatchModal({
  rootDomain, onClose, onCreated,
}: {
  rootDomain: string;
  onClose: () => void;
  onCreated?: () => void;
}) {
  const [text, setText] = useState("");
  const [fallbackNiche, setFallbackNiche] = useState<DemoNiche>("food");
  const [themeId, setThemeId] = useState<string>("auto");   // "auto" = varied
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [results, setResults] = useState<RowResult[]>([]);
  const [copied, setCopied] = useState(false);
  // CP-128.2: "Scan this plaza" — Places nearby → checklist → list lines.
  const [scanBusy, setScanBusy] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [nearby, setNearby] = useState<
    Array<{ name: string; address: string | null; niche: DemoNiche; checked: boolean; reviewUrl: string | null }> | null
  >(null);
  // CP-129: what the scan knew about each shop (address for auto-filing,
  // review link for the review boost) — survives into the build loop.
  const [scanInfo, setScanInfo] = useState<Record<string, { address: string | null; reviewUrl: string | null }>>({});

  const isDev = rootDomain.includes("lvh.me");
  const appUrl = (slug: string) =>
    `${isDev ? "http" : "https"}://${slug}.${rootDomain}${isDev ? ":3000" : ""}`;

  const rows = useMemo(() => parseRows(text, fallbackNiche), [text, fallbackNiche]);
  const builtOk = results.filter((r) => r.ok).length;

  async function run() {
    if (rows.length === 0) return;
    setRunning(true); setDone(false); setResults([]);
    const supabase = createClient();
    const acc: RowResult[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const theme = themeId === "auto"
        ? themeForIndex(i)
        : (PRESET_THEMES.find((t) => t.id === themeId) ?? themeForIndex(i));
      try {
        const pack = getDemoPack(row.niche);
        const { data, error } = await supabase.rpc("create_demo_business", {
          p_name: row.name,
          p_slug: slugify(row.name),
          p_industry: pack.industry,
          p_brand_colors: theme.colors,
          p_logo_url: monogramDataUrl(row.name, theme.colors),
          p_pack: packPayload(pack),
        });
        if (error) throw new Error(error.message);
        const out: any = Array.isArray(data) ? data[0] : data;
        const slug = out?.new_slug as string;
        acc.push({ name: row.name, niche: row.niche, ok: true, slug, url: appUrl(slug) });
        // CP-128.2: best-effort pipeline log — one open 'prepared_app'
        // prospect per business, never blocks the batch.
        try {
          const { data: existing } = await supabase
            .from("agency_pipeline").select("id")
            .ilike("name", row.name).eq("status", "open").limit(1);
          if (!existing?.length) {
            await supabase.from("agency_pipeline").insert({
              name: row.name,
              stage: "prepared_app",
              lead_source: "door_to_door",
              notes: `Batch demo: ${appUrl(slug)}`,
            });
          }
        } catch { /* best-effort */ }
        // CP-129: house design preset + review boost + auto-filing into
        // "<City>" ▸ "<Niche>" folders. All best-effort.
        if (out?.new_business_id) {
          const bizId = out.new_business_id as string;
          const info = scanInfo[row.name.toLowerCase()];
          try {
            const { data: wc } = await supabase
              .from("businesses").select("widget_config").eq("id", bizId).single();
            const widget = { ...((wc?.widget_config as Record<string, unknown> | null) ?? {}), reviews: true };
            await supabase.from("businesses").update({
              ...demoDesignPayload(i),
              widget_config: widget,
              ...(info?.reviewUrl ? { google_review_url: info.reviewUrl } : {}),
            }).eq("id", bizId);
          } catch { /* best-effort */ }
          const city = cityFromAddress(info?.address);
          if (city) await fileDemoIntoFolders(supabase, bizId, city, NICHE_META[row.niche].label);
        }
      } catch (e: any) {
        acc.push({ name: row.name, niche: row.niche, ok: false, error: e?.message ?? "failed" });
      }
      setResults([...acc]);   // live progress
    }

    setRunning(false); setDone(true);
    onCreated?.();
  }

  function copyAll() {
    const links = results.filter((r) => r.ok).map((r) => `${r.name}: ${r.url}`).join("\n");
    navigator.clipboard?.writeText(links);
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  }

  function restart() {
    setDone(false); setResults([]); setText("");
  }

  // CP-128.2: pull every storefront around the rep into a checklist.
  async function scanNearby() {
    if (scanBusy) return;
    setScanBusy(true); setScanNote(null); setNearby(null);
    try {
      const pos = await new Promise<GeolocationPosition | null>((res) => {
        if (!navigator.geolocation) return res(null);
        const t = window.setTimeout(() => res(null), 6000);
        navigator.geolocation.getCurrentPosition(
          (g) => { window.clearTimeout(t); res(g); },
          () => { window.clearTimeout(t); res(null); },
          { enableHighAccuracy: true, timeout: 5500 },
        );
      });
      if (!pos) { setScanNote("Location needed — allow location access and try again."); return; }
      const r = await fetch("/api/field/places-nearby", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat: pos.coords.latitude, lng: pos.coords.longitude, radius: 250 }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setScanNote(j?.error === "places_not_configured"
          ? "Scan needs GOOGLE_PLACES_API_KEY in Vercel — paste names manually meanwhile."
          : (j?.error || "Scan failed — paste names manually."));
        return;
      }
      const found = ((j.places ?? []) as Array<{ name?: string; address?: string | null; niche?: string; reviewUrl?: string | null }>)
        .map((p) => ({
          // commas would split the "name, niche" line format
          name: String(p.name || "").replace(/,/g, " ").replace(/\s+/g, " ").trim(),
          address: p.address ?? null,
          niche: (p.niche && p.niche in NICHE_META ? p.niche : "general") as DemoNiche,
          checked: true,
          reviewUrl: p.reviewUrl ?? null,
        }))
        .filter((p) => p.name);
      if (!found.length) { setScanNote("Nothing storefront-shaped found here."); return; }
      setNearby(found);
    } catch {
      setScanNote("Scan failed — paste names manually.");
    } finally {
      setScanBusy(false);
    }
  }

  function addNearby() {
    if (!nearby) return;
    const existing = new Set(rows.map((r) => r.name.toLowerCase()));
    const lines = nearby
      .filter((p) => p.checked && !existing.has(p.name.toLowerCase()))
      .map((p) => `${p.name}, ${p.niche}`);
    if (lines.length) {
      setText((t) => (t.trim() ? t.replace(/\s+$/, "") + "\n" : "") + lines.join("\n"));
    }
    // CP-129: remember each added shop's address + review link for the run.
    setScanInfo((prev) => {
      const next = { ...prev };
      for (const p of nearby) {
        if (p.checked) next[p.name.toLowerCase()] = { address: p.address, reviewUrl: p.reviewUrl };
      }
      return next;
    });
    setNearby(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4"
         onClick={running ? undefined : onClose}>
      <div className="w-full sm:max-w-md bg-white text-zinc-900 rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl"
           style={{ maxHeight: "92vh" }} onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b flex items-center justify-between bg-gradient-to-r from-cyan-50 to-white">
          <div className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-cyan-600" />
            <h2 className="text-base font-extrabold">Batch demos</h2>
          </div>
          <button onClick={onClose} disabled={running} aria-label="Close"
                  className="p-1.5 rounded-full hover:bg-black/5 disabled:opacity-40">
            <X className="h-4 w-4 text-zinc-500" />
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto" style={{ maxHeight: "calc(92vh - 60px)" }}>
          {results.length === 0 && !running ? (
            /* ── SETUP ────────────────────────────────────────────── */
            <div className="space-y-4">
              {/* CP-128.2: scan the plaza you're standing in. */}
              <div>
                <button onClick={scanNearby} disabled={scanBusy}
                  className="w-full rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2.5 text-sm font-bold text-cyan-700 disabled:opacity-50 flex items-center justify-center gap-1.5">
                  {scanBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                  {scanBusy ? "Scanning nearby…" : "Scan this plaza"}
                </button>
                {scanNote && <p className="text-[11px] text-zinc-500 mt-1.5">{scanNote}</p>}
                {nearby && (
                  <div className="mt-2 rounded-xl border overflow-hidden">
                    <div className="max-h-44 overflow-y-auto divide-y">
                      {nearby.map((p, i) => (
                        <div key={i} className="flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-zinc-50">
                          <input type="checkbox" checked={p.checked}
                            onChange={() => setNearby(n => n && n.map((x, xi) => (xi === i ? { ...x, checked: !x.checked } : x)))} />
                          <span className="min-w-0 flex-1 cursor-pointer"
                            onClick={() => setNearby(n => n && n.map((x, xi) => (xi === i ? { ...x, checked: !x.checked } : x)))}>
                            <span className="font-semibold text-zinc-900 block truncate">{p.name}</span>
                            {p.address && <span className="text-[10px] text-zinc-400 block truncate">{p.address}</span>}
                          </span>
                          {/* CP-129: mixed plazas — fix a wrong niche guess on the spot. */}
                          <select
                            value={p.niche}
                            onChange={(e) => {
                              const v = e.target.value as DemoNiche;
                              setNearby(n => n && n.map((x, xi) => (xi === i ? { ...x, niche: v } : x)));
                            }}
                            className="shrink-0 rounded-lg border bg-white px-1.5 py-1 text-xs font-semibold text-zinc-700"
                          >
                            {NICHE_ORDER.map(k => (
                              <option key={k} value={k}>{NICHE_META[k].emoji} {NICHE_META[k].label.split(" ")[0]}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                    <button onClick={addNearby}
                      className="w-full border-t bg-cyan-50 px-3 py-2 text-xs font-bold text-cyan-700">
                      Add {nearby.filter(p => p.checked).length} to the list
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-600">Your list</label>
                <p className="text-[11px] text-zinc-400 mb-1">One business per line. Add a type after a comma, or let it guess.</p>
                <textarea
                  value={text} onChange={(e) => setText(e.target.value)} rows={7} autoFocus
                  placeholder={"Joe's Diner, food\nVapor Kings, smoke\nGlow Bar, beauty\nMain St Coffee"}
                  className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm font-mono text-zinc-900 placeholder:text-zinc-400 outline-none focus:ring-2 focus:ring-cyan-400 resize-y"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-600">If a line doesn't say a type, assume</label>
                <div className="mt-1 grid grid-cols-4 gap-1.5">
                  {NICHE_ORDER.map((k) => (
                    <button key={k} onClick={() => setFallbackNiche(k)}
                      className={`rounded-xl border px-2 py-2 text-sm font-semibold flex flex-col items-center gap-0.5 ${
                        fallbackNiche === k ? "border-cyan-500 bg-cyan-50 text-cyan-700" : "border-zinc-200 text-zinc-600"}`}>
                      <span className="text-lg leading-none">{NICHE_META[k].emoji}</span>
                      {NICHE_META[k].label.split(" ")[0]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-zinc-600">Colors</label>
                <div className="mt-1 flex flex-wrap gap-2">
                  <button onClick={() => setThemeId("auto")}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                      themeId === "auto" ? "border-cyan-500 bg-cyan-50 text-cyan-700" : "border-zinc-200 text-zinc-600"}`}>
                    ✨ Auto (varied)
                  </button>
                  {PRESET_THEMES.map((t) => (
                    <button key={t.id} onClick={() => setThemeId(t.id)}
                      className={`rounded-full border pl-1.5 pr-3 py-1 text-xs font-semibold flex items-center gap-1.5 ${
                        themeId === t.id ? "border-cyan-500 bg-cyan-50 text-cyan-700" : "border-zinc-200 text-zinc-600"}`}>
                      <span className="flex -space-x-1">
                        <span className="h-4 w-4 rounded-full border" style={{ background: t.colors.primary }} />
                        <span className="h-4 w-4 rounded-full border" style={{ background: t.colors.accent }} />
                      </span>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-xl bg-zinc-50 border p-2.5 text-[11px] text-zinc-500 flex items-start gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                Batch demos use a color theme + a monogram tile (no logo). Use the single "Build instant demo" when you want the shop's real logo.
              </div>

              <Button className="w-full" disabled={rows.length === 0} onClick={run}>
                <Layers className="h-4 w-4 mr-1.5" /> Build {rows.length || ""} demo{rows.length === 1 ? "" : "s"}
              </Button>
            </div>
          ) : (
            /* ── PROGRESS / RESULTS ───────────────────────────────── */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-sm font-bold">
                  {running ? `Building… ${results.length} of ${rows.length}` : `Done — ${builtOk} of ${results.length} built`}
                </div>
                {running && <Loader2 className="h-4 w-4 animate-spin text-cyan-600" />}
              </div>

              <div className="h-1.5 rounded-full bg-zinc-100 overflow-hidden">
                <div className="h-full bg-cyan-400 transition-all"
                     style={{ width: `${rows.length ? (results.length / rows.length) * 100 : 0}%` }} />
              </div>

              <div className="divide-y rounded-xl border overflow-hidden">
                {results.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 text-sm">
                    {r.ok
                      ? <Check className="h-4 w-4 text-emerald-600 shrink-0" />
                      : <X className="h-4 w-4 text-rose-500 shrink-0" />}
                    <span className="font-semibold truncate flex-1">{r.name}</span>
                    <span className="text-[11px]">{NICHE_META[r.niche].emoji}</span>
                    {r.ok && r.url
                      ? <a href={r.url} target="_blank" rel="noopener noreferrer"
                           className="text-cyan-600 shrink-0"><ExternalLink className="h-3.5 w-3.5" /></a>
                      : <span className="text-[10px] text-rose-500 truncate max-w-[90px]">{r.error}</span>}
                  </div>
                ))}
              </div>

              {done && (
                <div className="grid grid-cols-1 gap-2 pt-1">
                  {builtOk > 0 && (
                    <Button variant="outline" className="w-full" onClick={copyAll}>
                      <Copy className="h-4 w-4 mr-1.5" /> {copied ? "Copied" : "Copy all links"}
                    </Button>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <Button variant="outline" onClick={restart}>New batch</Button>
                    <Button onClick={onClose}>Done</Button>
                  </div>
                  <p className="text-[11px] text-center text-zinc-400">All demos are in your <b>Demos</b> folder on the pitch-day board.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
