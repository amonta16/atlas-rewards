"use client";
/**
 * field-demo-modal.tsx — CP-113 (instant demo builder)
 *
 * The rep-facing "New demo at this door" flow. A few taps — name, niche,
 * optional logo/color theme — and one RPC builds a fully-seeded demo app
 * (branding, 4 rewards, a spin wheel with a freebie, a featured offer, and a
 * 4-week streak). Ends on a QR + Open button so the rep shows it on the spot.
 *
 * Colors come from the logo (extracted in-browser, no API) or a preset theme;
 * no logo falls back to a monogram tile. See lib/logo-colors + lib/demo-packs.
 */

import { useMemo, useState } from "react";
import QRCode from "react-qr-code";
import { Loader2, Sparkles, Camera, Check, ExternalLink, Copy, X, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  NICHE_ORDER, NICHE_META, COLOR_THEMES, getDemoPack, packPayload, type DemoNiche,
} from "@/lib/demo-packs";
import { paletteFromLogoFile, monogramDataUrl, type BrandColors } from "@/lib/logo-colors";

function slugify(s: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "demo";
}

type Result = { slug: string; url: string };

export function FieldDemoModal({
  rootDomain, onClose, onCreated,
}: {
  rootDomain: string;
  onClose: () => void;
  onCreated?: () => void;
}) {
  const [name, setName] = useState("");
  const [niche, setNiche] = useState<DemoNiche>("food");
  const [themeId, setThemeId] = useState<string>("from-logo");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);

  const isDev = rootDomain.includes("lvh.me");
  const appUrl = (slug: string) =>
    `${isDev ? "http" : "https"}://${slug}.${rootDomain}${isDev ? ":3000" : ""}`;

  const canGenerate = name.trim().length >= 2 && !busy;

  function pickLogo(file: File | null) {
    setLogoFile(file);
    setLogoPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return file ? URL.createObjectURL(file) : null; });
    // If they add a logo, default the theme back to "from logo".
    if (file) setThemeId("from-logo");
  }

  // ── CP-128: one-tap auto-fill from Google Places ────────────────────
  // Type the shop's name, hit Find: canonical name, the right niche pack,
  // and (when the shop has a website) the logo — which flows through the
  // normal pickLogo path, so palette extraction and upload just work.
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupNote, setLookupNote] = useState<string | null>(null);

  async function autofill() {
    if (name.trim().length < 2 || lookupBusy) return;
    setLookupBusy(true); setLookupNote(null);
    try {
      // Best-effort GPS so "Joe's" finds the one the rep is standing at.
      const pos = await new Promise<GeolocationPosition | null>((res) => {
        if (!navigator.geolocation) return res(null);
        const t = window.setTimeout(() => res(null), 1500);
        navigator.geolocation.getCurrentPosition(
          (g) => { window.clearTimeout(t); res(g); },
          () => { window.clearTimeout(t); res(null); },
          { maximumAge: 300_000, timeout: 1400 },
        );
      });
      const r = await fetch("/api/field/places-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: name.trim(),
          lat: pos?.coords.latitude,
          lng: pos?.coords.longitude,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setLookupNote(j?.error === "places_not_configured"
          ? "Auto-fill needs GOOGLE_PLACES_API_KEY in Vercel — manual entry works fine."
          : (j?.error || "Couldn't find it — fill in manually."));
        return;
      }
      if (j.name) setName(j.name);
      if (j.niche && j.niche in NICHE_META) setNiche(j.niche as DemoNiche);
      if (j.logoDataUrl) {
        const blob = await (await fetch(j.logoDataUrl)).blob();
        pickLogo(new File([blob], "logo.png", { type: blob.type || "image/png" }));
      }
      setLookupNote([
        j.address,
        j.logoDataUrl ? "logo + colors pulled" : "no logo found — snap one",
      ].filter(Boolean).join(" · "));
    } catch {
      setLookupNote("Couldn't find it — fill in manually.");
    } finally {
      setLookupBusy(false);
    }
  }

  async function resolveColorsAndLogo(): Promise<{ colors: BrandColors; logoUrl: string | null }> {
    const supabase = createClient();
    let logoUrl: string | null = null;

    if (logoFile) {
      const ext = (logoFile.name.split(".").pop() || "png").toLowerCase();
      const path = `demos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from("business-logos").upload(path, logoFile, { upsert: true });
      if (!upErr) {
        logoUrl = supabase.storage.from("business-logos").getPublicUrl(path).data.publicUrl;
      }
    }

    // Colors: explicit theme wins; otherwise extract from the logo; else warm.
    const preset = COLOR_THEMES.find((t) => t.id === themeId && t.id !== "from-logo");
    let colors: BrandColors | null = preset ? preset.colors : null;
    if (!colors && logoFile) colors = await paletteFromLogoFile(logoFile);
    if (!colors) colors = COLOR_THEMES.find((t) => t.id === "warm")!.colors;

    // No uploaded logo → generate a monogram tile in the chosen colors.
    if (!logoUrl) logoUrl = monogramDataUrl(name, colors);

    return { colors, logoUrl };
  }

  async function generate() {
    setBusy(true); setErr(null);
    try {
      const supabase = createClient();
      const pack = getDemoPack(niche);
      const { colors, logoUrl } = await resolveColorsAndLogo();

      const { data, error } = await supabase.rpc("create_demo_business", {
        p_name: name.trim(),
        p_slug: slugify(name),
        p_industry: pack.industry,
        p_brand_colors: colors,
        p_logo_url: logoUrl,
        p_pack: packPayload(pack),
      });
      if (error) { setErr(error.message); setBusy(false); return; }
      const row: any = Array.isArray(data) ? data[0] : data;
      const slug = row?.new_slug as string;
      setResult({ slug, url: appUrl(slug) });
      onCreated?.();
    } catch (e: any) {
      setErr(e?.message ?? "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setResult(null); setName(""); setLogoFile(null);
    setLogoPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
    setThemeId("from-logo"); setErr(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4"
         onClick={onClose}>
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl overflow-hidden shadow-2xl"
           style={{ maxHeight: "92vh" }} onClick={(e) => e.stopPropagation()}>
        {/* header */}
        <div className="px-5 py-4 border-b flex items-center justify-between bg-gradient-to-r from-indigo-50 to-white">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-indigo-600" />
            <h2 className="text-base font-extrabold">Instant demo</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-full hover:bg-black/5">
            <X className="h-4 w-4 text-zinc-500" />
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto" style={{ maxHeight: "calc(92vh - 60px)" }}>
          {result ? (
            /* ── DONE ─────────────────────────────────────────────── */
            <div className="text-center">
              <div className="mx-auto h-11 w-11 rounded-full bg-emerald-100 flex items-center justify-center">
                <Check className="h-6 w-6 text-emerald-600" />
              </div>
              <h3 className="mt-3 text-lg font-extrabold">Demo is live</h3>
              <p className="text-xs text-zinc-500 mt-1">Show it, or let them scan.</p>

              <div className="mt-4 mx-auto w-fit rounded-2xl border p-3 bg-white">
                <QRCode value={result.url} size={168} fgColor="#0a0a0a" bgColor="#ffffff" />
              </div>
              <div className="mt-3 text-[11px] font-mono text-zinc-500 break-all">{result.url}</div>

              <div className="mt-4 grid grid-cols-1 gap-2">
                <a href={result.url} target="_blank" rel="noopener noreferrer">
                  <Button className="w-full"><ExternalLink className="h-4 w-4 mr-1.5" /> Open demo</Button>
                </a>
                <Button variant="outline" className="w-full"
                        onClick={() => { navigator.clipboard?.writeText(result.url); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>
                  <Copy className="h-4 w-4 mr-1.5" /> {copied ? "Copied" : "Copy link"}
                </Button>
                <button onClick={reset} className="mt-1 text-sm font-semibold text-indigo-600 hover:text-indigo-800">
                  Build another
                </button>
              </div>
            </div>
          ) : (
            /* ── FORM ─────────────────────────────────────────────── */
            <div className="space-y-4">
              {/* name + CP-128 auto-fill. Explicit bg/text colors: the Field
                  App shell is dark-themed and this input was inheriting WHITE
                  text on the white modal — invisible typing. */}
              <div>
                <label className="text-xs font-bold text-zinc-600">Business name</label>
                <div className="mt-1 flex gap-2">
                  <input
                    value={name} onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Joe's Diner" autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter") autofill(); }}
                    className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                  <button
                    onClick={autofill}
                    disabled={name.trim().length < 2 || lookupBusy}
                    title="Look the shop up — fills the type, logo and colors"
                    className="shrink-0 rounded-xl border border-indigo-200 bg-indigo-50 px-3 text-xs font-bold text-indigo-700 disabled:opacity-50 flex items-center gap-1">
                    {lookupBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    Find
                  </button>
                </div>
                {lookupNote && <p className="text-[11px] text-zinc-500 mt-1.5">{lookupNote}</p>}
              </div>

              {/* niche */}
              <div>
                <label className="text-xs font-bold text-zinc-600">Type</label>
                {/* CP-128: 14 niches — denser grid, same one-tap pick. */}
                <div className="mt-1 grid grid-cols-4 gap-1.5">
                  {NICHE_ORDER.map((k) => (
                    <button key={k} onClick={() => setNiche(k)}
                      className={`rounded-xl border px-1 py-2 text-xs font-semibold flex flex-col items-center gap-0.5 ${
                        niche === k ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-zinc-200 text-zinc-600"}`}>
                      <span className="text-base leading-none">{NICHE_META[k].emoji}</span>
                      {NICHE_META[k].label.split(" ")[0]}
                    </button>
                  ))}
                </div>
              </div>

              {/* logo */}
              <div>
                <label className="text-xs font-bold text-zinc-600">Logo <span className="font-normal text-zinc-400">(optional — pulls the colors)</span></label>
                <label className="mt-1 flex items-center gap-3 rounded-xl border border-dashed px-3 py-3 cursor-pointer hover:bg-zinc-50">
                  {logoPreview
                    ? <img src={logoPreview} alt="" className="h-10 w-10 rounded-lg object-contain bg-white border" />
                    : <span className="h-10 w-10 rounded-lg bg-zinc-100 flex items-center justify-center"><Camera className="h-5 w-5 text-zinc-400" /></span>}
                  <span className="text-sm text-zinc-600">{logoFile ? logoFile.name : "Snap or upload the shop's logo"}</span>
                  <input type="file" accept="image/*" capture="environment" className="hidden"
                         onChange={(e) => pickLogo(e.target.files?.[0] ?? null)} />
                </label>
              </div>

              {/* color theme */}
              <div>
                <label className="text-xs font-bold text-zinc-600">Color theme</label>
                <div className="mt-1 flex flex-wrap gap-2">
                  {COLOR_THEMES.map((t) => {
                    const active = themeId === t.id;
                    const fromLogo = t.id === "from-logo";
                    return (
                      <button key={t.id} onClick={() => setThemeId(t.id)}
                        className={`rounded-full border pl-1.5 pr-3 py-1 text-xs font-semibold flex items-center gap-1.5 ${
                          active ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-zinc-200 text-zinc-600"}`}>
                        <span className="flex -space-x-1">
                          {fromLogo ? (
                            <span className="h-4 w-4 rounded-full border bg-gradient-to-br from-zinc-300 to-zinc-500" />
                          ) : (
                            <>
                              <span className="h-4 w-4 rounded-full border" style={{ background: t.colors.primary }} />
                              <span className="h-4 w-4 rounded-full border" style={{ background: t.colors.accent }} />
                            </>
                          )}
                        </span>
                        {t.label}
                      </button>
                    );
                  })}
                </div>
                {themeId === "from-logo" && !logoFile && (
                  <p className="text-[11px] text-amber-600 mt-1.5">No logo yet — pick a theme, or add a logo to auto-match.</p>
                )}
              </div>

              {err && <div className="rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700">{err}</div>}

              <Button className="w-full" disabled={!canGenerate} onClick={generate}>
                {busy ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Building…</>
                      : <><Sparkles className="h-4 w-4 mr-1.5" /> Build demo</>}
              </Button>
              <p className="text-[11px] text-center text-zinc-400 -mt-1">
                Creates a demo app with rewards, a spin wheel, an offer and a streak.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
