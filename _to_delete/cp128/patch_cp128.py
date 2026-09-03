import subprocess, sys

R = "checkpoint-02-brand-engine/atlas-rewards-app/"
MODE = sys.argv[1] if len(sys.argv) > 1 else "device"

def load(p):
    if MODE == "mirror":
        return open(p, encoding="utf-8").read()
    return subprocess.run(["git", "show", "HEAD:" + R + p], capture_output=True, text=True, check=True).stdout

def save(p, src):
    path = p if MODE == "mirror" else R + p
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(src)

def rep(src, a, b, name):
    assert src.count(a) == 1, f"anchor fail: {name} ({src.count(a)})"
    return src.replace(a, b)

# ═══ CP-128 · Instant-demo sharpening for door-to-door ═════════════════
# demo-packs.ts and the new places-lookup route ship as whole files; this
# script handles the two modal edits.

# ── A. field-demo-modal.tsx ───────────────────────────────────────────
p = "components/field/field-demo-modal.tsx"
src = load(p)

src = rep(src,
'import { Loader2, Sparkles, Camera, Check, ExternalLink, Copy, X } from "lucide-react";',
'import { Loader2, Sparkles, Camera, Check, ExternalLink, Copy, X, Search } from "lucide-react";',
"lucide import")

src = rep(src,
"""  function pickLogo(file: File | null) {
    setLogoFile(file);
    setLogoPreview((prev) => { if (prev) URL.revokeObjectURL(prev); return file ? URL.createObjectURL(file) : null; });
    // If they add a logo, default the theme back to "from logo".
    if (file) setThemeId("from-logo");
  }""",
"""  function pickLogo(file: File | null) {
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
  }""",
"autofill fn")

src = rep(src,
"""              {/* name */}
              <div>
                <label className="text-xs font-bold text-zinc-600">Business name</label>
                <input
                  value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Joe's Diner" autoFocus
                  className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </div>""",
"""              {/* name + CP-128 auto-fill. Explicit bg/text colors: the Field
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
              </div>""",
"name row")

src = rep(src,
"""                <div className="mt-1 grid grid-cols-3 gap-2">
                  {NICHE_ORDER.map((k) => (
                    <button key={k} onClick={() => setNiche(k)}
                      className={`rounded-xl border px-2 py-2.5 text-sm font-semibold flex flex-col items-center gap-0.5 ${
                        niche === k ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-zinc-200 text-zinc-600"}`}>
                      <span className="text-lg leading-none">{NICHE_META[k].emoji}</span>
                      {NICHE_META[k].label.split(" ")[0]}
                    </button>
                  ))}
                </div>""",
"""                {/* CP-128: 14 niches — denser grid, same one-tap pick. */}
                <div className="mt-1 grid grid-cols-4 gap-1.5">
                  {NICHE_ORDER.map((k) => (
                    <button key={k} onClick={() => setNiche(k)}
                      className={`rounded-xl border px-1 py-2 text-xs font-semibold flex flex-col items-center gap-0.5 ${
                        niche === k ? "border-indigo-500 bg-indigo-50 text-indigo-700" : "border-zinc-200 text-zinc-600"}`}>
                      <span className="text-base leading-none">{NICHE_META[k].emoji}</span>
                      {NICHE_META[k].label.split(" ")[0]}
                    </button>
                  ))}
                </div>""",
"niche grid")

save(p, src)
print("demo modal OK")

# ── B. field-batch-modal.tsx ──────────────────────────────────────────
p = "components/field/field-batch-modal.tsx"
src = load(p)

src = rep(src,
'className="w-full rounded-xl border px-3 py-2.5 text-sm font-mono outline-none focus:ring-2 focus:ring-cyan-400 resize-y"',
'className="w-full rounded-xl border bg-white px-3 py-2.5 text-sm font-mono text-zinc-900 placeholder:text-zinc-400 outline-none focus:ring-2 focus:ring-cyan-400 resize-y"',
"batch textarea color")

src = rep(src,
"""                <div className="mt-1 grid grid-cols-3 gap-2">
                  {NICHE_ORDER.map((k) => (
                    <button key={k} onClick={() => setFallbackNiche(k)}""",
"""                <div className="mt-1 grid grid-cols-4 gap-1.5">
                  {NICHE_ORDER.map((k) => (
                    <button key={k} onClick={() => setFallbackNiche(k)}""",
"batch niche grid")

save(p, src)
print("batch modal OK")
